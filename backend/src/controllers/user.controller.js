import mongoose from 'mongoose';
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
import { sendNotification } from '../services/notification.service.js';
import { checkAndNotifyFraud, notifyAdmins } from '../utils/adminNotification.js';
import { calculateCashback } from '../utils/cashback.util.js';
import { debitWallet, creditWallet, InsufficientBalanceError, DuplicatePaymentError, assertGatewayPaymentNotProcessed } from '../utils/wallet.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import { getRazorpayInstance, verifyRazorpaySignature, fetchVerifiedPaymentAmount } from '../utils/razorpay.util.js';
import { haversineDistanceMeters } from '../utils/geo.util.js';
import { getStoreVisibilityQuery, getVendorSubscriptionState } from '../utils/subscription.util.js';
import {
  assertWithinDailyRequestLimit,
  assertNoRecentDuplicateRequest,
  DailyLimitExceededError,
  DuplicateRequestError,
  HIGH_VALUE_THRESHOLD,
} from '../utils/cashbackRequestLimits.util.js';
import { signQrToken, verifyQrToken, looksLikeQrToken, CUSTOMER_QR_TTL_SECONDS } from '../utils/qr.util.js';

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
      { returnDocument: 'after' }
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

// Accepts either a manually-typed Zeebac ID/phone (unchanged behavior) OR a
// signed QR token scanned from a vendor's own QR code (see
// getVendorQrToken in vendor.controller.js). This is what makes
// ScanQRScreen.jsx's camera scan resolve to a real vendor instead of just
// telling the user to type the ID manually.
export const lookupVendorById = async (req, res) => {
  try {
    const { query } = req.params; // ZBV-1234, phone number, or a scanned QR token
    const raw = query.trim();

    let vendorFilter;
    if (looksLikeQrToken(raw)) {
      let decoded;
      try {
        decoded = verifyQrToken(raw);
      } catch {
        return res.status(400).json({ success: false, message: 'This QR code has expired or is invalid. Ask the vendor to refresh it.' });
      }
      if (decoded.type !== 'vendor') {
        return res.status(400).json({ success: false, message: 'That QR code is not a vendor QR.' });
      }
      vendorFilter = { status: 'Verified', zeebacId: decoded.zeebacId };
    } else {
      vendorFilter = { status: 'Verified', $or: [{ zeebacId: raw.toUpperCase() }, { phone: raw }] };
    }

    const vendor = await Vendor.findOne(vendorFilter)
      .select('zeebacId storeName category cashbackRate phone address storeLogo profilePic description operatingHours stats socialLinks subscription shopType');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'No verified vendor found with this ID or phone.' });
    }

    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const balance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, balance);

    const vendorObj = vendor.toObject ? vendor.toObject() : vendor;
    vendorObj.isStoreInactive = !subState.isStoreVisible;
    vendorObj.isStoreVisible = subState.isStoreVisible;
    vendorObj.cashbackBlocked = subState.cashbackBlocked;
    vendorObj.cashbackBlockedReason = subState.cashbackBlockedReason;
    vendorObj.subscriptionState = subState;

    res.status(200).json({ success: true, data: vendorObj });
  } catch (error) {
    logger.error(`lookupVendorById error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getMyQrToken = async (req, res) => {
  try {
    const customer = await User.findById(req.user.id).select('zeebacId');
    if (!customer) return res.status(404).json({ success: false, message: 'User not found' });

    const token = signQrToken({ type: 'customer', id: customer._id, zeebacId: customer.zeebacId }, CUSTOMER_QR_TTL_SECONDS);
    res.status(200).json({ success: true, data: { token, expiresIn: CUSTOMER_QR_TTL_SECONDS } });
  } catch (error) {
    logger.error(`getMyQrToken error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// A customer declaring "I paid cash" used to move real money instantly with
// no vendor confirmation of any kind — any logged-in customer could submit
// any verified vendor's public zeebacId and drain their wallet on demand.
// This now creates a CashbackRequest (the same model/approval pipeline
// already used for receipt claims) so a vendor has to confirm the payment
// actually happened before any cashback moves. See respondToCashbackRequest
// for the approval step and where the money actually changes hands.
export const createCustomerTransaction = async (req, res) => {
  try {
    const { vendorZeebacId, amount, paymentMethod } = req.body;

    if (!vendorZeebacId || !amount || amount < 1) {
      return res.status(400).json({ success: false, message: 'vendorZeebacId and amount (>=1) required' });
    }

    const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });
    }

    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    if (!subState.isSubActive) {
      return res.status(400).json({
        success: false,
        message: 'Cashback blocked due to subscription expiry'
      });
    }

    if (vendorBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cashback blocked due to insufficient cashback wallet balance.'
      });
    }

    const customer = await User.findById(req.user.id);
    if (!customer || customer.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Customer account is not active' });
    }

    await assertWithinDailyRequestLimit(customer._id);
    await assertNoRecentDuplicateRequest(customer._id, vendor._id, parseFloat(amount));

    const cashbackAmount = calculateCashback(amount, vendor.cashbackRate);

    if ((vendorWallet?.balance || 0) < cashbackAmount) {
      return res.status(400).json({
        success: false,
        message: `This vendor's wallet balance is currently too low to provide ₹${cashbackAmount} cashback. Try again later or use another payment method.`,
      });
    }

    const request = await CashbackRequest.create({
      customerId: customer._id,
      vendorId: vendor._id,
      amount: parseFloat(amount),
      requestType: 'cash_claim',
      paymentMethod: paymentMethod || 'Cash',
      status: 'Pending',
    });

    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'approval',
      title: '📝 New Cashback Request!',
      message: `${customer.name || customer.phone} says they paid ₹${amount} in cash. Approve to send ₹${cashbackAmount} cashback.`,
      icon: 'receipt',
      referenceId: request._id,
      referenceType: 'cashback_request',
    });

    res.status(201).json({
      success: true,
      message: 'Sent to the vendor for approval. You will be notified once they confirm.',
      data: {
        requestId: request._id,
        amount: request.amount,
        estimatedCashback: cashbackAmount,
        vendorName: vendor.storeName,
        status: request.status,
      },
    });
  } catch (error) {
    if (error instanceof DailyLimitExceededError || error instanceof DuplicateRequestError) {
      return res.status(429).json({ success: false, message: error.message });
    }
    logger.error(`createCustomerTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 1. Create Razorpay Order
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, vendorZeebacId } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ success: false, message: 'Invalid amount' });

    // --- Strict Vendor Subscription & Balance Check ---
    if (vendorZeebacId) {
      const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });
      
      let vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
      const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
      const subState = getVendorSubscriptionState(vendor, vendorBalance);

      if (!subState.isSubActive) {
        return res.status(400).json({
          success: false,
          message: 'Cashback blocked due to subscription expiry'
        });
      }

      if (vendorBalance <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cashback blocked due to insufficient cashback wallet balance.'
        });
      }

      const expectedCashback = Math.round(amount * (vendor.cashbackRate / 100) * 100) / 100;
      if (vendorBalance < expectedCashback) {
        return res.status(400).json({ 
          success: false, 
          message: `Vendor cannot accept this payment. Vendor wallet balance is too low to provide ₹${expectedCashback} cashback.` 
        });
      }
    }
    // -----------------------------------

    const options = {
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}` // Max length is 40 chars
    };

    const order = await getRazorpayInstance().orders.create(options);
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
//
// Previously trusted the client's own `amount` field for both the
// Transaction record and every wallet movement — the signature never covers
// amount at all, so a real ₹1 payment could be verified and then processed
// as if it were any amount the client claimed. Also had no protection
// against the same payment being verified (and credited) twice.
export const verifyRazorpayAndCreateTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, vendorZeebacId, paymentMethod } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !vendorZeebacId) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Trust Razorpay's own record of what was actually captured, not the client.
    const verifiedAmount = await fetchVerifiedPaymentAmount(razorpay_payment_id);

    const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });
    const customer = await User.findById(req.user.id);

    const cashbackAmount = calculateCashback(verifiedAmount, vendor.cashbackRate);
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    let txn;
    let referralAward = null;

    await session.withTransaction(async () => {
      await assertGatewayPaymentNotProcessed(session, razorpay_payment_id);

      const created = await Transaction.create([{
        transactionId, customerId: customer._id, customerZeebacId: customer.zeebacId,
        customerPhone: customer.phone, customerName: customer.name,
        vendorId: vendor._id, vendorZeebacId: vendor.zeebacId,
        vendorName: vendor.storeName, vendorPhone: vendor.phone,
        vendorCategory: vendor.category, type: 'qr_cashback',
        initiatedBy: 'customer', source: 'customer_request',
        amount: verifiedAmount, cashbackPercent: vendor.cashbackRate,
        cashbackAmount, paymentMethod, status: 'Approved',
      }], { session });
      txn = created[0];

      await creditWallet({
        session, ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId,
        amount: cashbackAmount, category: 'cashback',
        description: `Cashback from ${vendor.storeName}`,
        referenceId: txn._id, referenceType: 'Transaction',
        gateway: { gatewayName: 'Razorpay', gatewayOrderId: razorpay_order_id, gatewayPaymentId: razorpay_payment_id },
      });

      // Vendor receives the bill amount as an in-app wallet credit, then the
      // cashback is deducted straight back out of that same wallet.
      await creditWallet({
        session, ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId,
        amount: verifiedAmount, category: 'payment_received',
        description: `Payment received from ${customer.name} (Razorpay)`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      await debitWallet({
        session, ownerId: vendor._id, ownerType: 'Vendor',
        amount: cashbackAmount, category: 'cashback',
        description: `Cashback given to ${customer.name}`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': verifiedAmount } }, { session });

      referralAward = await claimFirstPurchaseReferralBonus({ session, customer });
    });

    // Update User's Recent Vendors (max 10) — not money-critical, fine outside the transaction.
    await User.findByIdAndUpdate(req.user.id, { $pull: { recentVendors: vendor._id } });
    await User.findByIdAndUpdate(req.user.id, {
      $push: { recentVendors: { $each: [vendor._id], $position: 0, $slice: 10 } }
    });

    if (referralAward) {
      sendNotification({
        recipientId: referralAward.referrerId,
        recipientType: 'customer',
        fcmTokens: referralAward.referrerFcmTokens,
        type: 'referral',
        title: '🎊 Referral Bonus Credited!',
        message: `₹${referralAward.rewardAmount} has been added to your wallet because ${referralAward.customerName} made their first purchase using your referral!`,
        icon: 'group_add',
        referenceId: referralAward.referralId,
        referenceType: 'Referral',
      });
    }

    checkAndNotifyFraud(txn).catch(e => logger.error('Fraud check failed', e));

    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });

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
        newWalletBalance: customerWallet?.balance,
        vendorName: vendor.storeName
      }
    });
  } catch (error) {
    if (error instanceof DuplicatePaymentError || error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This payment has already been processed.' });
    }
    logger.error(`verifyRazorpayAndCreateTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    session.endSession();
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
    
    const query = getStoreVisibilityQuery({
      $or: [
        { storeName: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { zeebacId: { $regex: q, $options: 'i' } }
      ]
    });

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
      .select('storeName category cashbackRate address stats storeLogo profilePic zeebacId location subscription shopType')
      .limit(50);

    const visibleVendors = vendors
      .filter(vendor => {
        const state = getVendorSubscriptionState(vendor);
        return state.isStoreVisible;
      })
      .map(vendor => {
        const vObj = vendor.toObject ? vendor.toObject() : { ...vendor };
        const state = getVendorSubscriptionState(vendor);
        vObj.isStoreVisible = state.isStoreVisible;
        vObj.inGracePeriod = state.inGracePeriod;
        vObj.cashbackBlocked = state.cashbackBlocked;
        vObj.subscriptionState = state;
        return vObj;
      });
      
    res.status(200).json({ success: true, data: visibleVendors });
  } catch (error) {
    logger.error(`searchVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 1.5 Get dynamic categories
export const getCategories = async (req, res) => {
  try {
    const visQuery = getStoreVisibilityQuery();
    const vendors = await Vendor.find(visQuery).select('category shopType subscription status');
    const validVendors = vendors.filter(v => getVendorSubscriptionState(v).isStoreVisible);
    const categories = [...new Set(validVendors.map(v => v.category).filter(Boolean))];
    const shopTypes = [...new Set(validVendors.map(v => v.shopType).filter(Boolean))];
    
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
    
    query = getStoreVisibilityQuery(query);
    
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
      .select('storeName category cashbackRate address stats storeLogo profilePic zeebacId location subscription shopType')
      .limit(50);

    const visibleVendors = vendors
      .filter(vendor => {
        const state = getVendorSubscriptionState(vendor);
        return state.isStoreVisible;
      })
      .map(vendor => {
        const vObj = vendor.toObject ? vendor.toObject() : { ...vendor };
        const state = getVendorSubscriptionState(vendor);
        vObj.isStoreVisible = state.isStoreVisible;
        vObj.inGracePeriod = state.inGracePeriod;
        vObj.cashbackBlocked = state.cashbackBlocked;
        vObj.subscriptionState = state;
        return vObj;
      });
      
    res.status(200).json({ success: true, data: visibleVendors });
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
      { returnDocument: 'after', select: '-password -refreshToken -otp -otpExpiry' }
    );
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateUserProfile error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// The no-POS "I have a receipt" flow. Unlike the quick cash_claim in
// createCustomerTransaction, this one requires an actual bill photo — routed
// through the same multer pipeline used for KYC documents (see
// user.routes.js) instead of the raw base64 JSON this used to accept, which
// bypassed multer's size/type checks entirely and let a customer submit a
// request with no photo despite the frontend claiming it was mandatory.
export const createCashbackRequest = async (req, res) => {
  try {
    const { vendorId, amount, description, paymentMethod, purchaseDate, billNumber, latitude, longitude } = req.body;

    if (!vendorId || !amount || amount < 1) {
      return res.status(400).json({ success: false, message: 'vendorId and amount (>=1) are required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A photo of the bill/receipt is required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Phase 6: Block cashback requests if vendor subscription is expired or wallet balance is <= 0
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    if (!subState.isSubActive) {
      return res.status(400).json({
        success: false,
        message: 'Cashback blocked due to subscription expiry'
      });
    }

    if (vendorBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cashback blocked due to insufficient cashback wallet balance.'
      });
    }

    const customer = await User.findById(req.user.id);
    if (!customer || customer.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Customer account is not active' });
    }

    await assertWithinDailyRequestLimit(customer._id);
    await assertNoRecentDuplicateRequest(customer._id, vendor._id, parseFloat(amount));

    const billImageUrl = req.file.url || (req.file.filename?.startsWith('http') ? req.file.filename : null);
    if (!billImageUrl) {
      return res.status(400).json({ success: false, message: 'Valid bill image upload is required' });
    }

    // GPS is advisory-only per product decision: never blocks submission,
    // just recorded (with the computed distance) for admin/vendor review —
    // the browser may not grant permission, or a customer may not be
    // physically at the shop when filing an after-the-fact claim.
    let location;
    let distanceFromVendorMeters;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      location = { type: 'Point', coordinates: [lng, lat] };
      if (vendor.location?.coordinates?.length === 2) {
        distanceFromVendorMeters = haversineDistanceMeters([lng, lat], vendor.location.coordinates);
      }
    }

    const isHighValue = parseFloat(amount) >= HIGH_VALUE_THRESHOLD;
    const trimmedBillNumber = billNumber ? String(billNumber).trim() : undefined;

    const request = await CashbackRequest.create({
      customerId: customer._id,
      vendorId: vendor._id,
      amount: parseFloat(amount),
      requestType: 'receipt_claim',
      billImageUrl,
      billNumber: trimmedBillNumber,
      description,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
      location,
      distanceFromVendorMeters,
      isHighValue,
      paymentMethod: paymentMethod || 'Other',
      status: 'Pending',
    });

    const billNumInfo = trimmedBillNumber ? ` (Bill No: ${trimmedBillNumber})` : '';

    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'approval',
      title: '📝 New Cashback Request!',
      message: `A customer has requested cashback for a bill of ₹${amount}${billNumInfo}. Please review it in your pending requests.`,
      icon: 'receipt',
      referenceId: request._id,
      referenceType: 'cashback_request',
    });

    // Non-blocking visibility for admins — vendor approval is unaffected.
    if (isHighValue) {
      notifyAdmins(
        'HIGH_VALUE_REQUEST',
        'High-value cashback request',
        `${customer.name || customer.phone} submitted a ₹${amount} receipt claim at ${vendor.storeName || 'a vendor'}.`
      ).catch((e) => logger.error('notifyAdmins (high-value request) failed', e));
    }

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    if (error instanceof DailyLimitExceededError || error instanceof DuplicateRequestError) {
      return res.status(429).json({ success: false, message: error.message });
    }
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

    const query = getStoreVisibilityQuery({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    });

    const vendors = await Vendor.find(query).select('storeName zeebacId category storeLogo profilePic address cashbackRate stats subscription shopType');

    const visibleVendors = vendors
      .filter(vendor => {
        const state = getVendorSubscriptionState(vendor);
        return state.isStoreVisible;
      })
      .map(vendor => {
        const vObj = vendor.toObject ? vendor.toObject() : { ...vendor };
        const state = getVendorSubscriptionState(vendor);
        vObj.isStoreVisible = state.isStoreVisible;
        vObj.inGracePeriod = state.inGracePeriod;
        vObj.cashbackBlocked = state.cashbackBlocked;
        vObj.subscriptionState = state;
        return vObj;
      });

    res.status(200).json({ success: true, data: visibleVendors });
  } catch (error) {
    logger.error(`getNearbyVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getRecentVendors = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'recentVendors',
      select: 'storeName zeebacId category storeLogo profilePic address cashbackRate stats subscription shopType',
      match: { status: 'Verified' }
    });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    // Filter out nulls and vendors whose stores are hidden (>24h expired or NONE)
    const validVendors = (user.recentVendors || [])
      .filter(v => v != null && getVendorSubscriptionState(v).isStoreVisible)
      .map(vendor => {
        const vObj = vendor.toObject ? vendor.toObject() : { ...vendor };
        const state = getVendorSubscriptionState(vendor);
        vObj.isStoreVisible = state.isStoreVisible;
        vObj.inGracePeriod = state.inGracePeriod;
        vObj.cashbackBlocked = state.cashbackBlocked;
        vObj.subscriptionState = state;
        return vObj;
      });
    
    res.status(200).json({ success: true, data: validVendors });
  } catch (error) {
    logger.error(`getRecentVendors error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const requestWithdrawal = async (req, res) => {
  try {
    const { amount } = req.body;
    const reqAmount = Number(amount);

    const config = (await RewardConfig.findOne()) || {};
    const minWithdrawal = config.userMinWithdrawalAmount ?? 250;
    const maxWithdrawal = config.userMaxWithdrawalAmount ?? 10000;
    const commissionPercent = config.userWithdrawalCommissionPercent ?? 2;

    if (!reqAmount || reqAmount < minWithdrawal) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ₹${minWithdrawal}` });
    }
    if (maxWithdrawal && reqAmount > maxWithdrawal) {
      return res.status(400).json({ success: false, message: `Maximum withdrawal limit per transaction is ₹${maxWithdrawal}` });
    }

    let wallet = await Wallet.findOne({ ownerId: req.user.id, ownerType: 'User' });
    if (!wallet || wallet.balance < reqAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    const feeAmount = Math.round(((reqAmount * commissionPercent) / 100) * 100) / 100;
    const netPayout = Math.round((reqAmount - feeAmount) * 100) / 100;

    // Deduct balance
    wallet.balance -= reqAmount;
    await wallet.save();

    // Create wallet transaction
    const withdrawalTx = await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: wallet.ownerId,
      ownerType: 'User',
      type: 'debit',
      amount: reqAmount,
      feeAmount,
      netPayout,
      balanceAfter: wallet.balance,
      category: 'cashout',
      description: `Bank Withdrawal Request (Fee: ₹${feeAmount}, Net: ₹${netPayout})`,
      status: 'Pending'
    });

    // 🔔 Notify user about withdrawal status
    sendNotification({
      recipientId: req.user.id,
      recipientType: 'customer',
      fcmTokens: (await User.findById(req.user.id).select('fcmTokens'))?.fcmTokens || [],
      type: 'system',
      title: '⏳ Withdrawal Request Received',
      message: `Your withdrawal request for ₹${reqAmount} (Net Payout: ₹${netPayout} after ${commissionPercent}% fee) is pending Admin review.`,
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
  const session = await mongoose.startSession();
  try {
    const { vendorZeebacId, amount } = req.body;

    if (!amount || amount < 1) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const vendor = await Vendor.findOne({ zeebacId: vendorZeebacId.toUpperCase(), status: 'Verified' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found or not verified' });

    const customer = await User.findById(req.user.id);
    const cashbackAmount = calculateCashback(amount, vendor.cashbackRate);
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    let txn;

    await session.withTransaction(async () => {
      const created = await Transaction.create([{
        transactionId, customerId: customer._id, customerZeebacId: customer.zeebacId,
        customerPhone: customer.phone, customerName: customer.name,
        vendorId: vendor._id, vendorZeebacId: vendor.zeebacId,
        vendorName: vendor.storeName, vendorPhone: vendor.phone,
        vendorCategory: vendor.category, type: 'qr_cashback',
        initiatedBy: 'customer', source: 'customer_request',
        amount: parseFloat(amount), cashbackPercent: vendor.cashbackRate,
        cashbackAmount, paymentMethod: 'Wallet', status: 'Approved',
      }], { session });
      txn = created[0];

      // Customer: debit the bill amount, then credit their own cashback back.
      await debitWallet({
        session, ownerId: customer._id, ownerType: 'User',
        amount: parseFloat(amount), category: 'payment_received',
        description: `Payment to ${vendor.storeName} (Wallet)`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      await creditWallet({
        session, ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId,
        amount: cashbackAmount, category: 'cashback',
        description: `Cashback from ${vendor.storeName}`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      // Vendor: credit the bill amount, then debit the cashback given.
      await creditWallet({
        session, ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId,
        amount: parseFloat(amount), category: 'payment_received',
        description: `Payment received from ${customer.name} (Wallet)`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      await debitWallet({
        session, ownerId: vendor._id, ownerType: 'Vendor',
        amount: cashbackAmount, category: 'cashback',
        description: `Cashback given to ${customer.name}`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } }, { session });
    });

    checkAndNotifyFraud(txn).catch(e => logger.error('Fraud check failed', e));

    await User.findByIdAndUpdate(req.user.id, { $pull: { recentVendors: vendor._id } });
    await User.findByIdAndUpdate(req.user.id, { $push: { recentVendors: { $each: [vendor._id], $position: 0, $slice: 10 } } });

    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });

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
        newBalance: customerWallet?.balance,
      }
    });

  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }
    logger.error(`processWalletPayment error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    session.endSession();
  }
};
