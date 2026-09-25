import express from 'express';
import { 
  getUserProfile, 
  updateUserLocation, 
  sendUserBankOtp,
  updateLinkedAccount,
  lookupVendorById, 
  createCustomerTransaction,
  createRazorpayOrder,
  verifyRazorpayAndCreateTransaction,
  searchVendors,
  getCategories,
  getVendorsByCategory,
  toggleFavoriteVendor,
  getFavoriteVendors,
  getMyWallet,
  getMyTransactions,
  updateUserProfile,
  createCashbackRequest,
  getMyCashbackRequests,
  getCashbackRequestById,
  verifyCashbackRequestCode,
  getVendorProducts,
  getNearbyVendors,
  getRecentVendors,
  requestWithdrawal,
  getUserWithdrawals,
  getRewardData,
  claimScratchCard,
  processWalletPayment,
  getMyQrToken,
  claimUpiCashbackByUtr,
  setupSecurityPin,
  toggleBiometricSecurity,
  verifySecurityPin
} from '../controllers/user.controller.js';
import { saveUserFcmToken } from '../controllers/notification.controller.js';
import { getVendorMedia, getVendorPromotions } from '../controllers/storefront.controller.js';
import { getVendorReviews, createReview, deleteReview } from '../controllers/review.controller.js';
import { getMyReferrals } from '../controllers/referral.controller.js';
import { getRechargePlans, processMobileRecharge, getMyRecharges } from '../controllers/recharge.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import { otpLimiter } from '../middlewares/rateLimit.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

// All customer routes require login + customer role
router.use(protect);
router.use(requireRole('customer'));

// Profile & Bank Linking
router.get('/me', getUserProfile);
router.post('/bank-account/send-otp', otpLimiter, sendUserBankOtp);
router.put('/me/linked-account', updateLinkedAccount);

// Mobile Recharge (Wallet Balance)
router.get('/recharge/plans', getRechargePlans);
router.post('/recharge/process', processMobileRecharge);
router.get('/recharge/history', getMyRecharges);

// Location
router.put('/location', updateUserLocation);

// Vendors & Discovery (Phase 4C + 4E)
router.get('/vendors/nearby', getNearbyVendors);
router.get('/recent-vendors', getRecentVendors);
router.get('/vendors/search', searchVendors);
router.get('/vendors/categories', getCategories);
router.get('/vendors/category/:name', getVendorsByCategory);
router.post('/favorites/:vendorId', toggleFavoriteVendor);
router.get('/favorites', getFavoriteVendors);
router.get('/vendors/:vendorId/products', getVendorProducts);

// Reviews (Phase 7)
router.get('/vendors/:vendorId/reviews', getVendorReviews);
router.post('/vendors/:vendorId/reviews', createReview);
router.delete('/vendors/:vendorId/reviews', deleteReview);

// Profile (Phase 4E)
router.put('/me', updateUserProfile);

router.get('/vendors/:vendorId/media', getVendorMedia);
router.get('/vendors/:vendorId/promotions', getVendorPromotions);
// Vendor Lookup (for QR Scan / Manual Search)
router.get('/vendors/:query', lookupVendorById);

// Customer Transaction (Core Payment Engine - For Cash)
router.post('/transactions', createCustomerTransaction);

// Wallet & Passbook (Phase 4D)
router.get('/wallet', getMyWallet);
router.get('/transactions', getMyTransactions);
router.post('/wallet/withdraw', requestWithdrawal);
router.get('/wallet/withdrawals', getUserWithdrawals);

// Biometric & PIN Security
router.post('/security/setup-pin', setupSecurityPin);
router.post('/security/toggle-biometric', toggleBiometricSecurity);
router.post('/security/verify-pin', verifySecurityPin);

// Razorpay Flow (For UPI/Cards)
router.post('/transactions/razorpay/order', createRazorpayOrder);
router.post('/transactions/razorpay/verify', verifyRazorpayAndCreateTransaction);

// Claim Cashback via 12-digit UPI Reference ID / UTR (GPay Backup)
router.post('/transactions/claim-upi-utr', claimUpiCashbackByUtr);

// Wallet Payment (Phase 9)
router.post('/pay-via-wallet', processWalletPayment);

// Cashback Requests (Phase 4E)
router.post('/cashback-requests', upload.single('billImg'), createCashbackRequest);
router.get('/cashback-requests', getMyCashbackRequests);
router.get('/cashback-requests/:id', getCashbackRequestById);
router.post('/cashback-requests/:id/verify-code', verifyCashbackRequestCode);

// Referrals (Phase 8)
router.get('/referrals', getMyReferrals);

// Rewards & Offers
router.get('/rewards-data', getRewardData);
router.post('/rewards/scratch', claimScratchCard);

// QR Code (Phase 3 — signed, short-lived, scanned by a vendor at checkout)
router.get('/qr-token', getMyQrToken);

// FCM Token (Push Notifications)
router.post('/fcm-token', saveUserFcmToken);

export default router;
