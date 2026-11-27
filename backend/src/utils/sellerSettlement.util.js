import mongoose from 'mongoose';
import SellerLedger from '../models/SellerLedger.js';
import SellerPayoutRequest from '../models/SellerPayoutRequest.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import Vendor from '../models/Vendor.js';
import RewardConfig from '../models/RewardConfig.js';
import { computeSellerShare, r2 } from './orderPricing.util.js';
import logger from './logger.js';

export class SettlementError extends Error {
  constructor(message, code = 'SETTLEMENT_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const isDuplicateKey = (err) => err && (err.code === 11000 || /E11000/.test(err.message || ''));

// Runs fn inside a transaction; falls back to no transaction on standalone Mongo (dev).
export const runInTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (err?.message && (err.message.includes('Transaction numbers are only allowed') || err.message.includes('replica set'))) {
      logger.warn(`[Settlement] Transactions unsupported, running without: ${err.message}`);
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

const withSession = (q, session) => (session ? q.session(session) : q);

// Serialises concurrent money movements for one seller: two transactions
// touching the same vendor doc conflict and withTransaction retries one.
const lockVendor = (vendorId, session) =>
  Vendor.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(vendorId)) }, { $inc: { settlementLockVersion: 1 } }, session ? { session } : {});

/**
 * Which orders are collected centrally by admin?
 *  - All delivery orders (online via Razorpay, COD via rider, or points)
 *  - Pickup orders paid ONLINE in the cart (Razorpay)
 * Not applicable: pickup orders paid at the store (money went straight to the seller)
 * and legacy direct-UPI-to-seller orders.
 */
export const getCollectionMode = (order) => {
  const method = order.paymentMethod;
  if (method === 'ONLINE' || method === 'RAZORPAY') return order.razorpay?.status === 'CAPTURED' ? 'ONLINE' : null;
  if (order.fulfillmentType === 'pickup') return null;
  if (method === 'CASH') return 'COD';
  if (method === 'ZEEBAC_POINTS') return 'POINTS';
  return null; // UPI_INTENT (paid directly to seller's UPI)
};

/**
 * Credit the seller's share for a delivered order. Idempotent per order.
 * Mutates order.financials — caller must save the order (same session).
 */
export const creditSellerForDeliveredOrder = async (order, { session = null } = {}) => {
  const mode = getCollectionMode(order);
  if (!order.financials) order.financials = {};
  if (!mode) {
    order.financials.settlementStatus = 'NOT_APPLICABLE';
    return null;
  }
  if (['CREDITED', 'ON_HOLD', 'REVERSED'].includes(order.financials.settlementStatus)) return null;

  const config = await withSession(RewardConfig.findOne(), session);
  const commissionPercent = order.financials.commissionPercent ?? Number(config?.sellerCommissionPercent || 0);
  const gatewayFee = mode === 'ONLINE' ? Number(order.razorpay?.fee || 0) : 0;
  const share = computeSellerShare({ order, gatewayFee, commissionPercent });
  const status = mode === 'COD' ? 'ON_HOLD' : 'AVAILABLE';

  Object.assign(order.financials, {
    grossTotal: share.grossTotal,
    customerPaid: share.customerPaid,
    sellerGross: share.sellerGross,
    pointsRedeemed: share.pointsRedeemed,
    commissionPercent: share.commissionPercent,
    commissionAmount: share.commissionAmount,
    gatewayFee: share.gatewayFee,
    sellerPayable: share.sellerPayable,
    adminShare: share.adminShare,
    settlementStatus: status === 'ON_HOLD' ? 'ON_HOLD' : 'CREDITED',
    creditedAt: new Date(),
  });

  try {
    const [entry] = await SellerLedger.create(
      [
        {
          vendorId: order.vendorId,
          type: 'ORDER_CREDIT',
          amount: share.sellerPayable,
          status,
          orderId: order._id,
          orderCode: order.orderId,
          paymentMode: mode,
          breakdown: share,
          note:
            mode === 'COD'
              ? `COD order ${order.orderId}: on hold until admin confirms cash collection`
              : `Order ${order.orderId} delivered`,
          idempotencyKey: `ORDER_CREDIT:${order._id}`,
        },
      ],
      { session }
    );
    return entry;
  } catch (err) {
    if (isDuplicateKey(err)) return null; // already credited
    throw err;
  }
};

