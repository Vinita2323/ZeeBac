import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Order from '../models/Order.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import RewardConfig from '../models/RewardConfig.js';
import { cancelOrderByCustomer, getCustomerCancelPreview, updateOrderStatus } from './order.controller.js';
import { updateDeliveryOrderStatus } from './delivery.controller.js';
import {
  computeLateCancellationPenalty,
  redemptionBlockedReason,
  getMinRedeemablePoints,
} from '../utils/pointsPolicy.util.js';

const notifyMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../services/notification.service.js', () => ({ sendNotification: notifyMock }));
vi.mock('../utils/orderPayment.util.js', async (orig) => ({ ...(await orig()), initiateOrderRefund: vi.fn(async () => { throw new Error('refund must not be called'); }) }));
vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: () => {} }) }) }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const oid = () => new mongoose.Types.ObjectId();
const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
};

let seq = 0;
const setup = async ({ category = 'Groceries & Supermarkets', status = 'OUT_FOR_DELIVERY', paymentMethod = 'CASH', deliveryCharge = 40, totalAmount = 540, pointsRedeemed = 0, balance = 0, riderPhone } = {}) => {
  const customerId = oid();
  const vendorId = oid();
  await mongoose.connection.collection('users').insertOne({ _id: customerId, zeebacId: `ZU-${++seq}`, name: 'C', phone: `90000${seq}` });
  await mongoose.connection.collection('vendors').insertOne({ _id: vendorId, zeebacId: `ZV-${seq}`, phone: `80000${seq}`, storeName: 'S', category });
  if (balance !== null) await Wallet.create({ ownerId: customerId, ownerType: 'User', ownerZeebacId: `ZU-${seq}`, balance });
  const _id = oid();
  await Order.collection.insertOne({
    _id,
    orderId: `ORD-P-${seq}`,
    customerId,
    vendorId,
    storeName: 'S',
    vendorZeebacId: 'ZV-1',
    customerName: 'C',
    customerPhone: '9000000000',
    items: [],
    fulfillmentType: 'delivery',
    paymentMethod,
    paymentStatus: 'PENDING',
    orderStatus: status,
    deliveryCharge,
    totalAmount,
    finalPayableAmount: totalAmount - pointsRedeemed,
    pointsRedeemed,
    totalCashbackPoints: 0,
    refunds: [],
    riderDetails: riderPhone ? { phone: riderPhone } : {},
  });
  return { _id, orderId: `ORD-P-${seq}`, customerId, vendorId };
};

const balanceOf = async (customerId) => (await Wallet.findOne({ ownerId: customerId }))?.balance;

describe('Penalty calculation rules', () => {
  const order = (o) => ({ fulfillmentType: 'delivery', paymentMethod: 'CASH', orderStatus: 'OUT_FOR_DELIVERY', deliveryCharge: 40, totalAmount: 540, ...o });

  it('full order amount for every store type after Out for Delivery', () => {
    expect(computeLateCancellationPenalty(order(), { category: 'Groceries & Supermarkets' })).toMatchObject({ applies: true, amount: 540, basis: 'ENTIRE_ORDER' });
    expect(computeLateCancellationPenalty(order(), { category: 'Restaurants & Cafes' })).toMatchObject({ applies: true, amount: 540 });
    expect(computeLateCancellationPenalty(order({ orderStatus: 'ARRIVED_AT_CUSTOMER' }), {}).amount).toBe(540);
  });

  it('no deduction before Out for Delivery, for non-COD, or for pickup orders', () => {
    for (const st of ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP']) {
      expect(computeLateCancellationPenalty(order({ orderStatus: st }), {}).applies).toBe(false);
    }
    expect(computeLateCancellationPenalty(order({ paymentMethod: 'ONLINE' }), {}).applies).toBe(false);
    expect(computeLateCancellationPenalty(order({ fulfillmentType: 'pickup' }), {}).applies).toBe(false);
  });
});

