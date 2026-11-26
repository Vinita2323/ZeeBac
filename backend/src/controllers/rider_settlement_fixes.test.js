import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import DeliveryPartner from '../models/DeliveryPartner.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';
import Order from "../models/Order.js";
import { sweepInactiveRiders } from "../utils/riderPresence.util.js";
import deliveryRouter from '../routes/delivery.routes.js';
import {
  withdrawDeliveryEarnings,
  depositDeliveryCash,
  adminSettleRiderCash,
  adminProcessRiderWithdrawal,
  adminVerifyRiderCashDeposit,
  adminGetRiderSettlementRequests,
  adminGetRiderCashLedgerSummary,
  adminGetRiderCashLedger,
  adminGetRiderEarningsSummary,
  adminGetRiderEarningsLedger,
  acceptDeliveryOrder,
  deliveryLogout,
} from './delivery.controller.js';

let mongod;

const call = async (handler, req) => {
  const out = {};
  const res = {
    status(c) { out.code = c; return this; },
    json(d) { out.body = d; return this; },
  };
  await handler(req, res);
  return out;
};

const admin = { id: new mongoose.Types.ObjectId().toString(), role: 'admin', name: 'Test Admin' };
let seq = 0;
const makeRider = (overrides = {}) => {
  seq += 1;
  return DeliveryPartner.create({
    riderId: `DLV-FIX-${seq}`,
    name: `Rider ${seq}`,
    phone: `90000000${String(seq).padStart(2, '0')}`,
    applicationStatus: 'APPROVED',
    totalEarnings: 1000,
    cashInHand: 0,
    bankDetails: { upiId: 'rider@upi' },
    ...overrides,
  });
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await DeliveryPayoutConfig.create({ baseFare: 30, perKmRate: 10, minPayout: 30, maxCashInHandLimit: 1500 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Bug 1: admin cash settlement is not reachable from rider routes', () => {
  it('delivery router has no settle-cash route', () => {
    const paths = deliveryRouter.stack.filter((l) => l.route).map((l) => l.route.path);
    expect(paths.some((p) => p.includes('settle-cash'))).toBe(false);
    expect(paths).toContain('/withdraw');
    expect(paths).toContain('/deposit-cash');
  });
});

describe('Bug 2: withdrawals stay PENDING until admin pays', () => {
  it('creates a PENDING request and holds the amount', async () => {
    const rider = await makeRider();
    const r = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 300 } });
    expect(r.code).toBe(200);
    expect(r.body.data.status).toBe('PENDING');
    expect(r.body.message).not.toMatch(/successfully initiated/i);

    const fresh = await DeliveryPartner.findById(rider._id);
    expect(fresh.totalEarnings).toBe(700);
    expect(fresh.earningsLedger[0].type).toBe('WITHDRAWAL');
    expect(fresh.earningsLedger[0].status).toBe('PENDING');
  });

  it('rejects invalid amounts', async () => {
    const rider = await makeRider();
    for (const amount of [-50, 0, 'abc', { $gt: 0 }, Infinity, undefined]) {
      const r = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount } });
      expect(r.code).toBe(400);
    }
    const r = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 5000 } });
    expect(r.code).toBe(400);
    expect((await DeliveryPartner.findById(rider._id)).totalEarnings).toBe(1000);
  });

  it('parallel requests cannot overdraw earnings', async () => {
    const rider = await makeRider({ totalEarnings: 500 });
    const req = () => call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 400 } });
    const results = await Promise.all([req(), req(), req()]);
    expect(results.filter((r) => r.code === 200)).toHaveLength(1);
    const fresh = await DeliveryPartner.findById(rider._id);
    expect(fresh.totalEarnings).toBe(100);
    expect(fresh.earningsLedger.filter((e) => e.type === 'WITHDRAWAL')).toHaveLength(1);
  });

  it('admin approves ONLINE only with a UTR, and cannot process twice', async () => {
    const rider = await makeRider();
    const w = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 200 } });
    const params = { id: rider._id.toString(), requestId: w.body.data.requestId.toString() };

    const noUtr = await call(adminProcessRiderWithdrawal, { user: admin, params, body: { action: 'Approve', payoutMethod: 'ONLINE' } });
    expect(noUtr.code).toBe(400);

    const ok = await call(adminProcessRiderWithdrawal, { user: admin, params, body: { action: 'Approve', payoutMethod: 'ONLINE', utr: 'UTR123456789' } });
    expect(ok.code).toBe(200);
    expect(ok.body.data.request.status).toBe('COMPLETED');
    expect(ok.body.data.request.utr).toBe('UTR123456789');

    const again = await call(adminProcessRiderWithdrawal, { user: admin, params, body: { action: 'Reject' } });
    expect(again.code).toBe(400);
    expect((await DeliveryPartner.findById(rider._id)).totalEarnings).toBe(800);
  });

  it('admin can pay in CASH without UTR', async () => {
    const rider = await makeRider();
    const w = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 150 } });
    const ok = await call(adminProcessRiderWithdrawal, {
      user: admin,
      params: { id: rider._id.toString(), requestId: w.body.data.requestId.toString() },
      body: { action: 'Approve', payoutMethod: 'CASH' },
    });
    expect(ok.code).toBe(200);
    expect(ok.body.data.request.payoutMethod).toBe('CASH');
  });

  it('admin reject refunds the held amount', async () => {
    const rider = await makeRider();
    const w = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 250 } });
    const r = await call(adminProcessRiderWithdrawal, {
      user: admin,
      params: { id: rider._id.toString(), requestId: w.body.data.requestId.toString() },
      body: { action: 'Reject', remarks: 'Bank details wrong' },
    });
    expect(r.code).toBe(200);
    const fresh = await DeliveryPartner.findById(rider._id);
    expect(fresh.totalEarnings).toBe(1000);
    expect(fresh.earningsLedger[0].status).toBe('REJECTED');
  });
});

