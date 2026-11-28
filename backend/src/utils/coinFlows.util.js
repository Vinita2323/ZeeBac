/**
 * Zeebac coin movements tied to orders and store bills.
 *
 *  Cashback   : coins leave the ISSUING store's wallet (earned first, then purchased) and the
 *               customer is credited exactly what was funded. When the store runs out of coins
 *               the cashback stops — no negative balance, no debt (migrated wallets).
 *  Redemption : coins the customer spends at a store are credited to THAT store's earnedCoins
 *               (not money; never withdrawable; usable for the store's own cashback).
 *
 * Every step is claimed in the database first (order flag / unique key), so retries and
 * duplicate events never double-credit.
 */
import mongoose from 'mongoose';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { creditWallet, debitVendorCashbackCoins } from './wallet.util.js';
import { recordCashbackIssuance } from './cashbackSettlement.util.js';
import { runInTransaction } from './sellerSettlement.util.js';
import { r2 } from './orderPricing.util.js';

const opts = (session) => (session ? { session } : {});

/** Coins from a customer's order that belong to the store: the item + packaging part only. */
export const storeShareOfRedeemedPoints = (order) =>
  r2(Math.min(Number(order.pointsRedeemed || 0), Number(order.itemTotal || 0) + Number(order.packagingCharge || 0)));

/**
 * Credit `coins` to the accepting store's earnedCoins once per `key`.
 * Returns the coins credited (0 if already credited).
 */
export const creditStoreForRedemption = async ({ vendorId, coins, key, description, referenceId, referenceType, session }) => {
  const amount = r2(coins);
  if (!(amount > 0)) return 0;
  const idempotencyKey = `POINTS_REDEEMED:${key}`;
  const exists = await WalletTransaction.findOne({ idempotencyKey }).session(session || null);
  if (exists) return 0;
  const vendor = await Vendor.findById(vendorId).select('zeebacId').session(session || null);
  await creditWallet({
    session,
    ownerId: vendorId,
    ownerType: 'Vendor',
    ownerZeebacId: vendor?.zeebacId,
    amount,
    category: 'points_redeemed',
    description,
    referenceId,
    referenceType,
    idempotencyKey, // unique index: a concurrent duplicate aborts its transaction
  });
  return amount;
};

const settleInSession = async (order, session) => {
  const Order = mongoose.model('Order');
  const result = { cashbackPromised: r2(order.totalCashbackPoints || 0), cashbackIssued: 0, redemptionCredited: 0 };

  // ── 1. Cashback (issuing store → customer) ──
  if (result.cashbackPromised > 0) {
    const claim = await Order.updateOne({ _id: order._id, cashbackSettled: { $ne: true } }, { $set: { cashbackSettled: true, settledAt: new Date() } }, opts(session));
    if (claim.modifiedCount) {
      const [customer, vendor] = await Promise.all([
        User.findById(order.customerId).session(session || null),
        Vendor.findById(order.vendorId).select('zeebacId storeName').session(session || null),
      ]);
      const funded = await debitVendorCashbackCoins({
        session,
        vendorId: order.vendorId,
        ownerZeebacId: vendor?.zeebacId,
        amount: result.cashbackPromised,
        category: 'cashback_payout',
        description: `Cashback coins for Order ${order.orderId}`,
        referenceId: order._id,
        referenceType: 'Order',
        allowNegativeBalance: true, // legacy (unmigrated) wallets only — migrated wallets never go negative
      });
      result.cashbackIssued = funded.amount;
      if (funded.amount > 0 && customer) {
        await creditWallet({
          session,
          ownerId: customer._id,
          ownerType: 'User',
          ownerZeebacId: customer.zeebacId,
          amount: funded.amount,
          category: 'cashback',
          description: `Earned ${funded.amount} Zeebac Points on Order ${order.orderId}`,
          referenceId: order._id,
          referenceType: 'Order',
        });
        await recordCashbackIssuance({
          vendorId: order.vendorId,
          amount: funded.amount,
          customer,
          orderId: order.orderId,
          paymentMethod: order.paymentMethod,
          eligiblePaidAmount: order.finalPayableAmount,
          referenceId: order._id,
          referenceType: 'Order',
          session,
        });
      }
      order.cashbackSettled = true;
      order.settledAt = new Date();
      order.cashbackIssued = result.cashbackIssued;
      order.cashbackShortfall = r2(result.cashbackPromised - result.cashbackIssued);
      await Order.updateOne(
        { _id: order._id },
        { $set: { cashbackIssued: order.cashbackIssued, cashbackShortfall: order.cashbackShortfall } },
        opts(session)
      );
    }
  }

  // ── 2. Redemption (customer coins → accepting store's earnedCoins) ──
  const storeCoins = storeShareOfRedeemedPoints(order);
  if (storeCoins > 0) {
    const claim = await Order.updateOne(
      { _id: order._id, redemptionCoinsCredited: { $in: [null, 0] } },
      { $set: { redemptionCoinsCredited: storeCoins } },
      opts(session)
    );
    if (claim.modifiedCount) {
      result.redemptionCredited = await creditStoreForRedemption({
        vendorId: order.vendorId,
        coins: storeCoins,
        key: `ORDER:${order._id}`,
        description: `${storeCoins} coins redeemed by customer on Order ${order.orderId}`,
        referenceId: order._id,
        referenceType: 'Order',
        session,
      });
      order.redemptionCoinsCredited = storeCoins;
    }
  }
  return result;
};

/** Run at DELIVERED (both the store-handover and rider paths). Pass the caller's session if any. */
export const settleDeliveredOrderCoins = async (order, { session = null } = {}) =>
  session ? settleInSession(order, session) : runInTransaction((s) => settleInSession(order, s));
