import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import PointsTopupRequest from '../models/PointsTopupRequest.js';
import Order from '../models/Order.js';
import {
  creditWallet,
  debitWallet,
  debitVendorCashbackCoins,
  getVendorCoinSummary,
  InsufficientBalanceError,
} from '../utils/wallet.util.js';
import { settleDeliveredOrderCoins } from '../utils/coinFlows.util.js';
import { submitTopupRequest, approveTopupRequest, rejectTopupRequest } from '../utils/pointsTopup.util.js';
import { runInTransaction } from '../utils/sellerSettlement.util.js';
import { computeSellerShare } from '../utils/orderPricing.util.js';
import { requestWithdrawal } from './vendor.controller.js';
import { processPayout } from './admin.controller.js';
import { processWalletPayment } from './user.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn(async () => ({})) }));
vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: () => {} }) }) }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const oid = () => new mongoose.Types.ObjectId();
let seq = 0;
const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

const makeVendor = async ({ purchased = 0, earned = 0, cash = 0, extra = {} } = {}) => {
  seq += 1;
  const _id = oid();
  await mongoose.connection.collection('vendors').insertOne({
    _id, zeebacId: `ZBV-C${seq}`, phone: `95000${seq}`, storeName: `Store ${seq}`, status: 'Verified', cashbackRate: 10,
    bankDetails: { accountNumber: '1234567890', ifscCode: 'HDFC0001', bankName: 'HDFC', isVerified: true, upiId: 's@upi' }, ...extra,
  });
  await Wallet.create({
    ownerId: _id, ownerType: 'Vendor', ownerZeebacId: `ZBV-C${seq}`,
    balance: purchased + earned + cash, purchasedPoints: purchased, earnedCoins: earned, cashEarnings: cash, bucketsVersion: 1,
  });
  return _id;
};
const makeCustomer = async (balance = 0) => {
  seq += 1;
  const _id = oid();
  await mongoose.connection.collection('users').insertOne({ _id, zeebacId: `ZBC-C${seq}`, phone: `96000${seq}`, name: `Cust ${seq}`, role: 'customer' });
  await Wallet.create({ ownerId: _id, ownerType: 'User', ownerZeebacId: `ZBC-C${seq}`, balance });
  return _id;
};
const W = async (ownerId) => Wallet.findOne({ ownerId }).lean();
const buckets = async (ownerId) => {
  const w = await W(ownerId);
  return { balance: w.balance, purchased: w.purchasedPoints, earned: w.earnedCoins, cash: w.cashEarnings };
};
const expectConsistent = async (ownerId) => {
  const b = await buckets(ownerId);
  expect(Math.round((b.purchased + b.earned + b.cash) * 100) / 100).toBe(b.balance);
  expect(b.purchased).toBeGreaterThanOrEqual(0);
  expect(b.earned).toBeGreaterThanOrEqual(0);
  expect(b.cash).toBeGreaterThanOrEqual(0);
};

