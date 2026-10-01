import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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
import AdminUser from '../models/AdminUser.js';
import OtpVerification from '../models/OtpVerification.js';
import logger from '../utils/logger.js';
import { sendOtpSms } from '../utils/sms.util.js';
import { verifyOtpOnly } from './auth.controller.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket/socket.js';
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
  assertCashRequestAllowed,
  DailyLimitExceededError,
  DuplicateRequestError,
  CashLimitExceededError,
  CashLocationRequiredError,
  CashLocationOutOfRangeError,
  CashDailyShopLimitError,
  HIGH_VALUE_THRESHOLD,
} from '../utils/cashbackRequestLimits.util.js';
import { signQrToken, verifyQrToken, looksLikeQrToken, CUSTOMER_QR_TTL_SECONDS } from '../utils/qr.util.js';
import { performOcrOnBill, matchBillWithSoftwarePos, executeInstantAutoCashbackApproval } from '../services/aiBillVerification.service.js';

// In-flight submission lock to prevent concurrent double/triple submits
const activeSubmissionLocks = new Set();

// ─── Get Customer Profile ───
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-refreshToken -otp -otpExpiry -security.securityPin');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const userObj = user.toObject();
    if (userObj.security) {
      userObj.security.hasPin = !!(await User.findById(req.user.id).select('security.securityPin'))?.security?.securityPin;
    }
    res.status(200).json({ success: true, data: userObj });
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

