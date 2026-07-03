import express from 'express';
import { getProfile, updateProfile, getDashboardStats } from '../controllers/vendor.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(protect);
router.use(requireRole('vendor'));

// Profile Routes
router.get('/me', getProfile);
router.put('/me', updateProfile);

// Dashboard Routes
router.get('/dashboard/stats', getDashboardStats);

export default router;
