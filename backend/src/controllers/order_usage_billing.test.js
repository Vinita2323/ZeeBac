import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Order from '../models/Order.js';
import OrderUsage from '../models/OrderUsage.js';
import SubscriptionCycle from '../models/SubscriptionCycle.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import {
  getCycleWindow,
  recordCompletedOrderUsage,
  reverseOrderUsage,
  recomputeCycleTotals,
  syncVendorUsage,
  getVendorUsageSummary,
} from '../utils/orderUsage.util.js';
import { resolvePlanPrice } from '../utils/subscription.util.js';
import { paySubscriptionFromWallet } from './vendor.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn(async () => ({})) }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const IST = 330 * 60 * 1000;
// Build an instant from IST wall-clock time
const ist = (y, m, d, hh = 0, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh, mm) - IST);
const DAY = 86400000;

const makeVendor = async ({ freeOrders = 3, rate = 6, tier = 'INDEPENDENT', anchor = new Date(Date.now() - 2 * DAY), expiresAt, status = 'ACTIVE', balance = 100 } = {}) => {
  const vendor = await Vendor.create({
    storeName: 'Quota Store',
    ownerName: 'Owner',
    zeebacId: `ZV-${Math.random().toString(36).slice(2, 10)}`,
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    subscription: {
      planType: '1 Month',
      status,
      startDate: anchor,
      cycleAnchor: anchor,
      expiresAt: expiresAt || new Date(Date.now() + 30 * DAY),
      tierCode: tier,
      planName: 'Test tier',
      freeOrdersPerMonth: tier ? freeOrders : null,
      extraChargePerOrder: tier ? rate : 0,
    },
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: 'VEND-T', balance });
  return vendor;
};

let seq = 0;
const fakeOrder = (vendor, at = new Date(), status = 'DELIVERED') => ({
  _id: new mongoose.Types.ObjectId(),
  vendorId: vendor._id,
  orderId: `ORD-T-${++seq}`,
  orderStatus: status,
  riderDetails: { deliveredAt: at },
});

const walletBalance = async (vendorId) => (await Wallet.findOne({ ownerId: vendorId })).balance;
const cycleOf = async (vendorId) => SubscriptionCycle.findOne({ vendorId }).sort({ cycleStart: -1 });

describe('Billing cycle dates (IST, anchored to activation date)', () => {
  it('15 Nov activation → cycle 15 Nov to 14 Dec, resets 15 Dec 00:00 IST', () => {
    const anchor = ist(2026, 11, 15, 15, 30);
    const w = getCycleWindow(anchor, ist(2026, 11, 20));
    expect(w.cycleIndex).toBe(0);
    expect(w.cycleStart.getTime()).toBe(ist(2026, 11, 15).getTime());
    expect(w.cycleEnd.getTime()).toBe(ist(2026, 12, 15).getTime());
    expect(w.displayEnd.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })).toBe('14/12/2026');

    // last minute of 14 Dec IST still in cycle 0; midnight of 15 Dec is cycle 1
    expect(getCycleWindow(anchor, ist(2026, 12, 14, 23, 59)).cycleIndex).toBe(0);
    expect(getCycleWindow(anchor, ist(2026, 12, 15, 0, 0)).cycleIndex).toBe(1);
    // the activation day itself (before the purchase time) belongs to cycle 0
    expect(getCycleWindow(anchor, ist(2026, 11, 15, 0, 1)).cycleIndex).toBe(0);
  });

  it('month-end anchors clamp to the last day and return to the anchor day', () => {
    const anchor = ist(2027, 1, 31, 10);
    expect(getCycleWindow(anchor, ist(2027, 2, 15)).cycleStart.getTime()).toBe(ist(2027, 1, 31).getTime());
    expect(getCycleWindow(anchor, ist(2027, 2, 28, 1)).cycleStart.getTime()).toBe(ist(2027, 2, 28).getTime());
    expect(getCycleWindow(anchor, ist(2027, 3, 31, 1)).cycleStart.getTime()).toBe(ist(2027, 3, 31).getTime());
    expect(getCycleWindow(anchor, ist(2027, 3, 30, 1)).cycleIndex).toBe(1);
    // across a year boundary
    expect(getCycleWindow(ist(2026, 12, 10), ist(2027, 1, 9, 23)).cycleIndex).toBe(0);
    expect(getCycleWindow(ist(2026, 12, 10), ist(2027, 1, 10)).cycleIndex).toBe(1);
  });
});

