import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import SellerLedger from '../models/SellerLedger.js';
import SellerPayoutRequest from '../models/SellerPayoutRequest.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import RewardConfig from '../models/RewardConfig.js';
import {
  getSellerBalance,
  recordSellerPayout,
  releaseCodCredits,
  reverseOrderCredit,
  runInTransaction,
  writeAudit,
  SettlementError,
} from '../utils/sellerSettlement.util.js';
import { initiateOrderRefund } from '../utils/orderPayment.util.js';
import { r2 } from '../utils/orderPricing.util.js';
import { sendNotification } from '../services/notification.service.js';
import logger from '../utils/logger.js';
import { notifyAdmins } from '../utils/adminNotification.js';

const sendError = (res, err, ctx) => {
  if (err instanceof SettlementError || err?.code) {
    const status = err.status || 400;
    if (status < 500) return res.status(status).json({ success: false, code: err.code, message: err.message });
  }
  logger.error(`[Settlement] ${ctx}: ${err.message || err?.error?.description}`);
  return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
};

const pageParams = (q) => {
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  return { limit, page, skip: (page - 1) * limit };
};

const dateRange = (q, field = 'createdAt') => {
  const r = {};
  if (q.from) r.$gte = new Date(q.from);
  if (q.to) {
    const t = new Date(q.to);
    t.setHours(23, 59, 59, 999);
    r.$lte = t;
  }
  return Object.keys(r).length ? { [field]: r } : {};
};

const findOrder = (id) => Order.findOne(mongoose.isValidObjectId(id) ? { $or: [{ _id: id }, { orderId: id }] } : { orderId: id });

// ═══════════════════════════ ADMIN ═══════════════════════════

// GET /admin/settlements/summary — seller-wise balances
export const adminGetSettlementSummary = async (req, res) => {
  try {
    const rows = await SellerLedger.aggregate([
      {
        $group: {
          _id: '$vendorId',
          available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, '$amount', 0] } },
          onHold: { $sum: { $cond: [{ $eq: ['$status', 'ON_HOLD'] }, '$amount', 0] } },
          totalCredited: { $sum: { $cond: [{ $eq: ['$type', 'ORDER_CREDIT'] }, '$amount', 0] } },
          totalPaidOut: { $sum: { $cond: [{ $in: ['$type', ['PAYOUT', 'PAYOUT_REVERSAL']] }, '$amount', 0] } },
          orders: { $sum: { $cond: [{ $eq: ['$type', 'ORDER_CREDIT'] }, 1, 0] } },
          lastActivity: { $max: '$createdAt' },
        },
      },
      { $sort: { available: -1 } },
    ]);
    const vendorIds = rows.map((r) => r._id);
    const [vendors, openReqs] = await Promise.all([
      Vendor.find({ _id: { $in: vendorIds } }).select('storeName zeebacId phone bankDetails.upiId bankDetails.bankName bankDetails.isVerified').lean(),
      SellerPayoutRequest.aggregate([
        { $match: { status: { $in: ['REQUESTED', 'PARTIALLY_PAID'] } } },
        { $group: { _id: '$vendorId', pending: { $sum: { $subtract: ['$requestedAmount', '$paidAmount'] } }, count: { $sum: 1 } } },
      ]),
    ]);
    const vmap = new Map(vendors.map((v) => [String(v._id), v]));
    const rmap = new Map(openReqs.map((r) => [String(r._id), r]));
    const sellers = rows.map((r) => {
      const v = vmap.get(String(r._id)) || {};
      const req_ = rmap.get(String(r._id));
      return {
        vendorId: r._id,
        storeName: v.storeName || 'Unknown store',
        zeebacId: v.zeebacId,
        phone: v.phone,
        bankLinked: Boolean(v.bankDetails?.bankName || v.bankDetails?.upiId),
        available: r2(r.available),
        onHold: r2(r.onHold),
        totalCredited: r2(r.totalCredited),
        totalPaidOut: r2(-r.totalPaidOut),
        pendingRequestAmount: r2(req_?.pending || 0),
        pendingRequests: req_?.count || 0,
        orders: r.orders,
        lastActivity: r.lastActivity,
      };
    });
    const totals = sellers.reduce(
      (t, s) => ({
        available: r2(t.available + s.available),
        onHold: r2(t.onHold + s.onHold),
        totalPaidOut: r2(t.totalPaidOut + s.totalPaidOut),
        pendingRequestAmount: r2(t.pendingRequestAmount + s.pendingRequestAmount),
      }),
      { available: 0, onHold: 0, totalPaidOut: 0, pendingRequestAmount: 0 }
    );
    res.json({ success: true, data: { totals, sellers } });
  } catch (err) {
    sendError(res, err, 'summary');
  }
};