describe('Bug 3 & 4: UPI cash deposit stays PENDING and cannot be manipulated', () => {
  it('UPI deposit does not reduce cashInHand until admin verifies', async () => {
    const rider = await makeRider({ cashInHand: 800, totalEarnings: 0 });
    const r = await call(depositDeliveryCash, {
      user: { id: rider._id.toString() },
      body: { amount: 800, paymentMethod: 'UPI', referenceId: 'UPIREF000111' },
    });
    expect(r.code).toBe(200);
    expect(r.body.data.status).toBe('PENDING');
    expect(r.body.data.cashInHand).toBe(800);
    expect(r.body.data.canWithdraw).toBe(false);

    const blocked = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 10 } });
    expect(blocked.code).toBe(403);

    const v = await call(adminVerifyRiderCashDeposit, {
      user: admin,
      params: { id: rider._id.toString(), depositId: r.body.data.depositId.toString() },
      body: { action: 'Approve' },
    });
    expect(v.code).toBe(200);
    const fresh = await DeliveryPartner.findById(rider._id);
    expect(fresh.cashInHand).toBe(0);
    expect(fresh.cashDepositHistory[0].status).toBe('COMPLETED');
    expect(fresh.cashDepositHistory[0].verifiedBy).toBe('Test Admin');
  });

  it('rejected UPI deposit leaves cashInHand unchanged', async () => {
    const rider = await makeRider({ cashInHand: 300 });
    const r = await call(depositDeliveryCash, {
      user: { id: rider._id.toString() },
      body: { amount: 300, paymentMethod: 'UPI', utr: 'FAKEUTR99999' },
    });
    const v = await call(adminVerifyRiderCashDeposit, {
      user: admin,
      params: { id: rider._id.toString(), depositId: r.body.data.depositId.toString() },
      body: { action: 'Reject', note: 'Not received' },
    });
    expect(v.code).toBe(200);
    const fresh = await DeliveryPartner.findById(rider._id);
    expect(fresh.cashInHand).toBe(300);
    expect(fresh.cashDepositHistory[0].status).toBe('REJECTED');
  });

  it('requires a UTR, rejects reused UTRs and over-claiming', async () => {
    const rider = await makeRider({ cashInHand: 500 });
    const other = await makeRider({ cashInHand: 500 });
    const u = (id, body) => call(depositDeliveryCash, { user: { id: id.toString() }, body: { paymentMethod: 'UPI', ...body } });

    expect((await u(rider._id, { amount: 100 })).code).toBe(400);
    expect((await u(rider._id, { amount: 100, utr: { $ne: '' } })).code).toBe(400);

    expect((await u(rider._id, { amount: 500, utr: 'DUPUTR123456' })).code).toBe(200);
    expect((await u(other._id, { amount: 100, utr: 'DUPUTR123456' })).code).toBe(409);
    // Whole cash already claimed pending → no more claims
    expect((await u(rider._id, { amount: 100, utr: 'NEWUTR123456' })).code).toBe(400);
  });

  it('riders cannot use admin-only methods to clear cash', async () => {
    const rider = await makeRider({ cashInHand: 400 });
    for (const m of ['ADMIN_CLEARANCE', 'CASH_HUB', 'ANYTHING']) {
      const r = await call(depositDeliveryCash, { user: { id: rider._id.toString() }, body: { amount: 400, method: m } });
      expect(r.code).toBe(400);
    }
    expect((await DeliveryPartner.findById(rider._id)).cashInHand).toBe(400);
  });

  it('EARNINGS_DEDUCTION still settles immediately and rejects bad amounts', async () => {
    const rider = await makeRider({ cashInHand: 400, totalEarnings: 1000 });
    const bad = await call(depositDeliveryCash, { user: { id: rider._id.toString() }, body: { amount: -100, method: 'EARNINGS_DEDUCTION' } });
    expect(bad.code).toBe(400);
    const ok = await call(depositDeliveryCash, { user: { id: rider._id.toString() }, body: { amount: 150, method: 'EARNINGS_DEDUCTION' } });
    expect(ok.code).toBe(200);
    expect(ok.body.data.cashInHand).toBe(250);
    expect(ok.body.data.totalEarnings).toBe(850);
  });

  it('admin settle-cash rejects non-numeric amounts instead of corrupting balance', async () => {
    const rider = await makeRider({ cashInHand: 400 });
    const r = await call(adminSettleRiderCash, { user: admin, params: { id: rider._id.toString() }, body: { amount: 'abc' } });
    expect(r.code).toBe(400);
    expect((await DeliveryPartner.findById(rider._id)).cashInHand).toBe(400);
  });
});