describe('Counting & extra charges', () => {
  it('first N orders free, every order after that deducts exactly the plan rate from the wallet', async () => {
    const vendor = await makeVendor({ freeOrders: 3, rate: 6, balance: 100 });
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await recordCompletedOrderUsage(fakeOrder(vendor)));

    expect(results.map((r) => r.usage.classification)).toEqual(['FREE', 'FREE', 'FREE', 'EXTRA', 'EXTRA']);
    expect(results.slice(3).every((r) => r.usage.chargeStatus === 'DEDUCTED' && r.usage.chargeAmount === 6)).toBe(true);
    expect(await walletBalance(vendor._id)).toBe(88);

    const txns = await WalletTransaction.find({ ownerId: vendor._id, category: 'extra_order_fee' });
    expect(txns).toHaveLength(2);
    expect(txns.reduce((s, t) => s + t.amount, 0)).toBe(12);

    const c = await cycleOf(vendor._id);
    expect({ free: c.freeUsed, extra: c.extraOrders, total: c.extraChargeTotal }).toEqual({ free: 3, extra: 2, total: 12 });
    expect((await recomputeCycleTotals(c._id)).fixed).toBe(false);
  });

  it('client tiers: 150 free then ₹6 (Independent Seller) — order #151 is the first charged', async () => {
    const vendor = await makeVendor({ freeOrders: 150, rate: 6, balance: 1000 });
    for (let i = 0; i < 152; i += 1) await recordCompletedOrderUsage(fakeOrder(vendor));
    const c = await cycleOf(vendor._id);
    expect(c.freeUsed).toBe(150);
    expect(c.extraOrders).toBe(2);
    expect(c.extraChargeTotal).toBe(12);
    expect(await walletBalance(vendor._id)).toBe(988);
  }, 240000);

  it('duplicate delivered events never double count or double charge', async () => {
    const vendor = await makeVendor({ freeOrders: 0, rate: 5, balance: 50 });
    const order = fakeOrder(vendor);
    await recordCompletedOrderUsage(order);
    const again = await recordCompletedOrderUsage(order);
    await Promise.all([recordCompletedOrderUsage(order), recordCompletedOrderUsage(order), recordCompletedOrderUsage(order)].map((p) => p.catch(() => null)));
    expect(again.duplicate).toBe(true);
    expect(await OrderUsage.countDocuments({ orderId: order._id })).toBe(1);
    expect(await walletBalance(vendor._id)).toBe(45);
    expect(await WalletTransaction.countDocuments({ category: 'extra_order_fee' })).toBe(1);
  });

  it('concurrent deliveries never hand out more free slots than the limit', async () => {
    const vendor = await makeVendor({ freeOrders: 3, rate: 4, balance: 100 });
    const orders = Array.from({ length: 10 }, () => fakeOrder(vendor));
    await Promise.all(orders.map((o) => recordCompletedOrderUsage(o)));
    const c = await cycleOf(vendor._id);
    expect(c.freeUsed).toBe(3);
    expect(c.extraOrders).toBe(7);
    expect(c.extraChargeTotal).toBe(28);
    expect(await walletBalance(vendor._id)).toBe(72);
    expect((await recomputeCycleTotals(c._id)).fixed).toBe(false);
  });

  it('non-delivered orders are never counted', async () => {
    const vendor = await makeVendor();
    for (const st of ['PLACED', 'PENDING', 'REJECTED', 'CANCELLED', 'FAILED', 'CONFIRMED']) {
      const r = await recordCompletedOrderUsage(fakeOrder(vendor, new Date(), st));
      expect(r.skipped).toBeTruthy();
    }
    expect(await OrderUsage.countDocuments()).toBe(0);
  });

  it('charges even when the wallet is short (balance goes negative, nothing skipped)', async () => {
    const vendor = await makeVendor({ freeOrders: 0, rate: 6, balance: 2 });
    await recordCompletedOrderUsage(fakeOrder(vendor));
    expect(await walletBalance(vendor._id)).toBe(-4);
  });

  it('free quota resets at the start of the next cycle', async () => {
    const anchor = new Date(Date.now() - 40 * DAY);
    const vendor = await makeVendor({ freeOrders: 1, rate: 6, anchor, expiresAt: new Date(Date.now() + 30 * DAY) });
    const w0 = getCycleWindow(anchor, anchor);
    const inPrev = new Date(w0.cycleEnd.getTime() - 60000);
    const inNext = new Date(w0.cycleEnd.getTime() + 60000);
    const a = await recordCompletedOrderUsage(fakeOrder(vendor, inPrev));
    const b = await recordCompletedOrderUsage(fakeOrder(vendor, inPrev));
    const c = await recordCompletedOrderUsage(fakeOrder(vendor, inNext));
    expect([a.usage.classification, b.usage.classification, c.usage.classification]).toEqual(['FREE', 'EXTRA', 'FREE']);
    expect(String(a.usage.cycleId)).not.toBe(String(c.usage.cycleId));
    expect(await SubscriptionCycle.countDocuments({ vendorId: vendor._id })).toBe(2);
  });

  it('legacy plan without tier: counted as unlimited, never charged', async () => {
    const vendor = await makeVendor({ tier: null, balance: 10 });
    for (let i = 0; i < 4; i += 1) await recordCompletedOrderUsage(fakeOrder(vendor));
    const c = await cycleOf(vendor._id);
    expect(c.unlimitedOrders).toBe(4);
    expect(c.extraOrders).toBe(0);
    expect(await walletBalance(vendor._id)).toBe(10);
  });

  it('expired subscription: recorded as NO_PLAN, not counted or charged', async () => {
    const vendor = await makeVendor({ freeOrders: 0, anchor: new Date(Date.now() - 40 * DAY), expiresAt: new Date(Date.now() - DAY) });
    const r = await recordCompletedOrderUsage(fakeOrder(vendor));
    expect(r.usage.classification).toBe('NO_PLAN');
    expect(await walletBalance(vendor._id)).toBe(100);
    expect(await SubscriptionCycle.countDocuments()).toBe(0);
  });
});

