import express from 'express';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import {
  deliveryLogin,
  getDeliveryProfile,
  updateDeliveryProfile,
  toggleAvailability,
  updateDeliveryLocation,
  getDeliveryOrders,
  acceptDeliveryOrder,
  updateDeliveryOrderStatus,
  getDeliveryHistory,
} from '../controllers/delivery.controller.js';

const router = express.Router();

// Public auth endpoint
router.post('/login', deliveryLogin);

// Protected Delivery Partner endpoints
router.use(protect);
router.use(requireRole('delivery_partner', 'admin', 'super_admin'));

router.get('/profile', getDeliveryProfile);
router.patch('/profile', updateDeliveryProfile);
router.patch('/availability', toggleAvailability);
router.patch('/location', updateDeliveryLocation);

router.get('/orders', getDeliveryOrders);
router.post('/orders/:id/accept', acceptDeliveryOrder);
router.patch('/orders/:id/status', updateDeliveryOrderStatus);

router.get('/history', getDeliveryHistory);

export default router;
