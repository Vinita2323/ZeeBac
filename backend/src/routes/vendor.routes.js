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
  getVendorQrToken,
  logPurchase,
  getVendorTransactions,
  getVendorWallet,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getVendorCustomers,
  requestWithdrawal,
  getPendingRequests,
  respondToCashbackRequest,
  saveApplicationDraft,
  submitApplication,
  resubmitApplication,
  UPLOAD_FIELDS as APPLICATION_UPLOAD_FIELDS,
} from '../controllers/vendor.controller.js';
import { getVendorReviews, replyToReview } from '../controllers/review.controller.js';
import { getMyMedia, uploadMedia, deleteMedia, getMyPromotions, createPromotion, togglePromotion, deletePromotion } from '../controllers/storefront.controller.js';
import { saveVendorFcmToken } from '../controllers/notification.controller.js';
import { createTicket, getUserTickets } from '../controllers/support.controller.js';
import { protect, requireRole, requireApprovedVendor } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(protect);
router.use(requireRole('vendor'));

// Profile Routes — open regardless of approval status
router.get('/me', getProfile);
router.put('/me', updateProfile);

// Vendor Onboarding — open regardless of approval status (this IS the approval flow)
router.patch('/application/draft', upload.fields(APPLICATION_UPLOAD_FIELDS), saveApplicationDraft);
router.post('/application/submit', upload.fields(APPLICATION_UPLOAD_FIELDS), submitApplication);
router.post('/application/resubmit', upload.fields(APPLICATION_UPLOAD_FIELDS), resubmitApplication);

// Everything below requires an Approved (status: Verified) vendor account.

// Dashboard Routes
router.get('/dashboard/stats', requireApprovedVendor, getDashboardStats);

// Product Routes (Phase 3B)
router.route('/products')
  .get(requireApprovedVendor, getProducts)
  .post(
    requireApprovedVendor,
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'brandLogo', maxCount: 1 }
    ]),
    createProduct
  );

router.route('/products/:id')
  .put(
    requireApprovedVendor,
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'brandLogo', maxCount: 1 }
    ]),
    updateProduct
  )
  .delete(requireApprovedVendor, deleteProduct);

// Transaction & Wallet Routes (Phase 3C & 3D)
router.get('/customers/list', requireApprovedVendor, getVendorCustomers);
router.get('/qr-token', requireApprovedVendor, getVendorQrToken);
router.get('/customers/:phone', requireApprovedVendor, lookupCustomerByPhone);
router.post('/transactions/log', requireApprovedVendor, logPurchase);
router.get('/transactions', requireApprovedVendor, getVendorTransactions);
router.get('/wallet', requireApprovedVendor, getVendorWallet);
router.post('/wallet/create-order', requireApprovedVendor, createRazorpayOrder);
router.post('/wallet/verify-payment', requireApprovedVendor, verifyRazorpayPayment);
router.post('/wallet/withdraw', requireApprovedVendor, requestWithdrawal);

// Cashback Requests (Phase 4 Approvals)
router.get('/requests/pending', requireApprovedVendor, getPendingRequests);
router.post('/requests/:id/respond', requireApprovedVendor, respondToCashbackRequest);

// Reviews (Phase 7)
router.get('/reviews', requireApprovedVendor, getVendorReviews);
router.post('/reviews/:id/reply', requireApprovedVendor, replyToReview);

// Storefront Media (Phase 9B)
router.route('/media')
  .get(requireApprovedVendor, getMyMedia)
  .post(requireApprovedVendor, upload.single('mediaFile'), uploadMedia);
router.delete('/media/:id', requireApprovedVendor, deleteMedia);

// Storefront Promotions (Phase 9B)
router.route('/promotions')
  .get(requireApprovedVendor, getMyPromotions)
  .post(requireApprovedVendor, createPromotion);
router.route('/promotions/:id')
  .put(requireApprovedVendor, togglePromotion)
  .delete(requireApprovedVendor, deletePromotion);

// Support — open regardless of approval status (vendor may need help during onboarding)
router.post('/support', createTicket);
router.get('/support', getUserTickets);

// FCM Token — open regardless of approval status (needed to receive the approval push)
router.post('/fcm-token', saveVendorFcmToken);

export default router;