// GET /admin/settlements/vendors/:vendorId/ledger
export const adminGetSellerLedger = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.isValidObjectId(vendorId)) return res.status(400).json({ success: false, message: 'Invalid vendor id' });
    const { limit, skip, page } = pageParams(req.query);
    const filter = { vendorId, ...dateRange(req.query) };
    if (req.query.type) filter.type = req.query.type;
    const [vendor, balance, entries, total] = await Promise.all([
      Vendor.findById(vendorId).select('storeName zeebacId phone bankDetails').lean(),
      getSellerBalance(vendorId),
      SellerLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SellerLedger.countDocuments(filter),
    ]);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const bank = vendor.bankDetails || {};
    res.json({
      success: true,
      data: {
        vendor: {
          _id: vendor._id,
          storeName: vendor.storeName,
          zeebacId: vendor.zeebacId,
          phone: vendor.phone,
          bank: {
            accountHolderName: bank.accountHolderName,
            bankName: bank.bankName,
            accountNumberMasked: bank.accountNumber ? `XXXX${String(bank.accountNumber).slice(-4)}` : null,
            ifscCode: bank.ifscCode,
            upiId: bank.upiId || vendor.upiId,
            isVerified: Boolean(bank.isVerified),
          },
        },
        balance,
        entries,
        pagination: { page, limit, total },
      },
    });
  } catch (err) {
    sendError(res, err, 'seller ledger');
  }
};

// GET /admin/settlements/orders — order-wise financials
export const adminGetOrderFinancials = async (req, res) => {
  try {
    const { limit, skip, page } = pageParams(req.query);
    const filter = { ...dateRange(req.query) };
    if (req.query.vendorId && mongoose.isValidObjectId(req.query.vendorId)) filter.vendorId = req.query.vendorId;
    if (req.query.settlementStatus) filter['financials.settlementStatus'] = req.query.settlementStatus;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
    if (req.query.search) filter.orderId = { $regex: String(req.query.search).replace(/[^A-Za-z0-9-]/g, ''), $options: 'i' };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'orderId storeName vendorId customerName fulfillmentType paymentMethod paymentStatus orderStatus itemTotal packagingCharge deliveryCharge platformFee taxAmount tipAmount pointsRedeemed finalPayableAmount razorpay.status razorpay.paymentId razorpay.fee razorpay.tax refundedAmount refunds financials createdAt riderDetails.deliveredAt'
        )
        .lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ success: true, data: { orders, pagination: { page, limit, total } } });
  } catch (err) {
    sendError(res, err, 'order financials');
  }
};

// GET /admin/settlements/orders/:orderId
export const adminGetOrderFinancialDetail = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const [ledger, audit] = await Promise.all([
      SellerLedger.find({ orderId: order._id }).sort({ createdAt: 1 }).lean(),
      AdminAuditLog.find({ entityType: 'Order', entityId: { $in: [String(order._id), order.orderId] } }).sort({ createdAt: -1 }).lean(),
    ]);
    const o = order.toObject();
    if (o.riderDetails) delete o.riderDetails.deliveryOtp;
    res.json({ success: true, data: { order: o, ledger, audit } });
  } catch (err) {
    sendError(res, err, 'order detail');
  }
};

