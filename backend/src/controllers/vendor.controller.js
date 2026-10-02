import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import CashbackRequest from '../models/CashbackRequest.js';
import PosBill from '../models/PosBill.js';
import CashbackRule from '../models/CashbackRule.js';
import RewardConfig from '../models/RewardConfig.js';
import Referral from '../models/Referral.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import SubscriptionPayment from '../models/SubscriptionPayment.js';
import OtpVerification from '../models/OtpVerification.js';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';
import { sendOtpSms } from '../utils/sms.util.js';
import { verifyOtpOnly } from './auth.controller.js';
import { getVendorSubscriptionState, resolvePlanPrice, calculateNewSubscriptionDates } from '../utils/subscription.util.js';
import { sendNotification } from '../services/notification.service.js';
import { notifyAdmins } from '../utils/adminNotification.js';
import { buildSnapshot, diffSnapshots, validateApplicationComplete } from '../utils/vendorApplication.util.js';
import { calculateCashback, validateVendorCashbackRate } from '../utils/cashback.util.js';
import { debitWallet, creditWallet, InsufficientBalanceError, DuplicatePaymentError, assertGatewayPaymentNotProcessed } from '../utils/wallet.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import { getRazorpayInstance, verifyRazorpaySignature, fetchVerifiedPaymentAmount } from '../utils/razorpay.util.js';
import { signQrToken, verifyQrToken, looksLikeQrToken, VENDOR_QR_TTL_SECONDS } from '../utils/qr.util.js';
import { getIO } from '../socket/socket.js';

const DOCUMENT_FIELDS = ['aadhaarPan', 'gstCertificate', 'shopLicense', 'cancelledCheque', 'panCard', 'additionalDoc'];

// Applies whatever Step 2/3 fields & files are present in the request onto the
// vendor doc (in-memory only — caller must .save()). Shared by draft/submit/resubmit
// so all three accept the same payload shape.
const applyApplicationFields = (vendor, body = {}, files = {}) => {
  const {
    storeName, shopType, category, subCategory, description,
    businessContactNumber, businessEmail, gstNumber, registrationNumber,
    address, lat, lng, businessHours,
  } = body;

  if (storeName !== undefined) vendor.storeName = storeName;
  if (shopType !== undefined) vendor.shopType = shopType;
  if (category !== undefined) vendor.category = category;
  if (subCategory !== undefined) vendor.subCategory = subCategory;
  if (description !== undefined) vendor.description = description;
  if (businessContactNumber !== undefined) vendor.businessContactNumber = businessContactNumber;
  if (businessEmail !== undefined) vendor.businessEmail = businessEmail;
  if (gstNumber !== undefined) vendor.gstNumber = gstNumber;
  if (registrationNumber !== undefined) vendor.registrationNumber = registrationNumber;
  if (body.cashbackRate !== undefined && body.cashbackRate !== null && body.cashbackRate !== '') {
    vendor.cashbackRate = Number(body.cashbackRate);
  }

  if (address !== undefined) {
    let addressObj = address;
    if (typeof address === 'string') {
      try {
        addressObj = JSON.parse(address);
      } catch {
        addressObj = { fullAddress: address };
      }
    }
    if (typeof addressObj === 'object' && addressObj !== null) {
      vendor.address = { ...(vendor.address?.toObject ? vendor.address.toObject() : vendor.address), ...addressObj };
    }
  }

  if (lat && lng) {
    vendor.location = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
  }

  if (businessHours !== undefined) {
    let hoursObj = businessHours;
    if (typeof businessHours === 'string') {
      try {
        hoursObj = JSON.parse(businessHours);
      } catch {
        hoursObj = {};
      }
    }
    if (typeof hoursObj === 'object' && hoursObj !== null) {
      vendor.businessHours = { ...(vendor.businessHours?.toObject ? vendor.businessHours.toObject() : vendor.businessHours), ...hoursObj };
    }
  }

  if (files) {
    const getUrl = (f) => (f ? (f.url || (f.filename?.startsWith('http') ? f.filename : null)) : null);

    if (files.storeLogo) vendor.storeLogo = vendor.profilePic = getUrl(files.storeLogo[0]);
    if (files.storeCoverImage) vendor.storeCoverImage = getUrl(files.storeCoverImage[0]);
    if (files.storeImages) vendor.storeImages = files.storeImages.map(f => getUrl(f)).filter(Boolean);

    for (const field of DOCUMENT_FIELDS) {
      if (files[field] && files[field][0]) {
        if (!vendor.documents) vendor.documents = {};
        vendor.documents[field] = {
          fileName: files[field][0].originalname,
          fileUrl: getUrl(files[field][0]),
          fileType: files[field][0].mimetype,
          uploadedAt: new Date(),
        };
      }
    }
  }
};

export const UPLOAD_FIELDS = [
  { name: 'storeLogo', maxCount: 1 },
  { name: 'storeCoverImage', maxCount: 1 },
  { name: 'storeImages', maxCount: 6 },
  { name: 'aadhaarPan', maxCount: 1 },
  { name: 'gstCertificate', maxCount: 1 },
  { name: 'shopLicense', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'cancelledCheque', maxCount: 1 },
  { name: 'additionalDoc', maxCount: 1 },
];

