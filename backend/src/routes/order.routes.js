import express from 'express';
import {
  createOrder,
  verifyOrderUpiPayment,
  assignRider,
  updateOrderStatus,
  getMyCustomerOrders,
  getOrderById,
  getVendorOrders,
  createVendorCashbackReserveUpiIntent,
  claimVendorCashbackReserveUpi,
} from '../controllers/order.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ── Customer Order Routes ──
router.post('/', protect, requireRole('customer'), createOrder);
router.get('/my-orders', protect, requireRole('customer'), getMyCustomerOrders);
router.post('/:orderId/verify-upi', protect, verifyOrderUpiPayment);
router.get('/:id', protect, getOrderById);

// ── Vendor Order & Delivery Management Routes ──
router.get('/vendor/list', protect, requireRole('vendor'), getVendorOrders);
router.patch('/:orderId/assign-rider', protect, requireRole('vendor'), assignRider);
router.patch('/:orderId/status', protect, updateOrderStatus);

// ── Merchant Prepaid Cashback Reserve Pool Routes ──
router.post('/vendor/cashback-reserve/upi-intent', protect, requireRole('vendor'), createVendorCashbackReserveUpiIntent);
router.post('/vendor/cashback-reserve/claim-upi', protect, requireRole('vendor'), claimVendorCashbackReserveUpi);

export default router;
