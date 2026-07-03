import express from 'express';
import { sendOtp, customerLogin, vendorLogin, adminLogin, refreshAccessToken, logout, getMe } from '../controllers/auth.controller.js';
import { customerSignup, vendorSignup } from '../controllers/signup.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

// --- PUBLIC ROUTES ---

// OTP
router.post('/send-otp', sendOtp);

// Logins
router.post('/customer/login', customerLogin);
router.post('/vendor/login', vendorLogin);
router.post('/admin/login', adminLogin);

// Signups
router.post('/customer/signup', upload.single('profilePic'), customerSignup);
router.post('/vendor/signup', upload.fields([
  { name: 'storeLogo', maxCount: 1 },
  { name: 'aadhaarPan', maxCount: 1 },
  { name: 'gstCertificate', maxCount: 1 },
  { name: 'shopLicense', maxCount: 1 },
  { name: 'cancelledCheque', maxCount: 1 }
]), vendorSignup);

// Tokens
router.post('/refresh', refreshAccessToken);
router.post('/logout', protect, logout);

// --- PROTECTED ROUTES ---
router.get('/me', protect, getMe);

export default router;