// ─── Vendor Onboarding: Save Draft (Steps 2-3) ───
export const saveApplicationDraft = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    if (vendor.applicationStatus !== 'DRAFT') {
      return res.status(409).json({ success: false, message: 'Application has already been submitted and can no longer be saved as a draft.' });
    }

    applyApplicationFields(vendor, req.body, req.files);
    await vendor.save();

    res.status(200).json({ success: true, message: 'Draft saved', data: vendor });
  } catch (error) {
    logger.error(`[saveApplicationDraft] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ─── Vendor Onboarding: Submit Application (Step 4) ───
export const submitApplication = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    if (vendor.applicationStatus !== 'DRAFT') {
      return res.status(409).json({ success: false, message: 'Application has already been submitted.' });
    }

    applyApplicationFields(vendor, req.body, req.files);

    const missing = validateApplicationComplete(vendor);
    if (missing.length > 0) {
      return res.status(400).json({ success: false, message: 'Application is incomplete.', missingFields: missing });
    }

    const activeRule = await CashbackRule.findOne({ shopType: vendor.shopType, isActive: true });
    const validation = validateVendorCashbackRate(vendor.cashbackRate, vendor.shopType, activeRule?.minCashback);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: `Cashback rate cannot be lower than the minimum required rate of ${validation.minRate}% for ${vendor.shopType || 'your store'}.`,
      });
    }

    const snapshot = buildSnapshot(vendor);
    const now = new Date();
    vendor.applicationStatus = 'PENDING_REVIEW';
    vendor.submittedAt = now;
    vendor.lastSubmittedAt = now;
    vendor.applicationHistory.push({
      version: 1,
      action: 'SUBMITTED',
      actionAt: now,
      actionByRole: 'vendor',
      changedFields: diffSnapshots(null, snapshot),
      snapshot,
    });

    await vendor.save();

    notifyAdmins('VENDOR_KYC', 'New Vendor Registration', `The store "${vendor.storeName}" has submitted an application for approval.`).catch(e => logger.error('notifyAdmins failed', e));

    logger.info(`[submitApplication] Vendor ${vendor._id} submitted application`);
    res.status(200).json({ success: true, message: 'Application submitted successfully.', data: vendor });
  } catch (error) {
    logger.error(`[submitApplication] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ─── Vendor Onboarding: Resubmit After Rejection ───
export const resubmitApplication = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    if (vendor.applicationStatus !== 'REJECTED') {
      return res.status(409).json({ success: false, message: 'Only a rejected application can be resubmitted.' });
    }

    // Snapshot the application as it stood before this resubmission's edits —
    // the most recent history entry that carries a snapshot (SUBMITTED or RESUBMITTED).
    const previousEntry = [...vendor.applicationHistory].reverse().find(h => h.snapshot);
    const previousSnapshot = previousEntry ? previousEntry.snapshot : null;

    applyApplicationFields(vendor, req.body, req.files);

    const missing = validateApplicationComplete(vendor);
    if (missing.length > 0) {
      return res.status(400).json({ success: false, message: 'Application is incomplete.', missingFields: missing });
    }

    const activeRule = await CashbackRule.findOne({ shopType: vendor.shopType, isActive: true });
    const validation = validateVendorCashbackRate(vendor.cashbackRate, vendor.shopType, activeRule?.minCashback);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: `Cashback rate cannot be lower than the minimum required rate of ${validation.minRate}% for ${vendor.shopType || 'your store'}.`,
      });
    }

    const newSnapshot = buildSnapshot(vendor);
    const changedFields = diffSnapshots(previousSnapshot, newSnapshot);
    const now = new Date();

    vendor.applicationStatus = 'RESUBMITTED';
    vendor.resubmissionCount = (vendor.resubmissionCount || 0) + 1;
    vendor.lastSubmittedAt = now;
    vendor.applicationHistory.push({
      version: vendor.resubmissionCount + 1,
      action: 'RESUBMITTED',
      actionAt: now,
      actionByRole: 'vendor',
      changedFields,
      snapshot: newSnapshot,
    });

    await vendor.save();

    notifyAdmins('VENDOR_KYC', 'Vendor Resubmitted Application', `The store "${vendor.storeName}" has resubmitted their application after rejection.`).catch(e => logger.error('notifyAdmins failed', e));

    logger.info(`[resubmitApplication] Vendor ${vendor._id} resubmitted application (count: ${vendor.resubmissionCount})`);
    res.status(200).json({ success: true, message: 'Application resubmitted successfully.', data: vendor, changedFields });
  } catch (error) {
    logger.error(`[resubmitApplication] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Helper to get or create wallet
const getOrCreateWallet = async (ownerId, ownerType, zeebacId) => {
  let wallet = await Wallet.findOne({ ownerId, ownerType });
  if (!wallet) {
    wallet = await Wallet.create({ ownerId, ownerType, ownerZeebacId: zeebacId });
  }
  return wallet;
};

// ─── Get Vendor Profile ───
export const getProfile = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id).select('-refreshToken');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const wallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const balance = wallet ? (wallet.balance || 0) : 0;
    const subscriptionState = getVendorSubscriptionState(vendor, balance);

    const vendorObj = vendor.toObject ? vendor.toObject() : vendor;
    vendorObj.walletBalance = balance;
    vendorObj.subscriptionState = subscriptionState;

    if (vendorObj.security) {
      vendorObj.security.hasPin = Boolean(vendorObj.security.securityPin);
      delete vendorObj.security.securityPin;
    } else {
      vendorObj.security = { biometricEnabled: false, hasPin: false, biometricCredentialId: null };
    }

    res.status(200).json({ success: true, data: vendorObj });
  } catch (error) {
    logger.error(`Error in vendor getProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Update Vendor Profile ───
export const updateProfile = async (req, res) => {
  try {
    const { 
      description, 
      socialLinks, 
      bankDetails,
      address,
      email,
      operatingHours,
      profilePic,
      cashbackRate,
    } = req.body;

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (cashbackRate !== undefined && cashbackRate !== null) {
      const activeRule = await CashbackRule.findOne({ shopType: vendor.shopType, isActive: true });
      const validation = validateVendorCashbackRate(cashbackRate, vendor.shopType, activeRule?.minCashback);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Cashback rate cannot be lower than the minimum required rate of ${validation.minRate}% for ${vendor.shopType || 'your store category'}.`,
        });
      }
      vendor.cashbackRate = Number(cashbackRate);
    }

    if (description !== undefined) vendor.description = description;
    if (email !== undefined) vendor.email = email;
    if (operatingHours !== undefined) vendor.operatingHours = operatingHours;
    if (profilePic !== undefined) vendor.profilePic = profilePic;
    
    if (socialLinks) {
      vendor.socialLinks = { ...vendor.socialLinks, ...socialLinks };
    }
    
    if (bankDetails) {
      if (!vendor.bankDetails) vendor.bankDetails = {};
      if (bankDetails.upiId !== undefined) vendor.bankDetails.upiId = bankDetails.upiId;
      if (bankDetails.accountHolderName !== undefined) vendor.bankDetails.accountHolderName = bankDetails.accountHolderName;
      if (bankDetails.bankName !== undefined) vendor.bankDetails.bankName = bankDetails.bankName;
      if (bankDetails.accountNumber !== undefined) vendor.bankDetails.accountNumber = bankDetails.accountNumber;
      if (bankDetails.ifscCode !== undefined) vendor.bankDetails.ifscCode = bankDetails.ifscCode;
    }

    if (address && typeof address === 'object') {
      if (!vendor.address) vendor.address = {};
      for (const key in address) {
        vendor.address[key] = address[key];
      }
    }

    // Fix GeoJSON 2dsphere index error for existing bad data
    if (vendor.location && (!vendor.location.coordinates || vendor.location.coordinates.length === 0)) {
      vendor.location = undefined;
    }

    await vendor.save();
    
    logger.info(`[vendor.controller] Profile updated successfully for vendor ID: ${vendor._id}`);

    res.status(200).json({ success: true, message: 'Profile updated successfully', data: vendor });
  } catch (error) {
    logger.error(`Error in vendor updateProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Dashboard Stats (Phase 3D Real Data + Sales Breakdown) ───
export const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    // Start of Today in IST converted back to UTC
    const startOfTodayUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset);

    // Start of Week (last 7 days)
    const startOfWeekUtc = new Date(startOfTodayUtc.getTime() - 6 * 24 * 60 * 60 * 1000);

    // Start of Current Month in IST converted back to UTC
    const startOfMonthUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - istOffset);

    // Start of Current Year in IST converted back to UTC
    const startOfYearUtc = new Date(Date.UTC(istNow.getUTCFullYear(), 0, 1) - istOffset);

    // Multi-period aggregation with Cash vs Digital breakdown
    const salesStats = await Transaction.aggregate([
      { $match: { vendorId: vendor._id, status: 'Approved' } },
      {
        $project: {
          amount: 1,
          cashbackAmount: 1,
          customerId: 1,
          txDate: { $ifNull: ["$timestamp", "$createdAt"] },
          isCash: {
            $regexMatch: {
              input: { $ifNull: ["$paymentMethod", "Cash"] },
              regex: "cash",
              options: "i"
            }
          }
        }
      },
      {
        $facet: {
          allTime: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalCashbackGiven: { $sum: "$cashbackAmount" },
                totalTransactions: { $sum: 1 },
                uniqueCustomers: { $addToSet: "$customerId" },
                cashRevenue: {
                  $sum: { $cond: ["$isCash", "$amount", 0] }
                },
                digitalRevenue: {
                  $sum: { $cond: ["$isCash", 0, "$amount"] }
                }
              }
            }
          ],
          today: [
            { $match: { txDate: { $gte: startOfTodayUtc } } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalCashbackGiven: { $sum: "$cashbackAmount" },
                totalTransactions: { $sum: 1 },
                cashRevenue: {
                  $sum: { $cond: ["$isCash", "$amount", 0] }
                },
                digitalRevenue: {
                  $sum: { $cond: ["$isCash", 0, "$amount"] }
                }
              }
            }
          ],
          weekly: [
            { $match: { txDate: { $gte: startOfWeekUtc } } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalCashbackGiven: { $sum: "$cashbackAmount" },
                totalTransactions: { $sum: 1 },
                cashRevenue: {
                  $sum: { $cond: ["$isCash", "$amount", 0] }
                },
                digitalRevenue: {
                  $sum: { $cond: ["$isCash", 0, "$amount"] }
                }
              }
            }
          ],
          monthly: [
            { $match: { txDate: { $gte: startOfMonthUtc } } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalCashbackGiven: { $sum: "$cashbackAmount" },
                totalTransactions: { $sum: 1 },
                cashRevenue: {
                  $sum: { $cond: ["$isCash", "$amount", 0] }
                },
                digitalRevenue: {
                  $sum: { $cond: ["$isCash", 0, "$amount"] }
                }
              }
            }
          ],
          yearly: [
            { $match: { txDate: { $gte: startOfYearUtc } } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalCashbackGiven: { $sum: "$cashbackAmount" },
                totalTransactions: { $sum: 1 },
                cashRevenue: {
                  $sum: { $cond: ["$isCash", "$amount", 0] }
                },
                digitalRevenue: {
                  $sum: { $cond: ["$isCash", 0, "$amount"] }
                }
              }
            }
          ]
        }
      }
    ]);

    const extractPeriod = (facetArr) => {
      const row = facetArr?.[0] || {};
      const total = row.totalRevenue || 0;
      const cash = row.cashRevenue || 0;
      const digital = row.digitalRevenue || 0;
      const transactions = row.totalTransactions || 0;
      const cashbackGiven = row.totalCashbackGiven || 0;
      const cashPercentage = total > 0 ? Math.round((cash / total) * 100) : 0;
      const digitalPercentage = total > 0 ? 100 - cashPercentage : 0;
      return {
        total,
        cash,
        digital,
        transactions,
        cashbackGiven,
        cashPercentage,
        digitalPercentage
      };
    };

    const facetRes = salesStats[0] || {};
    const allTime = facetRes.allTime?.[0] || {};
    const todaySales = extractPeriod(facetRes.today);
    const weeklySales = extractPeriod(facetRes.weekly);
    const monthlySales = extractPeriod(facetRes.monthly);
    const yearlySales = extractPeriod(facetRes.yearly);
    const totalCustomersCount = (allTime.uniqueCustomers || []).filter(Boolean).length;

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: allTime.totalRevenue || 0,
        totalCustomers: totalCustomersCount,
        totalTransactions: allTime.totalTransactions || 0,
        avgRating: vendor.stats?.avgRating || 0,
        totalCashbackGiven: allTime.totalCashbackGiven || 0,
        cashbackRate: vendor.cashbackRate || 5,
        todaySales,
        salesBreakdown: {
          today: todaySales,
          weekly: weeklySales,
          monthly: monthlySales,
          yearly: yearlySales
        }
      }
    });
  } catch (error) {
    logger.error(`Error in vendor getDashboardStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Vendor Sales Analytics (Today / Weekly / Monthly / Yearly with transactions) ───
export const getVendorSalesAnalytics = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const { period = 'today' } = req.query; // 'today' | 'weekly' | 'monthly' | 'yearly'

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    const startOfTodayUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset);
    let startDateUtc;

    if (period === 'weekly') {
      startDateUtc = new Date(startOfTodayUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      startDateUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - istOffset);
    } else if (period === 'yearly') {
      startDateUtc = new Date(Date.UTC(istNow.getUTCFullYear(), 0, 1) - istOffset);
    } else {
      // today
      startDateUtc = startOfTodayUtc;
    }

    const transactions = await Transaction.find({
      vendorId: vendor._id,
      status: 'Approved',
      $or: [
        { timestamp: { $gte: startDateUtc } },
        { createdAt: { $gte: startDateUtc } }
      ]
    }).sort({ timestamp: -1, createdAt: -1 });

    let totalAmount = 0;
    let cashAmount = 0;
    let digitalAmount = 0;
    let totalCashback = 0;

    const formattedList = transactions.map(t => {
      const isCash = /cash/i.test(t.paymentMethod || 'Cash');
      const amt = Number(t.amount) || 0;
      const cb = Number(t.cashbackAmount) || 0;

      totalAmount += amt;
      totalCashback += cb;
      if (isCash) {
        cashAmount += amt;
      } else {
        digitalAmount += amt;
      }

      return {
        id: t.transactionId,
        _id: t._id,
        customer: t.customerName || t.customerPhone || 'Customer',
        phone: t.customerPhone,
        amount: amt,
        cashbackAmount: cb,
        paymentMethod: t.paymentMethod || (isCash ? 'Cash' : 'Digital'),
        isCash,
        time: t.timestamp || t.createdAt,
        status: t.status
      };
    });

    const totalTxns = formattedList.length;
    const cashPercentage = totalAmount > 0 ? Math.round((cashAmount / totalAmount) * 100) : 0;
    const digitalPercentage = totalAmount > 0 ? 100 - cashPercentage : 0;

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate: startDateUtc,
        summary: {
          total: totalAmount,
          cash: cashAmount,
          digital: digitalAmount,
          transactions: totalTxns,
          cashbackGiven: totalCashback,
          cashPercentage,
          digitalPercentage
        },
        transactions: formattedList
      }
    });
  } catch (error) {
    logger.error(`Error in getVendorSalesAnalytics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Vendor Customers List (Phase 3D) ───
export const getVendorCustomers = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const mongoose = (await import('mongoose')).default;
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    
    // Find all customers who have transacted with this vendor
    const customersAggr = await Transaction.aggregate([
      { $match: { vendorId: vendorObjectId } },
      {
        $group: {
          _id: "$customerId",
          totalSpent: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          lastTransactionDate: { $max: "$createdAt" },
          customerName: { $first: "$customerName" },
          customerPhone: { $first: "$customerPhone" },
          customerZeebacId: { $first: "$customerZeebacId" }
        }
      },
      {
        $lookup: {
          from: 'reviews',
          let: { custId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$vendorId", vendorObjectId] },
                    { $eq: ["$customerId", "$$custId"] },
                    { $eq: ["$isVisible", true] }
                  ]
                }
              }
            },
            { $project: { rating: 1 } },
            { $limit: 1 }
          ],
          as: 'customerReview'
        }
      },
      {
        $addFields: {
          reviewRating: {
            $ifNull: [{ $arrayElemAt: ["$customerReview.rating", 0] }, 0]
          }
        }
      },
      { $project: { customerReview: 0 } },
      { $sort: { lastTransactionDate: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: customersAggr
    });
  } catch (error) {
    logger.error(`Error in getVendorCustomers: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Request Withdrawal (Phase 3D) ───
export const requestWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    let wallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);

    if (!vendor.bankDetails?.accountNumber || !vendor.bankDetails?.ifscCode) {
      return res.status(400).json({
        success: false,
        message: 'Please link and verify your bank account before requesting a withdrawal.',
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal' });
    }

    // Guard against a double-tap or naive network retry creating two
    // separate pending withdrawal requests — treat an identical request
    // (same amount, still Pending) submitted within the last 10s as a retry.
    const recentDuplicateWithdrawal = await WithdrawalRequest.findOne({
      vendorId: vendor._id,
      amount,
      status: 'Pending',
      createdAt: { $gte: new Date(Date.now() - 10000) },
    });
    if (recentDuplicateWithdrawal) {
      return res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: {
          ...recentDuplicateWithdrawal.toObject(),
          grossAmount: recentDuplicateWithdrawal.amount,
        },
      });
    }

    const config = (await RewardConfig.findOne()) || {};
    const withdrawalFixedFee = config.withdrawalFixedFee !== undefined ? Number(config.withdrawalFixedFee) : 5;
    const commissionPercent = config.vendorWithdrawalCommissionPercent ?? 2;
    const gstPercent = config.withdrawalGstPercent ?? 18;

    const platformFee = Math.round(((amount * commissionPercent) / 100) * 100) / 100;
    const withdrawalFee = withdrawalFixedFee;
    const feeAmount = Math.round((withdrawalFee + platformFee) * 100) / 100;
    const baseFee = Math.round((feeAmount / (1 + gstPercent / 100)) * 100) / 100;
    const gstAmount = Math.round((feeAmount - baseFee) * 100) / 100;
    const netPayout = Math.max(0, Math.round((amount - feeAmount) * 100) / 100);

    // Snapshot the verified bank details at the time of withdrawal
    const bankSnapshot = {
      accountHolderName: vendor.bankDetails?.accountHolderName || vendor.ownerName || vendor.storeName || '',
      bankName: vendor.bankDetails?.bankName || '',
      accountNumber: vendor.bankDetails?.accountNumber || '',
      ifscCode: vendor.bankDetails?.ifscCode || '',
      upiId: vendor.bankDetails?.upiId || '',
      isVerified: Boolean(vendor.bankDetails?.isVerified),
      verifiedAt: vendor.bankDetails?.verifiedAt || new Date(),
    };

    const maskedAcc = bankSnapshot.accountNumber ? `•••• ${bankSnapshot.accountNumber.slice(-4)}` : '';
    const destDesc = bankSnapshot.bankName ? `Withdrawal to ${bankSnapshot.bankName} (${maskedAcc})` : 'Withdrawal request initiated';

    // Deterministic key for this vendor+amount within a 10s bucket — backed
    // by a unique index, this is what actually closes the race the
    // pre-check above can't: two requests landing at the exact same instant.
    const idempotencyKey = `${vendor._id}_${amount}_${Math.floor(Date.now() / 10000)}`;

    // Deduct balance atomically (single findOneAndUpdate with a balance
    // precondition, inside a transaction) so two concurrent withdrawal
    // requests can never both pass the earlier balance check and both debit.
    const session = await mongoose.startSession();
    let withdrawalReq;
    try {
      await session.withTransaction(async () => {
        const updatedWallet = await Wallet.findOneAndUpdate(
          { _id: wallet._id, balance: { $gte: amount } },
          { $inc: { balance: -amount } },
          { returnDocument: 'after', session, runValidators: true }
        );
        if (!updatedWallet) {
          throw new InsufficientBalanceError('Insufficient wallet balance for withdrawal');
        }
        wallet = updatedWallet;

        const createdReq = await WithdrawalRequest.create([{
          vendorId: vendor._id,
          amount,
          withdrawalFee,
          platformFee,
          gstAmount,
          feeAmount,
          feePercent: commissionPercent,
          gstPercent,
          netPayout,
          status: 'Pending',
          bankDetailsSnapshot: bankSnapshot,
          idempotencyKey,
        }], { session });
        withdrawalReq = createdReq[0];

        await WalletTransaction.create([{
          walletId: wallet._id,
          ownerId: vendor._id,
          ownerType: 'Vendor',
          type: 'debit',
          category: 'withdrawal',
          amount: amount,
          withdrawalFee,
          platformFee,
          gstAmount,
          feeAmount,
          feePercent: commissionPercent,
          gstPercent,
          netPayout,
          balanceAfter: wallet.balance,
          referenceId: withdrawalReq._id,
          referenceType: 'WithdrawalRequest',
          description: destDesc,
          vendorName: vendor.storeName,
        }], { session });
      });
    } catch (txErr) {
      if (txErr instanceof InsufficientBalanceError) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal' });
      }
      if (txErr.code === 11000 && txErr.keyPattern?.idempotencyKey) {
        // Lost the race to an identical in-flight request — the OTHER one
        // already debited the wallet, so return its result instead of
        // erroring (and definitely not debiting again).
        const existing = await WithdrawalRequest.findOne({ idempotencyKey });
        if (existing) {
          return res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: { ...existing.toObject(), grossAmount: existing.amount },
          });
        }
      }
      throw txErr;
    } finally {
      await session.endSession();
    }

    await notifyAdmins(
      'PAYOUT_REQUEST',
      'New Payout Request',
      `Vendor "${vendor.storeName}" requested a withdrawal of ₹${amount} (Net: ₹${netPayout}, Fee: ₹${feeAmount} incl. ₹${withdrawalFee} withdrawal fee & ₹${platformFee} platform fee) to ${bankSnapshot.bankName} (${maskedAcc}).`
    );

    res.status(201).json({ 
      success: true, 
      message: 'Withdrawal request submitted successfully', 
      data: {
        ...withdrawalReq.toObject(),
        grossAmount: amount,
        withdrawalFee,
        platformFee,
        gstAmount,
        feeAmount,
        netPayout,
      } 
    });
  } catch (error) {
    logger.error(`Error in requestWithdrawal: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Products (Phase 3B) ───

// Get all products for the vendor
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find({ vendorId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    logger.error(`Error in vendor getProducts: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Create a new product
export const createProduct = async (req, res) => {
  try {
    const { 
      name, price, discountPrice, category, sku, description, isHighlight, stock, isActive,
      isBranded, brandName, brandCompany, brandWebsite, brandDescription, 
      brandEmail, brandContact, cashbackPercentage 
    } = req.body;

    const vendorId = req.user.id;
    
    // File URLs from multer
    let imageUrl = null;
    let brandLogoUrl = null;

    if (req.files) {
      if (req.files['image'] && req.files['image'][0]) {
        const f = req.files['image'][0];
        imageUrl = f.url || (f.filename?.startsWith('http') ? f.filename : null);
      }
      if (req.files['brandLogo'] && req.files['brandLogo'][0]) {
        const f = req.files['brandLogo'][0];
        brandLogoUrl = f.url || (f.filename?.startsWith('http') ? f.filename : null);
      }
    }

    const branding = {
      isBranded: isBranded === 'true',
      brandName,
      brandCompany,
      brandWebsite,
      brandDescription,
      brandEmail,
      brandContact,
      brandLogo: brandLogoUrl,
      cashbackPercentage: cashbackPercentage ? Number(cashbackPercentage) : undefined
    };

    const newProduct = new Product({
      vendorId,
      name,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : undefined,
      category: category || 'Bestsellers',
      sku,
      description,
      image: imageUrl,
      isHighlight: isHighlight === 'true',
      isActive: isActive !== 'false', // Default true unless explicitly false
      stock: stock ? Number(stock) : 0,
      branding
    });

    await newProduct.save();
    
    logger.info(`[vendor.controller] Product created: ${newProduct._id} by Vendor: ${vendorId}`);
    res.status(201).json({ success: true, message: 'Product created successfully', data: newProduct });
  } catch (error) {
    logger.error(`Error in vendor createProduct: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update a product
export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const vendorId = req.user.id;
    
    const product = await Product.findOne({ _id: productId, vendorId });
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Usually we do a partial update. Just copying the body fields.
    const updates = req.body;
    
    // Handle specific boolean fields from form data if necessary
    if (updates.isHighlight !== undefined) product.isHighlight = updates.isHighlight === 'true' || updates.isHighlight === true;
    if (updates.isActive !== undefined) product.isActive = updates.isActive === 'true' || updates.isActive === true;
    if (updates.price !== undefined) product.price = Number(updates.price);
    if (updates.discountPrice !== undefined) product.discountPrice = Number(updates.discountPrice);
    if (updates.stock !== undefined) product.stock = Number(updates.stock);
    
    // Generic strings
    ['name', 'category', 'sku', 'description'].forEach(key => {
      if (updates[key] !== undefined) product[key] = updates[key];
    });

    // Handle uploaded product files
    if (req.files) {
      if (req.files['image'] && req.files['image'][0]) {
        const f = req.files['image'][0];
        const newImageUrl = f.url || (f.filename?.startsWith('http') ? f.filename : null);
        if (newImageUrl) product.image = newImageUrl;
      }
      if (req.files['brandLogo'] && req.files['brandLogo'][0]) {
        const f = req.files['brandLogo'][0];
        const newLogoUrl = f.url || (f.filename?.startsWith('http') ? f.filename : null);
        if (newLogoUrl) {
          if (!product.branding) product.branding = {};
          product.branding.brandLogo = newLogoUrl;
        }
      }
    }

    await product.save();
    
    logger.info(`[vendor.controller] Product updated: ${product._id} by Vendor: ${vendorId}`);
    res.status(200).json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    logger.error(`Error in vendor updateProduct: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a product
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const vendorId = req.user.id;
    
    const product = await Product.findOneAndDelete({ _id: productId, vendorId });
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    logger.info(`[vendor.controller] Product deleted: ${productId} by Vendor: ${vendorId}`);
    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    logger.error(`Error in vendor deleteProduct: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Phase 3C: Transaction Engine ───

// 1. Lookup Customer by Phone or ZeeBac ID
// Accepts either a manually-typed phone/Zeebac-ID (unchanged behavior) OR a
// signed QR token scanned from the customer's own QR code (see
// getMyQrToken in user.controller.js for how it's issued). This is what
// makes VendorScanCustomerScreen.jsx's camera scan resolve to a real
// customer instead of the old hardcoded test-phone simulation.
export const lookupCustomerByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const raw = phone ? String(phone).trim() : '';

    let userFilter;
    if (looksLikeQrToken(raw)) {
      let decoded;
      try {
        decoded = verifyQrToken(raw);
      } catch {
        return res.status(400).json({ success: false, message: 'This QR code has expired or is invalid. Ask the customer to refresh it.' });
      }
      if (decoded.type !== 'customer') {
        return res.status(400).json({ success: false, message: 'That QR code is not a customer QR.' });
      }
      userFilter = { zeebacId: decoded.zeebacId };
    } else {
      userFilter = { $or: [{ phone: raw }, { zeebacId: raw.toUpperCase() }] };
    }

    const user = await User.findOne(userFilter).select('name zeebacId phone role status');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error(`Error in lookupCustomerByPhone: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// A signed, short-lived replacement for the old plaintext, non-expiring
// `zeebac://vendor/{zeebacId}` QR payload — the frontend fetches this and
// renders it locally (never sends it to a third-party QR-image service,
// since it's now a live, usable credential, not just a public ID).
export const getVendorQrToken = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id).select('zeebacId storeName bankDetails phone');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const token = signQrToken({ type: 'vendor', id: vendor._id, zeebacId: vendor.zeebacId }, VENDOR_QR_TTL_SECONDS);
    const payeeVpa = vendor.bankDetails?.upiId || process.env.MERCHANT_UPI_ID || `${vendor.phone}@upi`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(vendor.storeName || 'ZeeBac Store')}&tr=${vendor.zeebacId}&tn=Zeebac%20Cashback&cu=INR`;

    res.status(200).json({
      success: true,
      data: {
        token,
        upiUri,
        expiresIn: VENDOR_QR_TTL_SECONDS,
        zeebacId: vendor.zeebacId,
        storeName: vendor.storeName,
        payeeVpa,
      }
    });
  } catch (error) {
    logger.error(`getVendorQrToken error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 2. Log Purchase (QR/Manual) — vendor-initiated, so no separate approval
// step is needed (the vendor themself is confirming the sale).
export const logPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const vendorId = req.user.id;
    const { customerPhone, amount } = req.body;

    if (!customerPhone || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid input data' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    if (!subState.isSubActive) {
      return res.status(400).json({ success: false, message: 'Cashback blocked due to subscription expiry' });
    }

    if (vendorBalance <= 0) {
      return res.status(400).json({ success: false, message: 'Cashback blocked due to insufficient cashback wallet balance.' });
    }

    const customer = await User.findOne({ phone: customerPhone });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const cashbackAmount = calculateCashback(amount, vendor.cashbackRate);
    // Higher-entropy id than the old `TX-####` (only ~9,000 possible values,
    // a >50% collision chance after ~100 uses of this endpoint).
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    let tx;
    let referralAward = null;

    await session.withTransaction(async () => {
      // Created (and, if anything below fails, rolled back) inside the same
      // transaction as the wallet movements — previously the wallets were
      // debited/credited BEFORE this record existed, so a failure here left
      // money moved with no Transaction or ledger row to show for it.
      const created = await Transaction.create([{
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
        type: 'manual',
        initiatedBy: 'vendor',
        amount,
        cashbackPercent: vendor.cashbackRate,
        cashbackAmount,
        status: 'Approved', // Auto-approved since vendor initiated
        source: 'vendor_manual',
      }], { session });
      tx = created[0];

      await debitWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        amount: cashbackAmount,
        category: 'cashback',
        description: `Cashback given to ${customer.name}`,
        referenceId: tx._id,
        referenceType: 'Transaction',
      });

      await creditWallet({
        session,
        ownerId: customer._id,
        ownerType: 'User',
        ownerZeebacId: customer.zeebacId,
        amount: cashbackAmount,
        category: 'cashback',
        description: `Cashback from ${vendor.storeName}`,
        referenceId: tx._id,
        referenceType: 'Transaction',
      });

      referralAward = await claimFirstPurchaseReferralBonus({ session, customer });
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
      logger.info(`[Referral] Awarded ₹${referralAward.rewardAmount} to user ${referralAward.referrerId} for referring ${customer._id} (Vendor Initiated)`);
    }

    logger.info(`[vendor.controller] Purchase logged: ${tx.transactionId} by Vendor: ${vendor.storeName} for Customer: ${customer.name}`);
    res.status(201).json({ success: true, message: 'Purchase logged and cashback sent successfully', data: tx });

  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for cashback. Please recharge your wallet.' });
    }
    logger.error(`Error in logPurchase: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  } finally {
    session.endSession();
  }
};

// 3. Get Vendor Transactions
export const getVendorTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    logger.error(`Error in getVendorTransactions: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 4. Get Vendor Wallet
export const getVendorWallet = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    const wallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);
    
    // Get recent ledger
    const ledger = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .limit(30);

    const phone = vendor.businessContactNumber || vendor.phone || '';
    const maskedPhone = phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : '';

    res.status(200).json({
      success: true,
      data: {
        wallet,
        ledger,
        bankDetails: vendor.bankDetails || {},
        phone: maskedPhone,
      },
    });
  } catch (error) {
    logger.error(`Error in getVendorWallet: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 5. Create Razorpay Order for Wallet Recharge
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const rechargeAmount = Number(amount);

    if (!rechargeAmount || rechargeAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const options = {
      amount: Math.round(rechargeAmount * 100), // Razorpay amount is in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };

    const order = await getRazorpayInstance().orders.create(options);

    res.status(200).json({ success: true, order });
  } catch (error) {
    logger.error(`Error in createRazorpayOrder: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
};

// 6. Verify Razorpay Payment and Add Funds
//
// Two things this used to get wrong, both critical: the credited amount came
// straight from the client's own request body (never checked against what
// Razorpay actually captured — a valid signature for a real ₹1 payment could
// be submitted alongside a forged `amount: 100000` and be credited in full),
// and nothing stopped the same valid (order_id, payment_id, signature)
// triple from being replayed to credit the wallet again.
export const verifyRazorpayPayment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Trust Razorpay's own record of what was actually captured, not the client.
    const verifiedAmount = await fetchVerifiedPaymentAmount(razorpay_payment_id);

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    let wallet;
    await session.withTransaction(async () => {
      await assertGatewayPaymentNotProcessed(session, razorpay_payment_id);

      wallet = await creditWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        ownerZeebacId: vendor.zeebacId,
        amount: verifiedAmount,
        category: 'settlement',
        description: 'Wallet Recharge via Razorpay',
        referenceType: 'Transaction',
        gateway: {
          gatewayName: 'Razorpay',
          gatewayOrderId: razorpay_order_id,
          gatewayPaymentId: razorpay_payment_id,
          vendorName: vendor.storeName,
        },
      });
    });

    res.status(200).json({ success: true, message: 'Payment successful, wallet recharged!', data: { balance: wallet.balance } });

  } catch (error) {
    if (error instanceof DuplicatePaymentError || error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This payment has already been processed.' });
    }
    logger.error(`Error in verifyRazorpayPayment: ${error.message}`);
    res.status(500).json({ success: false, message: 'Verification Failed', error: error.message });
  } finally {
    session.endSession();
  }
};

