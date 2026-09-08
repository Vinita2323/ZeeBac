import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Referral from '../models/Referral.js';
import { verifyOtpOnly } from './auth.controller.js';
import { notifyAdmins } from '../utils/adminNotification.js';
import { sendTokens } from '../utils/token.utils.js';
import logger from '../utils/logger.js';

// Helper to generate unique Zeebac ID
const generateZeebacId = async (prefix, Model) => {
  let isUnique = false;
  let newId;
  while (!isUnique) {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    newId = `${prefix}-${randomDigits}`;
    const exists = await Model.findOne({ zeebacId: newId });
    if (!exists) isUnique = true;
  }
  return newId;
};

// 1. Customer Signup
export const customerSignup = async (req, res) => {
  try {
    const { phone, otp, name, email, referralCode: inputReferralCode } = req.body;

    // 1. Verify OTP
    await verifyOtpOnly(phone, otp, 'signup', 'customer');

    // 2. Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      logger.warn(`[customerSignup] Failed: Account already exists for phone ${phone}`);
      return res.status(400).json({ success: false, message: 'Account already exists. Please login.' });
    }

    // 3. Generate IDs
    const zeebacId = await generateZeebacId('ZBC', User);
    
    // Auto-generate referral code (e.g., ZEEBACRAHUL150)
    let firstName = name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
    if (!firstName) firstName = 'USER';
    
    // Ensure uniqueness of auto-generated referral code
    let generatedReferralCode = `ZEEBAC${firstName}150`;
    let codeIsUnique = false;
    let attempt = 0;
    while (!codeIsUnique) {
      const exists = await User.findOne({ referralCode: generatedReferralCode });
      if (!exists) {
        codeIsUnique = true;
      } else {
        attempt++;
        generatedReferralCode = `ZEEBAC${firstName}${attempt}150`;
      }
    }

    // 3.5 Check Input Referral Code
    let referredBy = null;
    let referrerDoc = null;
    if (inputReferralCode) {
      referrerDoc = await User.findOne({ referralCode: inputReferralCode.trim().toUpperCase() });
      if (referrerDoc) {
        referredBy = referrerDoc._id;
      } else {
        logger.warn(`[customerSignup] Invalid referral code provided: ${inputReferralCode}`);
      }
    }

    // 4. Create User
    const profileImage = req.file ? (req.file.filename.startsWith('http') ? req.file.filename : `/uploads/profiles/${req.file.filename}`) : undefined;

    const user = await User.create({
      zeebacId,
      name,
      phone,
      email,
      profileImage,
      referralCode: generatedReferralCode,
      referredBy
    });

    // 4.5 Create Referral Document if referred
    if (referrerDoc) {
      await Referral.create({
        referrerId: referrerDoc._id,
        referrerCode: inputReferralCode.trim().toUpperCase(),
        referrerName: referrerDoc.name,
        referredUserId: user._id,
        referredPhone: user.phone,
        status: 'Signed Up'
      });
      logger.info(`[customerSignup] Referral created for ${user.phone} by ${referrerDoc.phone}`);
    }

    // 5. Generate tokens
    const tokens = sendTokens(res, user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    logger.info(`[customerSignup] Success: User created with ID ${user._id}`);
    res.status(201).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        zeebacId: user.zeebacId,
        role: user.role,
        referralCode: user.referralCode
      }
    });

  } catch (error) {
    logger.error(`[customerSignup] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// 2. Vendor Registration — Step 1 of the onboarding wizard.
// Creates a minimal DRAFT Vendor doc (name/phone/email only) and issues tokens
// immediately so Steps 2-4 can be saved incrementally via authenticated
// /api/vendor/application/* endpoints. Replaces the old one-shot vendorSignup.
export const vendorRegister = async (req, res) => {
  try {
    const { phone, otp, name, email } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    // 1. Verify OTP
    await verifyOtpOnly(phone, otp, 'signup', 'vendor');

    // 2. One mobile number = one account
    const existingVendor = await Vendor.findOne({ phone });
    if (existingVendor) {
      logger.warn(`[vendorRegister] Failed: Vendor already exists for phone ${phone}`);
      return res.status(400).json({ success: false, message: 'Vendor account already exists. Please login.' });
    }

    // 3. Generate Zeebac ID
    const zeebacId = await generateZeebacId('ZBV', Vendor);

    // 4. Create the DRAFT application
    const vendor = await Vendor.create({
      zeebacId,
      ownerName: name.trim(),
      phone,
      email,
      applicationStatus: 'DRAFT',
    });

    // 5. Issue tokens so the wizard can continue as an authenticated vendor
    const tokens = sendTokens(res, vendor);
    vendor.refreshToken = tokens.refreshToken;
    await vendor.save();

    logger.info(`[vendorRegister] Success: Vendor account created with ID ${vendor._id}`);

    res.status(201).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      vendor: {
        _id: vendor._id,
        ownerName: vendor.ownerName,
        phone: vendor.phone,
        email: vendor.email,
        zeebacId: vendor.zeebacId,
        role: vendor.role,
        status: vendor.status,
        applicationStatus: vendor.applicationStatus,
      }
    });
  } catch (error) {
    logger.error(`[vendorRegister] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// 3. Business categories for the vendor onboarding dropdown — derived from
// existing vendors (any status, not just Verified, since a brand-new category
// should still surface once any vendor has used it) plus a small seed list so
// the dropdown isn't empty on a fresh database.
const SEED_CATEGORIES = [
  'Fashion & Apparel', 'Electronics', 'Groceries & Supermarkets', 'Restaurants & Cafes',
  'Health & Pharmacy', 'Home & Furniture', 'Beauty & Personal Care', 'Other'
];

export const getVendorCategories = async (req, res) => {
  try {
    const dbCategories = await Vendor.distinct('category', { category: { $ne: null } });
    const merged = Array.from(new Set([...SEED_CATEGORIES.filter(c => c !== 'Other'), ...dbCategories, 'Other']));
    res.status(200).json({ success: true, data: merged });
  } catch (error) {
    logger.error(`[getVendorCategories] Error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
