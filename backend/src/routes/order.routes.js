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
  submitOrderFeedback,
  rateRiderByVendor,
  startOrderPicking,
  pickOrderItem,
  finishOrderPacking,
  generateStoreBill,
  confirmStoreBillPayment,
  verifyOrderRazorpayPayment,
  getOrderRazorpayCheckout,
} from '../controllers/order.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ── Customer Order Routes ──
router.post('/', protect, requireRole('customer'), createOrder);
router.get('/my-orders', protect, requireRole('customer'), getMyCustomerOrders);
router.post('/:orderId/feedback', protect, requireRole('customer'), submitOrderFeedback);
router.post('/:orderId/verify-upi', protect, verifyOrderUpiPayment);
router.get('/:orderId/razorpay/checkout', protect, requireRole('customer'), getOrderRazorpayCheckout);
router.post('/:orderId/razorpay/verify', protect, requireRole('customer'), verifyOrderRazorpayPayment);
router.get('/:id', protect, getOrderById);

// ── Vendor Order & Delivery Management Routes ──
router.get('/vendor/list', protect, requireRole('vendor'), getVendorOrders);
router.patch('/:orderId/assign-rider', protect, requireRole('vendor'), assignRider);
router.patch('/:orderId/status', protect, updateOrderStatus);
router.post('/:orderId/rate-rider', protect, requireRole('vendor'), rateRiderByVendor);

// ── Store Pickup: In-Store Billing (pay directly to seller UPI / cash) ──
router.post('/:orderId/store-bill', protect, requireRole('vendor'), generateStoreBill);
router.post('/:orderId/store-bill/confirm', protect, requireRole('vendor'), confirmStoreBillPayment);

// ── Dark Store WMS Picking & Packing Routes (Zepto / Blinkit Flow) ──
router.post('/:orderId/start-picking', protect, requireRole('vendor'), startOrderPicking);
router.post('/:orderId/pick-item', protect, requireRole('vendor'), pickOrderItem);
router.post('/:orderId/finish-packing', protect, requireRole('vendor'), finishOrderPacking);

// ── Merchant Prepaid Cashback Reserve Pool Routes ──
router.post('/vendor/cashback-reserve/upi-intent', protect, requireRole('vendor'), createVendorCashbackReserveUpiIntent);
router.post('/vendor/cashback-reserve/claim-upi', protect, requireRole('vendor'), claimVendorCashbackReserveUpi);

export default router;