// GET /admin/settlements/cod-pending — delivered COD orders whose seller credit is on hold
export const adminGetCodPending = async (req, res) => {
  try {
    const filter = { 'financials.settlementStatus': 'ON_HOLD' };
    if (req.query.vendorId && mongoose.isValidObjectId(req.query.vendorId)) filter.vendorId = req.query.vendorId;
    const orders = await Order.find(filter)
      .sort({ 'riderDetails.deliveredAt': 1 })
      .limit(500)
      .select('orderId storeName vendorId customerName finalPayableAmount financials.sellerPayable riderDetails.name riderDetails.riderId riderDetails.deliveredAt')
      .lean();
    const total = r2(orders.reduce((s, o) => s + Number(o.finalPayableAmount || 0), 0));
    res.json({ success: true, data: { orders, totalCashToCollect: total } });
  } catch (err) {
    sendError(res, err, 'cod pending');
  }
};

// POST /admin/settlements/cod/confirm { orderIds: [] }
export const adminConfirmCodCollection = async (req, res) => {
  try {
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String).slice(0, 500) : [];
    if (!orderIds.length) return res.status(400).json({ success: false, message: 'orderIds is required' });
    const result = await runInTransaction((session) => releaseCodCredits({ orderIds, adminId: req.user.id, session }));
    for (const r of result.released) {
      await writeAudit(req, { action: 'COD_COLLECTION_CONFIRMED', entityType: 'Order', entityId: r.orderId, vendorId: r.vendorId, amount: r.amount });
    }
    res.json({ success: true, message: `${result.released.length} order(s) released to seller balance`, data: result });
  } catch (err) {
    sendError(res, err, 'cod confirm');
  }
};

// POST /admin/settlements/vendors/:vendorId/payout { amount, method, utr, requestId?, note? }
export const adminRecordPayout = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.isValidObjectId(vendorId)) return res.status(400).json({ success: false, message: 'Invalid vendor id' });
    const { amount, method, utr, requestId, note } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
    const before = await getSellerBalance(vendorId);
    const result = await recordSellerPayout({
      vendorId,
      amount,
      method,
      utr,
      requestId,
      note,
      idempotencyKey,
      adminId: req.user.id,
      adminRole: req.user.role,
    });
    const after = await getSellerBalance(vendorId);
    if (!result.duplicate) {
      await writeAudit(req, {
        action: 'SELLER_PAYOUT_RECORDED',
        entityType: 'SellerLedger',
        entityId: result.entry._id,
        vendorId,
        amount: r2(-result.entry.amount),
        before,
        after,
        meta: { method, utr, requestId, note },
      });
      sendNotification({
        recipientId: vendorId,
        recipientType: 'vendor',
        type: 'credit',
        title: 'Settlement Paid 💰',
        message: `₹${r2(-result.entry.amount)} has been paid to you by ZeeBac${utr ? ` (Ref: ${utr})` : ''}.`,
        referenceId: result.entry._id,
        referenceType: 'SellerLedger',
      }).catch(() => {});
    }
    res.json({ success: true, message: result.duplicate ? 'Payout already recorded' : 'Payout recorded', data: { entry: result.entry, request: result.request, balance: after, duplicate: result.duplicate } });
  } catch (err) {
    sendError(res, err, 'payout');
  }
};

