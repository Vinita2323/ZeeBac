import mongoose from 'mongoose';
import PosBill from '../models/PosBill.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import { creditWallet, debitWallet } from '../utils/wallet.util.js';
import { calculateCashback } from '../utils/cashback.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import { getVendorSubscriptionState } from '../utils/subscription.util.js';
import { cleanIndianPhoneNumber } from '../utils/phone.util.js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notification.service.js';

/**
 * Generate a unique POS Bill Code (e.g. ZEEBAC-89214)
 */
const generateBillCode = () => {
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  return `ZEEBAC-${randomDigits}`;
};

/**
 * 1. POS System API Trigger (External Billing Software / Vendor POS)
 * Supports two industry-standard modes:
 * - Option 1 (Scan Mode): billing software sends amount & vendorZeebacId -> generates QR payload for printed receipt.
 * - Option 2 (Auto-Credit Mode): cashier enters customerPhone in billing software -> Zeebac immediately credits cashback into user wallet without scanning!
 * - Fallback: If customerPhone is provided but user is not yet on Zeebac -> generates claimable QR receipt payload with linked phone.
 */
export const createPosBill = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { vendorZeebacId, amount, billCode: customBillCode, customerPhone, paymentMethod } = req.body;
    const vendorId = vendorZeebacId || req.user?.zeebacId;

    if (!vendorId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Vendor Zeebac ID and valid amount are required' });
    }

    const vendor = await Vendor.findOne({ zeebacId: vendorId });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    let billCode = customBillCode ? customBillCode.toUpperCase().trim() : generateBillCode();
    
    // Ensure code uniqueness
    let existing = await PosBill.findOne({ billCode });
    if (existing && !customBillCode) {
      billCode = generateBillCode();
    }

    const cashbackRate = vendor.cashbackRate || 10;
    const billAmount = parseFloat(amount);
    const cashbackEarned = Math.round(billAmount * (cashbackRate / 100) * 100) / 100;

    // Check if customerPhone is supplied for Option 2 (Auto-Credit)
    const rawPhone = customerPhone ? String(customerPhone).trim() : null;
    const normalizedPhone = rawPhone ? (cleanIndianPhoneNumber(rawPhone) || rawPhone.replace(/\D/g, '')) : null;

    if (normalizedPhone) {
      // Option 2: Automatic Cashback via Customer Mobile Number
      const customer = await User.findOne({ 
        $or: [{ phone: normalizedPhone }, { phone: `+91${normalizedPhone}` }]
      });

      if (customer) {
        // Check vendor prepaid wallet and subscription status
        const vendorWallet = await Wallet.findOne({ 
          ownerId: vendor._id, 
          ownerType: { $in: ['vendor', 'Vendor'] } 
        });
        const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
        const subState = getVendorSubscriptionState(vendor, vendorBalance);

        if (!subState.isSubActive) {
          return res.status(400).json({ 
            success: false, 
            message: 'Cashback blocked due to vendor subscription expiry.' 
          });
        }

        if (vendorBalance < cashbackEarned) {
          return res.status(400).json({ 
            success: false, 
            message: `Cashback blocked due to insufficient vendor wallet balance. Required: ₹${cashbackEarned}, Available: ₹${vendorBalance}` 
          });
        }

        let transaction = null;
        let newWalletBalance = 0;
        let referralAward = null;

        await session.withTransaction(async () => {
          // 1. Debit Vendor Wallet
          await debitWallet({
            ownerId: vendor._id,
            ownerType: 'vendor',
            amount: cashbackEarned,
            category: 'cashback_payout',
            description: `POS Bill Auto Cashback for ${customer.name || customer.phone}`,
            session,
          });

          // 2. Credit Customer Wallet
          const walletRes = await creditWallet({
            ownerId: customer._id,
            ownerType: 'customer',
            ownerZeebacId: customer.zeebacId,
            amount: cashbackEarned,
            category: 'cashback_earned',
            description: `POS Bill Cashback from ${vendor.storeName}`,
            session,
          });
          newWalletBalance = walletRes.balance;

          // 3. Create Transaction Ledger Entry
          const createdTx = await Transaction.create(
            [
              {
                transactionId: `TX-POS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
                customerId: customer._id,
                customerZeebacId: customer.zeebacId,
                customerName: customer.name || customer.phone,
                customerPhone: customer.phone,
                vendorId: vendor._id,
                vendorZeebacId: vendor.zeebacId,
                vendorName: vendor.storeName,
                vendorPhone: vendor.phone,
                vendorCategory: vendor.category,
                type: 'pos_bill',
                initiatedBy: 'vendor',
                source: 'pos_auto_credit',
                amount: billAmount,
                cashbackPercent: cashbackRate,
                cashbackAmount: cashbackEarned,
                paymentMethod: paymentMethod || 'Cash (POS Auto Credit)',
                status: 'Approved',
                approvedAt: new Date(),
                notes: `POS Bill Auto-Credited via Mobile: ${customer.phone} (Code: ${billCode})`,
              },
            ],
            { session }
          );
          transaction = createdTx[0];

          // 4. Create Claimed PosBill
          await PosBill.create(
            [
              {
                billCode,
                vendorZeebacId: vendor.zeebacId,
                vendor: vendor._id,
                amount: billAmount,
                cashbackRate,
                customerPhone: customer.phone,
                claimMode: 'AUTO_PHONE',
                paymentMethod: paymentMethod || 'Cash',
                status: 'CLAIMED',
                claimedBy: customer._id,
                claimedAt: new Date(),
                cashbackAmount: cashbackEarned,
                transaction: transaction._id,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
            ],
            { session }
          );

          // 5. First purchase referral check
          referralAward = await claimFirstPurchaseReferralBonus({ session, customer });
        });

        logger.info(`[POS Bill Auto-Credited] Code: ${billCode} | Customer: ${customer.phone} | Cashback: ₹${cashbackEarned}`);

        // Async Push Notification to Customer
        sendNotification({
          recipientId: customer._id,
          recipientType: 'customer',
          type: 'credit',
          title: '🎁 Cashback Credited!',
          message: `₹${cashbackEarned} cashback credited automatically for your purchase at ${vendor.storeName}`,
          icon: 'savings',
          referenceId: transaction._id,
          referenceType: 'transaction',
        }).catch(console.error);

        // Async Referral Notification
        if (referralAward) {
          sendNotification({
            recipientId: referralAward.referrerId,
            recipientType: 'customer',
            fcmTokens: referralAward.referrerFcmTokens,
            type: 'referral',
            title: '🎊 Referral Bonus Credited!',
            message: `₹${referralAward.rewardAmount} added to your wallet for referring ${customer.name || customer.phone}!`,
            icon: 'group_add',
            referenceId: referralAward.referralId,
            referenceType: 'Referral',
          }).catch(console.error);
        }

        return res.status(201).json({
          success: true,
          message: 'Cashback automatically credited to customer Zeebac wallet!',
          data: {
            mode: 'AUTO_CREDITED',
            billCode,
            amount: billAmount,
            cashbackEarned,
            storeName: vendor.storeName,
            customer: {
              name: customer.name,
              phone: customer.phone,
              zeebacId: customer.zeebacId,
            },
            newWalletBalance,
            transactionId: transaction.transactionId,
            receiptText: `Zeebac Cashback: ₹${cashbackEarned} credited to wallet (${customer.phone})`,
          },
        });
      }

      // Customer not registered on Zeebac yet -> create UNCLAIMED bill with linked customerPhone & QR
      const posBill = await PosBill.create({
        billCode,
        vendorZeebacId: vendor.zeebacId,
        vendor: vendor._id,
        amount: billAmount,
        cashbackRate,
        customerPhone: normalizedPhone,
        claimMode: 'SCAN',
        paymentMethod: paymentMethod || 'Cash',
        status: 'UNCLAIMED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      logger.info(`[POS Bill Created - Unregistered Customer] ${billCode} for Phone: ${normalizedPhone} Amount: ₹${billAmount}`);

      return res.status(201).json({
        success: true,
        message: 'Customer not yet registered on Zeebac. Printed QR code generated for receipt.',
        data: {
          mode: 'UNREGISTERED_CUSTOMER_QR',
          billCode: posBill.billCode,
          amount: posBill.amount,
          cashbackRate: posBill.cashbackRate,
          cashbackAmount: cashbackEarned,
          customerPhone: normalizedPhone,
          storeName: vendor.storeName,
          qrPayload: posBill.billCode,
          expiresAt: posBill.expiresAt,
          receiptText: `Claim ₹${cashbackEarned} Zeebac Cashback! Scan QR or download Zeebac app with mobile ${normalizedPhone}.`,
        },
      });
    }

    // Option 1: Standard POS Printed Bill without customer phone (QR Scan flow)
    const posBill = await PosBill.create({
      billCode,
      vendorZeebacId: vendor.zeebacId,
      vendor: vendor._id,
      amount: billAmount,
      cashbackRate,
      claimMode: 'SCAN',
      paymentMethod: paymentMethod || 'Cash',
      status: 'UNCLAIMED',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h validity
    });

    logger.info(`[POS Bill Created] ${billCode} for Vendor: ${vendor.storeName} Amount: ₹${billAmount}`);

    return res.status(201).json({
      success: true,
      message: 'POS Bill created successfully for receipt QR printing',
      data: {
        mode: 'QR_SCAN',
        billCode: posBill.billCode,
        amount: posBill.amount,
        storeName: vendor.storeName,
        cashbackRate: posBill.cashbackRate,
        cashbackAmount: cashbackEarned,
        qrPayload: posBill.billCode,
        expiresAt: posBill.expiresAt,
        receiptText: `Scan QR code with Zeebac App to claim ₹${cashbackEarned} cashback!`,
      },
    });
  } catch (error) {
    logger.error(`[createPosBill] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * 2. Instant Claim Printed Bill QR (Customer Scan)
 * Customer scans printed bill QR (ZEEBAC-89214) in Zeebac app
 * Auto-matches bill code & credits instant cashback!
 */
export const claimPosBill = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { billCode } = req.body;
    const customerId = req.user.id;

    if (!billCode) {
      return res.status(400).json({ success: false, message: 'Bill Code is required' });
    }

    const normalizedCode = billCode.trim();
    const posBill = await PosBill.findOne({ billCode: { $regex: new RegExp(`^${normalizedCode}$`, 'i') } });

    if (!posBill) {
      return res.status(404).json({ success: false, message: 'Invalid POS Bill Code. Generate a bill from Vendor POS first.' });
    }

    if (posBill.status === 'CLAIMED') {
      return res.status(400).json({ success: false, message: 'This POS Bill has already been claimed!' });
    }

    if (posBill.expiresAt < new Date()) {
      posBill.status = 'EXPIRED';
      await posBill.save();
      return res.status(400).json({ success: false, message: 'This POS Bill Code has expired' });
    }

    const vendor = await Vendor.findById(posBill.vendor);
    const customer = await User.findById(customerId);

    if (!vendor || !customer) {
      return res.status(404).json({ success: false, message: 'Vendor or Customer account not found' });
    }

    const cashbackEarned = Math.round(posBill.amount * (posBill.cashbackRate / 100) * 100) / 100;

    let transaction = null;
    let newWalletBalance = 0;

    await session.withTransaction(async () => {
      // 1. Debit Vendor Prepaid Wallet for cashback
      await debitWallet({
        ownerId: vendor._id,
        ownerType: 'vendor',
        amount: cashbackEarned,
        category: 'cashback_payout',
        description: `POS Bill Cashback for ${customer.name || customer.phone}`,
        session
      });

      // 2. Credit Customer Wallet
      const walletRes = await creditWallet({
        ownerId: customer._id,
        ownerType: 'customer',
        ownerZeebacId: customer.zeebacId,
        amount: cashbackEarned,
        category: 'cashback_earned',
        description: `POS Bill Cashback from ${vendor.storeName}`,
        session
      });
      newWalletBalance = walletRes.balance;

      // 3. Create Transaction Ledger Entry
      transaction = await Transaction.create(
        [
          {
            transactionId: `TX-POS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
            customerId: customer._id,
            customerZeebacId: customer.zeebacId,
            customerName: customer.name || customer.phone,
            customerPhone: customer.phone,
            vendorId: vendor._id,
            vendorZeebacId: vendor.zeebacId,
            vendorName: vendor.storeName,
            type: 'pos_bill',
            initiatedBy: 'customer',
            source: 'pos_bill_scan',
            amount: posBill.amount,
            cashbackPercent: posBill.cashbackRate,
            cashbackAmount: cashbackEarned,
            paymentMethod: 'Cash (POS Bill Scan)',
            status: 'Approved',
            approvedAt: new Date(),
            notes: `POS Printed Bill Code: ${posBill.billCode}`,
          },
        ],
        { session }
      );

      // 4. Mark POS Bill as CLAIMED
      posBill.status = 'CLAIMED';
      posBill.claimedBy = customer._id;
      posBill.claimedAt = new Date();
      posBill.claimMode = 'SCAN';
      if (!posBill.customerPhone) posBill.customerPhone = customer.phone;
      posBill.cashbackAmount = cashbackEarned;
      posBill.transaction = transaction[0]._id;
      await posBill.save({ session });
    });

    logger.info(`[POS Bill Claimed] Code: ${normalizedCode} | Customer: ${customer.phone} | Cashback: ₹${cashbackEarned}`);

    // Send async real-time push notification
    sendNotification({
      recipientId: customer._id,
      recipientType: 'customer',
      type: 'credit',
      title: '🎁 Cashback Credited!',
      message: `₹${cashbackEarned} cashback credited for POS Bill ${posBill.billCode} at ${vendor.storeName}`,
      icon: 'savings',
      referenceId: transaction[0]._id,
      referenceType: 'transaction',
    }).catch(console.error);

    res.status(200).json({
      success: true,
      message: 'POS Bill Claimed Successfully! Cashback Credited.',
      data: {
        billCode: posBill.billCode,
        amount: posBill.amount,
        cashbackEarned,
        vendorName: vendor.storeName,
        newWalletBalance,
        transactionId: transaction[0].transactionId,
      },
    });
  } catch (error) {
    logger.error(`[claimPosBill] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * 3. Lookup POS Bill Status
 */
export const getPosBillStatus = async (req, res) => {
  try {
    const { billCode } = req.params;
    const posBill = await PosBill.findOne({ billCode: billCode.toUpperCase().trim() }).populate('vendor', 'storeName cashbackRate category');

    if (!posBill) {
      return res.status(404).json({ success: false, message: 'POS Bill Code not found' });
    }

    res.status(200).json({ success: true, data: posBill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