// ─── Phase 4E: Cashback Requests Approvals ───

export const getPendingRequests = async (req, res) => {
  try {
    // 1. Auto-expire any cash claims whose verificationExpiresAt has passed
    const now = new Date();
    await CashbackRequest.updateMany(
      {
        vendorId: req.user.id,
        requestType: 'cash_claim',
        status: 'Pending',
        verificationExpiresAt: { $lt: now }
      },
      {
        status: 'Expired',
        rejectionReason: 'Cash verification OTP expired'
      }
    ).catch(err => logger.warn(`Failed to auto-expire cash requests: ${err.message}`));

    const rawRequests = await CashbackRequest.find({
      vendorId: req.user.id,
      status: { $in: ['Pending', 'Held'] }
    }).populate('customerId', 'name phone').sort({ createdAt: -1 });

    const seenCashCustomers = new Set();
    const seenBillNumbers = new Set();
    const duplicateIdsToReject = [];
    const uniqueRequests = [];

    for (const reqItem of rawRequests) {
      if (reqItem.requestType === 'cash_claim' || reqItem.paymentMethod === 'Cash') {
        const custId = reqItem.customerId?._id?.toString() || reqItem.customerId?.toString();
        if (custId) {
          if (seenCashCustomers.has(custId)) {
            // Older pending cash request from same customer — reject/supersede
            duplicateIdsToReject.push(reqItem._id);
            continue;
          }
          seenCashCustomers.add(custId);
        }
        uniqueRequests.push(reqItem);
        continue;
      }

      // Receipt claims with billNumber
      const bNum = reqItem.billNumber ? String(reqItem.billNumber).trim().toUpperCase() : null;
      if (bNum) {
        if (seenBillNumbers.has(bNum)) {
          duplicateIdsToReject.push(reqItem._id);
          continue;
        }
        seenBillNumbers.add(bNum);
      }
      uniqueRequests.push(reqItem);
    }

    // Auto-clean redundant duplicate/superseded pending requests in the background
    if (duplicateIdsToReject.length > 0) {
      CashbackRequest.updateMany(
        { _id: { $in: duplicateIdsToReject } },
        { status: 'Cancelled', rejectionReason: 'Superseded by newer cash request' }
      ).catch(err => logger.warn(`Failed to auto-clean duplicate pending requests: ${err.message}`));
    }

    res.status(200).json({ success: true, data: uniqueRequests });
  } catch (error) {
    logger.error(`getPendingRequests error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const respondToCashbackRequest = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'Approve' or 'Reject'

  if (action !== 'Approve' && action !== 'Reject') {
    return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  const session = await mongoose.startSession();
  try {
    // Atomically claim the request first — the old code checked
    // `status !== 'Pending'` and only wrote the final status AFTER moving
    // money, so two concurrent approve-clicks on the same request could both
    // pass the check and both pay out. This findOneAndUpdate only succeeds
    // for exactly one caller; a second concurrent call gets `claimed === null`
    // and a clean "already processed" response instead of a second payout.
    const claimed = await CashbackRequest.findOneAndUpdate(
      { _id: id, vendorId: req.user.id, status: { $in: ['Pending', 'Held'] } },
      { status: action === 'Approve' ? 'Approved' : 'Rejected' },
      { returnDocument: 'before' }
    ).populate('customerId');

    if (!claimed) {
      const exists = await CashbackRequest.exists({ _id: id, vendorId: req.user.id });
      return res.status(exists ? 400 : 404).json({
        success: false,
        message: exists ? 'Already processed' : 'Request not found',
      });
    }

    if (action === 'Reject') {
      if (claimed.requestType === 'cash_claim' || claimed.paymentMethod === 'Cash') {
        const custId = claimed.customerId?._id || claimed.customerId;
        if (custId) {
          CashbackRequest.updateMany(
            {
              _id: { $ne: claimed._id },
              vendorId: req.user.id,
              customerId: custId,
              requestType: 'cash_claim',
              status: { $in: ['Pending', 'Held'] },
            },
            { status: 'Cancelled', rejectionReason: 'Superseded by rejected request' }
          ).catch(err => logger.warn(`Failed to auto-clean customer pending cash requests: ${err.message}`));
        }
      }
      return res.status(200).json({ success: true, message: 'Request rejected' });
    }

    // action === 'Approve'
    const vendor = await Vendor.findById(req.user.id);
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    if (!subState.isSubActive) {
      return res.status(400).json({ success: false, message: 'Cashback blocked due to subscription expiry' });
    }

    if (vendorBalance <= 0) {
      return res.status(400).json({ success: false, message: 'Cashback blocked due to insufficient cashback wallet balance.' });
    }

    // Fix 3: Reject manual vendor approval if this bill number corresponds to an already claimed POS bill
    // or if another CashbackRequest was already approved for the same bill number
    if (claimed.billNumber) {
      const cleanBill = String(claimed.billNumber).trim().toUpperCase();
      const alreadyClaimedPos = await PosBill.findOne({
        vendor: vendor._id,
        status: 'CLAIMED',
        $or: [
          { billCode: cleanBill },
          { invoiceNumber: cleanBill },
        ],
      });
      if (alreadyClaimedPos) {
        await CashbackRequest.updateOne({ _id: id }, { status: 'Rejected', rejectionReason: 'POS bill already claimed' });
        return res.status(400).json({
          success: false,
          alreadyClaimed: true,
          message: 'Cannot approve: this POS bill has already been claimed.',
        });
      }

      const alreadyApprovedReq = await CashbackRequest.findOne({
        _id: { $ne: claimed._id },
        vendorId: vendor._id,
        billNumber: { $regex: new RegExp(`^${cleanBill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        status: 'Approved',
      });
      if (alreadyApprovedReq) {
        await CashbackRequest.updateOne({ _id: id }, { status: 'Rejected', rejectionReason: 'Bill already approved in another request' });
        return res.status(400).json({
          success: false,
          alreadyClaimed: true,
          message: 'Cannot approve: this bill has already been approved and cashback was disbursed.',
        });
      }
    }

    const customer = claimed.customerId;
    const amount = claimed.amount;
    const cashbackAmount = calculateCashback(amount, vendor.cashbackRate);
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    let txn;
    let referralAward = null;
    const lockedUntil = claimed.paymentMethod === 'Cash' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

    try {
      await session.withTransaction(async () => {
        if (lockedUntil) {
          await CashbackRequest.updateOne({ _id: id }, { lockedUntil }, { session });
        }

        const created = await Transaction.create([{
          transactionId, customerId: customer._id, customerZeebacId: customer.zeebacId,
          customerPhone: customer.phone, customerName: customer.name,
          vendorId: vendor._id, vendorZeebacId: vendor.zeebacId,
          vendorName: vendor.storeName, vendorPhone: vendor.phone,
          vendorCategory: vendor.category, type: 'receipt_claim',
          initiatedBy: 'customer', source: 'customer_request',
          amount: parseFloat(amount), cashbackPercent: vendor.cashbackRate,
          cashbackAmount, paymentMethod: claimed.paymentMethod || 'Other', status: 'Approved',
          hasReceipt: !!claimed.billImageUrl, receiptUrl: claimed.billImageUrl,
        }], { session });
        txn = created[0];

        // If an unclaimed POS bill existed for this invoice/code, atomically claim it now
        if (claimed.billNumber) {
          const cleanBill = String(claimed.billNumber).trim().toUpperCase();
          await PosBill.updateOne(
            {
              vendor: vendor._id,
              status: 'UNCLAIMED',
              $or: [
                { billCode: cleanBill },
                { invoiceNumber: cleanBill },
              ],
            },
            {
              $set: {
                status: 'CLAIMED',
                claimedBy: customer._id,
                claimedAt: new Date(),
                claimMode: 'AI_BILL_MATCH',
                cashbackAmount,
                transaction: txn._id,
              },
            },
            { session }
          );
        }

        await debitWallet({
          session, ownerId: vendor._id, ownerType: 'Vendor',
          amount: cashbackAmount, category: 'cashback',
          description: `Approved cashback for ${customer.name}`,
          referenceId: txn._id, referenceType: 'Transaction',
        });

        await creditWallet({
          session, ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId,
          amount: cashbackAmount, category: 'cashback',
          description: `Cashback approved from ${vendor.storeName}`,
          referenceId: txn._id, referenceType: 'Transaction',
          lockedUntil,
        });

        await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } }, { session });

        referralAward = await claimFirstPurchaseReferralBonus({ session, customer });
      });
    } catch (moneyError) {
      // Money didn't move — undo the claim so the request goes back to
      // Pending instead of being stuck "Approved" with no transaction behind it.
      await CashbackRequest.updateOne({ _id: id }, { status: 'Pending' });
      throw moneyError;
    }

    sendNotification({
      recipientId: customer._id,
      recipientType: 'customer',
      fcmTokens: customer.fcmTokens || [],
      type: 'credit',
      title: '✅ Cashback Request Approved!',
      message: `₹${cashbackAmount} cashback from ${vendor.storeName} has been approved.${lockedUntil ? ' (Locked for 24h from bank withdrawal)' : ''}`,
      icon: 'check_circle',
      referenceId: txn._id,
      referenceType: 'Transaction',
      data: {
        cashbackAmount: String(cashbackAmount),
        amount: String(amount),
        vendorName: vendor.storeName,
      },
    });

    try {
      getIO()?.to(`customer_${customer._id}`).emit('cashback_approved', {
        requestId: id,
        cashbackAmount,
        amount: parseFloat(amount),
        vendorName: vendor.storeName,
        transactionId: txn.transactionId,
      });
    } catch (socketErr) {
      logger.warn(`Socket emit error on manual approval: ${socketErr.message}`);
    }

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

    // Auto-reject any other remaining duplicate pending requests for this billNumber
    if (claimed.billNumber) {
      const cleanBill = String(claimed.billNumber).trim();
      CashbackRequest.updateMany(
        {
          _id: { $ne: claimed._id },
          vendorId: vendor._id,
          billNumber: { $regex: new RegExp(`^${cleanBill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          status: { $in: ['Pending', 'Held'] },
        },
        { status: 'Rejected', rejectionReason: 'Duplicate of approved bill request' }
      ).catch(err => logger.warn(`Failed to auto-reject duplicate bill requests: ${err.message}`));
    }

    // Auto-cancel any remaining pending cash requests for this customer at this shop
    if (claimed.requestType === 'cash_claim' || claimed.paymentMethod === 'Cash') {
      CashbackRequest.updateMany(
        {
          _id: { $ne: claimed._id },
          vendorId: vendor._id,
          customerId: customer._id,
          requestType: 'cash_claim',
          status: { $in: ['Pending', 'Held'] },
        },
        { status: 'Cancelled', rejectionReason: 'Resolved by approved cash request' }
      ).catch(err => logger.warn(`Failed to auto-clean customer pending cash requests: ${err.message}`));
    }

    return res.status(200).json({ success: true, message: 'Request approved successfully' });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for cashback' });
    }
    logger.error(`respondToCashbackRequest error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    session.endSession();
  }
};

// Vendor puts a cash transaction / cashback request on hold (blocks customer from withdrawing)
export const holdCashbackTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const request = await CashbackRequest.findOne({ _id: id, vendorId: req.user.id });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Cashback request not found' });
    }

    const holdReason = reason ? reason.trim() : 'Vendor flagged transaction for verification';
    const now = new Date();

    request.isHeld = true;
    request.holdReason = holdReason;
    request.heldAt = now;
    request.status = 'Held';
    await request.save();

    // Freeze associated wallet credit transaction
    await WalletTransaction.updateMany(
      {
        $or: [
          { referenceId: request._id },
          { ownerId: request.customerId, description: { $regex: new RegExp(req.user.storeName || 'Cashback', 'i') } }
        ],
        type: 'credit',
      },
      {
        $set: {
          isHeld: true,
          holdReason,
          heldAt: now,
          heldBy: req.user.id,
        }
      }
    );

    // Update Transaction if already created
    await Transaction.updateMany(
      {
        $or: [
          { customerId: request.customerId, vendorId: req.user.id, amount: request.amount }
        ]
      },
      {
        $set: {
          isHeld: true,
          holdReason,
          heldAt: now,
          status: 'Held',
        }
      }
    );

    sendNotification({
      recipientId: request.customerId,
      recipientType: 'customer',
      type: 'system',
      title: '⚠️ Cashback Put On Hold',
      message: `Cashback from ${req.user.storeName || 'the vendor'} has been placed on hold: "${holdReason}". Bank withdrawal is frozen until reviewed.`,
      icon: 'pause_circle',
      referenceId: request._id,
      referenceType: 'cashback_request',
    });

    res.status(200).json({
      success: true,
      message: 'Transaction successfully put on hold. Withdrawal is blocked for the customer.',
      data: request,
    });
  } catch (error) {
    logger.error(`holdCashbackTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// Vendor releases hold on a cash transaction
export const unholdCashbackTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await CashbackRequest.findOne({ _id: id, vendorId: req.user.id });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Cashback request not found' });
    }

    request.isHeld = false;
    request.status = 'Approved';
    await request.save();

    await WalletTransaction.updateMany(
      {
        $or: [
          { referenceId: request._id },
          { ownerId: request.customerId, isHeld: true, heldBy: req.user.id }
        ],
      },
      {
        $set: { isHeld: false }
      }
    );

    await Transaction.updateMany(
      {
        customerId: request.customerId,
        vendorId: req.user.id,
        isHeld: true,
      },
      {
        $set: { isHeld: false, status: 'Approved' }
      }
    );

    sendNotification({
      recipientId: request.customerId,
      recipientType: 'customer',
      type: 'credit',
      title: '✅ Hold Released on Cashback',
      message: `The hold on your cashback from ${req.user.storeName || 'the vendor'} has been released.`,
      icon: 'check_circle',
      referenceId: request._id,
      referenceType: 'cashback_request',
    });

    res.status(200).json({
      success: true,
      message: 'Hold has been released successfully.',
      data: request,
    });
  } catch (error) {
    logger.error(`unholdCashbackTransaction error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// ─── Phase 6: Vendor Subscription (Plans, Status & Purchase) ───
export const getVendorSubscriptionPlans = async (req, res) => {
  try {
    await SubscriptionPlan.seedDefaultsIfEmpty();
    const vendor = await Vendor.findById(req.user.id);
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ durationDays: 1 });

    const isBrand = vendor?.shopType === 'Chain & Brand';
    const plansWithEffectivePrice = plans.map(p => ({
      ...p.toObject(),
      price: isBrand ? p.pricing.chainBrand : p.pricing.independentStore,
      shopType: vendor?.shopType || 'Independent Store',
    }));

    res.status(200).json({
      success: true,
      data: plansWithEffectivePrice,
    });
  } catch (error) {
    logger.error(`Error in getVendorSubscriptionPlans: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getVendorSubscriptionStatus = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const wallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const balance = wallet ? (wallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, balance);

    const successfulPayments = await SubscriptionPayment.countDocuments({
      vendorId: vendor._id,
      paymentStatus: 'SUCCESS',
    });
    const isNewUserBonusEligible = !vendor.hasUsedNewUserBonus &&
      successfulPayments === 0 &&
      (!vendor.subscription?.startDate || vendor.subscription?.status === 'NONE');

    res.status(200).json({
      success: true,
      data: {
        ...subState,
        walletBalance: balance,
        storeName: vendor.storeName,
        shopType: vendor.shopType,
        isNewUserBonusEligible,
        newUserBonusDays: 10,
      },
    });
  } catch (error) {
    logger.error(`Error in getVendorSubscriptionStatus: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Disable direct subscription shortcut
export const subscribePlan = async (req, res) => {
  return res.status(400).json({
    success: false,
    message: 'Direct subscription is not permitted. Please use /subscription/create-order for Razorpay or /subscription/pay-from-wallet for Wallet payment.',
  });
};

/**
 * 1. Create Razorpay Order for Subscription Purchase / Renewal
 * Validates vendor, plan, and calculates authoritative price from backend (shopType).
 * Frontend price is NEVER trusted.
 */
export const createSubscriptionRazorpayOrder = async (req, res) => {
  try {
    const { planType, planId } = req.body;
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const targetPlan = planType || planId || '1 Month';
    const planInfo = await resolvePlanPrice(targetPlan, vendor.shopType);

    const successfulPayments = await SubscriptionPayment.countDocuments({
      vendorId: vendor._id,
      paymentStatus: 'SUCCESS',
    });
    const isNewUserBonusEligible = !vendor.hasUsedNewUserBonus &&
      successfulPayments === 0 &&
      (!vendor.subscription?.startDate || vendor.subscription?.status === 'NONE');
    const bonusDays = isNewUserBonusEligible ? 10 : 0;

    const transactionId = `SUB-RZP-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const rzpOptions = {
      amount: Math.round(planInfo.price * 100), // paise
      currency: 'INR',
      receipt: transactionId.slice(0, 40),
    };

    const order = await getRazorpayInstance().orders.create(rzpOptions);
    if (!order) {
      return res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
    }

    const baseAmount = Math.round((planInfo.price / 1.18) * 100) / 100;
    const gstAmount = Math.round((planInfo.price - baseAmount) * 100) / 100;

    // Create pending payment record
    await SubscriptionPayment.create({
      vendorId: vendor._id,
      planId: planInfo.planId,
      planType: planInfo.planType,
      shopType: planInfo.shopType,
      amount: planInfo.price,
      baseAmount,
      gstAmount,
      gstPercent: 18,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PENDING',
      razorpayOrderId: order.id,
      transactionId,
      bonusDaysApplied: bonusDays,
    });

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: planInfo.price,
        key: process.env.RAZORPAY_KEY_ID,
        planType: planInfo.planType,
        shopType: planInfo.shopType,
        transactionId,
        bonusDays,
        totalDurationDays: planInfo.durationDays + bonusDays,
        isNewUserBonusEligible,
      },
    });
  } catch (error) {
    logger.error(`Error in createSubscriptionRazorpayOrder: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

/**
 * 2. Verify Razorpay Payment for Subscription
 * Verifies signature and server-side captured payment status before activating subscription.
 */
export const verifySubscriptionRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planType, planId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    // Verify signature
    const isValidSignature = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValidSignature) {
      await SubscriptionPayment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { paymentStatus: 'FAILED', errorMessage: 'Invalid payment signature' }
      );
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Verify status & captured amount with Razorpay
    const verifiedAmount = await fetchVerifiedPaymentAmount(razorpay_payment_id);

    // Check payment record
    let payment = await SubscriptionPayment.findOne({ razorpayOrderId: razorpay_order_id });
    if (payment && payment.paymentStatus === 'SUCCESS') {
      // Idempotent return if already activated
      const vendor = await Vendor.findById(req.user.id);
      return res.status(200).json({
        success: true,
        message: 'Subscription payment already processed',
        data: vendor?.subscription,
      });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const targetPlan = planType || planId || payment?.planType || '1 Month';
    const planInfo = await resolvePlanPrice(targetPlan, vendor.shopType);

    if (Math.abs(verifiedAmount - planInfo.price) > 1) {
      await SubscriptionPayment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { paymentStatus: 'FAILED', errorMessage: `Amount mismatch: expected ${planInfo.price}, received ${verifiedAmount}` }
      );
      return res.status(400).json({ success: false, message: 'Payment amount mismatch' });
    }

    // Check if new user bonus applies (+10 days)
    const successfulPayments = await SubscriptionPayment.countDocuments({
      vendorId: vendor._id,
      paymentStatus: 'SUCCESS',
    });
    const isNewUserBonusEligible = !vendor.hasUsedNewUserBonus &&
      successfulPayments === 0 &&
      (!vendor.subscription?.startDate || vendor.subscription?.status === 'NONE');
    const bonusDays = isNewUserBonusEligible ? 10 : 0;
    const totalDurationDays = planInfo.durationDays + bonusDays;

    // Calculate dates (respects active renewal vs new/expired)
    const newDates = calculateNewSubscriptionDates(vendor.subscription, totalDurationDays);

    vendor.hasUsedNewUserBonus = true;
    vendor.subscription = {
      planType: planInfo.planType,
      price: planInfo.price,
      status: 'ACTIVE',
      startDate: newDates.startDate,
      expiresAt: newDates.expiresAt,
      lastRenewedAt: newDates.lastRenewedAt,
      expiredAt: null,
      bonusDaysApplied: bonusDays,
      paymentId: razorpay_payment_id,
    };
    await vendor.save();

    const baseAmount = Math.round((planInfo.price / 1.18) * 100) / 100;
    const gstAmount = Math.round((planInfo.price - baseAmount) * 100) / 100;

    // Update payment record
    if (payment) {
      payment.paymentStatus = 'SUCCESS';
      payment.baseAmount = baseAmount;
      payment.gstAmount = gstAmount;
      payment.gstPercent = 18;
      payment.razorpayPaymentId = razorpay_payment_id;
      payment.razorpaySignature = razorpay_signature;
      payment.bonusDaysApplied = bonusDays;
      payment.paidAt = new Date();
      await payment.save();
    } else {
      await SubscriptionPayment.create({
        vendorId: vendor._id,
        planId: planInfo.planId,
        planType: planInfo.planType,
        shopType: vendor.shopType,
        amount: planInfo.price,
        baseAmount,
        gstAmount,
        gstPercent: 18,
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'SUCCESS',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        transactionId: `SUB-RZP-${Date.now()}`,
        bonusDaysApplied: bonusDays,
        paidAt: new Date(),
      });
    }

    logger.info(`[vendor.controller] Vendor ${vendor._id} subscription activated via Razorpay (${planInfo.planType}) with ${bonusDays} bonus days`);

    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'system',
      title: '🎉 Subscription Active!',
      message: `Your store is active and visible on ZeeBac until ${newDates.expiresAt.toLocaleDateString('en-IN')}.${bonusDays > 0 ? ' (Includes +10 days new user bonus!)' : ''}`,
      icon: 'card_membership',
    });

    res.status(200).json({
      success: true,
      message: `Successfully subscribed to ${planInfo.planType} plan${bonusDays > 0 ? ' with +10 days new user bonus' : ''}. Valid until ${newDates.expiresAt.toLocaleDateString('en-IN')}`,
      data: vendor.subscription,
      bonusDaysApplied: bonusDays,
    });
  } catch (error) {
    logger.error(`Error in verifySubscriptionRazorpayPayment: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

/**
 * 3. Cancel / Fail Razorpay Order
 */
export const cancelSubscriptionRazorpayOrder = async (req, res) => {
  try {
    const { razorpay_order_id, reason } = req.body;
    if (razorpay_order_id) {
      await SubscriptionPayment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id, paymentStatus: 'PENDING' },
        { paymentStatus: 'FAILED', errorMessage: reason || 'Payment cancelled by user' }
      );
    }
    res.status(200).json({ success: true, message: 'Order marked as cancelled' });
  } catch (error) {
    logger.error(`Error in cancelSubscriptionRazorpayOrder: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * 4. Pay Subscription From Vendor Wallet
 * Atomically validates balance, debits wallet, creates transaction, and activates subscription.
 * Does NOT trust frontend amount.
 */
export const paySubscriptionFromWallet = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { planType, planId } = req.body;
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const targetPlan = planType || planId || '1 Month';
    const planInfo = await resolvePlanPrice(targetPlan, vendor.shopType);

    // Check wallet balance
    const wallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: { $in: ['vendor', 'Vendor'] } });
    const currentBalance = wallet ? (wallet.balance || 0) : 0;

    if (currentBalance < planInfo.price) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance. Please recharge your wallet or pay using Razorpay.',
        walletBalance: currentBalance,
        requiredAmount: planInfo.price,
      });
    }

    const successfulPayments = await SubscriptionPayment.countDocuments({
      vendorId: vendor._id,
      paymentStatus: 'SUCCESS',
    });
    const isNewUserBonusEligible = !vendor.hasUsedNewUserBonus &&
      successfulPayments === 0 &&
      (!vendor.subscription?.startDate || vendor.subscription?.status === 'NONE');
    const bonusDays = isNewUserBonusEligible ? 10 : 0;
    const totalDurationDays = planInfo.durationDays + bonusDays;

    const transactionId = `SUB-WLT-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
    let newDates;

    const baseAmount = Math.round((planInfo.price / 1.18) * 100) / 100;
    const gstAmount = Math.round((planInfo.price - baseAmount) * 100) / 100;

    await session.withTransaction(async () => {
      // 1. Create subscription payment transaction record
      const [createdSubPayment] = await SubscriptionPayment.create(
        [
          {
            vendorId: vendor._id,
            planId: planInfo.planId,
            planType: planInfo.planType,
            shopType: vendor.shopType,
            amount: planInfo.price,
            baseAmount,
            gstAmount,
            gstPercent: 18,
            paymentMethod: 'WALLET',
            paymentStatus: 'SUCCESS',
            transactionId,
            bonusDaysApplied: bonusDays,
            paidAt: new Date(),
          },
        ],
        { session }
      );

      // 2. Atomically debit wallet
      await debitWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        amount: planInfo.price,
        category: 'subscription',
        description: `Subscription payment for ${planInfo.planType} Plan`,
        referenceId: createdSubPayment._id,
        referenceType: 'SubscriptionPayment',
      });

      // 3. Calculate dates
      newDates = calculateNewSubscriptionDates(vendor.subscription, totalDurationDays);

      // 4. Update vendor subscription
      vendor.hasUsedNewUserBonus = true;
      vendor.subscription = {
        planType: planInfo.planType,
        price: planInfo.price,
        status: 'ACTIVE',
        startDate: newDates.startDate,
        expiresAt: newDates.expiresAt,
        lastRenewedAt: newDates.lastRenewedAt,
        expiredAt: null,
        bonusDaysApplied: bonusDays,
        paymentId: transactionId,
      };
      await vendor.save({ session });
    });

    logger.info(`[vendor.controller] Vendor ${vendor._id} subscription activated via Wallet (${planInfo.planType}) with ${bonusDays} bonus days`);

    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'system',
      title: '🎉 Subscription Active!',
      message: `Your store is active and visible on ZeeBac until ${newDates.expiresAt.toLocaleDateString('en-IN')}.${bonusDays > 0 ? ' (Includes +10 days new user bonus!)' : ''}`,
      icon: 'card_membership',
    });

    const updatedWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: { $in: ['vendor', 'Vendor'] } });

    res.status(200).json({
      success: true,
      message: `Successfully purchased ${planInfo.planType} plan from wallet${bonusDays > 0 ? ' with +10 days new user bonus' : ''}. Valid until ${newDates.expiresAt.toLocaleDateString('en-IN')}`,
      bonusDaysApplied: bonusDays,
      data: {
        subscription: vendor.subscription,
        walletBalance: updatedWallet?.balance ?? 0,
        transactionId,
        bonusDaysApplied: bonusDays,
      },
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance. Please recharge your wallet or pay using Razorpay.',
      });
    }
    logger.error(`Error in paySubscriptionFromWallet: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  } finally {
    session.endSession();
  }
};