describe("Admin settlement request listing", () => {
  it("lists pending withdrawals and UPI deposits, and reflects processed status", async () => {
    const rider = await makeRider({ totalEarnings: 900, cashInHand: 0 });
    const w = await call(withdrawDeliveryEarnings, { user: { id: rider._id.toString() }, body: { amount: 120 } });
    const depRider = await makeRider({ cashInHand: 200 });
    await call(depositDeliveryCash, { user: { id: depRider._id.toString() }, body: { amount: 200, paymentMethod: "UPI", utr: "LISTUTR12345" } });

    const pend = await call(adminGetRiderSettlementRequests, { query: { type: "withdrawal", status: "PENDING" } });
    expect(pend.code).toBe(200);
    const row = pend.body.data.find((r) => String(r.requestId) === String(w.body.data.requestId));
    expect(row).toMatchObject({ amount: 120, status: "PENDING", upiId: "rider@upi" });
    expect(pend.body.summary.pendingWithdrawals.count).toBeGreaterThan(0);

    const deps = await call(adminGetRiderSettlementRequests, { query: { type: "deposit", status: "PENDING" } });
    expect(deps.body.data.some((r) => r.utr === "LISTUTR12345" && r.amount === 200)).toBe(true);

    await call(adminProcessRiderWithdrawal, { user: admin, params: { id: rider._id.toString(), requestId: String(w.body.data.requestId) }, body: { action: "Approve", payoutMethod: "ONLINE", utr: "PAIDUTR98765" } });
    const done = await call(adminGetRiderSettlementRequests, { query: { type: "withdrawal", status: "COMPLETED" } });
    const paid = done.body.data.find((r) => String(r.requestId) === String(w.body.data.requestId));
    expect(paid).toMatchObject({ status: "COMPLETED", payoutMethod: "ONLINE", utr: "PAIDUTR98765", processedBy: "Test Admin" });
    const stillPending = await call(adminGetRiderSettlementRequests, { query: { type: "withdrawal", status: "PENDING" } });
    expect(stillPending.body.data.some((r) => String(r.requestId) === String(w.body.data.requestId))).toBe(false);
  });
});