// POST /admin/settlements/vendors/:vendorId/adjustment { amount (+/-), note }
export const adminRecordAdjustment = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const amount = r2(req.body?.amount);
    const note = String(req.body?.note || '').trim();
    if (!mongoose.isValidObjectId(vendorId)) return res.status(400).json({ success: false, message: 'Invalid vendor id' });
    if (!amount) return res.status(400).json({ success: false, message: 'Non-zero amount is required' });
    if (note.length < 5) return res.status(400).json({ success: false, message: 'A reason (min 5 characters) is required for adjustments' });
    const key = req.headers['idempotency-key'] || req.body?.idempotencyKey || `${Date.now()}-${Math.random()}`;
    const before = await getSellerBalance(vendorId);
    let entry;
    try {
      entry = await SellerLedger.create({
        vendorId,
        type: 'ADJUSTMENT',
        amount,
        status: 'AVAILABLE',
        note,
        idempotencyKey: `ADJ:${key}`,
        createdBy: req.user.id,
        createdByRole: req.user.role,
      });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'This adjustment was already recorded' });
      throw e;
    }
    const after = await getSellerBalance(vendorId);
    await writeAudit(req, { action: 'SELLER_ADJUSTMENT', entityType: 'SellerLedger', entityId: entry._id, vendorId, amount, before, after, meta: { note } });
    res.json({ success: true, message: 'Adjustment recorded', data: { entry, balance: after } });
  } catch (err) {
    sendError(res, err, 'adjustment');
  }
};

// GET /admin/settlements/payout-requests?status=
export const adminListPayoutRequests = async (req, res) => {
  try {
    const { limit, skip, page } = pageParams(req.query);
    const filter = {};
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.vendorId && mongoose.isValidObjectId(req.query.vendorId)) filter.vendorId = req.query.vendorId;
    const [requests, total] = await Promise.all([
      SellerPayoutRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('vendorId', 'storeName zeebacId phone').lean(),
      SellerPayoutRequest.countDocuments(filter),
    ]);
    res.json({ success: true, data: { requests, pagination: { page, limit, total } } });
  } catch (err) {
    sendError(res, err, 'list requests');
  }
};

// POST /admin/settlements/payout-requests/:id/reject { reason }
export const adminRejectPayoutRequest = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    const request = await SellerPayoutRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'REQUESTED' },
      { $set: { status: 'REJECTED', adminNote: reason, resolvedAt: new Date(), resolvedBy: req.user.id } },
      { new: true }
    );
    if (!request) return res.status(400).json({ success: false, message: 'Only unpaid requests can be rejected' });
    await writeAudit(req, { action: 'PAYOUT_REQUEST_REJECTED', entityType: 'SellerPayoutRequest', entityId: request._id, vendorId: request.vendorId, amount: request.requestedAmount, meta: { reason } });
    sendNotification({
      recipientId: request.vendorId,
      recipientType: 'vendor',
      type: 'system',
      title: 'Withdrawal Request Rejected',
      message: `Your withdrawal request of ₹${request.requestedAmount} was rejected: ${reason}`,
      referenceId: request._id,
      referenceType: 'SellerPayoutRequest',
    }).catch(() => {});
    res.json({ success: true, message: 'Request rejected', data: { request } });
  } catch (err) {
    sendError(res, err, 'reject request');
  }
};

// POST /admin/settlements/orders/:orderId/refund { amount?, reason, sellerReversal? }
// Refunds the customer via Razorpay. If the seller was already credited, claws
// back `sellerReversal` (defaults to the refunded amount, capped at what was credited).
export const adminRefundOrder = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ success: false, message: 'Refund reason is required' });
    const amount = req.body?.amount != null && req.body.amount !== '' ? Number(req.body.amount) : undefined;

    const before = { refundedAmount: order.refundedAmount, settlementStatus: order.financials?.settlementStatus };
    const record = await initiateOrderRefund({ order, amount, reason, actorId: req.user.id });
    const sellerReversal = req.body?.sellerReversal != null && req.body.sellerReversal !== '' ? Number(req.body.sellerReversal) : record.amount;
    record.sellerReversal = r2(sellerReversal);
    order.refunds[order.refunds.length - 1].sellerReversal = record.sellerReversal;
    const reversal = await reverseOrderCredit({
      order,
      amount: sellerReversal,
      reason: `Refund ${record.refundId}: ${reason}`,
      idempotencyKey: `REVERSAL:${record.refundId}`,
      actorId: req.user.id,
    });
    await order.save();
    await writeAudit(req, {
      action: 'ORDER_REFUND_INITIATED',
      entityType: 'Order',
      entityId: order.orderId,
      vendorId: order.vendorId,
      amount: record.amount,
      before,
      after: { refundedAmount: order.refundedAmount, settlementStatus: order.financials?.settlementStatus },
      meta: { refundId: record.refundId, reason, sellerReversal: reversal ? r2(-reversal.amount) : 0 },
    });
    res.json({ success: true, message: `Refund of ₹${record.amount} initiated`, data: { refund: record, sellerReversal: reversal ? r2(-reversal.amount) : 0 } });
  } catch (err) {
    sendError(res, err, 'refund');
  }
};