// ─── 1. Send OTP for Customer Bank Account Linking / Updating ───
export const sendUserBankOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const phone = user.phone;
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'No registered mobile number found on your account. Please update your profile phone number first.',
      });
    }

    const useDefaultOtp = process.env.USE_DEFAULT_OTP === 'true';
    const otp = useDefaultOtp ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();

    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);

    await OtpVerification.deleteMany({ phone, purpose: 'bank_update', role: 'customer' });

    await OtpVerification.create({
      phone,
      otpHash,
      purpose: 'bank_update',
      role: 'customer',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes validity
    });

    await sendOtpSms(phone, otp);

    const cleanPhone = phone.replace(/\D/g, '');
    const lastDigits = cleanPhone.slice(-4) || 'XXXX';
    const firstDigits = cleanPhone.slice(0, 2) || '';
    const maskedPhone = `+91 ${firstDigits}******${lastDigits}`;

    logger.info(`[sendUserBankOtp] Bank update OTP sent to user ${user._id} (${maskedPhone})`);

    res.status(200).json({
      success: true,
      message: `OTP sent successfully to registered mobile number ${maskedPhone}`,
      maskedPhone,
    });
  } catch (error) {
    logger.error(`Error in sendUserBankOtp: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Failed to send OTP' });
  }
};

// ─── 2. Verify OTP & Update Linked Account ───
export const updateLinkedAccount = async (req, res) => {
  try {
    const { upiId, bankName, accNo, accountHolderName, ifscCode, otp } = req.body;

    if (!bankName?.trim()) {
      return res.status(400).json({ success: false, message: 'Receiving bank name is required' });
    }
    const cleanAcc = (accNo || '').toString().trim();
    if (!cleanAcc || cleanAcc.length < 4) {
      return res.status(400).json({ success: false, message: 'Valid bank account number is required' });
    }
    if (!otp?.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Verification OTP is required to link bank account' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!user.phone) {
      return res.status(400).json({ success: false, message: 'No registered mobile number found' });
    }

    // Verify OTP
    try {
      await verifyOtpOnly(user.phone, otp.toString().trim(), 'bank_update', 'customer');
    } catch (otpErr) {
      return res.status(400).json({ success: false, message: otpErr.message || 'Invalid or expired OTP' });
    }

    // Save Bank Details
    const now = new Date();
    user.bankDetails = {
      accountHolderName: (accountHolderName || user.name || '').trim(),
      bankName: bankName.trim(),
      accountNumber: cleanAcc,
      ifscCode: (ifscCode || '').toString().trim().toUpperCase(),
      upiId: (upiId || '').toString().trim(),
      isVerified: true,
      verifiedAt: now,
    };
    await user.save();

    logger.info(`[updateLinkedAccount] User ${user._id} successfully verified & linked bank account ending in ${cleanAcc.slice(-4)}`);

    res.status(200).json({
      success: true,
      message: 'Bank account verified and linked successfully!',
      data: user.bankDetails,
    });
  } catch (error) {
    logger.error(`updateLinkedAccount error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
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
    if (raw.toLowerCase().startsWith('upi://') || raw.includes('tr=') || raw.includes('pa=')) {
      const trMatch = raw.match(/tr=([^&]+)/i);
      const paMatch = raw.match(/pa=([^&]+)/i);
      if (trMatch) {
        vendorFilter = { status: 'Verified', zeebacId: decodeURIComponent(trMatch[1]).toUpperCase() };
      } else if (paMatch) {
        vendorFilter = { status: 'Verified', 'bankDetails.upiId': decodeURIComponent(paMatch[1]).toLowerCase() };
      } else {
        vendorFilter = { status: 'Verified', $or: [{ zeebacId: raw.toUpperCase() }, { phone: raw }] };
      }
    } else if (looksLikeQrToken(raw)) {
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
      .select('zeebacId storeName category subCategory cashbackRate phone address storeLogo profilePic storeCoverImage storeImages description operatingHours stats socialLinks subscription shopType location');

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
// A customer declaring "I paid cash" used to move real money instantly with
// no vendor confirmation of any kind — any logged-in customer could submit
// any verified vendor's public zeebacId and drain their wallet on demand.
// This now creates a CashbackRequest with a 3-digit verification code sent to
// the vendor so the customer can enter it for auto-approval.
export const createCustomerTransaction = async (req, res) => {
  try {
    const { vendorZeebacId, amount, paymentMethod, latitude, longitude } = req.body;

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

    // Zero-Fraud Cash Mode Restrictions:
    // 1. Max ₹1,000 limit
    // 2. Daily max 3 cash requests per shop
    // 3. Nearby location check (within 300m)
    let geoResult = { distanceFromVendorMeters: null };
    const isCashPayment = !paymentMethod || paymentMethod === 'Cash';
    if (isCashPayment) {
      geoResult = await assertCashRequestAllowed({
        customerId: customer._id,
        vendor,
        amount,
        latitude,
        longitude,
        haversineDistanceMeters,
      });
    }

    const cashbackAmount = calculateCashback(amount, vendor.cashbackRate);

    if ((vendorWallet?.balance || 0) < cashbackAmount) {
      return res.status(400).json({
        success: false,
        message: `This vendor's wallet balance is currently too low to provide ₹${cashbackAmount} cashback. Try again later or use another payment method.`,
      });
    }

    // Generate 4-character verification code starting with 'Z' for cash requests (e.g. Z584)
    const verificationCode = 'Z' + Math.floor(100 + Math.random() * 900);
    const verificationExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins validity

    let location = undefined;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      location = { type: 'Point', coordinates: [lng, lat] };
    }

    const request = await CashbackRequest.create({
      customerId: customer._id,
      vendorId: vendor._id,
      amount: parseFloat(amount),
      requestType: 'cash_claim',
      paymentMethod: paymentMethod || 'Cash',
      status: 'Pending',
      verificationCode,
      verificationExpiresAt,
      location,
      distanceFromVendorMeters: geoResult.distanceFromVendorMeters,
    });

    // 1. Send OTP Notification to Vendor
    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'approval',
      title: `🔑 OTP: ${verificationCode} | Amount: ₹${amount}`,
      message: `Cash OTP: ${verificationCode} • Share with ${customer.name || customer.phone} (Cashback: ₹${cashbackAmount} on ₹${amount} cash)`,
      icon: 'pin',
      referenceId: request._id,
      referenceType: 'cashback_request',
      data: {
        requestId: request._id.toString(),
        verificationCode,
        amount: String(amount),
        cashbackAmount: String(cashbackAmount),
        isCashMode: 'true',
      },
    });

    // 2. Send Status Notification to Customer
    sendNotification({
      recipientId: customer._id,
      recipientType: 'customer',
      fcmTokens: customer.fcmTokens || [],
      type: 'approval',
      title: `⏳ Cash Request Sent: ₹${amount}`,
      message: `Ask ${vendor.storeName} for 4-digit code ${verificationCode} to auto-approve your ₹${cashbackAmount} cashback.`,
      icon: 'pin',
      referenceId: request._id,
      referenceType: 'cashback_request',
      data: {
        requestId: request._id.toString(),
        verificationCode,
        amount: String(amount),
        cashbackAmount: String(cashbackAmount),
        isCashMode: 'true',
      },
    });

    try {
      getIO()?.to(`vendor_${vendor._id}`).emit('new_cash_request', {
        requestId: request._id,
        customerName: customer.name || customer.phone,
        amount: parseFloat(amount),
        cashbackAmount,
        verificationCode,
        paymentMethod: 'Cash',
      });
    } catch (socketErr) {
      logger.warn(`Socket emit error for vendor ${vendor._id}: ${socketErr.message}`);
    }

    res.status(201).json({
      success: true,
      message: `Request sent to vendor! Ask the vendor for the code ${verificationCode} to auto-approve.`,
      data: {
        requestId: request._id,
        amount: request.amount,
        estimatedCashback: cashbackAmount,
        vendorName: vendor.storeName,
        status: request.status,
        verificationCode,
      },
    });
  } catch (error) {
    if (
      error instanceof DailyLimitExceededError ||
      error instanceof DuplicateRequestError ||
      error instanceof CashDailyShopLimitError
    ) {
      return res.status(429).json({ success: false, message: error.message });
    }
    if (
      error instanceof CashLimitExceededError ||
      error instanceof CashLocationRequiredError ||
      error instanceof CashLocationOutOfRangeError
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error(`createCustomerTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Customer enters the 3-digit verification code received from the vendor for instant auto-approval
export const verifyCashbackRequestCode = async (req, res) => {
  const { id } = req.params;
  const { code } = req.body;

  if (!code || !code.toString().trim()) {
    return res.status(400).json({ success: false, message: '3-digit verification code is required' });
  }

  const cleanCode = code.toString().trim();
  const session = await mongoose.startSession();

  try {
    const request = await CashbackRequest.findOne({
      _id: id,
      customerId: req.user.id,
      status: 'Pending',
    }).populate('vendorId').populate('customerId');

    if (!request) {
      const existing = await CashbackRequest.findOne({ _id: id, customerId: req.user.id });
      if (existing && existing.status === 'Approved') {
        return res.status(400).json({ success: false, message: 'This request has already been approved' });
      }
      return res.status(404).json({ success: false, message: 'Pending cashback request not found' });
    }

    const userCode = cleanCode.toUpperCase();
    const expectedCode = (request.verificationCode || '').toUpperCase();
    const isCodeMatch = (userCode === expectedCode) ||
                        (userCode === `Z${expectedCode}`) ||
                        (`Z${userCode}` === expectedCode) ||
                        (userCode.replace(/^Z/, '') === expectedCode.replace(/^Z/, ''));

    if (!isCodeMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please ask the vendor for the code (e.g. Z584).',
      });
    }

    if (request.verificationExpiresAt && request.verificationExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please submit a new request.',
      });
    }

    const vendor = request.vendorId;
    const customer = request.customerId;

    // Check vendor wallet & subscription
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    if (!subState.isSubActive) {
      return res.status(400).json({ success: false, message: 'Cashback blocked due to vendor subscription expiry' });
    }

    const cashbackAmount = calculateCashback(request.amount, vendor.cashbackRate);

    if (vendorBalance < cashbackAmount) {
      return res.status(400).json({ success: false, message: 'Vendor wallet balance is too low for this cashback payout' });
    }

    const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hr withdrawal lock
    const transactionId = `TX-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
    let txn = null;
    let referralAward = null;
    let customerNewBalance = 0;

    await session.withTransaction(async () => {
      // 1. Mark request as Approved
      request.status = 'Approved';
      request.lockedUntil = lockedUntil;
      await request.save({ session });

      // 2. Create Transaction Ledger Entry
      const createdTx = await Transaction.create([{
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
        type: 'receipt_claim',
        initiatedBy: 'customer',
        source: 'customer_request',
        amount: parseFloat(request.amount),
        cashbackPercent: vendor.cashbackRate,
        cashbackAmount,
        paymentMethod: 'Cash',
        status: 'Approved',
        hasReceipt: false,
      }], { session });
      txn = createdTx[0];

      // 3. Debit Vendor Wallet
      await debitWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        amount: cashbackAmount,
        category: 'cashback',
        description: `Approved cash cashback for ${customer.name || customer.phone} (Code Verified)`,
        referenceId: txn._id,
        referenceType: 'Transaction',
      });

      // 4. Credit Customer Wallet with 24-hr lock
      const walletRes = await creditWallet({
        session,
        ownerId: customer._id,
        ownerType: 'User',
        ownerZeebacId: customer.zeebacId,
        amount: cashbackAmount,
        category: 'cashback',
        description: `Cashback approved from ${vendor.storeName} (Cash Payment)`,
        referenceId: txn._id,
        referenceType: 'Transaction',
        lockedUntil,
      });
      customerNewBalance = walletRes.balance;

      // 5. Update vendor total revenue stats
      await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(request.amount) } }, { session });

      // 6. Referral reward check
      referralAward = await claimFirstPurchaseReferralBonus({ session, customer });
    });

    // Notify Customer
    sendNotification({
      recipientId: customer._id,
      recipientType: 'customer',
      fcmTokens: customer.fcmTokens || [],
      type: 'credit',
      title: '✅ Cashback Credited: ₹' + cashbackAmount,
      message: `₹${cashbackAmount} cashback from ${vendor.storeName} credited! (Locked for 24h from bank withdrawal)`,
      icon: 'check_circle',
      referenceId: txn._id,
      referenceType: 'transaction',
      data: {
        cashbackAmount: String(cashbackAmount),
        amount: String(request.amount),
        vendorName: vendor.storeName,
      },
    });

    // Notify Vendor with type 'credit' (renders green)
    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'credit',
      title: '✅ Cashback Successful: ₹' + cashbackAmount,
      message: `${customer.name || customer.phone}'s ₹${cashbackAmount} cashback auto-approved via OTP code ${cleanCode}.`,
      icon: 'verified',
      referenceId: txn._id,
      referenceType: 'transaction',
      data: {
        requestId: request._id.toString(),
        cashbackAmount: String(cashbackAmount),
        amount: String(request.amount),
        status: 'Approved',
        verificationCode: cleanCode,
      },
    });

    try {
      getIO()?.to(`customer_${customer._id}`).emit('cashback_approved', {
        requestId: request._id,
        cashbackAmount,
        amount: request.amount,
        vendorName: vendor.storeName,
        transactionId: txn.transactionId,
      });
      getIO()?.to(`vendor_${vendor._id}`).emit('cash_request_verified', {
        requestId: request._id,
        customerName: customer.name || customer.phone,
        cashbackAmount,
        amount: request.amount,
        verificationCode: cleanCode,
      });
    } catch (socketErr) {
      logger.warn(`Socket emit error on verification: ${socketErr.message}`);
    }

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
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cashback approved successfully! Locked for 24 hours for withdrawal safety.',
      data: {
        requestId: request._id,
        cashbackAmount,
        lockedUntil,
        status: 'Approved',
        transactionId: txn.transactionId,
        newWalletBalance: customerNewBalance,
      }
    });
  } catch (error) {
    logger.error(`verifyCashbackRequestCode error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  } finally {
    session.endSession();
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

// 1. Search vendors by name, category, or zeebacId with relevancy ranking
export const searchVendors = async (req, res) => {
  try {
    const rawQ = req.query.q || req.query.query || '';
    const q = rawQ.trim();
    const { lat, lng } = req.query;

    let baseQuery = {};
    if (q) {
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseQuery = {
        $or: [
          { storeName: { $regex: escapedQ, $options: 'i' } },
          { ownerName: { $regex: escapedQ, $options: 'i' } },
          { zeebacId: { $regex: escapedQ, $options: 'i' } },
          { category: { $regex: escapedQ, $options: 'i' } },
          { subCategory: { $regex: escapedQ, $options: 'i' } },
          { phone: { $regex: escapedQ, $options: 'i' } },
        ]
      };
    }
    
    const query = getStoreVisibilityQuery(baseQuery);

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
      .select('storeName ownerName category subCategory cashbackRate address stats storeLogo profilePic storeCoverImage storeImages zeebacId location subscription shopType phone')
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

    // Relevancy ranking: Pin exact and prefix matches on storeName to the top
    if (q) {
      const lowerQ = q.toLowerCase();
      visibleVendors.sort((a, b) => {
        const aName = (a.storeName || '').toLowerCase();
        const bName = (b.storeName || '').toLowerCase();
        const aId = (a.zeebacId || '').toLowerCase();
        const bId = (b.zeebacId || '').toLowerCase();
        const aOwner = (a.ownerName || '').toLowerCase();
        const bOwner = (b.ownerName || '').toLowerCase();

        // 1. Exact match on store name or zeebacId
        const aExact = aName === lowerQ || aId === lowerQ;
        const bExact = bName === lowerQ || bId === lowerQ;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // 2. Starts with search query in store name
        const aStarts = aName.startsWith(lowerQ);
        const bStarts = bName.startsWith(lowerQ);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // 3. Store name contains search query
        const aContains = aName.includes(lowerQ);
        const bContains = bName.includes(lowerQ);
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;

        // 4. Starts with in owner name
        const aOwnerStarts = aOwner.startsWith(lowerQ);
        const bOwnerStarts = bOwner.startsWith(lowerQ);
        if (aOwnerStarts && !bOwnerStarts) return -1;
        if (!aOwnerStarts && bOwnerStarts) return 1;

        // 5. Contains in owner name
        const aOwnerContains = aOwner.includes(lowerQ);
        const bOwnerContains = bOwner.includes(lowerQ);
        if (aOwnerContains && !bOwnerContains) return -1;
        if (!aOwnerContains && bOwnerContains) return 1;

        return 0;
      });
    }
      
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
    
    // Combine them and ensure 'All' is first — de-dupe across both groups,
    // since a vendor's shopType and another vendor's category can collide.
    const dynamicList = ['All', ...new Set([...shopTypes, ...categories])].filter(Boolean);
    
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
      .select('storeName category subCategory cashbackRate address stats storeLogo profilePic storeCoverImage storeImages zeebacId location subscription shopType')
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
    let wallet = await Wallet.findOne({ ownerId: req.user.id, ownerType: 'User' });
    if (!wallet) {
      wallet = await Wallet.create({
        ownerId: req.user.id,
        ownerType: 'User',
        ownerZeebacId: req.user.zeebacId || 'USER-INIT',
        balance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
      });
    }

    // Active locked cashback calculation (24-hour withdrawal lock or vendor hold)
    const activeLocked = await WalletTransaction.find({
      ownerId: req.user.id,
      ownerType: { $in: ['User', 'customer', 'user', 'Customer'] },
      type: 'credit',
      $or: [
        { lockedUntil: { $gt: new Date() } },
        { isHeld: true },
      ],
    });
    const lockedBalance = activeLocked.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const withdrawableBalance = Math.max(0, (wallet.balance || 0) - lockedBalance);

    const ledger = await WalletTransaction.find({ ownerId: req.user.id, ownerType: 'User' })
      .sort({ createdAt: -1 })
      .limit(50);

    const walletData = wallet.toObject();
    walletData.lockedBalance = lockedBalance;
    walletData.withdrawableBalance = withdrawableBalance;

    res.status(200).json({ success: true, data: { wallet: walletData, ledger } });
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
    const { name, email, phone, profileImage, preferences } = req.body; // allowing phone update might require OTP in real scenario, keeping it simple here
    const update = { name, email, phone, profileImage };
    if (preferences && typeof preferences === 'object') {
      for (const key of ['pushNotifications', 'smsNotifications', 'emailPromos']) {
        if (typeof preferences[key] === 'boolean') {
          update[`preferences.${key}`] = preferences[key];
        }
      }
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      update,
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
  const { vendorId, amount, description, paymentMethod, purchaseDate, billNumber, latitude, longitude } = req.body;
  const trimmedBillNumber = billNumber ? String(billNumber).trim() : undefined;
  const lockKey = `${req.user.id}_${vendorId}_${(trimmedBillNumber || amount || '').toString().toLowerCase()}`;

  if (activeSubmissionLocks.has(lockKey)) {
    return res.status(429).json({
      success: false,
      message: 'A cashback request for this bill is currently being processed. Please wait.',
    });
  }

  activeSubmissionLocks.add(lockKey);

  try {
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId) || !amount || isNaN(amount) || parseFloat(amount) < 1 || parseFloat(amount) > 10000000) {
      return res.status(400).json({ success: false, message: 'Valid vendorId and amount (between ₹1 and ₹1,00,00,000) are required' });
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

    // Explicit duplicate bill number check across vendor's pending/approved requests
    if (trimmedBillNumber) {
      const existingBillReq = await CashbackRequest.findOne({
        vendorId: vendor._id,
        billNumber: { $regex: new RegExp(`^${trimmedBillNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        status: { $in: ['Pending', 'Approved', 'Held'] },
      });
      if (existingBillReq) {
        return res.status(400).json({
          success: false,
          alreadyClaimed: existingBillReq.status === 'Approved',
          message: existingBillReq.status === 'Approved'
            ? 'This bill number has already been approved and claimed.'
            : 'A cashback request with this bill number has already been submitted and is pending review.',
        });
      }
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

    // Phase AI: Intelligent OCR & Software POS Bill Auto-Verification
    const imageSource = req.file.buffer || req.file.path || billImageUrl;
    const ocrResult = await performOcrOnBill(imageSource);

    const posMatch = await matchBillWithSoftwarePos({
      vendorId: vendor._id,
      billNumber: trimmedBillNumber,
      amount: parseFloat(amount),
      ocrResult,
    });

    // Fix 3: Hard-reject already claimed POS bills (NEVER allow pending/manual review)
    if (posMatch.alreadyClaimed) {
      return res.status(400).json({
        success: false,
        alreadyClaimed: true,
        message: 'This bill has already been claimed for cashback. Duplicate claims are not allowed.',
      });
    }

    // Fix 9: Reject expired bills
    if (posMatch.isExpired) {
      return res.status(400).json({
        success: false,
        isExpired: true,
        message: 'This bill has expired and is no longer eligible for cashback.',
      });
    }

    // Fix 2 & 8: Auto-approval requires full match + OCR corroboration + amount matching within tolerance
    const isAutoApproved = Boolean(
      posMatch.matched &&
      posMatch.ocrCorroborated &&
      !posMatch.amountMismatch
    );

    const request = await CashbackRequest.create({
      customerId: customer._id,
      vendorId: vendor._id,
      amount: isAutoApproved ? posMatch.posBill.amount : parseFloat(amount),
      requestType: 'receipt_claim',
      billImageUrl,
      billNumber: trimmedBillNumber || posMatch.posBill?.billCode || ocrResult.invoiceNumber,
      description,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
      location,
      distanceFromVendorMeters,
      isHighValue,
      paymentMethod: paymentMethod || 'Other',
      status: 'Pending',
      ocrExtractedText: ocrResult.rawText ? ocrResult.rawText.slice(0, 500) : null,
      ocrInvoiceNumber: ocrResult.invoiceNumber || null,
      ocrDetectedAmount: ocrResult.amount || null,
    });

    // If software bill matched and corroborated, execute instant auto-approval (No manual vendor approval required!)
    if (isAutoApproved) {
      try {
        const autoResult = await executeInstantAutoCashbackApproval({
          cashbackRequest: request,
          posBill: posMatch.posBill,
          vendor,
          customer,
        });

        return res.status(201).json({
          success: true,
          autoApproved: true,
          message: '🎉 Bill auto-verified with billing software! Cashback credited instantly without vendor approval.',
          data: autoResult.cashbackRequest,
          cashbackEarned: autoResult.cashbackEarned,
          transactionId: autoResult.transactionId,
          posBill: {
            billCode: posMatch.posBill.billCode,
            amount: posMatch.posBill.amount,
          },
          ocr: {
            detectedInvoiceNumber: ocrResult.invoiceNumber,
            detectedAmount: ocrResult.amount,
          },
        });
      } catch (autoErr) {
        logger.error(`AI auto-approval failed: ${autoErr.message}.`);
        // Fix 4: If bill was locked or claimed by a concurrent request, hard reject
        if (autoErr.message?.includes('BILL_ALREADY_CLAIMED')) {
          await CashbackRequest.findByIdAndDelete(request._id);
          return res.status(400).json({
            success: false,
            alreadyClaimed: true,
            message: 'This bill has already been claimed by another customer.',
          });
        }
        logger.info('Falling back to manual vendor review.');
      }
    }

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
      )?.catch?.((e) => logger.error('notifyAdmins (high-value request) failed', e));
    }

    res.status(201).json({ success: true, autoApproved: false, data: request });
  } catch (error) {
    if (error instanceof DailyLimitExceededError || error instanceof DuplicateRequestError) {
      return res.status(429).json({ success: false, message: error.message });
    }
    logger.error(`createCashbackRequest error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    activeSubmissionLocks.delete(lockKey);
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
    if (!mongoose.Types.ObjectId.isValid(req.params.vendorId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
    }
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

    const vendors = await Vendor.find(query).select('storeName zeebacId category subCategory storeLogo profilePic storeCoverImage storeImages address cashbackRate stats subscription shopType location');

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

    const user = await User.findById(req.user.id).select('bankDetails');
    if (!user?.bankDetails?.accountNumber || !user?.bankDetails?.ifscCode) {
      return res.status(400).json({
        success: false,
        message: 'Please link and verify your bank account before requesting a withdrawal.',
      });
    }

    let wallet = await Wallet.findOne({ ownerId: req.user.id, ownerType: 'User' });
    if (!wallet || wallet.balance < reqAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    // Active locked cashback check (24h lock or vendor hold)
    const activeLocked = await WalletTransaction.find({
      ownerId: req.user.id,
      ownerType: { $in: ['User', 'customer', 'user', 'Customer'] },
      type: 'credit',
      $or: [
        { lockedUntil: { $gt: new Date() } },
        { isHeld: true },
      ],
    });
    const lockedBalance = activeLocked.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const withdrawableBalance = Math.max(0, (wallet.balance || 0) - lockedBalance);

    if (reqAmount > withdrawableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient withdrawable balance. ₹${lockedBalance} is locked under 24-hour verification or hold. Available for withdrawal: ₹${withdrawableBalance}.`,
        data: {
          totalBalance: wallet.balance,
          lockedBalance,
          withdrawableBalance,
        },
      });
    }

    // Guard against a double-tap or naive network retry creating two
    // separate pending withdrawal requests — treat an identical request
    // (same amount, still Pending) submitted within the last 10s as a retry.
    const recentDuplicateWithdrawal = await WalletTransaction.findOne({
      ownerId: req.user.id,
      ownerType: 'User',
      category: 'cashout',
      amount: reqAmount,
      status: 'Pending',
      createdAt: { $gte: new Date(Date.now() - 10000) },
    });
    if (recentDuplicateWithdrawal) {
      return res.status(200).json({
        success: true,
        data: {
          ...recentDuplicateWithdrawal.toObject(),
          grossAmount: recentDuplicateWithdrawal.amount,
          netPayout: recentDuplicateWithdrawal.netPayout,
        },
        message: 'Withdrawal requested successfully (Pending Admin Approval)',
      });
    }

    const withdrawalFixedFee = config.withdrawalFixedFee !== undefined ? Number(config.withdrawalFixedFee) : 5;
    const platformFee = Math.round(((reqAmount * commissionPercent) / 100) * 100) / 100;
    const withdrawalFee = withdrawalFixedFee;
    const feeAmount = Math.round((withdrawalFee + platformFee) * 100) / 100;
    const gstPercent = config.withdrawalGstPercent ?? 18;
    const baseFee = Math.round((feeAmount / (1 + gstPercent / 100)) * 100) / 100;
    const gstAmount = Math.round((feeAmount - baseFee) * 100) / 100;
    const netPayout = Math.max(0, Math.round((reqAmount - feeAmount) * 100) / 100);

    // Deterministic key for this user+amount within a 10s bucket — backed by
    // a unique index, this is what actually closes the race the pre-check
    // above can't: two requests landing at the exact same instant.
    const idempotencyKey = `${req.user.id}_${reqAmount}_${Math.floor(Date.now() / 10000)}`;

    // Deduct balance atomically (single findOneAndUpdate with a balance
    // precondition, inside a transaction) so two concurrent withdrawal
    // requests can never both pass the earlier balance check and both debit.
    const session = await mongoose.startSession();
    let withdrawalTx;
    try {
      await session.withTransaction(async () => {
        const updatedWallet = await Wallet.findOneAndUpdate(
          { _id: wallet._id, balance: { $gte: reqAmount } },
          { $inc: { balance: -reqAmount } },
          { returnDocument: 'after', session, runValidators: true }
        );
        if (!updatedWallet) {
          throw new InsufficientBalanceError('Insufficient wallet balance');
        }
        wallet = updatedWallet;

        const created = await WalletTransaction.create([{
          walletId: wallet._id,
          ownerId: wallet.ownerId,
          ownerType: 'User',
          type: 'debit',
          amount: reqAmount,
          withdrawalFee,
          feeAmount,
          platformFee,
          gstAmount,
          feePercent: commissionPercent,
          gstPercent,
          netPayout,
          balanceAfter: wallet.balance,
          category: 'cashout',
          description: `Bank Withdrawal Request (Withdrawal Fee: ₹${withdrawalFee} + Platform Fee: ₹${platformFee}, Net: ₹${netPayout})`,
          status: 'Pending',
          idempotencyKey,
        }], { session });
        withdrawalTx = created[0];
      });
    } catch (txErr) {
      if (txErr instanceof InsufficientBalanceError) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      if (txErr.code === 11000 && txErr.keyPattern?.idempotencyKey) {
        // Lost the race to an identical in-flight request — the OTHER one
        // already debited the wallet, so return its result instead of
        // erroring (and definitely not debiting again).
        const existing = await WalletTransaction.findOne({ idempotencyKey });
        if (existing) {
          return res.status(200).json({
            success: true,
            data: { ...existing.toObject(), grossAmount: existing.amount },
            message: 'Withdrawal requested successfully (Pending Admin Approval)',
          });
        }
      }
      throw txErr;
    } finally {
      await session.endSession();
    }

    // 🔔 Notify user about withdrawal status
    sendNotification({
      recipientId: req.user.id,
      recipientType: 'customer',
      fcmTokens: (await User.findById(req.user.id).select('fcmTokens'))?.fcmTokens || [],
      type: 'system',
      title: '⏳ Withdrawal Request Received',
      message: `Your withdrawal request for ₹${reqAmount} (Net Payout: ₹${netPayout} after ₹${feeAmount} fee deduction: ₹${withdrawalFee} withdrawal fee + ₹${platformFee} platform fee) is pending Admin review.`,
      icon: 'schedule',
    });

    res.status(200).json({ 
      success: true, 
      data: {
        ...withdrawalTx.toObject(),
        grossAmount: reqAmount,
        withdrawalFee,
        platformFee,
        gstAmount,
        feeAmount,
        netPayout,
      }, 
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

    // Wallet payments carry the same platform commission vendors already pay
    // on withdrawals — taken from the vendor's side only, customer cashback
    // and debit are unaffected.
    const rewardConfig = (await RewardConfig.findOne()) || {};
    const commissionPercent = rewardConfig.vendorWithdrawalCommissionPercent ?? 2;
    const platformFee = Math.round(((parseFloat(amount) * commissionPercent) / 100) * 100) / 100;

    // Configurable Customer Wallet Payment Fee (Option A: Bill + Convenience Fee)
    const customerFeePercent = rewardConfig.customerWalletPayCommissionPercent !== undefined ? rewardConfig.customerWalletPayCommissionPercent : 2;
    const customerFixedFee = rewardConfig.customerWalletPayFixedFee !== undefined ? rewardConfig.customerWalletPayFixedFee : 0;
    const customerFee = Math.round(((parseFloat(amount) * customerFeePercent) / 100 + customerFixedFee) * 100) / 100;
    const totalCustomerDebit = Math.round((parseFloat(amount) + customerFee) * 100) / 100;

    // Verify customer wallet has enough balance for Bill + Convenience Fee
    const customerWalletCheck = await Wallet.findOne({ ownerId: customer._id, ownerType: { $in: ['User', 'user', 'Customer', 'customer'] } });
    if (!customerWalletCheck || (customerWalletCheck.balance || 0) < totalCustomerDebit) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Bill: ₹${amount}${customerFee > 0 ? `, Convenience Fee (${customerFeePercent}%): ₹${customerFee}` : ''}. Total required: ₹${totalCustomerDebit}, Available: ₹${customerWalletCheck?.balance?.toFixed(2) || '0.00'}`,
      });
    }

    let txn;
    let isDuplicate = false;

    await session.withTransaction(async () => {
      // Guard against a double-tap or naive network retry creating a second,
      // separate payment — the atomic debit above only stops the wallet from
      // going negative, it doesn't stop two legitimate-looking payments from
      // both succeeding. Treat an identical payment to the same vendor within
      // the last 10s as a retry of the same request, not a new one.
      const recentDuplicate = await Transaction.findOne({
        customerId: customer._id,
        vendorId: vendor._id,
        amount: parseFloat(amount),
        paymentMethod: 'Wallet',
        createdAt: { $gte: new Date(Date.now() - 10000) },
      }).session(session);

      if (recentDuplicate) {
        txn = recentDuplicate;
        isDuplicate = true;
        return;
      }

      const created = await Transaction.create([{
        transactionId, customerId: customer._id, customerZeebacId: customer.zeebacId,
        customerPhone: customer.phone, customerName: customer.name,
        vendorId: vendor._id, vendorZeebacId: vendor.zeebacId,
        vendorName: vendor.storeName, vendorPhone: vendor.phone,
        vendorCategory: vendor.category, type: 'qr_cashback',
        initiatedBy: 'customer', source: 'customer_request',
        amount: parseFloat(amount), cashbackPercent: vendor.cashbackRate,
        cashbackAmount, paymentMethod: 'Wallet', status: 'Approved',
        convenienceFee: customerFee,
        totalPaid: totalCustomerDebit,
      }], { session });
      txn = created[0];

      // Customer: debit the bill amount, then debit convenience fee (if any), then credit their own cashback back.
      await debitWallet({
        session, ownerId: customer._id, ownerType: 'User',
        amount: parseFloat(amount), category: 'payment_received',
        description: `Payment to ${vendor.storeName} (Wallet)`,
        referenceId: txn._id, referenceType: 'Transaction',
      });

      if (customerFee > 0) {
        await debitWallet({
          session, ownerId: customer._id, ownerType: 'User',
          amount: customerFee, category: 'platform_fee',
          description: `Convenience fee (${customerFeePercent}%) on wallet payment to ${vendor.storeName}`,
          referenceId: txn._id, referenceType: 'Transaction',
        });
      }

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

      if (platformFee > 0) {
        await debitWallet({
          session, ownerId: vendor._id, ownerType: 'Vendor',
          amount: platformFee, category: 'platform_fee',
          description: `Zeebac platform fee (${commissionPercent}%) on wallet payment from ${customer.name}`,
          referenceId: txn._id, referenceType: 'Transaction',
        });
      }

      // Admin Platform Wallet: credit customer convenience fee and vendor platform fee
      const adminUser = await AdminUser.findOne({ role: { $in: ['super_admin', 'admin'] } }).session(session);
      if (adminUser) {
        const totalFeeToAdmin = Math.round((customerFee + platformFee) * 100) / 100;
        if (totalFeeToAdmin > 0) {
          await creditWallet({
            session, ownerId: adminUser._id, ownerType: 'Admin', ownerZeebacId: 'ZEEBAC-ADMIN',
            amount: totalFeeToAdmin, category: 'platform_fee',
            description: `Platform fee earned on wallet txn ${txn.transactionId} (Customer Fee: ₹${customerFee}, Vendor Fee: ₹${platformFee})`,
            referenceId: txn._id, referenceType: 'Transaction',
          });
        }
      }

      await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } }, { session });
    });

    if (!isDuplicate) {
      checkAndNotifyFraud(txn).catch(e => logger.error('Fraud check failed', e));

      await User.findByIdAndUpdate(req.user.id, { $pull: { recentVendors: vendor._id } });
      await User.findByIdAndUpdate(req.user.id, { $push: { recentVendors: { $each: [vendor._id], $position: 0, $slice: 10 } } });
    }

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
          convenienceFee: customerFee,
          totalPaid: totalCustomerDebit,
        },
        vendor: { name: vendor.storeName },
        billAmount: parseFloat(amount),
        convenienceFee: customerFee,
        totalPaid: totalCustomerDebit,
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

/**
 * Claim cashback using 12-digit UPI UTR / Reference ID / Transaction ID.
 * Specifically handles the case when Google Pay or UPI apps hide customer phone number
 * during counter QR scans.
 *
 * @route POST /api/user/transactions/claim-upi-utr
 * @param {string} req.body.utr - 12-digit UPI reference ID, RRN, or gateway payment ID
 */
export const claimUpiCashbackByUtr = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const customerId = req.user.id;
    const { utr } = req.body;

    if (!utr || typeof utr !== 'string' || !utr.trim()) {
      return res.status(400).json({ success: false, message: 'UPI Reference ID / UTR is required' });
    }

    const cleanUtr = utr.trim();

    // 1. Find transaction matching utr, gatewayPaymentId, or transactionId
    const tx = await Transaction.findOne({
      $or: [
        { 'gateway.utr': cleanUtr },
        { 'gateway.gatewayPaymentId': cleanUtr },
        { transactionId: cleanUtr },
      ],
    });

    if (!tx) {
      return res.status(404).json({
        success: false,
        message: 'No payment found matching this UPI Reference ID / UTR. Please ensure your payment to the store was completed.',
      });
    }

    // 2. Duplicate claim validation
    if (tx.customerId && tx.cashbackAmount > 0) {
      if (tx.customerId.toString() === customerId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'You have already claimed cashback for this payment!',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'This UPI payment has already been claimed for cashback.',
      });
    }

    // 3. Find customer and vendor
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    const vendor = await Vendor.findById(tx.vendorId);
    if (!vendor || vendor.status !== 'Verified') {
      return res.status(400).json({ success: false, message: 'Store is not eligible for cashback' });
    }

    // 4. Check vendor subscription and wallet balance
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    const cashbackRate = vendor.cashbackRate || 0;
    const cashbackAmount = calculateCashback(tx.amount, cashbackRate);

    if (subState.cashbackBlocked || vendorBalance < cashbackAmount || cashbackAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: subState.cashbackBlockedReason || 'Vendor has insufficient cashback wallet balance. Please contact the store.',
      });
    }

    let updatedTx = null;
    let newCustomerBalance = 0;

    await session.withTransaction(async () => {
      // Debit vendor wallet for cashback
      await debitWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        amount: cashbackAmount,
        category: 'cashback',
        description: `UPI UTR cashback paid to ${customer.name || customer.phone} (UTR: ${cleanUtr})`,
        gateway: { gatewayName: 'Razorpay', gatewayOrderId: tx.gateway?.gatewayOrderId },
      });

      // Credit customer wallet for cashback
      const creditedWallet = await creditWallet({
        session,
        ownerId: customer._id,
        ownerType: 'User',
        ownerZeebacId: customer.zeebacId,
        amount: cashbackAmount,
        category: 'cashback',
        description: `Cashback earned at ${vendor.storeName} via UPI UTR Claim`,
        gateway: { gatewayName: 'Razorpay', gatewayOrderId: tx.gateway?.gatewayOrderId, gatewayPaymentId: `${tx.gateway?.gatewayPaymentId || cleanUtr}_claim` },
      });
      newCustomerBalance = creditedWallet.balance;

      // Update Transaction to link to this customer
      tx.customerId = customer._id;
      tx.customerZeebacId = customer.zeebacId;
      tx.customerPhone = customer.phone;
      tx.customerName = customer.name;
      tx.cashbackAmount = cashbackAmount;
      tx.cashbackPercent = cashbackRate;
      tx.source = 'upi_utr_claim';
      tx.status = 'Approved';
      if (!tx.gateway?.utr) {
        tx.gateway = tx.gateway || {};
        tx.gateway.utr = cleanUtr;
      }
      await tx.save({ session });
      updatedTx = tx;

      // First purchase referral bonus
      await claimFirstPurchaseReferralBonus({ session, customer });
    });

    // 5. Post-transaction notifications and socket events
    try {
      await sendNotification({
        recipientId: customer._id,
        recipientType: 'customer',
        fcmTokens: customer.fcmTokens || [],
        type: 'credit',
        title: 'Cashback Claimed! 💸',
        message: `Aapko ${vendor.storeName} se ₹${cashbackAmount} cashback mila!`,
        icon: 'account_balance_wallet',
        referenceId: updatedTx._id,
        referenceType: 'transaction',
      });

      await sendNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        fcmTokens: vendor.fcmTokens || [],
        type: 'credit',
        title: 'Cashback Claimed by Customer',
        message: `Customer ${customer.name || customer.phone} claimed ₹${cashbackAmount} cashback for ₹${tx.amount} UPI payment (UTR: ${cleanUtr}).`,
        icon: 'payments',
        referenceId: updatedTx._id,
        referenceType: 'transaction',
      });
    } catch (notifErr) {
      logger.error(`[claimUpiCashbackByUtr] Notification error: ${notifErr.message}`);
    }

    try {
      const io = getIO();
      io.to(`user_${customer._id}`).emit('wallet_updated', {
        balanceCredit: cashbackAmount,
        newBalance: newCustomerBalance,
        message: `Aapko ${vendor.storeName} se ₹${cashbackAmount} cashback mila!`,
        transactionId: updatedTx.transactionId,
      });
    } catch {
      // socket might be uninitialized in test
    }

    return res.status(200).json({
      success: true,
      message: `Successfully claimed ₹${cashbackAmount} cashback from ${vendor.storeName}!`,
      data: {
        transactionId: updatedTx.transactionId,
        amount: tx.amount,
        cashbackEarned: cashbackAmount,
        vendorName: vendor.storeName,
        vendorZeebacId: vendor.zeebacId,
        newWalletBalance: newCustomerBalance,
      },
    });
  } catch (error) {
    logger.error(`[claimUpiCashbackByUtr] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server Error claiming UPI cashback', error: error.message });
  } finally {
    session.endSession();
  }
};

