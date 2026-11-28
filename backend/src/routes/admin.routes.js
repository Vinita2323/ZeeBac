import { upload } from '../middlewares/multer.middleware.js';
import express from 'express';
import {
  getDashboardStats,
  getAdminSalesAnalytics,
  getAllVendors,
  getVendorById,
  approveVendor,
  rejectVendor,
  updateVendorRequestLimit,
  getAllUsers,
  getAdminUserById,
  suspendUser,
  blockUser,
  unsuspendUser,
  deleteUser,
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
  processPayout,
  refundTransaction,
  getAdminSubscriptionPlans,
  createAdminSubscriptionPlan,
  updateAdminSubscriptionPlan,
  deleteAdminSubscriptionPlan,
  adminActivateVendorSubscription,
  getAdminSubscriptionPayments,
} from '../controllers/admin.controller.js';
import { getReferralStats } from '../controllers/referral.controller.js';
import { getAdminLegalContent, updateAdminLegalContent } from '../controllers/platformContent.controller.js';
import { protect, requireRole } from '../middlewares/auth.middleware.js';

import {
  adminCreateTicket,
  getAllTickets,
  replyToTicket,
  closeTicket,
  getAllAdminFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  toggleFaqStatus,
  getSupportConfig,
  updateSupportConfig
} from '../controllers/support.controller.js';
import { saveAdminFcmToken } from '../controllers/notification.controller.js';
import {
  getAdminDeliveryStats,
  getAdminDeliveryPartners,
  getAdminDeliveryPartnerById,
  adminApproveDeliveryPartner,
  adminRejectDeliveryPartner,
  adminMarkUnderReview,
  adminSuspendDeliveryPartner,
  adminReactivateDeliveryPartner,
  adminGetLiveDeliveryOperations,
  adminAssignDeliveryOrder,
  adminCancelDeliveryAssignment,
  getAdminDeliveryPayoutConfig,
  updateAdminDeliveryPayoutConfig,
  adminSettleRiderCash,
  adminProcessRiderWithdrawal,
  adminVerifyRiderCashDeposit,
  adminGetRiderSettlementRequests,
  adminGetRiderCashLedgerSummary,
  adminGetRiderCashLedger,
  adminGetRiderEarningsSummary,
  adminGetRiderEarningsLedger,
} from '../controllers/delivery.controller.js';

import {
  adminGetSettlementSummary,
  adminGetSellerLedger,
  adminGetOrderFinancials,
  adminGetOrderFinancialDetail,
  adminGetCodPending,
  adminConfirmCodCollection,
  adminRecordPayout,
  adminRecordAdjustment,
  adminListPayoutRequests,
  adminRejectPayoutRequest,
  adminRefundOrder,
  adminReverseOrderUsage,
  adminListTopupRequests,
  adminApproveTopup,
  adminRejectTopup,
  adminGetVendorCoinOverview,
  adminGetVendorCoinTransactions,
  adminGetVendorOrderUsage,
  adminGetReconciliation,
  adminGetAuditLogs,
  adminGetPricingConfig,
  adminUpdatePricingConfig,
} from '../controllers/settlement.controller.js';

import { getAdminProfile, updateAdminProfile, changeAdminPassword } from '../controllers/adminProfile.controller.js';
import { adminListRiderUpdates, adminCreateRiderUpdate, adminUpdateRiderUpdate, adminDeleteRiderUpdate, adminListDeliveryZones, adminPushRiderUpdate } from '../controllers/riderUpdates.controller.js';
import { lookupRecipient, getBroadcastFilterOptions, previewBroadcast, createBroadcast, listBroadcasts, cancelBroadcast } from '../controllers/adminBroadcast.controller.js';
const router = express.Router();

// All routes require authentication and admin/super_admin role
router.use(protect);
router.use(requireRole('admin', 'super_admin'));

// ─── Dashboard ───
router.get('/dashboard/stats', getDashboardStats);
router.get('/sales-analytics', getAdminSalesAnalytics);
router.get('/dashboard/sales-analytics', getAdminSalesAnalytics);

// ─── FCM Token ───
router.post('/fcm-token', saveAdminFcmToken);

// ─── Support Tickets & Configuration ───
router.get('/support/tickets', getAllTickets);
router.post('/support/tickets', adminCreateTicket);
router.put('/support/tickets/:id/reply', replyToTicket);
router.put('/support/tickets/:id/close', closeTicket);
router.get('/support/config', getSupportConfig);
router.put('/support/config', updateSupportConfig);

// ─── FAQ Management ───
router.get('/faqs', getAllAdminFaqs);
router.post('/faqs', createFaq);
router.put('/faqs/:id', updateFaq);
router.delete('/faqs/:id', deleteFaq);
router.patch('/faqs/:id/toggle', toggleFaqStatus);

// ─── Vendor Management ───
router.get('/vendors', getAllVendors);
router.get('/vendors/:id', getVendorById);
router.patch('/vendors/:id/approve', approveVendor);
router.patch('/vendors/:id/reject', rejectVendor);
router.patch('/vendors/:id/request-limit', updateVendorRequestLimit);

// ─── User Management ───
router.get('/users', getAllUsers);
router.get('/users/:id', getAdminUserById);
router.patch('/users/:id/suspend', suspendUser);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/unsuspend', unsuspendUser);
router.delete('/users/:id', deleteUser);

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
router.post('/transactions/:id/refund', refundTransaction);

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

