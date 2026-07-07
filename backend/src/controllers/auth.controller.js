import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OtpVerification from '../models/OtpVerification.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import AdminUser from '../models/AdminUser.js';
import { sendTokens, generateAccessToken } from '../utils/token.utils.js';
import logger from '../utils/logger.js';

// 1. Send OTP
export const sendOtp = async (req, res) => {
  try {
    const { phone, purpose = 'login', role = 'customer' } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    // Generate random 4-digit OTP
    /*const otp = Math.floor(1000 + Math.random() * 9000).toString();
    logger.info(`[DEV OTP] for ${phone} (${role}): ${otp}`);*/
    const otp = "1234";

    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);

    // Delete existing OTPs for this phone+purpose+role to avoid conflicts
    await OtpVerification.deleteMany({ phone, purpose, role });

    await OtpVerification.create({
      phone,
      otpHash,
      purpose,
      role
    });

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    logger.error(`[sendOtp] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Internal helper to verify OTP
export const verifyOtpOnly = async (phone, otp, purpose, role) => {
  const otpRecord = await OtpVerification.findOne({ phone, purpose, role });
  if (!otpRecord) throw new Error('OTP expired or invalid');
  if (otpRecord.attempts >= 3) throw new Error('Too many attempts. Request a new OTP.');

  const isMatch = await bcrypt.compare(otp, otpRecord.otpHash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new Error('Invalid OTP');
  }

  otpRecord.isVerified = true;
  await otpRecord.save();
  return true;
};

// 2. Customer Login
export const customerLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    await verifyOtpOnly(phone, otp, 'login', 'customer');

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found. Please sign up.' });
    }
    if (user.status === 'Suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended' });
    }

    const tokens = sendTokens(res, user);

    // Save refresh token to DB
    user.refreshToken = tokens.refreshToken;
    await user.save();

    logger.info(`[customerLogin] Success for phone: ${phone}`);
    res.status(200).json({
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
    logger.error(`[customerLogin] Error for phone ${req.body.phone}: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// 3. Vendor Login
export const vendorLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    await verifyOtpOnly(phone, otp, 'login', 'vendor');

    const vendor = await Vendor.findOne({ phone });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor account not found. Please register.' });
    }
    if (vendor.status === 'Pending') {
      return res.status(403).json({ success: false, message: 'Your application is pending KYC approval.' });
    }
    if (vendor.status === 'Rejected' || vendor.status === 'Suspended') {
      return res.status(403).json({ success: false, message: `Account ${vendor.status.toLowerCase()}` });
    }

    const tokens = sendTokens(res, vendor);

    vendor.refreshToken = tokens.refreshToken;
    await vendor.save();

    logger.info(`[vendorLogin] Success for phone: ${phone}`);
    res.status(200).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      vendor: {
        _id: vendor._id,
        storeName: vendor.storeName,
        phone: vendor.phone,
        zeebacId: vendor.zeebacId,
        role: vendor.role
      }
    });
  } catch (error) {
    logger.error(`[vendorLogin] Error for phone ${req.body.phone}: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// 4. Admin Login (Email + Password)
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const admin = await AdminUser.findOne({ email });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found.' });
    }
    if (!admin.isActive) {
      return res.status(403).json({ success: false, message: 'Admin account is deactivated.' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const tokens = sendTokens(res, admin);

    admin.refreshToken = tokens.refreshToken;
    admin.lastLoginAt = new Date();
    await admin.save();

    logger.info(`[adminLogin] Success for email: ${email}`);
    res.status(200).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      admin: {
        _id: admin._id,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions
      }
    });
  } catch (error) {
    logger.error(`[adminLogin] Error for email ${req.body.email}: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// 5. Refresh Token
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token provided' });

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if user still exists and token matches
    let account = await User.findById(decoded.id);
    if (!account) account = await Vendor.findById(decoded.id);
    if (!account) account = await AdminUser.findById(decoded.id);

    if (!account || account.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Issue new access token
    const payload = { id: account._id, role: account.role, zeebacId: account.zeebacId };
    const newAccessToken = generateAccessToken(payload);

    logger.info(`[refreshAccessToken] Token refreshed for ID: ${account._id}`);
    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    logger.warn(`[refreshAccessToken] Failed: ${error.message}`);
    res.status(403).json({ message: 'Refresh token expired or invalid' });
  }
};

// 6. Logout
export const logout = async (req, res) => {
  try {
    if (req.user) {
      const { id, role } = req.user;
      let account;
      if (role === 'customer') account = await User.findById(id);
      else if (role === 'vendor') account = await Vendor.findById(id);
      else if (role === 'admin' || role === 'super_admin') account = await AdminUser.findById(id);

      if (account) {
        account.refreshToken = null;
        await account.save();
      }
      logger.info(`[logout] Success for ID: ${id}`);
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`[logout] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Get Me
export const getMe = async (req, res) => {
  try {
    const { id, role } = req.user;
    let data;

    if (role === 'customer') {
      data = await User.findById(id).select('-refreshToken');
    } else if (role === 'vendor') {
      data = await Vendor.findById(id).select('-refreshToken');
    } else if (role === 'admin' || role === 'super_admin') {
      data = await AdminUser.findById(id).select('-refreshToken');
    }

    if (!data) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`[getMe] Error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
