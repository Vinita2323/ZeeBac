import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import CashbackRequest from '../models/CashbackRequest.js';
import CashbackRule from '../models/CashbackRule.js';
import RewardConfig from '../models/RewardConfig.js';
import Referral from '../models/Referral.js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notification.service.js';
import { notifyAdmins } from '../utils/adminNotification.js';
import { buildSnapshot, diffSnapshots, validateApplicationComplete } from '../utils/vendorApplication.util.js';
import { calculateCashback, validateVendorCashbackRate } from '../utils/cashback.util.js';
import { debitWallet, creditWallet, InsufficientBalanceError, DuplicatePaymentError, assertGatewayPaymentNotProcessed } from '../utils/wallet.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import { getRazorpayInstance, verifyRazorpaySignature, fetchVerifiedPaymentAmount } from '../utils/razorpay.util.js';
import { signQrToken, verifyQrToken, looksLikeQrToken, VENDOR_QR_TTL_SECONDS } from '../utils/qr.util.js';

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

  if (address !== undefined) {
    const addressObj = typeof address === 'string' ? JSON.parse(address) : address;
    vendor.address = { ...(vendor.address?.toObject ? vendor.address.toObject() : vendor.address), ...addressObj };
  }

  if (lat && lng) {
    vendor.location = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
  }

  if (businessHours !== undefined) {
    const hoursObj = typeof businessHours === 'string' ? JSON.parse(businessHours) : businessHours;
    vendor.businessHours = { ...(vendor.businessHours?.toObject ? vendor.businessHours.toObject() : vendor.businessHours), ...hoursObj };
  }

  if (files) {
    const getUrl = (f, folder) => f.filename.startsWith('http') ? f.filename : `/uploads/${folder}/${f.filename}`;

    if (files.storeLogo) vendor.storeLogo = vendor.profilePic = getUrl(files.storeLogo[0], 'profiles');
    if (files.storeCoverImage) vendor.storeCoverImage = getUrl(files.storeCoverImage[0], 'storefront');
    if (files.storeImages) vendor.storeImages = files.storeImages.map(f => getUrl(f, 'storefront'));

    for (const field of DOCUMENT_FIELDS) {
      if (files[field]) {
        if (!vendor.documents) vendor.documents = {};
        vendor.documents[field] = {
          fileName: files[field][0].originalname,
          fileUrl: getUrl(files[field][0], 'documents'),
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
    res.status(200).json({ success: true, data: vendor });
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

// ─── Get Dashboard Stats (Phase 3D Real Data) ───
export const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Aggregate transactions for this vendor
    const stats = await Transaction.aggregate([
      { $match: { vendorId: vendor._id, status: 'Approved' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalCashbackGiven: { $sum: "$cashbackAmount" },
          totalTransactions: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerId" }
        }
      }
    ]);

    const result = stats[0] || { totalRevenue: 0, totalCashbackGiven: 0, totalTransactions: 0, uniqueCustomers: [] };
    const totalCustomersCount = result.uniqueCustomers.length;

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: result.totalRevenue,
        totalCustomers: totalCustomersCount,
        totalTransactions: result.totalTransactions,
        avgRating: vendor.stats.avgRating || 0,
        totalCashbackGiven: result.totalCashbackGiven,
        cashbackRate: vendor.cashbackRate || 5
      }
    });
  } catch (error) {
    logger.error(`Error in vendor getDashboardStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Vendor Customers List (Phase 3D) ───
export const getVendorCustomers = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const mongoose = (await import('mongoose')).default;
    
    // Find all customers who have transacted with this vendor
    const customersAggr = await Transaction.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
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

    const wallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);

    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal' });
    }

    // Deduct from balance
    wallet.balance -= amount;
    // Add to pending withdrawal tracking if schema supports it, else we just deduct.
    // Let's create the withdrawal request record
    const withdrawalReq = await WithdrawalRequest.create({
      vendorId: vendor._id,
      amount,
      status: 'Pending',
      bankDetailsSnapshot: vendor.bankDetails || {}
    });

    // Create a ledger entry for the withdrawal deduction
    await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: vendor._id,
      ownerType: 'Vendor',
      type: 'debit',
      category: 'withdrawal',
      amount: amount,
      balanceAfter: wallet.balance,
      referenceId: withdrawalReq._id,
      referenceType: 'WithdrawalRequest',
      description: `Withdrawal request initiated`,
      vendorName: vendor.storeName
    });

    await wallet.save();

    await notifyAdmins('PAYOUT_REQUEST', 'New Payout Request', `Vendor "${vendor.storeName}" requested a withdrawal of ₹${amount}.`);

    res.status(201).json({ success: true, message: 'Withdrawal request submitted successfully', data: withdrawalReq });
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
        imageUrl = req.files['image'][0].filename.startsWith('http') ? req.files['image'][0].filename : `/uploads/storefront/${req.files['image'][0].filename}`;
      }
      if (req.files['brandLogo'] && req.files['brandLogo'][0]) {
        brandLogoUrl = req.files['brandLogo'][0].filename.startsWith('http') ? req.files['brandLogo'][0].filename : `/uploads/storefront/${req.files['brandLogo'][0].filename}`;
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
    const vendor = await Vendor.findById(req.user.id).select('zeebacId');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const token = signQrToken({ type: 'vendor', id: vendor._id, zeebacId: vendor.zeebacId }, VENDOR_QR_TTL_SECONDS);
    res.status(200).json({ success: true, data: { token, expiresIn: VENDOR_QR_TTL_SECONDS } });
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

    res.status(200).json({ success: true, data: { wallet, ledger } });
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
    const requests = await CashbackRequest.find({
      vendorId: req.user.id,
      status: 'Pending'
    }).populate('customerId', 'name phone').sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: requests });
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
      { _id: id, vendorId: req.user.id, status: 'Pending' },
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
      return res.status(200).json({ success: true, message: 'Request rejected' });
    }

    // action === 'Approve'
    const vendor = await Vendor.findById(req.user.id);
    const customer = claimed.customerId;
    const amount = claimed.amount;
    const cashbackAmount = calculateCashback(amount, vendor.cashbackRate);
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    let txn;
    let referralAward = null;

    try {
      await session.withTransaction(async () => {
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
      message: `₹${cashbackAmount} cashback from ${vendor.storeName} has been approved. Wallet balance updated!`,
      icon: 'check_circle',
      referenceId: txn._id,
      referenceType: 'Transaction',
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

// ─── Phase 6: Vendor Subscription (Purchase / Renew) ───
export const subscribePlan = async (req, res) => {
  try {
    const { planType } = req.body; // 'Monthly' or 'Yearly'
    if (planType !== 'Monthly' && planType !== 'Yearly') {
      return res.status(400).json({ success: false, message: 'Invalid planType. Must be Monthly or Yearly.' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const config = (await RewardConfig.findOne()) || {};
    const isBrand = vendor.shopType === 'Chain & Brand';

    let price = 0;
    if (planType === 'Monthly') {
      price = isBrand ? (config.brandMonthlyPrice ?? 999) : (config.independentStoreMonthlyPrice ?? 499);
    } else {
      price = isBrand ? (config.brandYearlyPrice ?? 9999) : (config.independentStoreYearlyPrice ?? 4999);
    }

    const now = new Date();
    const expiresAt = new Date(now);
    if (planType === 'Monthly') {
      expiresAt.setDate(expiresAt.getDate() + 30);
    } else {
      expiresAt.setDate(expiresAt.getDate() + 365);
    }

    vendor.subscription = {
      planType,
      price,
      status: 'ACTIVE',
      startDate: now,
      expiresAt,
      lastRenewedAt: now,
    };

    await vendor.save();

    logger.info(`[vendor.controller] Vendor ${vendor._id} subscribed to ${planType} plan for ₹${price}`);

    res.status(200).json({
      success: true,
      message: `Successfully subscribed to ${planType} plan. Valid until ${expiresAt.toLocaleDateString()}`,
      data: vendor.subscription,
    });
  } catch (error) {
    logger.error(`Error in subscribePlan: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


