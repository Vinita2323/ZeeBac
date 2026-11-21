import express from 'express';
import {
  createPosBill,
  claimPosBill,
  getPosBillStatus,
  createPosBillIntent,
  payPosBillIntent,
  autoConfirmPosBillUtr,
} from '../controllers/pos.controller.js';
import { protect, authenticatePosOrVendor } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Authenticated POS / Vendor Trigger to generate POS Bill
router.post('/create-bill', authenticatePosOrVendor, createPosBill);

// Dynamic POS Bill Intent for In-Store Counter UPI & Zeebac App QR
router.post('/bill-intent', authenticatePosOrVendor, createPosBillIntent);
router.get('/bill-intent/:billCode/status', getPosBillStatus);

// Customer Auth Protected routes to pay or claim POS Bill
router.post('/pay-bill-intent', protect, payPosBillIntent);
router.post('/claim', protect, claimPosBill);

// Auto-Confirm via 12-digit UTR (GPay / PhonePe / Paytm)
router.post('/verify-intent-utr', protect, autoConfirmPosBillUtr);

// Public route to inspect POS Bill Status
router.get('/bill/:billCode', getPosBillStatus);

export default router;
