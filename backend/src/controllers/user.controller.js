import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import CashbackRequest from '../models/CashbackRequest.js';
import Product from '../models/Product.js';
import Referral from '../models/Referral.js';
import RewardConfig from '../models/RewardConfig.js';
import PartnerOffer from '../models/PartnerOffer.js';
import logger from '../utils/logger.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { sendNotification } from '../services/notification.service.js';
import { checkAndNotifyFraud } from '../utils/adminNotification.js';

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

// ─── Update Linked Account ───
export const updateLinkedAccount = async (req, res) => {
  try {
    const { upiId, bankName, accNo } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.bankDetails = {
      upiId: upiId || '',
      bankName: bankName || '',
      accountNumber: accNo || '',
    };
    await user.save();

    res.status(200).json({ success: true, message: 'Linked account updated successfully', data: user.bankDetails });
  } catch (error) {
    logger.error(`updateLinkedAccount error: ${error.message}`);
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
    }).select('zeebacId storeName category cashbackRate phone address storeLogo profilePic description operatingHours stats socialLinks');

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

    // --- Strict Vendor Balance Check ---
    let vendorWalletCheck = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const currentVendorBalance = vendorWalletCheck ? (vendorWalletCheck.balance || 0) : 0;
    
    if (currentVendorBalance < cashbackAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Vendor cannot accept this payment. Vendor wallet balance is too low to provide ₹${cashbackAmount} cashback.` 
      });
    }
    // -----------------------------------
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

    // Fire & forget fraud check
    checkAndNotifyFraud(txn).catch(e => logger.error('Fraud check failed', e));

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

    // 9. Referral Logic: Check if this is customer's first transaction
    if (customer.referredBy) {
      const txnCount = await Transaction.countDocuments({ customerId: customer._id });
      if (txnCount === 1) {
        // This is their first transaction! Award the referrer.
        const referral = await Referral.findOne({ referredUserId: customer._id, status: 'Signed Up' });
        if (referral) {
          const rewardAmount = referral.rewardAmount || 150;

          // Find referrer's wallet
          let referrerWallet = await Wallet.findOne({ ownerId: referral.referrerId, ownerType: 'User' });
          if (!referrerWallet) {
            referrerWallet = await Wallet.create({ ownerId: referral.referrerId, ownerType: 'User' });
          }

          // Credit referrer
          const refPrevBalance = referrerWallet.balance || 0;
          const refNewBalance = refPrevBalance + rewardAmount;
          await Wallet.findByIdAndUpdate(referrerWallet._id, { balance: refNewBalance });

          // Create ledger entry
          await WalletTransaction.create({
            walletId: referrerWallet._id,
            ownerId: referral.referrerId,
            ownerType: 'User',
            type: 'credit',
            category: 'referral_bonus',
            amount: rewardAmount,
            balanceAfter: refNewBalance,
            referenceId: referral._id,
            referenceType: 'Referral',
            description: `Referral bonus for inviting ${customer.name}`,
          });

          // Update Referral doc
          referral.status = 'Converted';
          referral.rewardStatus = 'Credited';
          referral.rewardCreditedAt = new Date();
          await referral.save();

          // 🔔 Notify referrer about bonus
          const referrerUser = await User.findById(referral.referrerId).select('fcmTokens');
          sendNotification({
            recipientId: referral.referrerId,
            recipientType: 'customer',
            fcmTokens: referrerUser?.fcmTokens || [],
            type: 'referral',
            title: '🎊 Referral Bonus Credited!',
            message: `₹${rewardAmount} has been added to your wallet because ${customer.name} made their first purchase using your referral!`,
            icon: 'group_add',
            referenceId: referral._id,
            referenceType: 'Referral',
          });

          logger.info(`[Referral] Awarded ₹${rewardAmount} to user ${referral.referrerId} for referring ${customer._id}`);
        }
      }
    }

    // 10. Update vendor stats
    await Vendor.findByIdAndUpdate(vendor._id, {
      $inc: { 'stats.totalRevenue': parseFloat(amount) }
    });

    // 11. Update User's Recent Vendors (max 10)
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { recentVendors: vendor._id } // Remove if exists
    });
    await User.findByIdAndUpdate(req.user.id, {
      $push: { recentVendors: { $each: [vendor._id], $position: 0, $slice: 10 } } // Push to start, max 10
    });

    // 11. Send Notification to customer
    sendNotification({
      recipientId: customer._id,
      recipientType: 'customer',
      fcmTokens: customer.fcmTokens || [],
      type: 'credit',
      title: '🎉 Cashback Credited!',
      message: `You received ₹${cashbackAmount} cashback from ${vendor.storeName}. Wallet balance: ₹${newBalance}`,
      icon: 'payments',
      referenceId: txn._id,
      referenceType: 'transaction',
    });

    // 11.5 Send Notification to vendor
    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'credit',
      title: '💸 New Payment Received!',
      message: `You received a payment of ₹${amount} from ${customer.name || customer.phone}. Cashback of ₹${cashbackAmount} was deducted from your wallet.`,
      icon: 'payments',
      referenceId: txn._id,
      referenceType: 'transaction',
    });

    // 12. Return success response
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
    const { amount, vendorZeebacId } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ success: false, message: 'Invalid amount' });

    // --- Strict Vendor Balance Check ---
    if (vendorZeebacId) {
      const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });
      
      const expectedCashback = Math.round(amount * (vendor.cashbackRate / 100) * 100) / 100;
      let vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
      const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
      
      if (vendorBalance < expectedCashback) {
        return res.status(400).json({ 
          success: false, 
          message: `Vendor cannot accept this payment. Vendor wallet balance is too low to provide ₹${expectedCashback} cashback.` 
        });
      }
    }
    // -----------------------------------

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

    checkAndNotifyFraud(txn).catch(e => logger.error('Fraud check failed', e));

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

    // Update Vendor Wallet: Credit the bill amount, then debit the cashback
    let vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    if (!vendorWallet) {
      vendorWallet = await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId });
    }

    // 1. Credit the Bill Amount
    const vBalanceAfterCredit = (vendorWallet.balance || 0) + parseFloat(amount);
    await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vBalanceAfterCredit });
    await WalletTransaction.create({
      walletId: vendorWallet._id, ownerId: vendor._id, ownerType: 'Vendor',
      type: 'credit', category: 'payment_received', amount: parseFloat(amount),
      balanceAfter: vBalanceAfterCredit, referenceId: txn._id, referenceType: 'Transaction',
      description: `Payment received from ${customer.name} (Razorpay)`
    });

    // 2. Debit the Cashback
    const vBalanceAfterDebit = vBalanceAfterCredit - cashbackAmount;
    await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vBalanceAfterDebit });
    await WalletTransaction.create({
      walletId: vendorWallet._id, ownerId: vendor._id, ownerType: 'Vendor',
      type: 'debit', category: 'cashback', amount: cashbackAmount,
      balanceAfter: vBalanceAfterDebit, referenceId: txn._id, referenceType: 'Transaction',
      description: `Cashback given to ${customer.name}`
    });

    await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } });

    // Update User's Recent Vendors (max 10)
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { recentVendors: vendor._id }
    });
    await User.findByIdAndUpdate(req.user.id, {
      $push: { recentVendors: { $each: [vendor._id], $position: 0, $slice: 10 } }
    });

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

// ─── Phase 4C: Vendor Discovery ───

// 1. Search vendors by name, category, or zeebacId
export const searchVendors = async (req, res) => {
  try {
    const { q, lat, lng } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }
    
    const query = {
      status: 'Verified',
      $or: [
        { storeName: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { zeebacId: { $regex: q, $options: 'i' } }
      ]
    };

    if (lat && lng) {
      // Global search, but nearest first
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          }
        }
      };
    }

    const vendors = await Vendor.find(query)
      .select('storeName category cashbackRate address stats storeLogo profilePic zeebacId location')
      .limit(50);
      
    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    logger.error(`searchVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 1.5 Get dynamic categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Vendor.distinct('category', { status: 'Verified' });
    const shopTypes = await Vendor.distinct('shopType', { status: 'Verified' });
    
    // Combine them and ensure 'All' is first
    const dynamicList = ['All', ...shopTypes, ...categories].filter(Boolean);
    
    res.status(200).json({ success: true, data: dynamicList });
  } catch (error) {
    logger.error(`getCategories error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 2. Get vendors by category (or all)
export const getVendorsByCategory = async (req, res) => {
  try {
    const { name } = req.params;
    const { lat, lng } = req.query;
    
    
    let query = {};
    if (name !== 'All') {
      if (name === 'Independent Store' || name === 'Chain & Brand') {
        query.shopType = name;
      } else {
        query.category = name;
      }
    }
    
    query.status = 'Verified';
    
    if (lat && lng) {
      // 70km max radius for Explore (Nearby)
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: 50000 // 50 kilometers
        }
      };
    }
    
    const vendors = await Vendor.find(query)
      .select('storeName category cashbackRate address stats storeLogo profilePic zeebacId location')
      .limit(50);
      
    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    logger.error(`getVendorsByCategory error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 3. Toggle favorite vendor
export const toggleFavoriteVendor = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { vendorId } = req.params;
    
    // Check if the vendor is already a favorite
    const isFav = user.favoriteVendors && user.favoriteVendors.some(id => id.toString() === vendorId);
    
    if (isFav) {
      // Remove from favorites
      user.favoriteVendors = user.favoriteVendors.filter(id => id.toString() !== vendorId);
    } else {
      // Add to favorites
      user.favoriteVendors = [...(user.favoriteVendors || []), vendorId];
    }
    
    await user.save();
    res.status(200).json({ success: true, isFavorite: !isFav });
  } catch (error) {
    logger.error(`toggleFavoriteVendor error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 4. Get user's favorite vendors
export const getFavoriteVendors = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('favoriteVendors', 'storeName category cashbackRate address storeLogo zeebacId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, data: user.favoriteVendors || [] });
  } catch (error) {
    logger.error(`getFavoriteVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Phase 4D: Wallet & Passbook ───

// 1. Get Wallet and Recent Ledger
export const getMyWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ ownerId: req.user.id, ownerType: 'User' });
    const ledger = await WalletTransaction.find({ ownerId: req.user.id, ownerType: 'User' })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, data: { wallet, ledger } });
  } catch (error) {
    logger.error(`getMyWallet error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 2. Get Transaction History
export const getMyTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    logger.error(`getMyTransactions error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Phase 4E: Profile, Cashback Requests & Storefront ───

export const updateUserProfile = async (req, res) => {
  try {
    const { name, email, phone, profileImage } = req.body; // allowing phone update might require OTP in real scenario, keeping it simple here
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, phone, profileImage },
      { new: true, select: '-password -refreshToken -otp -otpExpiry' }
    );
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateUserProfile error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const createCashbackRequest = async (req, res) => {
  try {
    const { vendorId, amount, billImageUrl, description } = req.body;
    const request = await CashbackRequest.create({
      customerId: req.user.id,
      vendorId, 
      amount, 
      billImageUrl, 
      description,
      status: 'Pending'
    });

    // Notify vendor about new request
    const vendor = await Vendor.findById(vendorId).select('fcmTokens');
    if (vendor) {
      sendNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        fcmTokens: vendor.fcmTokens || [],
        type: 'approval',
        title: '📝 New Cashback Request!',
        message: `A customer has requested cashback for a bill of ₹${amount}. Please review it in your pending requests.`,
        icon: 'receipt',
        referenceId: request._id,
        referenceType: 'cashback_request',
      });
    }

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    logger.error(`createCashbackRequest error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getMyCashbackRequests = async (req, res) => {
  try {
    const requests = await CashbackRequest.find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('vendorId', 'storeName zeebacId');
    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    logger.error(`getMyCashbackRequests error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getCashbackRequestById = async (req, res) => {
  try {
    const request = await CashbackRequest.findOne({
      _id: req.params.id, 
      customerId: req.user.id
    }).populate('vendorId', 'storeName zeebacId');
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: request });
  } catch (error) {
    logger.error(`getCashbackRequestById error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getVendorProducts = async (req, res) => {
  try {
    const products = await Product.find({ vendorId: req.params.vendorId, isActive: true });
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    logger.error(`getVendorProducts error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getNearbyVendors = async (req, res) => {
  try {
    const { lat, lng, radius = 10000 } = req.query; // Default 10km radius

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    const vendors = await Vendor.find({
      status: 'Verified',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).select('storeName zeebacId category storeLogo profilePic address cashbackRate stats');

    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    logger.error(`getNearbyVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getRecentVendors = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'recentVendors',
      select: 'storeName zeebacId category storeLogo profilePic address cashbackRate stats',
      match: { status: 'Verified' }
    });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    // Filter out nulls in case some vendors were deleted or suspended
    const validVendors = user.recentVendors.filter(v => v != null);
    
    res.status(200).json({ success: true, data: validVendors });
  } catch (error) {
    logger.error(`getRecentVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const requestWithdrawal = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 50) return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₹50' });

    let wallet = await Wallet.findOne({ ownerId: req.user.id, ownerType: 'User' });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Deduct balance
    wallet.balance -= amount;
    await wallet.save();

    // Create wallet transaction
    const withdrawalTx = await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: wallet.ownerId,
      ownerType: 'User',
      type: 'debit',
      amount,
      balanceAfter: wallet.balance,
      category: 'cashout',
      description: 'Bank Withdrawal Request',
      status: 'Pending'
    });

    // 🔔 Notify user about withdrawal status
    sendNotification({
      recipientId: req.user.id,
      recipientType: 'customer',
      fcmTokens: (await User.findById(req.user.id).select('fcmTokens'))?.fcmTokens || [],
      type: 'system',
      title: '⏳ Withdrawal Request Received',
      message: `Your withdrawal request for ₹${amount} is pending Admin review. It will be processed in 24-48 hrs.`,
      icon: 'schedule',
    });

    res.status(200).json({ 
      success: true, 
      data: withdrawalTx, 
      message: 'Withdrawal requested successfully (Pending Admin Approval)' 
    });
  } catch (error) {
    logger.error(`requestWithdrawal error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getUserWithdrawals = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ ownerId: req.user.id, ownerType: 'User' });
    if (!wallet) return res.status(200).json({ success: true, data: [] });

    const withdrawals = await WalletTransaction.find({
      walletId: wallet._id,
      category: 'cashout'
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: withdrawals });
  } catch (error) {
    logger.error(`getUserWithdrawals error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Phase C: Dynamic Rewards & Offers ───
export const getRewardData = async (req, res) => {
  try {
    let config = await RewardConfig.findOne();
    if (!config) {
      config = { milestoneInterval: 5, minScratchReward: 5, maxScratchReward: 50, isActive: true };
    }
    const offers = await PartnerOffer.find({ isActive: true }).sort({ createdAt: -1 });
    const user = await User.findById(req.user.id);
    
    res.status(200).json({ success: true, data: { config, offers, scratchCardsClaimed: user?.scratchCardsClaimed || 0 } });
  } catch (error) {
    logger.error(`getRewardData error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const claimScratchCard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Get config for reward range and interval
    let config = await RewardConfig.findOne();
    const min = config?.minScratchReward || 5;
    const max = config?.maxScratchReward || 50;
    const interval = config?.milestoneInterval || 5;
    
    // Count user transactions
    const txCount = await Transaction.countDocuments({ customerId: user._id });
    const unlockedCardsCount = Math.floor(txCount / interval);
    
    // Check if they have available scratch cards
    if (user.scratchCardsClaimed >= unlockedCardsCount) {
      return res.status(400).json({ success: false, message: 'No unlocked scratch cards available' });
    }
    
    // Calculate random reward
    const rewardAmount = Math.floor(Math.random() * (max - min + 1)) + min;

    // Credit wallet
    let wallet = await Wallet.findOne({ ownerId: user.id, ownerType: 'User' });
    if (!wallet) {
      wallet = await Wallet.create({ ownerId: user.id, ownerType: 'User', balance: 0 });
      user.walletId = wallet._id;
    }

    wallet.balance += rewardAmount;
    await wallet.save();

    // Log wallet transaction
    await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: user.id,
      ownerType: 'User',
      type: 'credit',
      amount: rewardAmount,
      balanceAfter: wallet.balance,
      category: 'scratch_card_reward',
      description: 'Scratch Card Reward'
    });

    // Update user claimed count
    user.scratchCardsClaimed += 1;
    await user.save();

    // Send notification
    sendNotification({
      recipientId: user._id,
      recipientType: 'customer',
      fcmTokens: user.fcmTokens || [],
      type: 'credit',
      title: '🎁 Scratch Card Reward!',
      message: `Congratulations! ₹${rewardAmount} has been added to your wallet.`,
      icon: 'stars',
    });

    res.status(200).json({ 
      success: true, 
      data: { rewardAmount, scratchCardsClaimed: user.scratchCardsClaimed, newBalance: wallet.balance } 
    });
  } catch (error) {
    logger.error(`claimScratchCard error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const processWalletPayment = async (req, res) => {
  try {
    const { vendorZeebacId, amount } = req.body;

    if (!amount || amount < 1) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });

    const customer = await User.findById(req.user.id);
    let userWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    if (!userWallet) {
      userWallet = await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId });
    }

    if (userWallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

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
      cashbackAmount, paymentMethod: 'Wallet', status: 'Approved'
    });

    checkAndNotifyFraud(txn).catch(e => logger.error('Fraud check failed', e));

    // --- Process User Wallet ---
    // 1. Debit Bill Amount
    const uBalanceAfterDebit = userWallet.balance - amount;
    await Wallet.findByIdAndUpdate(userWallet._id, { balance: uBalanceAfterDebit });
    await WalletTransaction.create({
      walletId: userWallet._id, ownerId: customer._id, ownerType: 'User',
      type: 'debit', category: 'payment_received', amount: amount, // using payment_received category temporarily for debit too, or 'cashout' maybe? Let's use 'withdrawal' or add 'payment_sent'
      balanceAfter: uBalanceAfterDebit, referenceId: txn._id, referenceType: 'Transaction',
      description: `Payment to ${vendor.storeName} (Wallet)`
    });

    // 2. Credit Cashback
    const uBalanceAfterCredit = uBalanceAfterDebit + cashbackAmount;
    await Wallet.findByIdAndUpdate(userWallet._id, { balance: uBalanceAfterCredit });
    await WalletTransaction.create({
      walletId: userWallet._id, ownerId: customer._id, ownerType: 'User',
      type: 'credit', category: 'cashback', amount: cashbackAmount,
      balanceAfter: uBalanceAfterCredit, referenceId: txn._id, referenceType: 'Transaction',
      description: `Cashback from ${vendor.storeName}`
    });

    // --- Process Vendor Wallet ---
    let vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    if (!vendorWallet) {
      vendorWallet = await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId });
    }

    // 1. Credit Bill Amount
    const vBalanceAfterCredit = (vendorWallet.balance || 0) + parseFloat(amount);
    await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vBalanceAfterCredit });
    await WalletTransaction.create({
      walletId: vendorWallet._id, ownerId: vendor._id, ownerType: 'Vendor',
      type: 'credit', category: 'payment_received', amount: parseFloat(amount),
      balanceAfter: vBalanceAfterCredit, referenceId: txn._id, referenceType: 'Transaction',
      description: `Payment received from ${customer.name} (Wallet)`
    });

    // 2. Debit Cashback
    const vBalanceAfterDebit = vBalanceAfterCredit - cashbackAmount;
    await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vBalanceAfterDebit });
    await WalletTransaction.create({
      walletId: vendorWallet._id, ownerId: vendor._id, ownerType: 'Vendor',
      type: 'debit', category: 'cashback', amount: cashbackAmount,
      balanceAfter: vBalanceAfterDebit, referenceId: txn._id, referenceType: 'Transaction',
      description: `Cashback given to ${customer.name}`
    });

    await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } });

    // Update User's Recent Vendors (max 10)
    await User.findByIdAndUpdate(req.user.id, { $pull: { recentVendors: vendor._id } });
    await User.findByIdAndUpdate(req.user.id, { $push: { recentVendors: { $each: [vendor._id], $position: 0, $slice: 10 } } });

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
        vendor: { name: vendor.storeName },
        cashbackEarned: cashbackAmount,
        newBalance: uBalanceAfterCredit
      }
    });

  } catch (error) {
    logger.error(`processWalletPayment error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
