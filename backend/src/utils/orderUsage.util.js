/**
 * Order-quota billing for vendor subscriptions.
 *
 * Rules (confirmed by client):
 *  - Billing cycle is monthly from the subscription activation date (IST), e.g.
 *    activated 15 Nov → cycle 15 Nov 00:00 IST to 15 Dec 00:00 IST (shown as 15 Nov – 14 Dec).
 *  - Only DELIVERED orders are counted. Each order is counted at most once (unique OrderUsage.orderId).
 *  - While free slots remain the order is FREE; after that each order is EXTRA and the plan's
 *    per-order charge is debited from the vendor wallet immediately (no invoice).
 *  - Refund / return of a counted order: the order stops counting (one slot comes back) and,
 *    if it was charged, the charge is credited back to the wallet. Idempotent.
 *
 * Slot allocation is a single conditional atomic update ($expr freeUsed < freeLimit), so
 * concurrent deliveries can never over-allocate free slots.
 */
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import OrderUsage from '../models/OrderUsage.js';
import SubscriptionCycle from '../models/SubscriptionCycle.js';
import { debitWallet, creditWallet } from './wallet.util.js';
import { runInTransaction } from './sellerSettlement.util.js';
import { r2 } from './orderPricing.util.js';
import logger from './logger.js';

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30, no DST
const NEAR_LIMIT_RATIO = 0.8;

const isDuplicateKey = (err) => err && (err.code === 11000 || /E11000/.test(err.message || ''));
const withSession = (q, session) => (session ? q.session(session) : q);
const opts = (session, extra = {}) => (session ? { ...extra, session } : extra);

// ─── Cycle date math (IST calendar days) ─────────────────────────────────────

const istParts = (date) => {
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};

const istMidnight = (y, m, d) => new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);

const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Start of cycle k for an anchor: same day-of-month k months later (clamped to month end). */
export const cycleStartFor = (anchor, k) => {
  const a = istParts(anchor);
  const totalMonths = a.m + k;
  const y = a.y + Math.floor(totalMonths / 12);
  const m = ((totalMonths % 12) + 12) % 12;
  return istMidnight(y, m, Math.min(a.d, daysInMonth(y, m)));
};

/**
 * Returns the cycle containing `at` for the given anchor.
 * cycleEnd is exclusive; displayEnd is the last calendar day of the cycle.
 */
export const getCycleWindow = (anchor, at = new Date()) => {
  const t = new Date(at).getTime();
  const a = istParts(anchor);
  const p = istParts(at);
  let k = Math.max(0, (p.y - a.y) * 12 + (p.m - a.m));
  while (k > 0 && cycleStartFor(anchor, k).getTime() > t) k -= 1;
  while (cycleStartFor(anchor, k + 1).getTime() <= t) k += 1;
  const cycleStart = cycleStartFor(anchor, k);
  const cycleEnd = cycleStartFor(anchor, k + 1);
  return {
    cycleIndex: k,
    cycleStart,
    cycleEnd,
    displayEnd: new Date(cycleEnd.getTime() - 24 * 60 * 60 * 1000),
  };
};

// ─── Plan state ──────────────────────────────────────────────────────────────

const getAnchor = (sub) => sub?.cycleAnchor || sub?.startDate || null;

/** Is the subscription active at instant `at`? (status ACTIVE and not past expiresAt) */
const isActiveAt = (sub, at) => {
  if (!sub || String(sub.status || '').toUpperCase() !== 'ACTIVE') return false;
  if (!getAnchor(sub)) return false;
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() < new Date(at).getTime()) return false;
  return true;
};

const planLimits = (sub) => {
  const limit = sub?.tierCode && sub?.freeOrdersPerMonth != null ? Number(sub.freeOrdersPerMonth) : null;
  return {
    planId: sub?.planId && mongoose.isValidObjectId(sub.planId) ? sub.planId : null,
    planName: sub?.planName || sub?.planType || null,
    tierCode: sub?.tierCode || null,
    freeLimit: limit,
    extraRate: limit == null ? 0 : r2(sub?.extraChargePerOrder || 0),
  };
};

