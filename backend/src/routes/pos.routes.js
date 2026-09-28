import express from 'express';
import { createPosBill, claimPosBill, getPosBillStatus } from '../controllers/pos.controller.js';
import { protect, authenticatePosOrVendor } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Authenticated POS / Vendor Trigger to generate POS Bill
router.post('/create-bill', authenticatePosOrVendor, createPosBill);

// Customer Auth Protected route to claim POS Bill code
router.post('/claim', protect, claimPosBill);

// Public route to inspect POS Bill Status
router.get('/bill/:billCode', getPosBillStatus);

export default router;
