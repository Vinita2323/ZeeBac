/**
 * Zeebac Points – cancellation penalty & redemption rules.
 *
 * 1. COD delivery order returned by the rider AFTER it is Out for Delivery (customer not
 *    answering, not found, not available, refused): the full order amount (totalAmount) is
 *    deducted as points. Customers themselves can only cancel before the store accepts.
 *    Before Out for Delivery → no deduction.
 * 2. If the customer does not have enough points the balance goes negative (e.g. 0 → -100).
 * 3. A customer can redeem points only when their balance is at least the minimum (default 100).
 */
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import RewardConfig from '../models/RewardConfig.js';
import User from '../models/User.js';
import { r2 } from './orderPricing.util.js';

export const LATE_CANCEL_STAGES = ['OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'];
export const DEFAULT_MIN_REDEEMABLE_POINTS = 100;

const RESTAURANT_RE = /restaurant|caf[eé]|dining|cloud\s*kitchen|dhaba|eatery|bakery|sweet\s*shop|fast\s*food|food\s*court|\bqsr\b|instant\s*food/i;

/** Restaurant / instant food store? Grocery & packaged-food stores are NOT restaurants. */
export const isRestaurantVendor = (vendor) => {
  if (!vendor) return false;
  const text = [vendor.category, vendor.subCategory, vendor.businessCategory, vendor.storeType].filter(Boolean).join(' ');
  return RESTAURANT_RE.test(text);
};

export const isCodDeliveryOrder = (order) =>
  order?.fulfillmentType === 'delivery' && ['CASH', 'COD', 'Cash'].includes(order?.paymentMethod);

/**
 * What a cancel/return would cost the customer right now (pure, no DB writes).
 * @returns {{ applies: boolean, amount: number, basis: 'ENTIRE_ORDER'|'DELIVERY_CHARGE'|null, reason: string }}
 */
export const computeLateCancellationPenalty = (order, vendor) => {
  if (!isCodDeliveryOrder(order)) return { applies: false, amount: 0, basis: null, reason: 'Not a cash-on-delivery delivery order' };
  if (!LATE_CANCEL_STAGES.includes(order.orderStatus)) {
    return { applies: false, amount: 0, basis: null, reason: 'Order is not out for delivery yet — no points deducted' };
  }
  // Client decision (28 Nov 2026): the full order amount is deducted for every store type.
  const amount = r2(order.totalAmount);
  return {
    applies: amount > 0,
    amount,
    basis: 'ENTIRE_ORDER',
    reason: 'Order returned after Out for Delivery (customer unavailable / refused) — full order amount deducted as points',
  };
};

/**
 * Deducts the late-cancellation penalty from the customer's points. Balance may go negative.
 * Idempotent per order (order.lateCancellationPenalty.applied + unique WalletTransaction key).
 * Mutates order.lateCancellationPenalty — caller saves the order (same session).
 * Must be called BEFORE orderStatus is changed to CANCELLED / FAILED_DELIVERY.
 */
export const applyLateCancellationPenalty = async ({ order, vendor, session = null, actor = 'CUSTOMER' }) => {
  if (order.lateCancellationPenalty?.applied) return { applied: false, duplicate: true, amount: order.lateCancellationPenalty.amount };
  const p = computeLateCancellationPenalty(order, vendor);
  const stage = order.orderStatus;
  if (!p.applies) {
    order.lateCancellationPenalty = { applied: false, amount: 0, basis: p.basis, stage, reason: p.reason };
    return { applied: false, amount: 0, reason: p.reason };
  }

  const opts = session ? { session } : {};
  const customer = await User.findById(order.customerId).select('zeebacId').session(session || null);
  const ownerType = { $in: ['User', 'user', 'Customer', 'customer'] };
  // Upsert without any welcome balance: a missing wallet starts at 0 and goes to -amount.
  const wallet = await Wallet.findOneAndUpdate(
    { ownerId: order.customerId, ownerType },
    { $inc: { balance: -p.amount }, $setOnInsert: { ownerType: 'User', ownerZeebacId: customer?.zeebacId || 'USER' } },
    { ...opts, upsert: true, new: true }
  );
  await WalletTransaction.create(
    [
      {
        walletId: wallet._id,
        ownerId: order.customerId,
        ownerType: 'User',
        type: 'debit',
        category: 'cancellation_penalty',
        amount: p.amount,
        balanceAfter: r2(wallet.balance),
        referenceId: order._id,
        referenceType: 'Order',
        description: `${p.amount} points deducted: Order ${order.orderId} returned after Out for Delivery (full order amount)`,
        idempotencyKey: `LATE_CANCEL_PENALTY:${order._id}`,
      },
    ],
    opts
  );

  order.lateCancellationPenalty = {
    applied: true,
    amount: p.amount,
    basis: p.basis,
    stage,
    actor,
    reason: p.reason,
    appliedAt: new Date(),
    balanceAfter: r2(wallet.balance),
  };
  return { applied: true, amount: p.amount, basis: p.basis, balanceAfter: r2(wallet.balance) };
};

// ─── Minimum redemption ─────────────────────────────────────────────────────

export const getMinRedeemablePoints = async () => {
  const cfg = await RewardConfig.findOne().select('minRedeemablePoints').lean();
  const v = Number(cfg?.minRedeemablePoints);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_REDEEMABLE_POINTS;
};

/** null when allowed, otherwise a customer-facing message. */
export const redemptionBlockedReason = (balance, minPoints) => {
  const bal = r2(balance || 0);
  if (bal < minPoints) {
    return `You need at least ${minPoints} Zeebac Points to redeem. Your balance is ${bal} points.`;
  }
  return null;
};