/** Finds or creates the cycle doc containing `at` (race-safe via unique index). */
export const getOrCreateCycle = async (vendor, at = new Date(), session = null) => {
  const anchor = getAnchor(vendor.subscription);
  if (!anchor) return null;
  const w = getCycleWindow(anchor, at);
  const filter = { vendorId: vendor._id, cycleStart: w.cycleStart };
  const existing = await withSession(SubscriptionCycle.findOne(filter), session);
  if (existing) return existing;
  try {
    const [created] = await SubscriptionCycle.create(
      [{ ...filter, cycleAnchor: anchor, cycleIndex: w.cycleIndex, cycleEnd: w.cycleEnd, ...planLimits(vendor.subscription) }],
      opts(session)
    );
    return created;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return withSession(SubscriptionCycle.findOne(filter), session);
  }
};

/**
 * After a (re)purchase: apply the vendor's current plan limits to the cycle that is open now.
 * Already-classified orders are never re-priced; only orders completed from now on use the new limits.
 */
export const syncOpenCycleWithPlan = async (vendor, session = null) => {
  if (!isActiveAt(vendor.subscription, new Date())) return null;
  const cycle = await getOrCreateCycle(vendor, new Date(), session);
  if (!cycle) return null;
  const limits = planLimits(vendor.subscription);
  return SubscriptionCycle.findByIdAndUpdate(cycle._id, { $set: limits }, opts(session, { new: true }));
};

/**
 * cycleAnchor for a new subscription record.
 * Renewing while still active keeps the existing cycles running; a fresh purchase starts a new cycle today.
 */
export const resolveCycleAnchor = (prevSub, newStartDate, now = new Date()) => {
  const continuing =
    prevSub?.status === 'ACTIVE' && prevSub?.expiresAt && new Date(prevSub.expiresAt).getTime() > now.getTime();
  if (continuing) return prevSub.cycleAnchor || prevSub.startDate || newStartDate;
  return newStartDate || now;
};

/** Fields to merge into vendor.subscription from resolvePlanPrice() output. */
export const buildPlanSnapshot = (planInfo, prevSub, newStartDate) => ({
  planId: planInfo?.planId ? String(planInfo.planId) : null,
  planName: planInfo?.planName || planInfo?.planType || null,
  tierCode: planInfo?.tierCode || null,
  freeOrdersPerMonth: planInfo?.tierCode ? planInfo.freeOrdersPerMonth : null,
  extraChargePerOrder: planInfo?.tierCode ? r2(planInfo.extraChargePerOrder || 0) : 0,
  cycleAnchor: resolveCycleAnchor(prevSub, newStartDate),
});

// ─── Notifications (fire-and-forget) ─────────────────────────────────────────

const notifyVendor = async (vendorId, title, message, extra = {}) => {
  try {
    const { sendNotification } = await import('../services/notification.service.js');
    await sendNotification({ recipientId: vendorId, recipientType: 'vendor', type: 'system', title, message, ...extra });
  } catch (err) {
    logger.warn(`[OrderUsage] notify failed: ${err.message}`);
  }
};

const maybeSendQuotaAlerts = async (cycle) => {
  if (!cycle || cycle.freeLimit == null || cycle.freeLimit <= 0) return;
  const nearAt = Math.ceil(cycle.freeLimit * NEAR_LIMIT_RATIO);
  if (cycle.freeUsed >= nearAt && cycle.freeUsed < cycle.freeLimit && !cycle.alerts?.nearLimitSentAt) {
    const r = await SubscriptionCycle.updateOne(
      { _id: cycle._id, 'alerts.nearLimitSentAt': { $exists: false } },
      { $set: { 'alerts.nearLimitSentAt': new Date() } }
    );
    if (r.modifiedCount) {
      notifyVendor(
        cycle.vendorId,
        'Free order limit almost used',
        `You have used ${cycle.freeUsed} of ${cycle.freeLimit} free orders this cycle. After the limit, ₹${cycle.extraRate} will be deducted from your wallet for every completed order.`
      );
    }
  }
  if (cycle.freeUsed >= cycle.freeLimit && !cycle.alerts?.limitReachedSentAt) {
    const r = await SubscriptionCycle.updateOne(
      { _id: cycle._id, 'alerts.limitReachedSentAt': { $exists: false } },
      { $set: { 'alerts.limitReachedSentAt': new Date() } }
    );
    if (r.modifiedCount) {
      notifyVendor(
        cycle.vendorId,
        'Free order limit reached',
        `All ${cycle.freeLimit} free orders for this cycle are used. From now on ₹${cycle.extraRate} per completed order will be deducted from your wallet until ${getCycleWindow(cycle.cycleAnchor, cycle.cycleStart).displayEnd.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.`
      );
    }
  }
};