// ─── Subscription Plans (Admin) ───
router.route('/subscription-plans')
  .get(getAdminSubscriptionPlans)
  .post(createAdminSubscriptionPlan);

router.route('/subscription-plans/:id')
  .put(updateAdminSubscriptionPlan)
  .delete(deleteAdminSubscriptionPlan);

router.post('/vendors/:vendorId/activate-subscription', adminActivateVendorSubscription);
router.get('/subscription-payments', getAdminSubscriptionPayments);

// ─── Legal & Policy CMS ───
router.route('/content/legal')
  .get(getAdminLegalContent)
  .put(updateAdminLegalContent);


// ─── Delivery Partner Management & Live Operations ───
router.get('/delivery/stats', getAdminDeliveryStats);
router.get('/delivery/partners', getAdminDeliveryPartners);
router.get('/delivery/partners/:id', getAdminDeliveryPartnerById);
router.post('/delivery/partners/:id/approve', adminApproveDeliveryPartner);
router.post('/delivery/partners/:id/reject', adminRejectDeliveryPartner);
router.post('/delivery/partners/:id/under-review', adminMarkUnderReview);
router.post('/delivery/partners/:id/suspend', adminSuspendDeliveryPartner);
router.post('/delivery/partners/:id/reactivate', adminReactivateDeliveryPartner);
router.get('/delivery/settlement-requests', adminGetRiderSettlementRequests);
router.get('/delivery/cash-ledger', adminGetRiderCashLedgerSummary);
router.get('/delivery/cash-ledger/:id', adminGetRiderCashLedger);
router.get('/delivery/earnings', adminGetRiderEarningsSummary);
router.get('/delivery/earnings/:id', adminGetRiderEarningsLedger);
router.post('/delivery/partners/:id/settle-cash', adminSettleRiderCash);
router.post('/delivery/partners/:id/withdrawals/:requestId/process', adminProcessRiderWithdrawal);
router.post('/delivery/partners/:id/cash-deposits/:depositId/verify', adminVerifyRiderCashDeposit);

router.get('/delivery/operations/live', adminGetLiveDeliveryOperations);
router.post('/delivery/operations/assign', adminAssignDeliveryOrder);
router.post('/delivery/operations/cancel-assignment', adminCancelDeliveryAssignment);

// Rider Updates page content (announcements / stories / training videos)
router.get('/delivery/updates', adminListRiderUpdates);
router.get('/delivery/zones', adminListDeliveryZones);
router.post('/delivery/updates', upload.single('storyMedia'), adminCreateRiderUpdate);
router.put('/delivery/updates/:id', upload.single('storyMedia'), adminUpdateRiderUpdate);
router.delete('/delivery/updates/:id', adminDeleteRiderUpdate);
router.post('/delivery/updates/:id/push', adminPushRiderUpdate);

// ─── Send notifications to customers / vendors / delivery partners ───
router.get('/broadcasts', listBroadcasts);
router.get('/broadcasts/lookup', lookupRecipient);
router.get('/broadcasts/filters', getBroadcastFilterOptions);
router.post('/broadcasts/preview', previewBroadcast);
router.post('/broadcasts', createBroadcast);
router.post('/broadcasts/:id/cancel', cancelBroadcast);

// Dynamic Payout Configuration
router.get('/delivery/payout-config', getAdminDeliveryPayoutConfig);
router.put('/delivery/payout-config', updateAdminDeliveryPayoutConfig);

// ─── Centralized Payment Collection & Seller Settlements ───
router.get('/settlements/summary', adminGetSettlementSummary);
router.get('/settlements/config', adminGetPricingConfig);
router.put('/settlements/config', adminUpdatePricingConfig);
router.get('/settlements/reconciliation', adminGetReconciliation);
router.get('/settlements/audit-logs', adminGetAuditLogs);
router.get('/settlements/orders', adminGetOrderFinancials);
router.get('/settlements/orders/:orderId', adminGetOrderFinancialDetail);
router.post('/settlements/orders/:orderId/refund', adminRefundOrder);
router.post('/settlements/orders/:orderId/reverse-usage', adminReverseOrderUsage);

// ─── Zeebac Coins ───
router.get('/coins/topups', adminListTopupRequests);
router.post('/coins/topups/:id/approve', adminApproveTopup);
router.post('/coins/topups/:id/reject', adminRejectTopup);
router.get('/coins/vendors', adminGetVendorCoinOverview);
router.get('/coins/vendors/:vendorId/transactions', adminGetVendorCoinTransactions);
router.get('/settlements/vendors/:vendorId/order-usage', adminGetVendorOrderUsage);
router.get('/settlements/cod-pending', adminGetCodPending);
router.post('/settlements/cod/confirm', adminConfirmCodCollection);
router.get('/settlements/payout-requests', adminListPayoutRequests);
router.post('/settlements/payout-requests/:id/reject', adminRejectPayoutRequest);
router.get('/settlements/vendors/:vendorId/ledger', adminGetSellerLedger);
router.post('/settlements/vendors/:vendorId/payout', adminRecordPayout);
router.post('/settlements/vendors/:vendorId/adjustment', adminRecordAdjustment);

// ─── Logged-in admin's own profile & credentials ───
router.get('/me', getAdminProfile);
router.put('/me', updateAdminProfile);
router.put('/me/password', changeAdminPassword);

export default router;