// ─── Security: Set or Update Security PIN ───
export const setupSecurityPin = async (req, res) => {
  try {
    const { pin, currentPin } = req.body;
    const cleanPin = String(pin || '').trim();

    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 8) {
      return res.status(400).json({ success: false, message: 'Security PIN must be between 4 and 8 digits' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // If a PIN is already set, require verification of the current PIN
    if (user.security?.securityPin) {
      if (!currentPin) {
        return res.status(400).json({ success: false, message: 'Current PIN is required to set a new PIN' });
      }
      const isMatch = await bcrypt.compare(String(currentPin).trim(), user.security.securityPin);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Current PIN is incorrect' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(cleanPin, salt);

    if (!user.security) {
      user.security = {};
    }
    user.security.securityPin = hashedPin;
    await user.save();

    logger.info(`[Security] User ${user._id} configured Security PIN`);
    return res.status(200).json({
      success: true,
      message: 'Security PIN set successfully',
      data: {
        hasPin: true,
        biometricEnabled: !!user.security.biometricEnabled,
      },
    });
  } catch (error) {
    logger.error(`[setupSecurityPin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Security: Toggle Biometric Authentication ───
export const toggleBiometricSecurity = async (req, res) => {
  try {
    const { enabled, credentialId } = req.body;
    const isEnabled = Boolean(enabled);

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!user.security) {
      user.security = {};
    }

    // Require a fallback PIN before enabling biometrics
    if (isEnabled && !user.security.securityPin) {
      return res.status(400).json({
        success: false,
        message: 'Please set up a Security PIN/Password first as a fallback before enabling biometrics.',
        code: 'PIN_REQUIRED',
      });
    }

    user.security.biometricEnabled = isEnabled;
    if (credentialId) {
      user.security.biometricCredentialId = String(credentialId);
    }
    await user.save();

    logger.info(`[Security] User ${user._id} set biometricEnabled = ${isEnabled}`);
    return res.status(200).json({
      success: true,
      message: isEnabled ? 'Biometric security enabled successfully' : 'Biometric security disabled',
      data: {
        biometricEnabled: user.security.biometricEnabled,
        hasPin: !!user.security.securityPin,
      },
    });
  } catch (error) {
    logger.error(`[toggleBiometricSecurity] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Security: Verify Security PIN ───
export const verifySecurityPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, message: 'Security PIN is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!user.security?.securityPin) {
      return res.status(400).json({ success: false, message: 'No Security PIN is configured on this account' });
    }

    const isMatch = await bcrypt.compare(String(pin).trim(), user.security.securityPin);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect Security PIN / Password. Please try again.' });
    }

    return res.status(200).json({
      success: true,
      message: 'PIN verified successfully',
    });
  } catch (error) {
    logger.error(`[verifySecurityPin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};