// ─── Record a completed order ────────────────────────────────────────────────

const recordInSession = async (order, session) => {
  const orderId = order._id;
  const already = await withSession(OrderUsage.findOne({ orderId }), session);
  if (already) return { duplicate: true, usage: already };

  const vendor = await withSession(Vendor.findById(order.vendorId), session);
  if (!vendor) return { skipped: 'vendor not found' };

  const completedAt = order.riderDetails?.deliveredAt ? new Date(order.riderDetails.deliveredAt) : new Date();
  const sub = vendor.subscription || {};

  // 1. Claim the order first: the unique index makes every later duplicate a no-op.
  let usage;
  try {
    [usage] = await OrderUsage.create(
      [{ vendorId: vendor._id, orderId, orderCode: order.orderId, completedAt, classification: 'PENDING' }],
      opts(session)
    );
  } catch (err) {
    if (isDuplicateKey(err)) return { duplicate: true };
    throw err;
  }

  if (!isActiveAt(sub, completedAt)) {
    usage.classification = 'NO_PLAN';
    await usage.save(opts(session));
    return { usage };
  }

  const cycle = await getOrCreateCycle(vendor, completedAt, session);
  usage.cycleId = cycle._id;

  // 2. Classify atomically
  let updatedCycle;
  if (cycle.freeLimit == null) {
    usage.classification = 'UNLIMITED';
    updatedCycle = await SubscriptionCycle.findByIdAndUpdate(cycle._id, { $inc: { unlimitedOrders: 1 } }, opts(session, { new: true }));
  } else {
    updatedCycle = await SubscriptionCycle.findOneAndUpdate(
      { _id: cycle._id, $expr: { $lt: ['$freeUsed', '$freeLimit'] } },
      { $inc: { freeUsed: 1 } },
      opts(session, { new: true })
    );
    if (updatedCycle) {
      usage.classification = 'FREE';
    } else {
      const rate = r2(cycle.extraRate || 0);
      updatedCycle = await SubscriptionCycle.findByIdAndUpdate(
        cycle._id,
        { $inc: { extraOrders: 1, extraChargeTotal: rate } },
        opts(session, { new: true })
      );
      usage.classification = 'EXTRA';
      usage.chargeAmount = rate;
      usage.chargeStatus = rate > 0 ? 'PENDING' : 'NONE';
    }
  }
  await usage.save(opts(session));

  // 3. Deduct the extra charge from the vendor wallet
  if (usage.chargeStatus === 'PENDING') {
    await chargeUsage(usage, session);
  }

  return { usage, cycle: updatedCycle };
};

/** Debits a PENDING charge. Atomic flip PENDING→DEDUCTED guards against double debit. */
const chargeUsage = async (usage, session) => {
  const flipped = await OrderUsage.findOneAndUpdate(
    { _id: usage._id, chargeStatus: 'PENDING', status: 'COUNTED' },
    { $set: { chargeStatus: 'DEDUCTED', chargedAt: new Date() } },
    opts(session, { new: true })
  );
  if (!flipped) return false;
  await debitWallet({
    session,
    ownerId: usage.vendorId,
    ownerType: 'Vendor',
    amount: usage.chargeAmount,
    category: 'extra_order_fee',
    description: `Extra order charge for Order ${usage.orderCode} (free order limit exceeded)`,
    referenceId: usage.orderId,
    referenceType: 'Order',
    allowNegativeBalance: true,
  });
  usage.chargeStatus = 'DEDUCTED';
  usage.chargedAt = flipped.chargedAt;
  return true;
};

