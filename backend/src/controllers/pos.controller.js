import mongoose from 'mongoose';
import PosBill from '../models/PosBill.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { creditWallet, debitWallet } from '../utils/wallet.util.js';
import { calculateCashback } from '../utils/cashback.util.js';
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
 * 1. POS System API Trigger (or Vendor POS Simulator)
 * Triggered by POS/Computer billing software when vendor clicks "Print Bill"
 */
export const createPosBill = async (req, res) => {
  try {
    const { vendorZeebacId, amount, billCode: customBillCode } = req.body;
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

    const posBill = await PosBill.create({
      billCode,
      vendorZeebacId: vendor.zeebacId,
      vendor: vendor._id,
      amount: parseFloat(amount),
      cashbackRate,
      status: 'UNCLAIMED',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h validity
    });

    logger.info(`[POS Bill Created] ${billCode} for Vendor: ${vendor.storeName} Amount: ₹${amount}`);

    res.status(201).json({
      success: true,
      message: 'POS Bill created successfully',
      data: {
        billCode: posBill.billCode,
        amount: posBill.amount,
        storeName: vendor.storeName,
        cashbackRate: posBill.cashbackRate,
        qrPayload: posBill.billCode,
        expiresAt: posBill.expiresAt,
      },
    });
  } catch (error) {
    logger.error(`[createPosBill] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
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
