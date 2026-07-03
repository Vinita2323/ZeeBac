import express from 'express';
import { 
  getUserProfile, 
  updateUserLocation, 
  lookupVendorById, 
  createCustomerTransaction,
  createRazorpayOrder,
  verifyRazorpayAndCreateTransaction
} from '../controllers/user.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All customer routes require login + customer role
router.use(protect);
router.use(requireRole('customer'));

// Profile
router.get('/me', getUserProfile);

// Location
router.put('/location', updateUserLocation);

// Vendor Lookup (for QR Scan / Manual Search)
router.get('/vendors/:query', lookupVendorById);

// Customer Transaction (Core Payment Engine - For Cash)
router.post('/transactions', createCustomerTransaction);

// Razorpay Flow (For UPI/Cards)
router.post('/transactions/razorpay/order', createRazorpayOrder);
router.post('/transactions/razorpay/verify', verifyRazorpayAndCreateTransaction);

export default router;