describe('Refund / return reversal (Option A)', () => {
  it('extra order refunded: charge credited back, order no longer counted, idempotent', async () => {
    const vendor = await makeVendor({ freeOrders: 2, rate: 6, balance: 100 });
    const orders = Array.from({ length: 4 }, () => fakeOrder(vendor));
    for (const o of orders) await recordCompletedOrderUsage(o);
    expect(await walletBalance(vendor._id)).toBe(88);

    const r1 = await reverseOrderUsage({ order: orders[3], reason: 'returned' });
    const r2 = await reverseOrderUsage({ order: orders[3], reason: 'returned again' });
    await Promise.all([reverseOrderUsage({ order: orders[3] }), reverseOrderUsage({ order: orders[3] })]);
    expect(r1).toMatchObject({ reversed: true, classification: 'EXTRA', refundAmount: 6 });
    expect(r2.reversed).toBe(false);
    expect(await walletBalance(vendor._id)).toBe(94);
    expect(await WalletTransaction.countDocuments({ category: 'extra_order_fee_reversal' })).toBe(1);

    const c = await cycleOf(vendor._id);
    expect({ free: c.freeUsed, extra: c.extraOrders, total: c.extraChargeTotal, rev: c.reversedOrders, revAmt: c.reversedChargeTotal }).toEqual({
      free: 2, extra: 1, total: 6, rev: 1, revAmt: 6,
    });
    const summary = await getVendorUsageSummary(vendor._id, { sync: false });
    expect(summary.current.ordersUsed).toBe(3); // one slot came back
    expect((await recomputeCycleTotals(c._id)).fixed).toBe(false);
  });

  it('free order refunded: its slot is restored so the next order is free', async () => {
    const vendor = await makeVendor({ freeOrders: 2, rate: 6, balance: 100 });
    const a = fakeOrder(vendor);
    const b = fakeOrder(vendor);
    await recordCompletedOrderUsage(a);
    await recordCompletedOrderUsage(b);
    await reverseOrderUsage({ order: a, reason: 'refund' });
    const next = await recordCompletedOrderUsage(fakeOrder(vendor));
    expect(next.usage.classification).toBe('FREE');
    expect(await walletBalance(vendor._id)).toBe(100);
    const after = await recordCompletedOrderUsage(fakeOrder(vendor));
    expect(after.usage.classification).toBe('EXTRA');
    expect(await walletBalance(vendor._id)).toBe(94);
  });

  it('reversed order cannot be re-counted by a late duplicate delivered event', async () => {
    const vendor = await makeVendor({ freeOrders: 0, rate: 6, balance: 100 });
    const o = fakeOrder(vendor);
    await recordCompletedOrderUsage(o);
    await reverseOrderUsage({ order: o });
    const dup = await recordCompletedOrderUsage(o);
    expect(dup.duplicate).toBe(true);
    expect(await walletBalance(vendor._id)).toBe(100);
  });

  it('reversing an order that was never counted does nothing', async () => {
    const r = await reverseOrderUsage({ orderId: new mongoose.Types.ObjectId() });
    expect(r.reversed).toBe(false);
  });
});

