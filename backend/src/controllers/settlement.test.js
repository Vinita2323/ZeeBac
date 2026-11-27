import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// DB transactions on an in-memory replica set can exceed the default 5s under full-suite load
vi.setConfig({ testTimeout: 30000 });

// ── Mock the admin Razorpay account ──
const rzp = {
  payments: new Map(),
  refunds: [],
};
vi.mock('../utils/razorpay.util.js', () => ({
  getRazorpayInstance: () => ({
    orders: { create: vi.fn(async ({ amount, receipt }) => ({ id: `order_${receipt}`, amount, currency: 'INR' })) },
    payments: {
      fetch: vi.fn(async (id) => rzp.payments.get(id)),
      capture: vi.fn(async (id) => ({ ...rzp.payments.get(id), status: 'captured' })),
      refund: vi.fn(async (paymentId, { amount }) => {
        const r = { id: `rfnd_${rzp.refunds.length + 1}`, payment_id: paymentId, amount, status: 'pending' };
        rzp.refunds.push(r);
        return r;
      }),
    },
  }),
  verifyRazorpaySignature: (o, p, sig) => sig === `sig:${o}|${p}`,
}));

const Vendor = (await import('../models/Vendor.js')).default;
const User = (await import('../models/User.js')).default;
const Order = (await import('../models/Order.js')).default;
const RewardConfig = (await import('../models/RewardConfig.js')).default;
const SellerLedger = (await import('../models/SellerLedger.js')).default;
const AdminAuditLog = (await import('../models/AdminAuditLog.js')).default;
const { computeOrderCharges, computeSellerShare } = await import('../utils/orderPricing.util.js');
const { creditSellerForDeliveredOrder, getSellerBalance } = await import('../utils/sellerSettlement.util.js');
const { applyCapturedOrderPayment } = await import('../utils/orderPayment.util.js');
const { verifyOrderRazorpayPayment, updateOrderStatus } = await import('./order.controller.js');
const { handleRazorpayWebhook } = await import('./webhook.controller.js');
const S = await import('./settlement.controller.js');

let replSet;
let vendor;
let customer;
let seq = 0;

const call = async (h, req) => {
  const o = {};
  const res = { status(c) { o.code = c; return this; }, json(d) { o.body = d; if (!o.code) o.code = 200; return this; } };
  await h(req, res);
  return o;
};
const admin = (body = {}, params = {}, query = {}, headers = {}) => ({
  body, params, query, headers, ip: '127.0.0.1', user: { id: new mongoose.Types.ObjectId().toString(), role: 'admin' },
});
const vendorReq = (body = {}, params = {}) => ({ body, params, query: {}, headers: {}, user: { id: vendor._id.toString(), role: 'vendor' } });

// The example from the spec: items 500, packaging 10, delivery 40, platform fee + GST 60 → 610
const makeOrder = async (over = {}) => {
  seq += 1;
  const orderId = `SET-${seq}`;
  const doc = {
    orderId,
    customerId: customer._id,
    vendorId: vendor._id,
    storeName: 'Settle Store',
    vendorZeebacId: 'ZBV-SET',
    customerName: 'Cust',
    customerPhone: '9876500144',
    items: [],
    itemTotal: 500,
    packagingCharge: 10,
    deliveryCharge: 40,
    platformFee: 35,
    taxAmount: 25,
    tipAmount: 0,
    totalAmount: 500,
    pointsRedeemed: 0,
    finalPayableAmount: 610,
    totalCashbackPoints: 0,
    fulfillmentType: 'delivery',
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    orderStatus: 'READY_FOR_PICKUP',
    riderDetails: { deliveryOtp: '4321' },
    financials: { settlementStatus: 'PENDING' },
    cashbackSettled: true,
    createdAt: new Date(),
    ...over,
  };
  await Order.collection.insertOne(doc);
  return Order.findOne({ orderId });
};

