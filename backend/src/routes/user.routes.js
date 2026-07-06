import express from 'express';
import { 
  getUserProfile, 
  updateUserLocation, 
  lookupVendorById, 
  createCustomerTransaction,
  createRazorpayOrder,
  verifyRazorpayAndCreateTransaction,
  searchVendors,
  getVendorsByCategory,
  toggleFavoriteVendor,
  getFavoriteVendors,
  getMyWallet,
  getMyTransactions,
  updateUserProfile,
  createCashbackRequest,
  getMyCashbackRequests,
  getCashbackRequestById,
  getVendorProducts,
  getNearbyVendors,
  getRecentVendors
} from '../controllers/user.controller.js';
import { getVendorReviews, createReview, deleteReview } from '../controllers/review.controller.js';
import { getMyReferrals } from '../controllers/referral.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All customer routes require login + customer role
router.use(protect);
router.use(requireRole('customer'));

// Profile
router.get('/me', getUserProfile);

// Location
router.put('/location', updateUserLocation);

// Vendors & Discovery (Phase 4C + 4E)
router.get('/vendors/nearby', getNearbyVendors);
router.get('/recent-vendors', getRecentVendors);
router.get('/vendors/search', searchVendors);
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

// Vendor Lookup (for QR Scan / Manual Search)
router.get('/vendors/:query', lookupVendorById);

// Customer Transaction (Core Payment Engine - For Cash)
router.post('/transactions', createCustomerTransaction);

// Wallet & Passbook (Phase 4D)
router.get('/wallet', getMyWallet);
router.get('/transactions', getMyTransactions);

// Razorpay Flow (For UPI/Cards)
router.post('/transactions/razorpay/order', createRazorpayOrder);
router.post('/transactions/razorpay/verify', verifyRazorpayAndCreateTransaction);

// Cashback Requests (Phase 4E)
router.post('/cashback-requests', createCashbackRequest);
router.get('/cashback-requests', getMyCashbackRequests);
router.get('/cashback-requests/:id', getCashbackRequestById);

// Referrals (Phase 8)
router.get('/referrals', getMyReferrals);

export default router;