describe('Self-healing sync', () => {
  it('counts delivered orders that were missed and fixes drifted counters', async () => {
    const vendor = await makeVendor({ freeOrders: 1, rate: 6, balance: 100 });
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await Order.collection.insertMany(
      ids.map((_id, i) => ({
        _id,
        vendorId: vendor._id,
        orderId: `ORD-SYNC-${i}`,
        orderStatus: 'DELIVERED',
        riderDetails: { deliveredAt: new Date(Date.now() - (2 - i) * 60000) },
      }))
    );
    const r = await syncVendorUsage(vendor._id);
    expect(r.counted).toBe(2);
    expect(await walletBalance(vendor._id)).toBe(94);
    const again = await syncVendorUsage(vendor._id);
    expect(again.counted).toBe(0);
    expect(await walletBalance(vendor._id)).toBe(94);

    const c = await cycleOf(vendor._id);
    await SubscriptionCycle.updateOne({ _id: c._id }, { $set: { freeUsed: 9 } });
    const fix = await recomputeCycleTotals(c._id);
    expect(fix.fixed).toBe(true);
    expect((await SubscriptionCycle.findById(c._id)).freeUsed).toBe(1);
  });
});

describe('Plans & purchase snapshot', () => {
  it('seeds the four client tiers with exact prices, limits and rates', async () => {
    await SubscriptionPlan.seedDefaultsIfEmpty();
    const tiers = await SubscriptionPlan.find({ tierCode: { $type: 'string' } }).sort({ sortOrder: 1 }).lean();
    expect(tiers.map((t) => [t.name, t.pricing.independentStore, t.pricing.chainBrand, t.freeOrdersPerMonth, t.extraChargePerOrder])).toEqual([
      ['Independent Seller', 499, 499, 150, 6],
      ['Established Retailers', 799, 799, 200, 5],
      ['Business Enterprise', 999, 999, 300, 4],
      ['Brand/Manufacturer', 1499, 1499, 500, 4],
    ]);
    const info = await resolvePlanPrice('ENTERPRISE', 'Chain & Brand');
    expect(info).toMatchObject({ price: 999, tierCode: 'ENTERPRISE', freeOrdersPerMonth: 300, extraChargePerOrder: 4, durationDays: 30 });
  });

  it('wallet purchase snapshots the tier and anchors the cycle on the activation date', async () => {
    await SubscriptionPlan.seedDefaultsIfEmpty();
    const plan = await SubscriptionPlan.findOne({ tierCode: 'ESTABLISHED' });
    const vendor = await Vendor.create({ storeName: 'Buyer', ownerName: 'O', zeebacId: 'ZV-BUYER', phone: '9876500001', status: 'Verified', shopType: 'Independent Store' });
    await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: 'V', balance: 1000 });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await paySubscriptionFromWallet({ user: { id: vendor._id }, body: { planId: String(plan._id) } }, res);
    expect(res.status).toHaveBeenCalledWith(200);

    const v = await Vendor.findById(vendor._id);
    expect(v.subscription).toMatchObject({ status: 'ACTIVE', tierCode: 'ESTABLISHED', freeOrdersPerMonth: 200, extraChargePerOrder: 5, price: 799 });
    expect(v.subscription.cycleAnchor.getTime()).toBe(v.subscription.startDate.getTime());
    expect(await walletBalance(vendor._id)).toBe(201);

    // admin later edits the plan: the active vendor keeps the limits they bought
    await SubscriptionPlan.updateOne({ _id: plan._id }, { $set: { freeOrdersPerMonth: 10, extraChargePerOrder: 50 } });
    const u = await recordCompletedOrderUsage(fakeOrder(v));
    expect(u.usage.classification).toBe('FREE');
    expect((await cycleOf(v._id)).freeLimit).toBe(200);
  });
});