const capturedPayment = (order, extra = {}) => ({
  id: `pay_${order.orderId}`,
  order_id: order.razorpay.orderId,
  amount: Math.round(order.finalPayableAmount * 100),
  currency: 'INR',
  status: 'captured',
  method: 'upi',
  fee: 1440, // ₹14.40 incl. GST
  tax: 220,
  created_at: Math.floor(Date.now() / 1000),
  ...extra,
});

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  await SellerLedger.init();
  vendor = await new Vendor({
    storeName: 'Settle Store',
    ownerName: 'O',
    phone: '9876500133',
    zeebacId: 'ZBV-SET',
    status: 'Verified',
    bankDetails: { accountHolderName: 'O', bankName: 'HDFC', accountNumber: '1234567890', ifscCode: 'HDFC0000001' },
  }).save({ validateBeforeSave: false });
  customer = await new User({ name: 'Cust', phone: '9876500144', zeebacId: 'ZBC-SET' }).save({ validateBeforeSave: false });
  await RewardConfig.create({ sellerCommissionPercent: 0, sellerMinPayoutRequest: 100 });
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(() => {
  rzp.payments.clear();
});

describe('Pricing: delivery/platform/GST by admin, packaging by seller', () => {
  it('matches the spec example: customer pays 610, seller gets 510, admin keeps 100', () => {
    const charges = computeOrderCharges({
      itemTotal: 500,
      fulfillmentType: 'delivery',
      vendor: { deliverySettings: { packagingCharge: 10, deliveryCharge: 999 } }, // seller's delivery charge is ignored
      rewardConfig: { orderDeliveryCharge: 40, orderPlatformFeeFixed: 35, enableOrderTax: true, orderGstTaxPercent: 5 },
    });
    expect(charges).toMatchObject({ deliveryCharge: 40, packagingCharge: 10, platformFee: 35, taxAmount: 25, grossTotal: 610 });
    const share = computeSellerShare({ order: { ...charges, finalPayableAmount: 610, pointsRedeemed: 0 } });
    expect(share.sellerPayable).toBe(510);
    expect(share.adminShare).toBe(100);
  });

  it('online: Razorpay fee is deducted from the seller share; commission is applied when configured', () => {
    const order = { itemTotal: 500, packagingCharge: 10, deliveryCharge: 40, platformFee: 35, taxAmount: 25, finalPayableAmount: 610 };
    expect(computeSellerShare({ order, gatewayFee: 14.4 }).sellerPayable).toBe(495.6);
    const withCommission = computeSellerShare({ order, gatewayFee: 14.4, commissionPercent: 2 });
    expect(withCommission.commissionAmount).toBe(10.2);
    expect(withCommission.sellerPayable).toBe(485.4);
    expect(withCommission.adminShare).toBe(110.2);
  });

  it('pickup orders have no delivery fee or packaging; free-delivery threshold works', () => {
    const p = computeOrderCharges({ itemTotal: 500, fulfillmentType: 'pickup', vendor: { deliverySettings: { packagingCharge: 10 } }, rewardConfig: { orderDeliveryCharge: 40 } });
    expect(p.deliveryCharge).toBe(0);
    expect(p.packagingCharge).toBe(0);
    const free = computeOrderCharges({ itemTotal: 500, fulfillmentType: 'delivery', vendor: {}, rewardConfig: { orderDeliveryCharge: 40, orderFreeDeliveryAbove: 499 } });
    expect(free.deliveryCharge).toBe(0);
  });
});

