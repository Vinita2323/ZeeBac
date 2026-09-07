import express from 'express';
import { sendOtp, customerLogin, vendorLogin, adminLogin, refreshAccessToken, logout, getMe } from '../controllers/auth.controller.js';
import { customerSignup, vendorRegister, getVendorCategories } from '../controllers/signup.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';
import { otpLimiter, loginLimiter, adminLoginLimiter } from '../middlewares/rateLimit.middleware.js';

const router = express.Router();

// --- PUBLIC ROUTES ---

// OTP
router.post('/send-otp', otpLimiter, sendOtp);

// Logins
router.post('/customer/login', loginLimiter, customerLogin);
router.post('/vendor/login', loginLimiter, vendorLogin);
router.post('/admin/login', adminLoginLimiter, adminLogin);

// Signups
router.post('/customer/signup', upload.single('profilePic'), customerSignup);

// Vendor onboarding — Step 1 (account creation). Steps 2-4 are authenticated
// endpoints under /api/vendor/application/* (see vendor.routes.js).
router.post('/vendor/register', vendorRegister);
router.get('/vendor/categories', getVendorCategories);

// Tokens
router.post('/refresh', refreshAccessToken);
router.post('/logout', protect, logout);

// --- PROTECTED ROUTES ---
router.get('/me', protect, getMe);

export default router;
