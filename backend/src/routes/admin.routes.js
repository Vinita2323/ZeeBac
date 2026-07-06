import express from 'express';
import {
  getDashboardStats,
  getAllVendors,
  getVendorById,
  approveVendor,
  rejectVendor,
  getAllUsers,
  suspendUser,
  unsuspendUser
} from '../controllers/admin.controller.js';
import { getReferralStats } from '../controllers/referral.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication and admin/super_admin role
router.use(protect);
router.use(requireRole('admin', 'super_admin'));

// ─── Dashboard ───
router.get('/dashboard/stats', getDashboardStats);

// ─── Vendor Management ───
router.get('/vendors', getAllVendors);
router.get('/vendors/:id', getVendorById);
router.patch('/vendors/:id/approve', approveVendor);
router.patch('/vendors/:id/reject', rejectVendor);

// ─── User Management ───
router.get('/users', getAllUsers);
router.patch('/users/:id/suspend', suspendUser);
router.patch('/users/:id/unsuspend', unsuspendUser);

// ─── Referrals (Phase 8) ───
router.get('/referrals/stats', getReferralStats);

export default router;