describe('COD flow', () => {
  it('credits seller ON_HOLD at delivery, releases only after admin confirms collection (once)', async () => {
    const order = await makeOrder();
    const r = await call(updateOrderStatus, vendorReq({ status: 'DELIVERED' }, { orderId: order.orderId }));
    expect(r.code).toBe(200);
    const saved = await Order.findOne({ orderId: order.orderId });
    expect(saved.financials.settlementStatus).toBe('ON_HOLD');
    expect(saved.financials.sellerPayable).toBe(510);
    expect(saved.financials.gatewayFee).toBe(0);

    let bal = await getSellerBalance(vendor._id);
    expect(bal.onHold).toBe(510);
    expect(bal.available).toBe(0);

    const c1 = await call(S.adminConfirmCodCollection, admin({ orderIds: [order.orderId] }));
    expect(c1.body.data.released).toHaveLength(1);
    const c2 = await call(S.adminConfirmCodCollection, admin({ orderIds: [order.orderId] }));
    expect(c2.body.data.released).toHaveLength(0);
    expect(c2.body.data.skipped[0].orderId).toBe(order.orderId);

    bal = await getSellerBalance(vendor._id);
    expect(bal.onHold).toBe(0);
    expect(bal.available).toBe(510);
    expect(await AdminAuditLog.countDocuments({ action: 'COD_COLLECTION_CONFIRMED', entityId: order.orderId })).toBe(1);
  });

  it('crediting the same order twice never double-credits', async () => {
    const order = await makeOrder({ paymentMethod: 'CASH', orderStatus: 'DELIVERED' });
    await creditSellerForDeliveredOrder(order);
    order.financials.settlementStatus = 'PENDING'; // simulate a stale copy racing
    await creditSellerForDeliveredOrder(order);
    expect(await SellerLedger.countDocuments({ orderId: order._id, type: 'ORDER_CREDIT' })).toBe(1);
  });

  it('pickup orders paid at the store are not settled by admin', async () => {
    const order = await makeOrder({ fulfillmentType: 'pickup', paymentMethod: 'CASH', paymentStatus: 'PAID' });
    await creditSellerForDeliveredOrder(order);
    expect(order.financials.settlementStatus).toBe('NOT_APPLICABLE');
    expect(await SellerLedger.countDocuments({ orderId: order._id })).toBe(0);
  });
});