describe("Admin rider cash ledger", () => {
  it("builds a running balance that ends at the real cashInHand", async () => {
    const rider = await makeRider({
      cashInHand: 500,
      totalEarnings: 1000,
      earningsLedger: [
        { type: "COD_CASH_COLLECTED", orderId: "ZBC-L1", amount: 300, date: new Date("2026-11-01T10:00:00Z") },
        { type: "COD_CASH_COLLECTED", orderId: "ZBC-L2", amount: 200, date: new Date("2026-11-02T10:00:00Z") },
      ],
    });
    const uid = { id: rider._id.toString() };
    await call(depositDeliveryCash, { user: uid, body: { amount: 100, method: "EARNINGS_DEDUCTION" } });
    await call(depositDeliveryCash, { user: uid, body: { amount: 150, paymentMethod: "UPI", utr: "LEDGERUTR001" } });
    await call(adminSettleRiderCash, { user: admin, params: { id: rider._id.toString() }, body: { amount: 200 } });

    const r = await call(adminGetRiderCashLedger, { params: { id: rider._id.toString() }, query: {} });
    expect(r.code).toBe(200);
    const d = r.body.data;
    expect(d.rider.cashInHand).toBe(200);
    expect(d.unrecordedBalance).toBe(0);
    expect(d.totalCollected).toBe(500);
    expect(d.totalCleared).toBe(300);
    expect(d.closingBalance).toBe(200);
    expect(d.pendingUpi).toBe(150);
    expect(d.entries[0].balance).toBe(200);
    const pending = d.entries.find((e) => e.kind === "UPI");
    expect(pending.status).toBe("PENDING");
    expect(pending.affectsBalance).toBe(false);
    expect(d.entries.find((e) => e.orderId === "ZBC-L1").balance).toBe(300);

    const win = await call(adminGetRiderCashLedger, { params: { id: rider._id.toString() }, query: { from: "2026-11-02", to: "2026-11-02" } });
    expect(win.body.data.openingBalance).toBe(300);
    expect(win.body.data.entries).toHaveLength(1);
    expect(win.body.data.closingBalance).toBe(500);
  });

  it("shows legacy cash with no history as an unrecorded opening balance", async () => {
    const rider = await makeRider({ cashInHand: 750 });
    const r = await call(adminGetRiderCashLedger, { params: { id: rider._id.toString() }, query: {} });
    expect(r.body.data.unrecordedBalance).toBe(750);
    expect(r.body.data.closingBalance).toBe(750);
  });

  it("summary totals cash held and filters riders", async () => {
    const r = await call(adminGetRiderCashLedgerSummary, { query: { filter: "WITH_CASH" } });
    expect(r.code).toBe(200);
    expect(r.body.data.every((x) => x.cashInHand > 0)).toBe(true);
    const sum = r.body.data.reduce((s, x) => s + x.cashInHand, 0);
    expect(r.body.summary.totalCashHeld).toBeCloseTo(sum, 2);
    const q = await call(adminGetRiderCashLedgerSummary, { query: { filter: "ALL", search: "(.*" } });
    expect(q.code).toBe(200);
  });
});