/**
 * Count a DELIVERED order against the vendor's quota and deduct the extra charge if applicable.
 * Pass the caller's session to make it part of the delivery transaction.
 * Safe to call any number of times for the same order.
 */
export const recordCompletedOrderUsage = async (order, { session = null } = {}) => {
  if (!order || order.orderStatus !== 'DELIVERED' || !order.vendorId) return { skipped: 'not delivered' };
  const result = session ? await recordInSession(order, session) : await runInTransaction((s) => recordInSession(order, s));
  if (result?.cycle) {
    const c = result.cycle;
    setImmediate(() => maybeSendQuotaAlerts(c).catch(() => {}));
  }
  return result;
};

// ─── Refund / return reversal ────────────────────────────────────────────────

const reverseInSession = async ({ orderId, reason, actorId }, session) => {
  const usage = await OrderUsage.findOneAndUpdate(
    { orderId, status: 'COUNTED' },
    { $set: { status: 'REVERSED', reversedAt: new Date(), reversalReason: reason || 'Order refunded/returned', reversedBy: actorId } },
    opts(session, { new: true })
  );
  if (!usage) {
    const exists = await withSession(OrderUsage.findOne({ orderId }), session);
    return { reversed: false, reason: exists ? 'already reversed' : 'order was not counted' };
  }

  let refundAmount = 0;
  if (usage.cycleId) {
    const inc = { reversedOrders: 1 };
    if (usage.classification === 'FREE') inc.freeUsed = -1;
    else if (usage.classification === 'UNLIMITED') inc.unlimitedOrders = -1;
    else if (usage.classification === 'EXTRA') {
      inc.extraOrders = -1;
      inc.extraChargeTotal = -usage.chargeAmount;
    }
    if (usage.classification === 'EXTRA' && usage.chargeStatus === 'DEDUCTED') {
      inc.reversedChargeTotal = usage.chargeAmount;
    }
    await SubscriptionCycle.updateOne({ _id: usage.cycleId }, { $inc: inc }, opts(session));
  }

  if (usage.chargeStatus === 'DEDUCTED' && usage.chargeAmount > 0) {
    const flipped = await OrderUsage.findOneAndUpdate(
      { _id: usage._id, chargeStatus: 'DEDUCTED' },
      { $set: { chargeStatus: 'REVERSED' } },
      opts(session, { new: true })
    );
    if (flipped) {
      const vendor = await withSession(Vendor.findById(usage.vendorId).select('zeebacId'), session);
      await creditWallet({
        session,
        ownerId: usage.vendorId,
        ownerType: 'Vendor',
        ownerZeebacId: vendor?.zeebacId,
        amount: usage.chargeAmount,
        category: 'extra_order_fee_reversal',
        description: `Extra order charge reversed for Order ${usage.orderCode} (${reason || 'refund/return'})`,
        referenceId: usage.orderId,
        referenceType: 'Order',
      });
      refundAmount = usage.chargeAmount;
    }
  } else if (usage.chargeStatus === 'PENDING') {
    await OrderUsage.updateOne({ _id: usage._id }, { $set: { chargeStatus: 'CANCELLED' } }, opts(session));
  }

  return { reversed: true, classification: usage.classification, refundAmount, usageId: usage._id };
};

/**
 * Reverse a counted order after a refund / return: the order stops counting toward the quota
 * and any extra charge is credited back to the vendor wallet. Idempotent.
 */
export const reverseOrderUsage = async ({ order, orderId, reason, actorId, session = null }) => {
  const oid = orderId || order?._id;
  if (!oid) return { reversed: false, reason: 'no order' };
  const id = new mongoose.Types.ObjectId(String(oid));
  const result = session
    ? await reverseInSession({ orderId: id, reason, actorId }, session)
    : await runInTransaction((s) => reverseInSession({ orderId: id, reason, actorId }, s));
  if (result.reversed && order?.vendorId) {
    notifyVendor(
      order.vendorId,
      'Order usage adjusted',
      result.refundAmount > 0
        ? `Order #${order.orderId} was refunded/returned. ₹${result.refundAmount} extra order charge credited back to your wallet and the order no longer counts toward your limit.`
        : `Order #${order.orderId} was refunded/returned and no longer counts toward your monthly order limit.`
    );
  }
  return result;
};