// GET /admin/settlements/reconciliation?from&to
// Money in (Razorpay captured + COD) vs money out (refunds, seller payable, gateway fees).
export const adminGetReconciliation = async (req, res) => {
  try {
    const range = dateRange(req.query);
    const [online] = await Order.aggregate([
      { $match: { 'razorpay.status': 'CAPTURED', ...range } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          captured: { $sum: '$razorpay.amountPaid' },
          gatewayFee: { $sum: '$razorpay.fee' },
          gatewayGst: { $sum: '$razorpay.tax' },
          refunded: { $sum: '$refundedAmount' },
        },
      },
    ]);
    const [cod] = await Order.aggregate([
      { $match: { paymentMethod: 'CASH', fulfillmentType: 'delivery', orderStatus: 'DELIVERED', ...range } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          collected: { $sum: '$finalPayableAmount' },
          confirmed: { $sum: { $cond: [{ $ifNull: ['$financials.codConfirmedAt', false] }, '$finalPayableAmount', 0] } },
        },
      },
    ]);
    const [split] = await Order.aggregate([
      { $match: { 'financials.settlementStatus': { $in: ['CREDITED', 'ON_HOLD', 'REVERSED'] }, ...range } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          sellerPayable: { $sum: '$financials.sellerPayable' },
          adminShare: { $sum: '$financials.adminShare' },
          commission: { $sum: '$financials.commissionAmount' },
          deliveryFees: { $sum: '$deliveryCharge' },
          platformFees: { $sum: '$platformFee' },
          gst: { $sum: '$taxAmount' },
          tips: { $sum: '$tipAmount' },
          riderPayouts: { $sum: '$deliveryPayout' },
        },
      },
    ]);
    const ledgerRange = dateRange(req.query);
    const ledger = await SellerLedger.aggregate([{ $match: ledgerRange }, { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
    const ledgerByType = Object.fromEntries(ledger.map((l) => [l._id, { total: r2(l.total), count: l.count }]));

    // Integrity checks
    const anomalies = [];
    const capturedNotSettled = await Order.countDocuments({ 'razorpay.status': 'CAPTURED', orderStatus: 'DELIVERED', 'financials.settlementStatus': 'PENDING' });
    if (capturedNotSettled) anomalies.push({ type: 'DELIVERED_NOT_CREDITED', count: capturedNotSettled, message: 'Delivered online orders without a seller credit' });
    const pendingRefunds = await Order.countDocuments({ 'refunds.status': 'PENDING' });
    if (pendingRefunds) anomalies.push({ type: 'REFUNDS_PENDING', count: pendingRefunds, message: 'Refunds awaiting Razorpay confirmation' });
    const mismatch = await Order.countDocuments({ 'razorpay.failureReason': /Amount mismatch/ });
    if (mismatch) anomalies.push({ type: 'AMOUNT_MISMATCH', count: mismatch, message: 'Payments whose amount did not match the order' });
    const cancelledPaid = await Order.countDocuments({ orderStatus: 'CANCELLED', 'razorpay.status': 'CAPTURED', paymentStatus: 'PAID', refunds: { $size: 0 } });
    if (cancelledPaid) anomalies.push({ type: 'CANCELLED_NOT_REFUNDED', count: cancelledPaid, message: 'Cancelled online orders with no refund' });

    const o = online || {};
    const c = cod || {};
    const sp = split || {};
    res.json({
      success: true,
      data: {
        online: {
          orders: o.count || 0,
          captured: r2(o.captured),
          gatewayFee: r2(o.gatewayFee),
          gatewayGst: r2(o.gatewayGst),
          refunded: r2(o.refunded),
          netReceived: r2((o.captured || 0) - (o.gatewayFee || 0) - (o.refunded || 0)),
        },
        cod: { orders: c.count || 0, collectedByRiders: r2(c.collected), confirmedByAdmin: r2(c.confirmed), awaitingConfirmation: r2((c.collected || 0) - (c.confirmed || 0)) },
        split: {
          orders: sp.orders || 0,
          sellerPayable: r2(sp.sellerPayable),
          adminShare: r2(sp.adminShare),
          commission: r2(sp.commission),
          deliveryFees: r2(sp.deliveryFees),
          platformFees: r2(sp.platformFees),
          gst: r2(sp.gst),
          tips: r2(sp.tips),
          riderPayouts: r2(sp.riderPayouts),
          adminNetAfterRiders: r2((sp.adminShare || 0) - (sp.riderPayouts || 0)),
        },
        ledger: ledgerByType,
        anomalies,
      },
    });
  } catch (err) {
    sendError(res, err, 'reconciliation');
  }
};

// GET /admin/settlements/audit-logs
export const adminGetAuditLogs = async (req, res) => {
  try {
    const { limit, skip, page } = pageParams(req.query);
    const filter = { ...dateRange(req.query) };
    if (req.query.action) filter.action = req.query.action;
    if (req.query.vendorId && mongoose.isValidObjectId(req.query.vendorId)) filter.vendorId = req.query.vendorId;
    if (req.query.entityId) filter.entityId = String(req.query.entityId);
    const [logs, total] = await Promise.all([
      AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAuditLog.countDocuments(filter),
    ]);
    res.json({ success: true, data: { logs, pagination: { page, limit, total } } });
  } catch (err) {
    sendError(res, err, 'audit logs');
  }
};

// GET/PUT /admin/settlements/config — order pricing & commission
const CONFIG_FIELDS = ['orderDeliveryCharge', 'orderFreeDeliveryAbove', 'orderPlatformFeeFixed', 'orderPlatformFeePercent', 'sellerCommissionPercent', 'sellerMinPayoutRequest', 'orderGstTaxPercent', 'enableOrderTax'];
const pickConfig = (c) => Object.fromEntries(CONFIG_FIELDS.map((k) => [k, c?.[k]]));

export const adminGetPricingConfig = async (req, res) => {
  try {
    const config = (await RewardConfig.findOne()) || (await RewardConfig.create({}));
    res.json({ success: true, data: pickConfig(config) });
  } catch (err) {
    sendError(res, err, 'get config');
  }
};

export const adminUpdatePricingConfig = async (req, res) => {
  try {
    const config = (await RewardConfig.findOne()) || (await RewardConfig.create({}));
    const before = pickConfig(config);
    for (const k of CONFIG_FIELDS) {
      if (req.body?.[k] === undefined) continue;
      if (k === 'enableOrderTax') {
        config[k] = Boolean(req.body[k]);
        continue;
      }
      const v = Number(req.body[k]);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ success: false, message: `${k} must be a non-negative number` });
      config[k] = v;
    }
    await config.save();
    const after = pickConfig(config);
    await writeAudit(req, { action: 'PRICING_CONFIG_UPDATED', entityType: 'RewardConfig', entityId: config._id, before, after });
    res.json({ success: true, message: 'Pricing updated', data: after });
  } catch (err) {
    sendError(res, err, 'update config');
  }
};