/** Admin confirms COD cash was collected → release on-hold credits. */
export const releaseCodCredits = async ({ orderIds, adminId, session = null }) => {
  const Order = mongoose.model('Order');
  const ids = orderIds.filter((id) => mongoose.isValidObjectId(id));
  const codeIds = orderIds.filter((id) => !mongoose.isValidObjectId(id));
  const orders = await withSession(Order.find({ $or: [{ _id: { $in: ids } }, { orderId: { $in: codeIds } }] }), session);
  const released = [];
  const skipped = [];
  for (const order of orders) {
    const r = await SellerLedger.updateMany(
      { orderId: order._id, type: { $in: ['ORDER_CREDIT', 'ORDER_REVERSAL'] }, status: 'ON_HOLD' },
      { $set: { status: 'AVAILABLE', releasedAt: new Date() } },
      { session }
    );
    if (r.modifiedCount > 0) {
      if (order.financials.settlementStatus === 'ON_HOLD') order.financials.settlementStatus = 'CREDITED';
      order.financials.codConfirmedAt = new Date();
      order.financials.codConfirmedBy = adminId;
      await order.save({ session });
      released.push({ orderId: order.orderId, vendorId: order.vendorId, amount: order.financials.sellerPayable });
    } else {
      skipped.push({ orderId: order.orderId, reason: `settlement is ${order.financials?.settlementStatus || 'PENDING'}` });
    }
  }
  const found = new Set(orders.flatMap((o) => [String(o._id), o.orderId]));
  for (const id of orderIds) if (!found.has(String(id))) skipped.push({ orderId: id, reason: 'not found' });
  return { released, skipped };
};

/** Claw back (part of) a seller's credit after a refund. Idempotent per key. */
export const reverseOrderCredit = async ({ order, amount, reason, idempotencyKey, actorId, session = null }) => {
  const credited = await withSession(SellerLedger.findOne({ orderId: order._id, type: 'ORDER_CREDIT' }), session);
  if (!credited) return null; // nothing credited yet → nothing to reverse
  const already = await SellerLedger.aggregate([
    { $match: { orderId: order._id, type: 'ORDER_REVERSAL' } },
    { $group: { _id: null, t: { $sum: '$amount' } } },
  ]).session(session || null);
  const remaining = r2(credited.amount + (already[0]?.t || 0));
  const amt = r2(Math.min(Math.max(0, Number(amount) || 0), remaining));
  if (amt <= 0) return null;
  try {
    await lockVendor(order.vendorId, session);
    const [entry] = await SellerLedger.create(
      [
        {
          vendorId: order.vendorId,
          type: 'ORDER_REVERSAL',
          amount: -amt,
          // Reversing an on-hold COD credit stays on hold so it nets out of the held amount
          status: credited.status,
          orderId: order._id,
          orderCode: order.orderId,
          paymentMode: credited.paymentMode,
          note: reason,
          idempotencyKey,
          createdBy: actorId,
        },
      ],
      { session }
    );
    if (amt >= remaining) order.financials.settlementStatus = 'REVERSED';
    return entry;
  } catch (err) {
    if (isDuplicateKey(err)) return null;
    throw err;
  }
};

export const getSellerBalance = async (vendorId, session = null) => {
  const vid = new mongoose.Types.ObjectId(String(vendorId));
  const [agg] = await SellerLedger.aggregate([
    { $match: { vendorId: vid } },
    {
      $group: {
        _id: null,
        available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, '$amount', 0] } },
        onHold: { $sum: { $cond: [{ $eq: ['$status', 'ON_HOLD'] }, '$amount', 0] } },
        totalCredited: { $sum: { $cond: [{ $eq: ['$type', 'ORDER_CREDIT'] }, '$amount', 0] } },
        totalReversed: { $sum: { $cond: [{ $eq: ['$type', 'ORDER_REVERSAL'] }, '$amount', 0] } },
        totalPaidOut: { $sum: { $cond: [{ $in: ['$type', ['PAYOUT', 'PAYOUT_REVERSAL']] }, '$amount', 0] } },
        totalAdjustments: { $sum: { $cond: [{ $eq: ['$type', 'ADJUSTMENT'] }, '$amount', 0] } },
      },
    },
  ]).session(session || null);
  const openRequests = await withSession(
    SellerPayoutRequest.find({ vendorId: vid, status: { $in: ['REQUESTED', 'PARTIALLY_PAID'] } }).select('requestedAmount paidAmount'),
    session
  );
  const reserved = r2(openRequests.reduce((s, q) => s + (q.requestedAmount - q.paidAmount), 0));
  const available = r2(agg?.available || 0);
  return {
    available,
    onHold: r2(agg?.onHold || 0),
    reservedForRequests: reserved,
    withdrawable: Math.max(0, r2(available - reserved)),
    totalCredited: r2(agg?.totalCredited || 0),
    totalReversed: r2(-(agg?.totalReversed || 0)),
    totalPaidOut: r2(-(agg?.totalPaidOut || 0)),
    totalAdjustments: r2(agg?.totalAdjustments || 0),
  };
};