describe("Admin rider earnings wallet", () => {
  it("ledger running balance matches wallet balance; rejected withdrawals have no net effect", async () => {
    const rider = await makeRider({
      totalEarnings: 180,
      completedDeliveries: 2,
      earningsLedger: [
        { type: "DELIVERY_PAYOUT", orderId: "ZBC-E1", amount: 100, date: new Date("2026-11-01T10:00:00Z"), breakdown: { baseFare: 30, distancePayout: 50 } },
        { type: "DELIVERY_PAYOUT", orderId: "ZBC-E2", amount: 80, date: new Date("2026-11-02T10:00:00Z") },
      ],
    });
    await Order.create({
      orderId: "ZBC-E1", customerId: new mongoose.Types.ObjectId(), vendorId: new mongoose.Types.ObjectId(),
      storeName: "Test Store", items: [{ productId: new mongoose.Types.ObjectId(), name: "x", quantity: 1, price: 100 }],
      totalAmount: 100, finalPayableAmount: 100, tipAmount: 20,
    }).catch(() => {});
    const uid = { id: rider._id.toString() };
    const w1 = await call(withdrawDeliveryEarnings, { user: uid, body: { amount: 50 } });
    const w2 = await call(withdrawDeliveryEarnings, { user: uid, body: { amount: 30 } });
    const w3 = await call(withdrawDeliveryEarnings, { user: uid, body: { amount: 40 } });
    const p = (w) => ({ id: rider._id.toString(), requestId: String(w.body.data.requestId) });
    await call(adminProcessRiderWithdrawal, { user: admin, params: p(w1), body: { action: "Approve", payoutMethod: "CASH" } });
    await call(adminProcessRiderWithdrawal, { user: admin, params: p(w2), body: { action: "Reject", remarks: "x" } });

    const r = await call(adminGetRiderEarningsLedger, { params: { id: rider._id.toString() }, query: {} });
    expect(r.code).toBe(200);
    const d = r.body.data;
    expect(d.rider.walletBalance).toBe(90);
    expect(d.unrecordedBalance).toBe(0);
    expect(d.totalEarned).toBe(180);
    expect(d.totalPaidOut).toBe(50);
    expect(d.pendingWithdrawals).toBe(40);
    expect(d.closingBalance).toBe(90);
    expect(d.entries[0].balance).toBe(90);
    const rejected = d.entries.find((e) => e.status === "REJECTED");
    expect(rejected.affectsBalance).toBe(false);
    const e1 = d.entries.find((e) => e.orderId === "ZBC-E1");
    if (e1.storeName) expect(e1.breakdown).toMatchObject({ tip: 20, deliveryFee: 80, baseFare: 30 });

    const s = await call(adminGetRiderEarningsSummary, { query: { filter: "PENDING_WITHDRAWAL", search: rider.riderId } });
    expect(s.code).toBe(200);
    expect(s.body.data).toHaveLength(1);
    expect(s.body.data[0]).toMatchObject({ walletBalance: 90, totalEarned: 180, pendingWithdrawals: 40, totalPaidOut: 50, payoutCount: 2 });
  });
});

describe("Rider online presence", () => {
  it("offline rider cannot accept an order", async () => {
    const rider = await makeRider({ isOnline: false });
    const r = await call(acceptDeliveryOrder, { user: { id: rider._id.toString() }, params: { id: new mongoose.Types.ObjectId().toString() } });
    expect(r.code).toBe(403);
    expect(r.body.code).toBe("RIDER_OFFLINE");
  });

  it("logout sets rider offline, but not during an active delivery", async () => {
    const idle = await makeRider({ isOnline: true, status: "AVAILABLE" });
    const r1 = await call(deliveryLogout, { user: { id: idle._id.toString() } });
    expect(r1.code).toBe(200);
    expect((await DeliveryPartner.findById(idle._id)).isOnline).toBe(false);

    const busy = await makeRider({ isOnline: true, status: "BUSY", activeOrderId: new mongoose.Types.ObjectId() });
    const r2 = await call(deliveryLogout, { user: { id: busy._id.toString() } });
    expect(r2.code).toBe(200);
    expect(r2.body.data.isOnline).toBe(true);
    expect((await DeliveryPartner.findById(busy._id)).isOnline).toBe(true);
  });

  it("sweep switches inactive riders offline, keeps active and on-delivery riders online", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await makeRider({ isOnline: true, lastSeenAt: old });
    const fresh = await makeRider({ isOnline: true, lastSeenAt: new Date() });
    const onTrip = await makeRider({ isOnline: true, lastSeenAt: old, activeOrderId: new mongoose.Types.ObjectId() });
    await sweepInactiveRiders();
    expect((await DeliveryPartner.findById(stale._id)).isOnline).toBe(false);
    expect((await DeliveryPartner.findById(stale._id)).status).toBe("OFFLINE");
    expect((await DeliveryPartner.findById(fresh._id)).isOnline).toBe(true);
    expect((await DeliveryPartner.findById(onTrip._id)).isOnline).toBe(true);
  });
});