/**
 * ─── Bank Account Management with OTP Verification ───
 */

// 1. Get Vendor Linked Bank Account
export const getVendorBankAccount = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const phone = vendor.businessContactNumber || vendor.phone || '';
    const maskedPhone = phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : '';

    res.status(200).json({
      success: true,
      data: {
        bankDetails: vendor.bankDetails || {},
        phone: maskedPhone,
      },
    });
  } catch (error) {
    logger.error(`Error in getVendorBankAccount: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 2. Send OTP for Bank Account Linking / Updating
export const sendVendorBankOtp = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const phone = vendor.businessContactNumber || vendor.phone;
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'No registered mobile number found on your vendor account. Please update your profile phone number first.',
      });
    }

    const useDefaultOtp = process.env.USE_DEFAULT_OTP === 'true';
    const otp = useDefaultOtp ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();

    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);

    await OtpVerification.deleteMany({ phone, purpose: 'bank_update', role: 'vendor' });

    await OtpVerification.create({
      phone,
      otpHash,
      purpose: 'bank_update',
      role: 'vendor',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes validity
    });

    await sendOtpSms(phone, otp);

    const maskedPhone = `${phone.slice(0, 2)}******${phone.slice(-2)}`;
    logger.info(`[sendVendorBankOtp] Bank update OTP sent to vendor ${vendor._id} (${maskedPhone})`);

    res.status(200).json({
      success: true,
      message: `OTP sent successfully to registered mobile number ${maskedPhone}`,
      maskedPhone,
    });
  } catch (error) {
    logger.error(`Error in sendVendorBankOtp: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Failed to send OTP' });
  }
};