// ─── Self-healing & reporting ────────────────────────────────────────────────

/**
 * Rebuilds a cycle's counters from its OrderUsage rows (source of truth).
 * Returns { before, after, fixed }.
 */
export const recomputeCycleTotals = async (cycleId) => {
  const cycle = await SubscriptionCycle.findById(cycleId);
  if (!cycle) return null;
  const rows = await OrderUsage.aggregate([
    { $match: { cycleId: cycle._id } },
    {
      $group: {
        _id: null,
        freeUsed: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'COUNTED'] }, { $eq: ['$classification', 'FREE'] }] }, 1, 0] } },
        extraOrders: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'COUNTED'] }, { $eq: ['$classification', 'EXTRA'] }] }, 1, 0] } },
        unlimitedOrders: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'COUNTED'] }, { $eq: ['$classification', 'UNLIMITED'] }] }, 1, 0] } },
        extraChargeTotal: {
          $sum: { $cond: [{ $and: [{ $eq: ['$status', 'COUNTED'] }, { $eq: ['$classification', 'EXTRA'] }] }, '$chargeAmount', 0] },
        },
        reversedOrders: { $sum: { $cond: [{ $eq: ['$status', 'REVERSED'] }, 1, 0] } },
        reversedChargeTotal: { $sum: { $cond: [{ $eq: ['$chargeStatus', 'REVERSED'] }, '$chargeAmount', 0] } },
      },
    },
  ]);
  const t = rows[0] || {};
  const after = {
    freeUsed: t.freeUsed || 0,
    extraOrders: t.extraOrders || 0,
    unlimitedOrders: t.unlimitedOrders || 0,
    extraChargeTotal: r2(t.extraChargeTotal || 0),
    reversedOrders: t.reversedOrders || 0,
    reversedChargeTotal: r2(t.reversedChargeTotal || 0),
  };
  const before = Object.fromEntries(Object.keys(after).map((k) => [k, cycle[k]]));
  const fixed = Object.keys(after).some((k) => r2(before[k]) !== r2(after[k]));
  if (fixed) await SubscriptionCycle.updateOne({ _id: cycle._id }, { $set: after });
  return { before, after, fixed };
};

/**
 * Catches up anything a crash may have left behind for the vendor's current cycle:
 *  - delivered orders that were never counted
 *  - EXTRA charges classified but not yet debited
 * Then re-verifies the counters. Safe to run any time.
 */
export const syncVendorUsage = async (vendorId) => {
  const Order = mongoose.model('Order');
  const vendor = await Vendor.findById(vendorId);
  const anchor = getAnchor(vendor?.subscription);
  if (!vendor || !anchor) return { counted: 0, charged: 0 };
  const w = getCycleWindow(anchor, new Date());

  const delivered = await Order.find({
    vendorId: vendor._id,
    orderStatus: 'DELIVERED',
    'riderDetails.deliveredAt': { $gte: w.cycleStart, $lt: w.cycleEnd },
  })
    .select('_id orderId vendorId orderStatus riderDetails.deliveredAt')
    .sort({ 'riderDetails.deliveredAt': 1 })
    .lean();
  const ids = delivered.map((o) => o._id);
  const have = new Set((await OrderUsage.find({ orderId: { $in: ids } }).select('orderId').lean()).map((u) => String(u.orderId)));

  let counted = 0;
  for (const o of delivered) {
    if (have.has(String(o._id))) continue;
    try {
      const r = await recordCompletedOrderUsage(o);
      if (r?.usage && !r.duplicate) counted += 1;
    } catch (err) {
      logger.error(`[OrderUsage] backfill failed for order ${o.orderId}: ${err.message}`);
    }
  }

  let charged = 0;
  const pending = await OrderUsage.find({ vendorId: vendor._id, chargeStatus: 'PENDING', status: 'COUNTED' });
  for (const u of pending) {
    try {
      const ok = await runInTransaction((s) => chargeUsage(u, s));
      if (ok) charged += 1;
    } catch (err) {
      logger.error(`[OrderUsage] pending charge failed for ${u.orderCode}: ${err.message}`);
    }
  }

  const cycle = await SubscriptionCycle.findOne({ vendorId: vendor._id, cycleStart: w.cycleStart });
  if (cycle) await recomputeCycleTotals(cycle._id);
  return { counted, charged };
};