describe('Customer cancel (only before the store accepts)', () => {
  it('PLACED order: cancelled, no points deducted, redeemed points returned', async () => {
    const o = await setup({ status: 'PLACED', balance: 0, pointsRedeemed: 30 });
    const res = makeRes();
    await cancelOrderByCustomer({ params: { orderId: o.orderId }, user: { id: String(o.customerId) }, body: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.pointsDeducted).toBe(0);
    expect(await balanceOf(o.customerId)).toBe(30);
    expect((await Order.findById(o._id)).orderStatus).toBe('CANCELLED');
  });

  it('after the store accepts (any later stage) the customer cannot cancel', async () => {
    for (const st of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY']) {
      const o = await setup({ status: st, balance: 0 });
      const preview = makeRes();
      await getCustomerCancelPreview({ params: { orderId: o.orderId }, user: { id: String(o.customerId) } }, preview);
      expect(preview.body.data.canCancel).toBe(false);
      const res = makeRes();
      await cancelOrderByCustomer({ params: { orderId: o.orderId }, user: { id: String(o.customerId) }, body: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('STORE_ALREADY_ACCEPTED');
      expect((await Order.findById(o._id)).orderStatus).toBe(st);
      expect(await balanceOf(o.customerId)).toBe(0);
    }
  });

  it("another customer cannot cancel someone else's order", async () => {
    const o = await setup({ status: 'PLACED', balance: 0 });
    const res = makeRes();
    await cancelOrderByCustomer({ params: { orderId: o.orderId }, user: { id: String(oid()) }, body: {} }, res);
    expect(res.statusCode).toBe(403);
  });
});

describe('Rider: customer not reachable / not found / not available / refused', () => {
  const makeRider = async (phone, activeOrderId) => {
    const _id = oid();
    await DeliveryPartner.collection.insertOne({ _id, riderId: `RID-${phone}`, phone, name: 'R', isOnline: true, status: 'BUSY', activeOrderId, totalEarnings: 100, earningsLedger: [] });
    return _id;
  };
  const markReturn = async (o, riderId, body) => {
    const res = makeRes();
    await updateDeliveryOrderStatus({ params: { id: String(o._id) }, user: { id: String(riderId) }, body: { status: 'FAILED_DELIVERY', ...body } }, res);
    return res;
  };

  it('deducts the full order amount (balance goes negative), pays the rider, frees the rider', async () => {
    const o = await setup({ balance: 10, totalAmount: 540, riderPhone: '9111111111' });
    await Order.updateOne({ _id: o._id }, { $set: { deliveryPayout: 35 } });
    const riderId = await makeRider('9111111111', o._id);

    const res = await markReturn(o, riderId, { reasonCode: 'NOT_ANSWERING' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.pointsDeducted).toBe(540);
    expect(await balanceOf(o.customerId)).toBe(-530);

    const saved = await Order.findById(o._id);
    expect(saved.orderStatus).toBe('FAILED_DELIVERY');
    expect(saved.cancellationReason).toMatch(/not answering calls/);

    const rider = await DeliveryPartner.findById(riderId);
    expect(rider.totalEarnings).toBe(135);
    expect(rider.earningsLedger).toHaveLength(1);
    expect(rider.earningsLedger[0]).toMatchObject({ orderId: o.orderId, amount: 35, type: 'DELIVERY_PAYOUT' });
    expect(rider.activeOrderId).toBeNull();
    expect(rider.status).toBe('AVAILABLE');

    // repeat call: no second deduction, no second payout
    const again = await markReturn(o, riderId, { reasonCode: 'NOT_ANSWERING' });
    expect(again.statusCode).toBe(400);
    expect(await balanceOf(o.customerId)).toBe(-530);
    expect((await DeliveryPartner.findById(riderId)).totalEarnings).toBe(135);
    expect(await WalletTransaction.countDocuments({ category: 'cancellation_penalty' })).toBe(1);
  });

  it('online-paid order returned: no refund (payment forfeited), no extra points, store notified', async () => {
    const o = await setup({ paymentMethod: 'ONLINE', balance: 20, totalAmount: 540, riderPhone: '9444444444' });
    await Order.updateOne({ _id: o._id }, { $set: { paymentStatus: 'PAID', razorpay: { status: 'CAPTURED', paymentId: 'pay_x', amountPaid: 540 }, items: [{ name: 'Rice', quantity: 2, price: 100, total: 200 }] } });
    const riderId = await makeRider('9444444444', o._id);
    notifyMock.mockClear();

    const res = await markReturn(o, riderId, { reasonCode: 'NOT_AVAILABLE' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.pointsDeducted).toBe(0);
    expect(await balanceOf(o.customerId)).toBe(20);

    const saved = await Order.findById(o._id);
    expect(saved.paymentForfeited).toMatchObject({ forfeited: true, amount: 540 });
    expect(saved.refunds).toHaveLength(0);
    expect(saved.paymentStatus).toBe('PAID');

    const toStore = notifyMock.mock.calls.find(([a]) => a.recipientType === 'vendor');
    expect(toStore[0].title).toMatch(/being returned/);
    const toCustomer = notifyMock.mock.calls.find(([a]) => a.recipientType === 'customer');
    expect(toCustomer[0].message).toMatch(/not refundable/);
  });

  it('needs a reason and cannot be used before Out for Delivery', async () => {
    const o1 = await setup({ riderPhone: '9222222222' });
    const r1 = await makeRider('9222222222', o1._id);
    expect((await markReturn(o1, r1, {})).statusCode).toBe(400);

    const o2 = await setup({ status: 'ARRIVED_AT_PICKUP', riderPhone: '9333333333' });
    const r2 = await makeRider('9333333333', o2._id);
    expect((await markReturn(o2, r2, { reasonCode: 'REFUSED' })).statusCode).toBe(400);
  });
});

describe('Admin cancel', () => {
  it('no penalty unless admin says the customer asked (chargeCustomer)', async () => {
    const a = await setup({ balance: 0 });
    const r1 = makeRes();
    await updateOrderStatus({ params: { orderId: a.orderId }, user: { id: String(oid()), role: 'admin' }, body: { status: 'CANCELLED', reason: 'store issue' } }, r1);
    expect(r1.statusCode).toBe(200);
    expect(await balanceOf(a.customerId)).toBe(0);

    const b = await setup({ balance: 0 });
    await updateOrderStatus({ params: { orderId: b.orderId }, user: { id: String(oid()), role: 'admin' }, body: { status: 'CANCELLED', reason: 'customer asked', chargeCustomer: true } }, makeRes());
    expect(await balanceOf(b.customerId)).toBe(-540);
  });
});

describe('Minimum redemption balance', () => {
  it('needs at least 100 points (configurable)', async () => {
    expect(await getMinRedeemablePoints()).toBe(100);
    expect(redemptionBlockedReason(99.99, 100)).toMatch(/at least 100/);
    expect(redemptionBlockedReason(-40, 100)).toMatch(/at least 100/);
    expect(redemptionBlockedReason(100, 100)).toBeNull();
    await RewardConfig.create({ minRedeemablePoints: 250 });
    expect(await getMinRedeemablePoints()).toBe(250);
  });
});