describe('Online flow (admin Razorpay)', () => {
  it('client verify and webhook are idempotent; seller credit deducts the gateway fee', async () => {
    let order = await makeOrder({ paymentMethod: 'ONLINE', orderStatus: 'PLACED' });
    order.razorpay = { orderId: `order_${order.orderId}`, status: 'CREATED' };
    await order.save();
    const payment = capturedPayment(order);
    rzp.payments.set(payment.id, payment);

    // Delivery is blocked before payment
    const early = await call(updateOrderStatus, vendorReq({ status: 'DELIVERED' }, { orderId: order.orderId }));
    expect(early.body.code).toBe('ONLINE_PAYMENT_PENDING');

    const v = await call(verifyOrderRazorpayPayment, {
      params: { orderId: order.orderId },
      body: { razorpay_order_id: payment.order_id, razorpay_payment_id: payment.id, razorpay_signature: `sig:${payment.order_id}|${payment.id}` },
      user: { id: customer._id.toString(), role: 'customer' },
    });
    expect(v.code).toBe(200);
    order = await Order.findOne({ orderId: order.orderId });
    expect(order.paymentStatus).toBe('PAID');
    expect(order.razorpay.fee).toBe(14.4);
    expect(order.razorpay.capturedVia).toBe('CLIENT_VERIFY');

    const again = await applyCapturedOrderPayment({ payment, via: 'WEBHOOK' });
    expect(again.applied).toBe(false);
    expect(again.duplicate).toBe(true);

    const d = await call(updateOrderStatus, vendorReq({ status: 'DELIVERED' }, { orderId: order.orderId }));
    expect(d.code).toBe(200);
    order = await Order.findOne({ orderId: order.orderId });
    expect(order.financials.settlementStatus).toBe('CREDITED');
    expect(order.financials.sellerPayable).toBe(495.6);
    const entry = await SellerLedger.findOne({ orderId: order._id });
    expect(entry.status).toBe('AVAILABLE');
    expect(entry.paymentMode).toBe('ONLINE');
  });

  it('rejects a forged signature and an amount mismatch', async () => {
    const order = await makeOrder({ paymentMethod: 'ONLINE', orderStatus: 'PLACED' });
    order.razorpay = { orderId: `order_${order.orderId}`, status: 'CREATED' };
    await order.save();
    const bad = await call(verifyOrderRazorpayPayment, {
      params: { orderId: order.orderId },
      body: { razorpay_order_id: order.razorpay.orderId, razorpay_payment_id: 'pay_x', razorpay_signature: 'forged' },
      user: { id: customer._id.toString(), role: 'customer' },
    });
    expect(bad.body.code).toBe('INVALID_SIGNATURE');

    const r = await applyCapturedOrderPayment({ payment: capturedPayment(order, { amount: 100 }), via: 'WEBHOOK' });
    expect(r.applied).toBe(false);
    expect((await Order.findById(order._id)).paymentStatus).toBe('PENDING');
  });

  it('a second, different payment for an already-paid order is refunded automatically', async () => {
    const order = await makeOrder({ paymentMethod: 'ONLINE', orderStatus: 'PLACED' });
    order.razorpay = { orderId: `order_${order.orderId}`, status: 'CREATED' };
    await order.save();
    await applyCapturedOrderPayment({ payment: capturedPayment(order), via: 'WEBHOOK' });
    const before = rzp.refunds.length;
    const r = await applyCapturedOrderPayment({ payment: capturedPayment(order, { id: `pay_dup_${order.orderId}` }), via: 'WEBHOOK' });
    expect(r.duplicate).toBe(true);
    expect(rzp.refunds.length).toBe(before + 1);
  });

  it('webhook: verifies signature and de-duplicates by event id', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
    const order = await makeOrder({ paymentMethod: 'ONLINE', orderStatus: 'PLACED' });
    order.razorpay = { orderId: `order_${order.orderId}`, status: 'CREATED' };
    await order.save();
    const body = { event: 'payment.captured', payload: { payment: { entity: capturedPayment(order) } } };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac('sha256', 'whsec_test').update(raw).digest('hex');
    const req = { headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': `evt_${order.orderId}` }, body, rawBody: raw };

    const first = await call(handleRazorpayWebhook, req);
    expect(first.code).toBe(200);
    expect(first.body.data.applied).toBe(true);
    const second = await call(handleRazorpayWebhook, req);
    expect(second.body.status).toBe('already_processed');

    const forged = await call(handleRazorpayWebhook, { ...req, headers: { ...req.headers, 'x-razorpay-signature': 'nope' } });
    expect(forged.code).toBe(400);
    expect((await Order.findById(order._id)).razorpay.capturedVia).toBe('WEBHOOK');
  });

  it('refund after delivery claws back the seller credit; refund webhook marks it processed', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
    let order = await makeOrder({ paymentMethod: 'ONLINE', orderStatus: 'PLACED' });
    order.razorpay = { orderId: `order_${order.orderId}`, status: 'CREATED' };
    await order.save();
    await applyCapturedOrderPayment({ payment: capturedPayment(order), via: 'WEBHOOK' });
    await call(updateOrderStatus, vendorReq({ status: 'DELIVERED' }, { orderId: order.orderId }));

    const r = await call(S.adminRefundOrder, admin({ amount: 100, reason: 'Damaged item', sellerReversal: 100 }, { orderId: order.orderId }));
    expect(r.code).toBe(200);
    expect(r.body.data.sellerReversal).toBe(100);
    const ledger = await SellerLedger.find({ orderId: order._id }).sort({ createdAt: 1 });
    expect(ledger.map((l) => l.amount)).toEqual([495.6, -100]);

    const refundId = r.body.data.refund.refundId;
    const body = { event: 'refund.processed', payload: { refund: { entity: { id: refundId, payment_id: `pay_${order.orderId}`, amount: 10000, status: 'processed' } } } };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac('sha256', 'whsec_test').update(raw).digest('hex');
    await call(handleRazorpayWebhook, { headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': `evt_rf_${refundId}` }, body, rawBody: raw });
    order = await Order.findById(order._id);
    expect(order.refundedAmount).toBe(100);
    expect(order.refunds[0].status).toBe('PROCESSED');
  });
});

describe('Seller withdrawals & admin payouts', () => {
  let sellerB;
  const asB = (body = {}, params = {}) => ({ body, params, query: {}, headers: {}, user: { id: sellerB._id.toString(), role: 'vendor' } });

  beforeAll(async () => {
    sellerB = await new Vendor({
      storeName: 'Payout Store', ownerName: 'P', phone: '9876500155', zeebacId: 'ZBV-PAY', status: 'Verified',
      bankDetails: { bankName: 'SBI', accountNumber: '9988776655', ifscCode: 'SBIN0000001' },
    }).save({ validateBeforeSave: false });
    await SellerLedger.create({ vendorId: sellerB._id, type: 'ORDER_CREDIT', amount: 1000, status: 'AVAILABLE', idempotencyKey: 'seed-b-1' });
    await SellerLedger.create({ vendorId: sellerB._id, type: 'ORDER_CREDIT', amount: 300, status: 'ON_HOLD', idempotencyKey: 'seed-b-2' });
  });

  it('seller can only request what is withdrawable (excludes on-hold and open requests)', async () => {
    const tooMuch = await call(S.vendorRequestPayout, asB({ amount: 1200 }));
    expect(tooMuch.body.code).toBe('EXCEEDS_BALANCE');
    const ok = await call(S.vendorRequestPayout, asB({ amount: 800 }));
    expect(ok.code).toBe(201);
    const overlap = await call(S.vendorRequestPayout, asB({ amount: 300 }));
    expect(overlap.body.code).toBe('EXCEEDS_BALANCE'); // only 200 left after the open 800 request
  });

  it('admin pays a request in parts; duplicate UTR is idempotent; overpay rejected', async () => {
    const reqs = await call(S.adminListPayoutRequests, admin({}, {}, { vendorId: sellerB._id.toString() }));
    const request = reqs.body.data.requests[0];

    const p1 = await call(S.adminRecordPayout, admin({ amount: 500, method: 'BANK_TRANSFER', utr: 'UTR-B-1', requestId: request._id }, { vendorId: sellerB._id.toString() }));
    expect(p1.code).toBe(200);
    expect(p1.body.data.request.status).toBe('PARTIALLY_PAID');

    const dup = await call(S.adminRecordPayout, admin({ amount: 500, method: 'BANK_TRANSFER', utr: 'UTR-B-1', requestId: request._id }, { vendorId: sellerB._id.toString() }));
    expect(dup.body.data.duplicate).toBe(true);

    const over = await call(S.adminRecordPayout, admin({ amount: 400, utr: 'UTR-B-2', requestId: request._id }, { vendorId: sellerB._id.toString() }));
    expect(over.body.code).toBe('EXCEEDS_REQUEST');

    const p2 = await call(S.adminRecordPayout, admin({ amount: 300, utr: 'UTR-B-3', requestId: request._id }, { vendorId: sellerB._id.toString() }));
    expect(p2.body.data.request.status).toBe('PAID');

    const bal = await getSellerBalance(sellerB._id);
    expect(bal.available).toBe(200);
    expect(bal.onHold).toBe(300);
    expect(bal.totalPaidOut).toBe(800);
    expect(await AdminAuditLog.countDocuments({ action: 'SELLER_PAYOUT_RECORDED', vendorId: sellerB._id })).toBe(2);
  });

  it('direct payout without a request is capped at withdrawable; a payout needs a reference', async () => {
    const noRef = await call(S.adminRecordPayout, admin({ amount: 50 }, { vendorId: sellerB._id.toString() }));
    expect(noRef.body.code).toBe('REFERENCE_REQUIRED');
    const over = await call(S.adminRecordPayout, admin({ amount: 250, utr: 'UTR-B-4' }, { vendorId: sellerB._id.toString() }));
    expect(over.body.code).toBe('EXCEEDS_BALANCE');
  });

  it('reconciliation and summary endpoints respond', async () => {
    const rec = await call(S.adminGetReconciliation, admin());
    expect(rec.code).toBe(200);
    expect(rec.body.data.online.orders).toBeGreaterThan(0);
    const sum = await call(S.adminGetSettlementSummary, admin());
    expect(sum.body.data.sellers.find((s) => String(s.vendorId) === String(sellerB._id)).available).toBe(200);
  });
});