// 3. Verify OTP & Save Bank Account
export const verifyAndSaveVendorBankAccount = async (req, res) => {
  try {
    const { accountHolderName, bankName, accountNumber, ifscCode, upiId, otp } = req.body;

    if (!accountHolderName?.trim()) {
      return res.status(400).json({ success: false, message: 'Account holder name is required' });
    }
    if (!bankName?.trim()) {
      return res.status(400).json({ success: false, message: 'Bank name is required' });
    }
    const cleanAcc = (accountNumber || '').toString().trim();
    if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18 || !/^\d+$/.test(cleanAcc)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid bank account number (9 to 18 digits)',
      });
    }
    const cleanIfsc = (ifscCode || '').toString().trim().toUpperCase();
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!cleanIfsc || !ifscRegex.test(cleanIfsc)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 11-character IFSC code (e.g. SBIN0001234, HDFC0000123)',
      });
    }
    if (!otp?.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Verification OTP is required' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const phone = vendor.businessContactNumber || vendor.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'No registered mobile number found' });
    }

    // Verify OTP
    try {
      await verifyOtpOnly(phone, otp.toString().trim(), 'bank_update', 'vendor');
    } catch (otpErr) {
      return res.status(400).json({ success: false, message: otpErr.message || 'Invalid or expired OTP' });
    }

    // Save Bank Details
    const now = new Date();
    vendor.bankDetails = {
      accountHolderName: accountHolderName.trim(),
      bankName: bankName.trim(),
      accountNumber: cleanAcc,
      ifscCode: cleanIfsc,
      upiId: (upiId || '').toString().trim(),
      isVerified: true,
      verifiedAt: now,
    };
    await vendor.save();

    logger.info(`[verifyAndSaveVendorBankAccount] Vendor ${vendor._id} successfully verified & saved bank account ending in ${cleanAcc.slice(-4)}`);

    res.status(200).json({
      success: true,
      message: 'Bank account verified and linked successfully!',
      data: {
        bankDetails: vendor.bankDetails,
      },
    });
  } catch (error) {
    logger.error(`Error in verifyAndSaveVendorBankAccount: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// ─── Vendor Security: Set or Update Security PIN ───
export const setupSecurityPin = async (req, res) => {
  try {
    const { pin, currentPin } = req.body;
    const cleanPin = String(pin || '').trim();

    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 8 || !/^\d+$/.test(cleanPin)) {
      return res.status(400).json({ success: false, message: 'Security PIN must be between 4 and 8 digits' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    // If a PIN is already set, require verification of current PIN
    if (vendor.security?.securityPin) {
      if (!currentPin) {
        return res.status(400).json({ success: false, message: 'Current PIN is required to set a new PIN' });
      }
      const isMatch = await bcrypt.compare(String(currentPin).trim(), vendor.security.securityPin);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Current PIN is incorrect' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(cleanPin, salt);

    if (!vendor.security) {
      vendor.security = {};
    }
    vendor.security.securityPin = hashedPin;
    await vendor.save();

    logger.info(`[Vendor Security] Vendor ${vendor._id} configured Security PIN`);
    return res.status(200).json({
      success: true,
      message: 'Security PIN set successfully',
      data: {
        hasPin: true,
        biometricEnabled: !!vendor.security.biometricEnabled,
      },
    });
  } catch (error) {
    logger.error(`[Vendor setupSecurityPin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Vendor Security: Toggle Biometric Authentication ───
export const toggleBiometricSecurity = async (req, res) => {
  try {
    const { enabled, credentialId } = req.body;
    const isEnabled = Boolean(enabled);

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    if (!vendor.security) {
      vendor.security = {};
    }

    // Require fallback PIN before enabling biometrics
    if (isEnabled && !vendor.security.securityPin) {
      return res.status(400).json({
        success: false,
        message: 'Please set up a Security PIN first as a fallback before enabling biometrics.',
        code: 'PIN_REQUIRED',
      });
    }

    vendor.security.biometricEnabled = isEnabled;
    if (credentialId) {
      vendor.security.biometricCredentialId = String(credentialId);
    }
    await vendor.save();

    logger.info(`[Vendor Security] Vendor ${vendor._id} set biometricEnabled = ${isEnabled}`);
    return res.status(200).json({
      success: true,
      message: isEnabled ? 'Biometric security enabled successfully' : 'Biometric security disabled',
      data: {
        biometricEnabled: vendor.security.biometricEnabled,
        hasPin: !!vendor.security.securityPin,
      },
    });
  } catch (error) {
    logger.error(`[Vendor toggleBiometricSecurity] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Vendor Security: Verify Security PIN ───
export const verifySecurityPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, message: 'Security PIN is required' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    if (!vendor.security?.securityPin) {
      return res.status(400).json({ success: false, message: 'No Security PIN is configured on this account' });
    }

    const isMatch = await bcrypt.compare(String(pin).trim(), vendor.security.securityPin);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect Security PIN. Please try again.' });
    }

    return res.status(200).json({
      success: true,
      message: 'PIN verified successfully',
    });
  } catch (error) {
    logger.error(`[Vendor verifySecurityPin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};



