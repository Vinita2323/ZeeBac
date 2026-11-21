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
import { recordCashbackIssuance, getVendorSettlementSummary } from '../utils/cashbackSettlement.util.js';
import { getIO } from '../socket/socket.js';

const safeSocketEmit = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    logger.warn(`[POS Socket] Could not emit ${event} to ${room}: ${err.message}`);
  }
};

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
    const rawInvoice = req.body.invoiceNumber || req.body.billNumber || req.body.invoiceNo || customBillCode;
    const invoiceNumber = rawInvoice ? String(rawInvoice).toUpperCase().trim() : null;

    // Security Fix 6: Never trust client-provided vendor ID if authenticated vendor identity is present
    const authenticatedVendorId = req.user?.zeebacId || req.vendor?.zeebacId;
    if (authenticatedVendorId && vendorZeebacId && authenticatedVendorId !== vendorZeebacId && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: cannot create bill for a different vendor' });
    }
    const vendorId = authenticatedVendorId || vendorZeebacId;

    if (!vendorId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Vendor Zeebac ID and valid amount are required' });
    }

    const vendor = req.vendor || (await Vendor.findOne({ zeebacId: vendorId }));
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    let billCode = (customBillCode || invoiceNumber) ? String(customBillCode || invoiceNumber).toUpperCase().trim() : generateBillCode();

    // Security Fix 7: Safe duplicate POS bill handling
    const existingForVendor = await PosBill.findOne({
      vendor: vendor._id,
      $or: [
        { billCode },
        ...(invoiceNumber ? [{ invoiceNumber }] : []),
      ],
    });

    if (existingForVendor) {
      if (existingForVendor.status === 'CLAIMED') {
        return res.status(409).json({
          success: false,
          alreadyClaimed: true,
          message: 'A POS bill with this invoice number has already been claimed',
        });
      }
      if (existingForVendor.status === 'UNCLAIMED' && existingForVendor.expiresAt > new Date()) {
        const existingCashback = Math.round(existingForVendor.amount * (existingForVendor.cashbackRate / 100) * 100) / 100;
        return res.status(200).json({
          success: true,
          message: 'POS bill already exists and is ready to claim',
          data: {
            mode: 'QR_SCAN',
            billCode: existingForVendor.billCode,
            invoiceNumber: existingForVendor.invoiceNumber,
            amount: existingForVendor.amount,
            storeName: vendor.storeName,
            cashbackRate: existingForVendor.cashbackRate,
            cashbackAmount: existingCashback,
            qrPayload: existingForVendor.billCode,
            expiresAt: existingForVendor.expiresAt,
          },
        });
      }
    }

    // If billCode exists for a DIFFERENT vendor, scope with vendor prefix to avoid index collision
    let codeConflict = await PosBill.findOne({ billCode });
    if (codeConflict && codeConflict.vendor.toString() !== vendor._id.toString()) {
      billCode = `${vendor.zeebacId}-${billCode}`;
    }

    // Ensure code uniqueness for generated codes
    if (!customBillCode && !invoiceNumber) {
      let existing = await PosBill.findOne({ billCode });
      while (existing) {
        billCode = generateBillCode();
        existing = await PosBill.findOne({ billCode });
      }
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
        invoiceNumber: invoiceNumber || billCode,
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
          invoiceNumber: posBill.invoiceNumber,
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
      invoiceNumber: invoiceNumber || billCode,
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

      // 4. Mark POS Bill as CLAIMED atomically
      const claimedPos = await PosBill.findOneAndUpdate(
        { _id: posBill._id, status: 'UNCLAIMED' },
        {
          $set: {
            status: 'CLAIMED',
            claimedBy: customer._id,
            claimedAt: new Date(),
            claimMode: 'SCAN',
            customerPhone: posBill.customerPhone || customer.phone,
            cashbackAmount: cashbackEarned,
            transaction: transaction[0]._id,
          },
        },
        { session, returnDocument: 'after' }
      );

      if (!claimedPos) {
        throw new Error('BILL_ALREADY_CLAIMED_OR_LOCKED');
      }
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
    if (error.message?.includes('BILL_ALREADY_CLAIMED')) {
      return res.status(400).json({ success: false, alreadyClaimed: true, message: 'This POS Bill has already been claimed!' });
    }
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
    const cleanCode = (billCode || '').toUpperCase().trim();
    const posBill = await PosBill.findOne({ billCode: cleanCode })
      .populate('vendor', 'storeName ownerName phone address zeebacId logo storeLogo gstNumber cashbackRate category upiId bankDetails')
      .populate('claimedBy', 'name phone zeebacId');

    if (!posBill) {
      return res.status(404).json({ success: false, message: 'POS Bill Code not found' });
    }

    let transaction = null;
    if (posBill.status === 'CLAIMED' && posBill.transaction) {
      transaction = await Transaction.findById(posBill.transaction).lean();
    }

    res.status(200).json({
      success: true,
      paid: posBill.status === 'CLAIMED',
      status: posBill.status,
      data: {
        billCode: posBill.billCode,
        amount: posBill.amount,
        cashbackRate: posBill.cashbackRate,
        cashbackAmount: posBill.cashbackAmount,
        status: posBill.status,
        claimedAt: posBill.claimedAt,
        items: posBill.items || [],
        customerPhone: posBill.customerPhone,
        customerZeebacId: posBill.customerZeebacId,
        customerName: posBill.customerName || posBill.claimedBy?.name,
        vendor: posBill.vendor,
        transaction,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. Vendor POS Billing Intent Creation (Dynamic UPI / Zeebac App Barcode)
 */
export const createPosBillIntent = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.vendor?._id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const {
      amount,
      items = [],
      customerPhone,
      customerZeebacId,
      customerName,
      billNumber: customBillNo,
    } = req.body;

    const parsedAmount = Math.round(Number(amount) * 100) / 100;
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bill amount is required' });
    }

    const billCode = (customBillNo || `BILL-${Date.now().toString().slice(-6)}`).toUpperCase().trim();
    const cashbackRate = vendor.cashbackRate || 10;
    const cashbackAmount = Math.round(parsedAmount * (cashbackRate / 100) * 100) / 100;

    // ── Smart Cashback Issuance Limit Check ──
    const vendorSettlement = getVendorSettlementSummary(vendor);
    if (cashbackAmount > 0 && vendorSettlement.remainingIssuanceCapacity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cashback issuance limit reached for this store (0 Pts remaining). Please settle net dues or purchase Zeebac points to continue issuing cashback.',
        reason: 'Issuance limit reached',
        remainingIssuanceCapacity: 0,
        totalIssuanceCapacity: vendorSettlement.totalIssuanceCapacity,
      });
    }

    let posBill = await PosBill.findOne({ billCode, vendor: vendor._id });
    if (!posBill) {
      posBill = new PosBill({
        billCode,
        vendor: vendor._id,
        vendorZeebacId: vendor.zeebacId,
        amount: parsedAmount,
        cashbackRate,
        cashbackAmount,
        customerPhone: customerPhone ? String(customerPhone).trim() : null,
        customerZeebacId: customerZeebacId ? String(customerZeebacId).trim().toUpperCase() : null,
        customerName: customerName ? String(customerName).trim() : null,
        items,
        status: 'UNCLAIMED',
        paymentMethod: 'UPI',
        invoiceNumber: billCode,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });
    } else {
      posBill.amount = parsedAmount;
      posBill.cashbackRate = cashbackRate;
      posBill.cashbackAmount = cashbackAmount;
      posBill.items = items;
      if (customerPhone) posBill.customerPhone = String(customerPhone).trim();
      if (customerZeebacId) posBill.customerZeebacId = String(customerZeebacId).trim().toUpperCase();
      if (customerName) posBill.customerName = String(customerName).trim();
      posBill.status = 'UNCLAIMED';
    }

    await posBill.save();

    const upiId = vendor.bankDetails?.upiId || vendor.upiId || 'zeebac@upi';
    const storeName = vendor.storeName || vendor.ownerName || 'Zeebac Store';
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${parsedAmount.toFixed(2)}&cu=INR&tr=${encodeURIComponent(billCode)}&tn=${encodeURIComponent(`Zeebac POS Bill ${billCode}`)}`;

    res.status(200).json({
      success: true,
      data: {
        billCode,
        billNumber: billCode,
        amount: parsedAmount,
        cashbackRate,
        cashbackAmount,
        items,
        vendorStoreName: vendor.storeName,
        vendorZeebacId: vendor.zeebacId,
        upiId,
        upiUri,
        qrPayload: upiUri,
        status: 'AWAITING_PAYMENT',
      },
    });
  } catch (error) {
    logger.error(`[createPosBillIntent] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. Customer Pay POS Bill Intent (via Zeebac App Wallet or UPI)
 * Automatically marks the bill as PAID, creates Transaction, credits customer cashback,
 * and notifies the merchant screen via Socket in real time!
 */
export const payPosBillIntent = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const customerId = req.user?.id;
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer user not found' });
    }

    const { billCode, paymentMethod = 'Wallet', utr = null } = req.body;
    const cleanCode = (billCode || '').toUpperCase().trim();

    const posBill = await PosBill.findOne({ billCode: cleanCode }).populate('vendor');
    if (!posBill) {
      return res.status(404).json({ success: false, message: 'POS Bill Code not found' });
    }

    if (posBill.status === 'CLAIMED') {
      const existingTx = await Transaction.findById(posBill.transaction);
      return res.status(200).json({
        success: true,
        message: 'This POS Bill has already been paid!',
        alreadyPaid: true,
        transaction: existingTx,
      });
    }

    const vendor = posBill.vendor;
    const billAmount = posBill.amount;
    const cashbackRate = posBill.cashbackRate || vendor?.cashbackRate || 10;
    const cashbackEarned = Math.round(billAmount * (cashbackRate / 100) * 100) / 100;

    let createdTx = null;

    const executePayment = async (activeSession) => {
      const sessOpt = activeSession ? { session: activeSession } : {};

      // 1. If paymentMethod is Wallet, deduct customer wallet
      if (paymentMethod === 'Wallet') {
        const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' }, null, sessOpt);
        if (!customerWallet || (customerWallet.balance || 0) < billAmount) {
          throw new Error(`Insufficient wallet balance. Required: ₹${billAmount}, Available: ₹${customerWallet?.balance || 0}`);
        }

        await debitWallet({
          session: activeSession,
          ownerId: customer._id,
          ownerType: 'User',
          ownerZeebacId: customer.zeebacId,
          amount: billAmount,
          category: 'cashout',
          description: `Paid for bill ${posBill.billCode} at ${vendor.storeName}`,
          referenceId: posBill._id,
        });
      }

      // 2. Credit cashback to customer wallet
      if (cashbackEarned > 0) {
        await creditWallet({
          session: activeSession,
          ownerId: customer._id,
          ownerType: 'User',
          ownerZeebacId: customer.zeebacId,
          amount: cashbackEarned,
          category: 'cashback',
          description: `Cashback earned (${cashbackRate}%) on POS bill ${posBill.billCode} at ${vendor.storeName}`,
          referenceId: posBill._id,
        });
      }

      // 3. Record Cashback Issuance in Smart Cashback & Settlement Ledger
      try {
        await recordCashbackIssuance({
          vendorId: vendor._id,
          amount: cashbackEarned,
          customer,
          orderId: posBill.billCode,
          billNumber: posBill.billCode,
          paymentMethod,
          eligiblePaidAmount: billAmount,
          cashbackPercentage: cashbackRate,
          referenceId: posBill._id,
          referenceType: 'Order',
          notes: `POS Bill ${posBill.billCode} paid via ${paymentMethod}`,
          session: activeSession,
        });
      } catch (issuanceErr) {
        logger.warn(`[payPosBillIntent] Settlement issuance warning: ${issuanceErr.message}`);
      }

      // 4. Create Transaction Record
      const transactionId = `TX-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const vendorAddr = typeof vendor.address === 'object'
        ? [vendor.address?.fullAddress || vendor.address?.street, vendor.address?.city, vendor.address?.state].filter(Boolean).join(', ')
        : (vendor.address || 'Verified Merchant Store');

      const txDocs = await Transaction.create(
        [
          {
            transactionId,
            customerId: customer._id,
            customerZeebacId: customer.zeebacId,
            customerName: customer.name || 'Valued Customer',
            customerPhone: customer.phone,
            vendorId: vendor._id,
            vendorZeebacId: vendor.zeebacId,
            vendorName: vendor.storeName,
            vendorPhone: vendor.phone,
            vendorAddress: vendorAddr,
            vendorCategory: vendor.category || 'Retail',
            type: 'pos_bill',
            initiatedBy: 'customer',
            amount: billAmount,
            cashbackPercent: cashbackRate,
            cashbackAmount: cashbackEarned,
            paymentMethod,
            status: 'Approved',
            source: 'vendor_pos_billing',
            billNumber: posBill.billCode,
            items: posBill.items && posBill.items.length > 0 ? posBill.items : [
              {
                name: `${vendor.category || 'Retail'} Store Purchase`,
                quantity: 1,
                price: billAmount,
                total: billAmount,
                cashbackPercentage: cashbackRate,
              },
            ],
            gateway: utr ? { gatewayName: 'UPI', utr } : undefined,
          },
        ],
        sessOpt
      );

      createdTx = txDocs[0];

      // 5. Update PosBill
      posBill.status = 'CLAIMED';
      posBill.claimedBy = customer._id;
      posBill.claimedAt = new Date();
      posBill.transaction = createdTx._id;
      posBill.cashbackAmount = cashbackEarned;
      posBill.customerPhone = customer.phone;
      posBill.customerZeebacId = customer.zeebacId;
      posBill.customerName = customer.name;
      posBill.paymentMethod = paymentMethod;
      posBill.claimMode = 'SCAN';
      await posBill.save(sessOpt);
    };

    try {
      await session.withTransaction(async () => {
        await executePayment(session);
      });
    } catch (txErr) {
      if (txErr.message?.includes('replica set') || txErr.message?.includes('Transaction numbers')) {
        logger.warn(`[payPosBillIntent] Non-transactional fallback: ${txErr.message}`);
        await executePayment(null);
      } else {
        throw txErr;
      }
    }

    // 6. Real-time Socket Event to Vendor Room & Bill Room!
    const socketPayload = {
      billCode: posBill.billCode,
      billNumber: posBill.billCode,
      transactionId: createdTx.transactionId,
      amount: billAmount,
      cashbackAmount: cashbackEarned,
      customerName: customer.name || 'Customer',
      customerZeebacId: customer.zeebacId,
      customerPhone: customer.phone,
      paymentMethod,
      items: posBill.items,
      transaction: createdTx,
    };

    safeSocketEmit(`vendor:${vendor._id}`, 'pos_bill:paid', socketPayload);
    safeSocketEmit(`pos_bill:${posBill.billCode}`, 'pos_bill:paid', socketPayload);
    safeSocketEmit(`user:${customer._id}`, 'wallet:updated', {
      transactionId: createdTx.transactionId,
      amount: billAmount,
      cashbackEarned,
      newWalletBalance: (await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' }))?.balance || 0,
    });

    // In-app Notification to customer
    try {
      await sendNotification({
        recipientId: customer._id,
        recipientType: 'customer',
        type: 'cashback_credited',
        title: '🎉 Bill Paid & Cashback Credited!',
        message: `₹${cashbackEarned} cashback points credited on bill ${posBill.billCode} at ${vendor.storeName}`,
        referenceId: createdTx._id,
        referenceType: 'Transaction',
        data: { transactionId: createdTx.transactionId, billNumber: posBill.billCode },
      });
    } catch (_) {}

    const updatedCustWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });

    return res.status(200).json({
      success: true,
      message: `🎉 Payment successful! ₹${cashbackEarned} cashback points credited to your wallet!`,
      data: {
        billNumber: posBill.billCode,
        amount: billAmount,
        cashbackEarned,
        newWalletBalance: updatedCustWallet?.balance || 0,
        transaction: createdTx,
        vendorName: vendor.storeName,
        transactionId: createdTx.transactionId,
      },
    });
  } catch (error) {
    logger.error(`[payPosBillIntent] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Payment failed' });
  } finally {
    session.endSession();
  }
};