describe('Cashback funding', () => {
  it('uses earned coins first, then purchased; never cash earnings', async () => {
    const v = await makeVendor({ purchased: 100, earned: 30, cash: 500 });
    const r = await runInTransaction((s) => debitVendorCashbackCoins({ session: s, vendorId: v, amount: 50, description: 'cb' }));
    expect(r).toMatchObject({ amount: 50, split: { earnedCoins: 30, purchasedPoints: 20 } });
    expect(await buckets(v)).toEqual({ balance: 580, purchased: 80, earned: 0, cash: 500 });
    await expectConsistent(v);
  });

  it('stops at zero coins: funds only what exists, never goes negative', async () => {
    const v = await makeVendor({ purchased: 15, cash: 1000 });
    const r = await runInTransaction((s) => debitVendorCashbackCoins({ session: s, vendorId: v, amount: 40, description: 'cb' }));
    expect(r.amount).toBe(15);
    const again = await runInTransaction((s) => debitVendorCashbackCoins({ session: s, vendorId: v, amount: 40, description: 'cb' }));
    expect(again.amount).toBe(0);
    expect(await buckets(v)).toEqual({ balance: 1000, purchased: 0, earned: 0, cash: 1000 });
  });

  it('strict cashback debit refuses instead of going negative', async () => {
    const v = await makeVendor({ purchased: 5, cash: 999 });
    await expect(runInTransaction((s) => debitWallet({ session: s, ownerId: v, ownerType: 'Vendor', amount: 10, category: 'cashback', allowNegativeBalance: true, description: 'x' }))).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect((await W(v)).balance).toBe(1004);
  });

  it('concurrent cashback never overdraws coins', async () => {
    const v = await makeVendor({ purchased: 100 });
    const results = await Promise.all(
      Array.from({ length: 12 }, () => runInTransaction((s) => debitVendorCashbackCoins({ session: s, vendorId: v, amount: 10, description: 'cb' })).catch(() => ({ amount: 0 })))
    );
    const total = results.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(100);
    expect(await buckets(v)).toEqual({ balance: 0, purchased: 0, earned: 0, cash: 0 });
  });

  it('legacy (unmigrated) wallets keep the old behaviour', async () => {
    const _id = oid();
    await Wallet.create({ ownerId: _id, ownerType: 'Vendor', ownerZeebacId: 'L', balance: 5 });
    const r = await runInTransaction((s) => debitVendorCashbackCoins({ session: s, vendorId: _id, amount: 20, description: 'cb', allowNegativeBalance: true }));
    expect(r.amount).toBe(20);
    expect((await W(_id)).balance).toBe(-15);
  });
});

describe('Delivered order: cashback + redemption credit to the accepting store', () => {
  const makeOrder = async ({ storeId, issuerId = storeId, customerId, points = 0, cashback = 0, itemTotal = 500 }) => {
    const _id = oid();
    await Order.collection.insertOne({
      _id, orderId: `ORD-C${++seq}`, vendorId: storeId, customerId, orderStatus: 'DELIVERED', fulfillmentType: 'delivery',
      paymentMethod: 'CASH', itemTotal, packagingCharge: 0, deliveryCharge: 40, totalAmount: itemTotal + 40,
      pointsRedeemed: points, finalPayableAmount: itemTotal + 40 - points, totalCashbackPoints: cashback,
      storeName: 'S', vendorZeebacId: 'Z', customerName: 'C', customerPhone: '9', items: [],
    });
    return Order.findById(_id);
  };

  it('Store B gets the redeemed coins as earned coins (once); cashback funded by Store B coins', async () => {
    const storeB = await makeVendor({ purchased: 50 });
    const cust = await makeCustomer(0);
    const order = await makeOrder({ storeId: storeB, customerId: cust, points: 200, cashback: 30 });

    const r1 = await settleDeliveredOrderCoins(order);
    expect(r1).toMatchObject({ cashbackIssued: 30, redemptionCredited: 200 });
    const again = await settleDeliveredOrderCoins(await Order.findById(order._id));
    expect(again).toMatchObject({ cashbackIssued: 0, redemptionCredited: 0 });

    expect(await buckets(storeB)).toEqual({ balance: 220, purchased: 20, earned: 200, cash: 0 });
    expect((await W(cust)).balance).toBe(30);
    await expectConsistent(storeB);
    const saved = await Order.findById(order._id);
    expect(saved).toMatchObject({ cashbackIssued: 30, redemptionCoinsCredited: 200, cashbackSettled: true });
  });

  it('store with no coins: customer cashback stops, shortfall recorded, no negative', async () => {
    const store = await makeVendor({ cash: 800 });
    const cust = await makeCustomer(0);
    const order = await makeOrder({ storeId: store, customerId: cust, cashback: 25 });
    const r = await settleDeliveredOrderCoins(order);
    expect(r.cashbackIssued).toBe(0);
    expect((await W(cust)).balance).toBe(0);
    expect((await Order.findById(order._id)).cashbackShortfall).toBe(25);
    expect(await buckets(store)).toEqual({ balance: 800, purchased: 0, earned: 0, cash: 800 });
  });

  it('only the item part of redeemed points goes to the store (coins covering delivery are not store revenue)', async () => {
    const store = await makeVendor({});
    const cust = await makeCustomer(0);
    const order = await makeOrder({ storeId: store, customerId: cust, points: 520, itemTotal: 500 });
    await settleDeliveredOrderCoins(order);
    expect((await buckets(store)).earned).toBe(500);
  });
});