// ═══════════════════════════ SELLER ═══════════════════════════

// GET /vendor/settlement — balance, ledger, requests
export const vendorGetSettlement = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { limit, skip, page } = pageParams(req.query);
    const [balance, entries, total, requests, config] = await Promise.all([
      getSellerBalance(vendorId),
      SellerLedger.find({ vendorId }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-createdBy -createdByRole').lean(),
      SellerLedger.countDocuments({ vendorId }),
      SellerPayoutRequest.find({ vendorId }).sort({ createdAt: -1 }).limit(20).select('-resolvedBy -payments.paidBy').lean(),
      RewardConfig.findOne().select('sellerMinPayoutRequest sellerCommissionPercent').lean(),
    ]);
    res.json({
      success: true,
      data: {
        balance,
        entries,
        requests,
        minPayoutRequest: Number(config?.sellerMinPayoutRequest ?? 100),
        commissionPercent: Number(config?.sellerCommissionPercent ?? 0),
        pagination: { page, limit, total },
      },
    });
  } catch (err) {
    sendError(res, err, 'vendor settlement');
  }
};

// POST /vendor/settlement/withdraw { amount, note? }
export const vendorRequestPayout = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const amount = r2(req.body?.amount);
    const config = await RewardConfig.findOne().select('sellerMinPayoutRequest').lean();
    const minAmt = Number(config?.sellerMinPayoutRequest ?? 100);
    if (!(amount >= minAmt)) return res.status(400).json({ success: false, code: 'BELOW_MINIMUM', message: `Minimum withdrawal is ₹${minAmt}` });

    const vendor = await Vendor.findById(vendorId).select('bankDetails upiId storeName');
    const bank = vendor?.bankDetails || {};
    if (!bank.accountNumber && !bank.upiId && !vendor?.upiId) {
      return res.status(400).json({ success: false, code: 'NO_PAYOUT_ACCOUNT', message: 'Add your bank account or UPI ID before requesting a withdrawal.' });
    }

    const request = await runInTransaction(async (session) => {
      await Vendor.collection.updateOne({ _id: new mongoose.Types.ObjectId(vendorId) }, { $inc: { settlementLockVersion: 1 } }, session ? { session } : {});
      const balance = await getSellerBalance(vendorId, session);
      if (amount > balance.withdrawable) {
        throw new SettlementError(`You can withdraw up to ₹${balance.withdrawable}`, 'EXCEEDS_BALANCE');
      }
      const [doc] = await SellerPayoutRequest.create(
        [
          {
            requestId: `SPR-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
            vendorId,
            requestedAmount: amount,
            bankSnapshot: {
              accountHolderName: bank.accountHolderName,
              bankName: bank.bankName,
              accountNumberMasked: bank.accountNumber ? `XXXX${String(bank.accountNumber).slice(-4)}` : undefined,
              ifscCode: bank.ifscCode,
              upiId: bank.upiId || vendor.upiId,
            },
            sellerNote: typeof req.body?.note === 'string' ? req.body.note.slice(0, 300) : undefined,
          },
        ],
        { session }
      );
      return doc;
    });
    notifyAdmins('PAYOUT_REQUEST', 'New Seller Settlement Withdrawal', `${vendor.storeName} requested ₹${amount} from their settlement balance (${request.requestId}).`).catch(() => {});
    res.status(201).json({ success: true, message: 'Withdrawal request sent to admin', data: { request } });
  } catch (err) {
    sendError(res, err, 'vendor request payout');
  }
};

// POST /vendor/settlement/requests/:id/cancel
export const vendorCancelPayoutRequest = async (req, res) => {
  try {
    const request = await SellerPayoutRequest.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.id, status: 'REQUESTED' },
      { $set: { status: 'CANCELLED', resolvedAt: new Date() } },
      { new: true }
    );
    if (!request) return res.status(400).json({ success: false, message: 'Only requests that have not been paid can be cancelled' });
    res.json({ success: true, message: 'Request cancelled', data: { request } });
  } catch (err) {
    sendError(res, err, 'vendor cancel request');
  }
};
