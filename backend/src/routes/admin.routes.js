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
  getFraudAlerts,
  getPeakActivityHours,
  getRewardConfig,
  updateRewardConfig,
  getPartnerOffers,
  createPartnerOffer,
  updatePartnerOffer,
  deletePartnerOffer,
  getPendingPayouts,
  processPayout
} from '../controllers/admin.controller.js';
import { getReferralStats } from '../controllers/referral.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

import { getAllTickets, replyToTicket, closeTicket } from '../controllers/support.controller.js';
import { saveAdminFcmToken } from '../controllers/notification.controller.js';

const router = express.Router();

// All routes require authentication and admin/super_admin role
router.use(protect);
router.use(requireRole('admin', 'super_admin'));

// ─── Dashboard ───
router.get('/dashboard/stats', getDashboardStats);

// ─── FCM Token ───
router.post('/fcm-token', saveAdminFcmToken);

// ─── Support Tickets ───
router.get('/support/tickets', getAllTickets);
router.put('/support/tickets/:id/reply', replyToTicket);
router.put('/support/tickets/:id/close', closeTicket);

// ─── Vendor Management ───
router.get('/vendors', getAllVendors);
router.get('/vendors/:id', getVendorById);
router.patch('/vendors/:id/approve', approveVendor);
router.patch('/vendors/:id/reject', rejectVendor);

// ─── User Management ───
router.get('/users', getAllUsers);
router.patch('/users/:id/suspend', suspendUser);
router.patch('/users/:id/unsuspend', unsuspendUser);

// ─── Payouts & Withdrawals ───
router.get('/payouts/pending', getPendingPayouts);
router.post('/payouts/:id/process', processPayout);

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

// ─── Peak Activity Heatmap ───
router.get('/analytics/peak-hours', getPeakActivityHours);

// ─── Rewards Config & Offers ───
router.route('/rewards/config')
  .get(getRewardConfig)
  .put(updateRewardConfig);

router.route('/rewards/offers')
  .get(getPartnerOffers)
  .post(createPartnerOffer);

router.route('/rewards/offers/:id')
  .put(updatePartnerOffer)
  .delete(deletePartnerOffer);

export default router;