describe('Commission (Option B: cash part only)', () => {
  it('₹1000 items, 200 coins, 10% → commission ₹80, cash payout ₹720', () => {
    const share = computeSellerShare({ order: { itemTotal: 1000, packagingCharge: 0, pointsRedeemed: 200, finalPayableAmount: 840 }, commissionPercent: 10 });
    expect(share).toMatchObject({ coinPortion: 200, cashPortion: 800, commissionAmount: 80, sellerPayable: 720 });
  });
  it('fully coin-paid order → no commission, no cash payout (store gets coins)', () => {
    const share = computeSellerShare({ order: { itemTotal: 300, pointsRedeemed: 300 }, commissionPercent: 10 });
    expect(share).toMatchObject({ commissionAmount: 0, sellerPayable: 0, coinPortion: 300 });
  });
});

describe('Customer pays a store with coins', () => {
  it('store gets earned coins (not cash), cashback funded from its coins, no vendor fee', async () => {
    const store = await makeVendor({ purchased: 100 });
    const cust = await makeCustomer(500);
    const res = makeRes();
    await processWalletPayment({ user: { id: String(cust) }, body: { vendorZeebacId: (await mongoose.connection.collection('vendors').findOne({ _id: store })).zeebacId, amount: 200 } }, res);
    expect(res.statusCode).toBe(200);
    // 200 coins in as earned; 20 cashback taken earned-first → earned 180, purchased 100
    expect(await buckets(store)).toEqual({ balance: 280, purchased: 100, earned: 180, cash: 0 });
    expect((await W(cust)).balance).toBe(320); // 500 - 200 + 20
    expect(getVendorCoinSummary(await W(store)).withdrawable).toBe(100);
  });

  it('needs at least 100 coins', async () => {
    const store = await makeVendor({});
    const cust = await makeCustomer(60);
    const res = makeRes();
    await processWalletPayment({ user: { id: String(cust) }, body: { vendorZeebacId: (await mongoose.connection.collection('vendors').findOne({ _id: store })).zeebacId, amount: 50 } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('MIN_REDEEM_BALANCE');
  });
});

describe('Withdrawal', () => {
  it('only purchased + cash are withdrawable; earned coins never; reject restores the exact split', async () => {
    const v = await makeVendor({ purchased: 300, earned: 1000, cash: 200 });
    const tooMuch = makeRes();
    await requestWithdrawal({ user: { id: String(v) }, body: { amount: 600, upiId: 's@upi' } }, tooMuch);
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.body.code).toBe('EXCEEDS_WITHDRAWABLE');

    const ok = makeRes();
    await requestWithdrawal({ user: { id: String(v) }, body: { amount: 350, upiId: 's@upi' } }, ok);
    expect(ok.statusCode).toBe(201);
    // cash first (200), then purchased (150)
    expect(await buckets(v)).toEqual({ balance: 1150, purchased: 150, earned: 1000, cash: 0 });
    const wr = await WithdrawalRequest.findOne({ vendorId: v });
    expect(wr.bucketSplit).toMatchObject({ cashEarnings: 200, purchasedPoints: 150 });

    const rej = makeRes();
    await processPayout({ params: { id: String(wr._id) }, user: { id: String(oid()), role: 'admin' }, body: { type: 'Vendor', action: 'Reject', remarks: 'test' } }, rej);
    expect(await buckets(v)).toEqual({ balance: 1500, purchased: 300, earned: 1000, cash: 200 });
    await expectConsistent(v);
  });
});

describe('UPI top-up approval', () => {
  const owner = async (vId) => ({ _id: vId, zeebacId: 'Z', storeName: 'S', phone: '9' });

  it('pending → approved credits purchased coins exactly once, even with concurrent approvals', async () => {
    const v = await makeVendor({});
    const req = await submitTopupRequest({ ownerType: 'Vendor', owner: await owner(v), utr: '123456789012', amount: 500 });
    expect(req.status).toBe('PENDING');
    expect((await W(v)).balance).toBe(0);

    const results = await Promise.allSettled([1, 2, 3].map(() => approveTopupRequest({ requestId: req._id, adminId: oid() })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await buckets(v)).toEqual({ balance: 500, purchased: 500, earned: 0, cash: 0 });
    expect(await WalletTransaction.countDocuments({ category: 'reserve_topup' })).toBe(1);
  });

  it('a UTR can back only one request; rejection frees it for a genuine resubmission', async () => {
    const v = await makeVendor({});
    const r1 = await submitTopupRequest({ ownerType: 'Vendor', owner: await owner(v), utr: '222233334444', amount: 100 });
    await expect(submitTopupRequest({ ownerType: 'Vendor', owner: await owner(v), utr: '222233334444', amount: 100 })).rejects.toMatchObject({ code: 'DUPLICATE_UTR' });
    await rejectTopupRequest({ requestId: r1._id, adminId: oid(), note: 'not found in statement' });
    await expect(approveTopupRequest({ requestId: r1._id, adminId: oid() })).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
    const r2 = await submitTopupRequest({ ownerType: 'Vendor', owner: await owner(v), utr: '222233334444', amount: 100 });
    expect(r2.status).toBe('PENDING');
    expect((await W(v)).balance).toBe(0);
  });

  it('rejects malformed UTRs and customer top-ups go through the same approval', async () => {
    const c = await makeCustomer(0);
    await expect(submitTopupRequest({ ownerType: 'User', owner: { _id: c }, utr: '12345', amount: 50 })).rejects.toMatchObject({ code: 'INVALID_UTR' });
    const r = await submitTopupRequest({ ownerType: 'User', owner: { _id: c }, utr: '999988887777', amount: 50 });
    expect((await W(c)).balance).toBe(0);
    await approveTopupRequest({ requestId: r._id, adminId: oid() });
    expect((await W(c)).balance).toBe(50);
    expect(await PointsTopupRequest.countDocuments({ status: 'APPROVED' })).toBe(1);
  });
});

describe('Money credits land in the right bucket', () => {
  it('QR payment → cash earnings; Razorpay coin top-up → purchased; refund of cashback → earned', async () => {
    const v = await makeVendor({});
    await runInTransaction(async (s) => {
      await creditWallet({ session: s, ownerId: v, ownerType: 'Vendor', amount: 400, category: 'payment_received', description: 'qr' });
      await creditWallet({ session: s, ownerId: v, ownerType: 'Vendor', amount: 250, category: 'settlement', description: 'rzp topup' });
      await creditWallet({ session: s, ownerId: v, ownerType: 'Vendor', amount: 15, category: 'refund', description: 'cb reversal' });
    });
    expect(await buckets(v)).toEqual({ balance: 665, purchased: 250, earned: 15, cash: 400 });
    const txs = await WalletTransaction.find({ ownerId: v }).sort({ createdAt: 1 }).lean();
    expect(txs.map((t) => t.bucketSplit)).toEqual([
      expect.objectContaining({ cashEarnings: 400 }),
      expect.objectContaining({ purchasedPoints: 250 }),
      expect.objectContaining({ earnedCoins: 15 }),
    ]);
  });

  it('subscription / fees are paid with money only (cash then purchased), never earned coins', async () => {
    const v = await makeVendor({ purchased: 100, earned: 5000, cash: 50 });
    await expect(runInTransaction((s) => debitWallet({ session: s, ownerId: v, ownerType: 'Vendor', amount: 499, category: 'subscription', description: 'sub' }))).rejects.toBeInstanceOf(InsufficientBalanceError);
    await runInTransaction((s) => debitWallet({ session: s, ownerId: v, ownerType: 'Vendor', amount: 120, category: 'subscription', description: 'sub' }));
    expect(await buckets(v)).toEqual({ balance: 5030, purchased: 30, earned: 5000, cash: 0 });
  });

  it('new vendor wallets start at 0 (no free starting balance) with buckets on', async () => {
    const vId = oid();
    await runInTransaction((s) => creditWallet({ session: s, ownerId: vId, ownerType: 'Vendor', ownerZeebacId: 'NEW', amount: 10, category: 'payment_received', description: 'first' }));
    expect(await buckets(vId)).toEqual({ balance: 10, purchased: 0, earned: 0, cash: 10 });
    expect((await W(vId)).bucketsVersion).toBe(1);
  });
});
