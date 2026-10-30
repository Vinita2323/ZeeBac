import express from 'express';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import {
  deliveryRegister,
  deliveryLogin,
  getDeliveryStatus,
  resubmitApplication,
  getDeliveryProfile,
  updateDeliveryProfile,
  toggleAvailability,
  updateDeliveryLocation,
  getDeliveryOrders,
  acceptDeliveryOrder,
  rejectDeliveryOrder,
  updateDeliveryOrderStatus,
  getDeliveryHistory,
  getDeliveryEarnings,
} from '../controllers/delivery.controller.js';

const router = express.Router();

// Public auth endpoints
router.post('/register', deliveryRegister);
router.post('/login', deliveryLogin);

// Protected Delivery Partner endpoints
router.use(protect);
router.use(requireRole('delivery_partner', 'admin', 'super_admin'));

router.get('/status', getDeliveryStatus);
router.post('/resubmit', resubmitApplication);
router.get('/profile', getDeliveryProfile);
router.patch('/profile', updateDeliveryProfile);
router.patch('/availability', toggleAvailability);
router.patch('/location', updateDeliveryLocation);

router.get('/orders', getDeliveryOrders);
router.post('/orders/:id/accept', acceptDeliveryOrder);
router.post('/orders/:id/reject', rejectDeliveryOrder);
router.patch('/orders/:id/status', updateDeliveryOrderStatus);

router.get('/history', getDeliveryHistory);
router.get('/earnings', getDeliveryEarnings);

export default router;
