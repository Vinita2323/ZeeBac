import express from 'express';
import { 
  getProfile, 
  updateProfile, 
  getDashboardStats,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  lookupCustomerByPhone,
  logPurchase,
  getVendorTransactions,
  getVendorWallet,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getVendorCustomers,
  requestWithdrawal,
  getPendingRequests,
  respondToCashbackRequest
} from '../controllers/vendor.controller.js';
import { getVendorReviews, replyToReview } from '../controllers/review.controller.js';
import { getMyMedia, uploadMedia, deleteMedia, getMyPromotions, createPromotion, togglePromotion, deletePromotion } from '../controllers/storefront.controller.js';
import { saveVendorFcmToken } from '../controllers/notification.controller.js';
import { createTicket, getUserTickets } from '../controllers/support.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(protect);
router.use(requireRole('vendor'));

// Profile Routes
router.get('/me', getProfile);
router.put('/me', updateProfile);

// Dashboard Routes
router.get('/dashboard/stats', getDashboardStats);

// Product Routes (Phase 3B)
router.route('/products')
  .get(getProducts)
  .post(
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'brandLogo', maxCount: 1 }
    ]), 
    createProduct
  );

router.route('/products/:id')
  .put(
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'brandLogo', maxCount: 1 }
    ]), 
    updateProduct
  )
  .delete(deleteProduct);

// Transaction & Wallet Routes (Phase 3C & 3D)
router.get('/customers/list', getVendorCustomers);
router.get('/customers/:phone', lookupCustomerByPhone);
router.post('/transactions/log', logPurchase);
router.get('/transactions', getVendorTransactions);
router.get('/wallet', getVendorWallet);
router.post('/wallet/create-order', createRazorpayOrder);
router.post('/wallet/verify-payment', verifyRazorpayPayment);
router.post('/wallet/withdraw', requestWithdrawal);

// Cashback Requests (Phase 4 Approvals)
router.get('/requests/pending', getPendingRequests);
router.post('/requests/:id/respond', respondToCashbackRequest);

// Reviews (Phase 7)
router.get('/reviews', getVendorReviews);
router.post('/reviews/:id/reply', replyToReview);

// Storefront Media (Phase 9B)
router.route('/media')
  .get(getMyMedia)
  .post(upload.single('mediaFile'), uploadMedia);
router.delete('/media/:id', deleteMedia);

// Storefront Promotions (Phase 9B)
router.route('/promotions')
  .get(getMyPromotions)
  .post(createPromotion);
router.route('/promotions/:id')
  .put(togglePromotion)
  .delete(deletePromotion);

// Support (Phase H)
router.post('/support', createTicket);
router.get('/support', getUserTickets);

// FCM Token (Push Notifications)
router.post('/fcm-token', saveVendorFcmToken);

export default router;