/**
 * 6. Auto-Confirm POS Bill via 12-digit UPI UTR
 * Used when customer scans and pays via external UPI (GPay/PhonePe)
 */
export const autoConfirmPosBillUtr = async (req, res) => {
  try {
    const { billCode, utr } = req.body;
    const cleanCode = (billCode || '').toUpperCase().trim();
    const cleanUtr = String(utr || '').replace(/\D/g, '').trim();

    if (!cleanUtr || cleanUtr.length !== 12) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 12-digit UPI Reference ID (UTR)' });
    }

    const posBill = await PosBill.findOne({ billCode: cleanCode }).populate('vendor');
    if (!posBill) {
      return res.status(404).json({ success: false, message: 'POS Bill not found' });
    }

    if (posBill.status === 'CLAIMED') {
      const existingTx = await Transaction.findById(posBill.transaction);
      return res.status(200).json({
        success: true,
        message: 'This bill is already confirmed!',
        alreadyPaid: true,
        transaction: existingTx,
      });
    }

    // Lookup customer by customerPhone or customerZeebacId if linked
    let customer = null;
    if (posBill.customerPhone) {
      customer = await User.findOne({
        $or: [{ phone: posBill.customerPhone }, { phone: `+91${posBill.customerPhone}` }],
      });
    }
    if (!customer && posBill.customerZeebacId) {
      customer = await User.findOne({ zeebacId: posBill.customerZeebacId });
    }

    const vendor = posBill.vendor;
    const billAmount = posBill.amount;
    const cashbackRate = posBill.cashbackRate || vendor?.cashbackRate || 10;
    const cashbackEarned = Math.round(billAmount * (cashbackRate / 100) * 100) / 100;

    // Credit customer if registered
    if (customer && cashbackEarned > 0) {
      await creditWallet({
        ownerId: customer._id,
        ownerType: 'User',
        ownerZeebacId: customer.zeebacId,
        amount: cashbackEarned,
        category: 'cashback',
        description: `Cashback earned (${cashbackRate}%) on POS bill ${posBill.billCode} via UPI`,
        referenceId: posBill._id,
      });

      try {
        await recordCashbackIssuance({
          vendorId: vendor._id,
          amount: cashbackEarned,
          customer,
          orderId: posBill.billCode,
          billNumber: posBill.billCode,
          paymentMethod: 'UPI',
          eligiblePaidAmount: billAmount,
          cashbackPercentage: cashbackRate,
          referenceId: posBill._id,
          referenceType: 'Order',
          notes: `POS Bill ${posBill.billCode} paid via UPI UTR ${cleanUtr}`,
        });
      } catch (_) {}
    }

    // Create Transaction Record
    const transactionId = `TX-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const vendorAddr = typeof vendor.address === 'object'
      ? [vendor.address?.fullAddress || vendor.address?.street, vendor.address?.city, vendor.address?.state].filter(Boolean).join(', ')
      : (vendor.address || 'Verified Merchant Store');

    const createdTx = await Transaction.create({
      transactionId,
      customerId: customer ? customer._id : undefined,
      customerZeebacId: customer ? customer.zeebacId : posBill.customerZeebacId,
      customerName: customer ? customer.name : (posBill.customerName || 'Customer'),
      customerPhone: customer ? customer.phone : posBill.customerPhone,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      vendorName: vendor.storeName,
      vendorPhone: vendor.phone,
      vendorAddress: vendorAddr,
      vendorCategory: vendor.category || 'Retail',
      type: 'pos_bill',
      initiatedBy: 'vendor',
      amount: billAmount,
      cashbackPercent: cashbackRate,
      cashbackAmount: customer ? cashbackEarned : 0,
      paymentMethod: 'UPI',
      status: 'Approved',
      source: 'vendor_pos_billing',
      billNumber: posBill.billCode,
      items: posBill.items && posBill.items.length > 0 ? posBill.items : [
        {
          name: `${vendor.category || 'Retail'} Store Purchase`,
          quantity: 1,
          price: billAmount,
          total: billAmount,
          cashbackPercentage: cashbackRate,
        },
      ],
      gateway: { gatewayName: 'UPI', utr: cleanUtr },
    });

    posBill.status = 'CLAIMED';
    if (customer) posBill.claimedBy = customer._id;
    posBill.claimedAt = new Date();
    posBill.transaction = createdTx._id;
    posBill.cashbackAmount = customer ? cashbackEarned : 0;
    posBill.paymentMethod = 'UPI';
    posBill.claimMode = 'SCAN';
    await posBill.save();

    const socketPayload = {
      billCode: posBill.billCode,
      billNumber: posBill.billCode,
      transactionId: createdTx.transactionId,
      amount: billAmount,
      cashbackAmount: customer ? cashbackEarned : 0,
      customerName: customer ? customer.name : (posBill.customerName || 'Customer'),
      customerZeebacId: customer ? customer.zeebacId : posBill.customerZeebacId,
      paymentMethod: 'UPI',
      items: posBill.items,
      transaction: createdTx,
    };

    safeSocketEmit(`vendor:${vendor._id}`, 'pos_bill:paid', socketPayload);
    safeSocketEmit(`pos_bill:${posBill.billCode}`, 'pos_bill:paid', socketPayload);

    let updatedCustWallet = null;
    if (customer) {
      updatedCustWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
      safeSocketEmit(`user:${customer._id}`, 'wallet:updated', {
        transactionId: createdTx.transactionId,
        amount: billAmount,
        cashbackEarned,
        newWalletBalance: updatedCustWallet?.balance || 0,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified and Bill generated successfully!',
      data: {
        billNumber: posBill.billCode,
        amount: billAmount,
        cashbackEarned: customer ? cashbackEarned : 0,
        newWalletBalance: updatedCustWallet?.balance || 0,
        transaction: createdTx,
        vendorName: vendor.storeName,
        transactionId: createdTx.transactionId,
      },
    });
  } catch (error) {
    logger.error(`[autoConfirmPosBillUtr] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};
