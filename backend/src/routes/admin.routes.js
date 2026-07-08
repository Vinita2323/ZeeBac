import express from 'express';
import {
  getDashboardStats,
  getAllVendors,
  getVendorById,
  approveVendor,
  rejectVendor,
  getAllUsers,
  suspendUser,
  unsuspendUser,
  getCashbackRules,
  createCashbackRule,
  updateCashbackRule,
  deleteCashbackRule,
  getAllTransactions,
  getRevenueAnalytics,
  getUserAnalytics,
  getTopVendors,
  getVendorCategoryBreakdown,
  getWalletStats,
  getAllWalletTransactions,
  getFraudAlerts
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

// ─── Cashback Rules (Phase A) ───
router.route('/cashback-rules')
  .get(getCashbackRules)
  .post(createCashbackRule);

router.route('/cashback-rules/:id')
  .put(updateCashbackRule)
  .delete(deleteCashbackRule);

// ─── Transactions (Phase B) ───
router.get('/transactions', getAllTransactions);

// ─── Analytics (Phase C) ───
router.get('/analytics/revenue',       getRevenueAnalytics);
router.get('/analytics/users',         getUserAnalytics);
router.get('/analytics/top-vendors',   getTopVendors);
router.get('/analytics/categories',    getVendorCategoryBreakdown);

// ─── Wallet Monitor (Phase E) ───
router.get('/wallet/stats',            getWalletStats);
router.get('/wallet/transactions',     getAllWalletTransactions);

// ─── Fraud Detection (Phase F) ───
router.get('/fraud/alerts',            getFraudAlerts);

export default router;