/**
 * Admin records a (possibly partial) payout to a seller.
 * Against a request: amount ≤ request's unpaid amount and ≤ available balance.
 * Without a request: amount ≤ withdrawable balance (so it can't eat money reserved for requests).
 */
export const recordSellerPayout = async ({ vendorId, amount, method, utr, requestId, note, adminId, adminRole, idempotencyKey }) => {
  const amt = r2(amount);
  if (!(amt > 0)) throw new SettlementError('Payout amount must be greater than 0', 'INVALID_AMOUNT');
  const cleanUtr = typeof utr === 'string' && utr.trim() ? utr.trim().slice(0, 60) : undefined;
  const key = idempotencyKey ? `PAYOUT:${idempotencyKey}` : cleanUtr ? `PAYOUT_UTR:${cleanUtr}` : null;
  if (!key) throw new SettlementError('Provide a UTR / reference number for the payout', 'REFERENCE_REQUIRED');

  const existing = await SellerLedger.findOne({ idempotencyKey: key });
  if (existing) {
    if (String(existing.vendorId) !== String(vendorId) || r2(-existing.amount) !== amt) {
      throw new SettlementError('This UTR / reference has already been used for a different payout', 'DUPLICATE_PAYOUT', 409);
    }
    return { entry: existing, duplicate: true };
  }

  return runInTransaction(async (session) => {
    await lockVendor(vendorId, session);
    const balance = await getSellerBalance(vendorId, session);
    let request = null;
    if (requestId) {
      request = await withSession(SellerPayoutRequest.findOne({ _id: requestId, vendorId }), session);
      if (!request) throw new SettlementError('Payout request not found', 'REQUEST_NOT_FOUND', 404);
      if (!['REQUESTED', 'PARTIALLY_PAID'].includes(request.status)) throw new SettlementError(`Request is already ${request.status}`, 'REQUEST_CLOSED');
      const unpaid = r2(request.requestedAmount - request.paidAmount);
      if (amt > unpaid) throw new SettlementError(`Amount exceeds the unpaid request amount (₹${unpaid})`, 'EXCEEDS_REQUEST');
      if (amt > balance.available) throw new SettlementError(`Amount exceeds seller's available balance (₹${balance.available})`, 'EXCEEDS_BALANCE');
    } else if (amt > balance.withdrawable) {
      throw new SettlementError(`Amount exceeds seller's withdrawable balance (₹${balance.withdrawable})`, 'EXCEEDS_BALANCE');
    }

    let entry;
    try {
      [entry] = await SellerLedger.create(
        [
          {
            vendorId,
            type: 'PAYOUT',
            amount: -amt,
            status: 'AVAILABLE',
            payoutRequestId: request?._id,
            payout: { method: method || 'BANK_TRANSFER', utr: cleanUtr },
            note: note || (request ? `Payout against request ${request.requestId}` : 'Direct settlement by admin'),
            idempotencyKey: key,
            createdBy: adminId,
            createdByRole: adminRole,
          },
        ],
        { session }
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new SettlementError('This UTR / reference has already been used for a payout', 'DUPLICATE_PAYOUT', 409);
      throw err;
    }

    if (request) {
      request.paidAmount = r2(request.paidAmount + amt);
      request.payments.push({ ledgerEntryId: entry._id, amount: amt, method: method || 'BANK_TRANSFER', utr: cleanUtr, paidAt: new Date(), paidBy: adminId });
      request.status = request.paidAmount >= request.requestedAmount ? 'PAID' : 'PARTIALLY_PAID';
      if (request.status === 'PAID') {
        request.resolvedAt = new Date();
        request.resolvedBy = adminId;
      }
      await request.save({ session });
    }
    return { entry, request, duplicate: false };
  });
};

export const writeAudit = async (req, { action, entityType, entityId, vendorId, amount, before, after, meta }) => {
  try {
    await AdminAuditLog.create({
      adminId: mongoose.isValidObjectId(req?.user?.id) ? req.user.id : undefined,
      adminRole: req?.user?.role,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : undefined,
      vendorId,
      amount,
      before,
      after,
      meta,
      ip: req?.ip,
    });
  } catch (err) {
    logger.error(`[Audit] Failed to write audit log for ${action}: ${err.message}`);
  }
};