const summarizeCycle = (cycle, window, sub) => {
  const limits = cycle ? cycle : planLimits(sub);
  const freeLimit = limits.freeLimit ?? null;
  const freeUsed = cycle?.freeUsed || 0;
  const extraOrders = cycle?.extraOrders || 0;
  const unlimitedOrders = cycle?.unlimitedOrders || 0;
  return {
    cycleId: cycle?._id || null,
    cycleIndex: window.cycleIndex,
    cycleStart: window.cycleStart,
    cycleEnd: window.cycleEnd,
    displayEnd: window.displayEnd,
    planName: limits.planName || null,
    tierCode: limits.tierCode || null,
    isUnlimited: freeLimit == null,
    freeLimit,
    extraRate: r2(limits.extraRate || 0),
    ordersUsed: freeUsed + extraOrders + unlimitedOrders,
    freeUsed,
    freeRemaining: freeLimit == null ? null : Math.max(0, freeLimit - freeUsed),
    extraOrders,
    extraChargeTotal: r2(cycle?.extraChargeTotal || 0),
    reversedOrders: cycle?.reversedOrders || 0,
    reversedChargeTotal: r2(cycle?.reversedChargeTotal || 0),
  };
};

/** Dashboard payload: current cycle summary + this cycle's extra-charged orders. */
export const getVendorUsageSummary = async (vendorId, { sync = true } = {}) => {
  if (sync) {
    try {
      await syncVendorUsage(vendorId);
    } catch (err) {
      logger.warn(`[OrderUsage] sync failed for ${vendorId}: ${err.message}`);
    }
  }
  const vendor = await Vendor.findById(vendorId).select('subscription');
  const sub = vendor?.subscription;
  const anchor = getAnchor(sub);
  const active = isActiveAt(sub, new Date());
  if (!anchor) return { hasPlan: false, isActive: false, current: null, extraOrders: [] };

  const w = getCycleWindow(anchor, new Date());
  const cycle = await SubscriptionCycle.findOne({ vendorId, cycleStart: w.cycleStart });
  const extraRows = cycle
    ? await OrderUsage.find({ cycleId: cycle._id, classification: 'EXTRA' })
        .sort({ completedAt: -1 })
        .select('orderId orderCode completedAt chargeAmount chargeStatus status reversedAt reversalReason')
        .lean()
    : [];

  return {
    hasPlan: true,
    isActive: active,
    plan: {
      planName: sub.planName || sub.planType,
      tierCode: sub.tierCode || null,
      freeOrdersPerMonth: sub.tierCode ? sub.freeOrdersPerMonth : null,
      extraChargePerOrder: sub.tierCode ? r2(sub.extraChargePerOrder || 0) : 0,
      expiresAt: sub.expiresAt,
      cycleAnchor: anchor,
    },
    current: summarizeCycle(cycle, w, sub),
    extraOrders: extraRows,
  };
};

/** Past cycles (most recent first). */
export const getVendorCycleHistory = async (vendorId, { limit = 12 } = {}) => {
  const cycles = await SubscriptionCycle.find({ vendorId }).sort({ cycleStart: -1 }).limit(Math.min(50, Number(limit) || 12));
  return cycles.map((c) =>
    summarizeCycle(c, { cycleIndex: c.cycleIndex, cycleStart: c.cycleStart, cycleEnd: c.cycleEnd, displayEnd: new Date(c.cycleEnd.getTime() - 86400000) }, null)
  );
};

/** All counted/reversed orders of one cycle (for a detailed breakdown). */
export const getCycleOrders = async (vendorId, cycleId) => {
  const cycle = await SubscriptionCycle.findOne({ _id: cycleId, vendorId });
  if (!cycle) return null;
  const orders = await OrderUsage.find({ cycleId: cycle._id }).sort({ completedAt: 1 }).lean();
  return { cycle, orders };
};
