import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import logger from '../utils/logger.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// ─── Get Customer Profile ───
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-refreshToken -otp -otpExpiry');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error(`getUserProfile error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Update Customer Location ───
export const updateUserLocation = async (req, res) => {
  try {
    const { latitude, longitude, address, city } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        location: {
          coordinates: { latitude, longitude },
          address,
          city
        }
      },
      { new: true }
    ).select('location zeebacId name');
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateUserLocation error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Phase 4B: Core Payment Engine ───

export const lookupVendorById = async (req, res) => {
  try {
    const { query } = req.params; // ZBV-1234 ya phone number
    const cleanQuery = query.trim().toUpperCase();

    // Zeebac ID ya phone dono se dhundho
    const vendor = await Vendor.findOne({
      status: 'Verified',
      $or: [
        { zeebacId: cleanQuery },
        { phone: query.trim() }
      ]
    }).select('zeebacId storeName category cashbackRate phone address storeLogo');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'No verified vendor found with this ID or phone.' });
    }
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    logger.error(`lookupVendorById error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const createCustomerTransaction = async (req, res) => {
  try {
    const { vendorZeebacId, amount, paymentMethod } = req.body;

    // 1. Validate input
    if (!vendorZeebacId || !amount || amount < 1) {
      return res.status(400).json({ success: false, message: 'vendorZeebacId and amount (>=1) required' });
    }

    // 2. Find & validate vendor
    const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });
    }

    // 3. Find customer (the logged-in user)
    const customer = await User.findById(req.user.id);
    if (!customer || customer.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Customer account is not active' });
    }

    // 4. Calculate cashback
    const cashbackAmount = Math.round(amount * (vendor.cashbackRate / 100) * 100) / 100;

    // 5. Create Transaction document
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const txn = await Transaction.create({
      transactionId,
      customerId: customer._id,
      customerZeebacId: customer.zeebacId,
      customerPhone: customer.phone,
      customerName: customer.name,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      vendorName: vendor.storeName,
      vendorPhone: vendor.phone,
      vendorCategory: vendor.category,
      type: 'qr_cashback',
      initiatedBy: 'customer',
      source: 'customer_request',
      amount: parseFloat(amount),
      cashbackPercent: vendor.cashbackRate,
      cashbackAmount,
      paymentMethod: paymentMethod || 'Cash',
      status: 'Approved',  // Customer transactions auto-approved
    });

    // 6. Get or create customer Wallet
    let wallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    if (!wallet) {
      wallet = await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId });
    }

    // 7. Credit cashback to customer wallet
    const prevBalance = wallet.balance || 0;
    const newBalance = prevBalance + cashbackAmount;
    await Wallet.findByIdAndUpdate(wallet._id, { balance: newBalance });

    // 8. Create ledger (WalletTransaction) entry for customer
    await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: customer._id,
      ownerType: 'User',
      type: 'credit',
      category: 'cashback',
      amount: cashbackAmount,
      balanceAfter: newBalance,
      referenceId: txn._id,
      referenceType: 'Transaction',
      description: `Cashback from ${vendor.storeName}`,
    });

    // 8.5 Deduct cashback from vendor wallet
    let vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    if (vendorWallet) {
      const vPrevBalance = vendorWallet.balance || 0;
      const vNewBalance = vPrevBalance - cashbackAmount;
      await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vNewBalance });

      await WalletTransaction.create({
        walletId: vendorWallet._id,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        type: 'debit',
        category: 'cashback',
        amount: cashbackAmount,
        balanceAfter: vNewBalance,
        referenceId: txn._id,
        referenceType: 'Transaction',
        description: `Cashback given to ${customer.name}`,
      });
    }

    // 9. Update vendor stats
    await Vendor.findByIdAndUpdate(vendor._id, {
      $inc: { 'stats.totalRevenue': parseFloat(amount) }
    });

    // 10. Return success response
    res.status(201).json({
      success: true,
      data: {
        transaction: {
          transactionId: txn.transactionId,
          amount: txn.amount,
          cashbackAmount: txn.cashbackAmount,
          cashbackPercent: txn.cashbackPercent,
          status: txn.status,
          timestamp: txn.timestamp,
        },
        cashbackEarned: cashbackAmount,
        newWalletBalance: newBalance,
        vendorName: vendor.storeName,
      }
    });
  } catch (error) {
    logger.error(`createCustomerTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 1. Create Razorpay Order
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}` // Max length is 40 chars
    };

    const order = await instance.orders.create(options);
    if (!order) return res.status(500).json({ success: false, message: 'Failed to create order' });

    res.status(200).json({
      success: true,
      data: {
        id: order.id,
        amount: order.amount,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    const errorMsg = error.error ? error.error.description : error.message;
    logger.error(`Error in createRazorpayOrder (Customer): ${errorMsg}`);
    res.status(500).json({ success: false, message: 'Server Error', error: errorMsg });
  }
};

// 2. Verify Razorpay Payment & Process Transaction
export const verifyRazorpayAndCreateTransaction = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, vendorZeebacId, amount, paymentMethod } = req.body;

    // Verify Signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // --- If valid, run the core payment engine logic ---
    const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
    const customer = await User.findById(req.user.id);

    const cashbackAmount = Math.round(amount * (vendor.cashbackRate / 100) * 100) / 100;
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const txn = await Transaction.create({
      transactionId, customerId: customer._id, customerZeebacId: customer.zeebacId,
      customerPhone: customer.phone, customerName: customer.name,
      vendorId: vendor._id, vendorZeebacId: vendor.zeebacId,
      vendorName: vendor.storeName, vendorPhone: vendor.phone,
      vendorCategory: vendor.category, type: 'qr_cashback',
      initiatedBy: 'customer', source: 'customer_request',
      amount: parseFloat(amount), cashbackPercent: vendor.cashbackRate,
      cashbackAmount, paymentMethod, status: 'Approved'
    });

    let wallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    if (!wallet) wallet = await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId });

    const newBalance = (wallet.balance || 0) + cashbackAmount;
    await Wallet.findByIdAndUpdate(wallet._id, { balance: newBalance });

    await WalletTransaction.create({
      walletId: wallet._id, ownerId: customer._id, ownerType: 'User',
      type: 'credit', category: 'cashback', amount: cashbackAmount,
      balanceAfter: newBalance, referenceId: txn._id, referenceType: 'Transaction',
      description: `Cashback from ${vendor.storeName}`,
      gatewayName: 'Razorpay', gatewayOrderId: razorpay_order_id, gatewayPaymentId: razorpay_payment_id
    });

    // Deduct cashback from vendor wallet
    let vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    if (vendorWallet) {
      const vPrevBalance = vendorWallet.balance || 0;
      const vNewBalance = vPrevBalance - cashbackAmount;
      await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vNewBalance });

      await WalletTransaction.create({
        walletId: vendorWallet._id,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        type: 'debit',
        category: 'cashback',
        amount: cashbackAmount,
        balanceAfter: vNewBalance,
        referenceId: txn._id,
        referenceType: 'Transaction',
        description: `Cashback given to ${customer.name}`,
      });
    }

    await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } });

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          transactionId: txn.transactionId,
          amount: txn.amount,
          cashbackAmount: txn.cashbackAmount,
          cashbackPercent: txn.cashbackPercent,
          status: txn.status,
          timestamp: txn.timestamp,
        },
        cashbackEarned: cashbackAmount,
        newWalletBalance: newBalance,
        vendorName: vendor.storeName
      }
    });
  } catch (error) {
    logger.error(`verifyRazorpayAndCreateTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
