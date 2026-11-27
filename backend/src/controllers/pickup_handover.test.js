import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { updateOrderStatus, getVendorOrders, generateStoreBill, confirmStoreBillPayment } from './order.controller.js';

let replSet;
const call = async (h, req) => {
  const o = {};
  const res = { status(c) { o.code = c; return this; }, json(d) { o.body = d; return this; } };
  await h(req, res);
  return o;
};

let vendor;
let customer;
let seq = 0;
const makeOrder = (fulfillmentType) => {
  seq += 1;
  return Order.collection.insertOne({
    orderId: `PICK-${seq}`,
    customerId: customer._id,
    vendorId: vendor._id,
    storeName: 'Pickup Store',
    vendorZeebacId: 'ZBV-PICK',
    customerName: 'Cust',
    customerPhone: '9876500044',
    items: [],
    totalAmount: 100,
    finalPayableAmount: 100,
    totalCashbackPoints: 0,
    fulfillmentType,
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    orderStatus: 'READY_FOR_PICKUP',
    riderDetails: { deliveryOtp: '4321' },
    createdAt: new Date(),
  }).then(() => `PICK-${seq}`);
};
const vendorReq = (orderId, body) => ({
  params: { orderId },
  body,
  user: { id: vendor._id.toString(), role: 'vendor' },
});

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  vendor = await new Vendor({ storeName: 'Pickup Store', ownerName: 'O', phone: '9876500033', zeebacId: 'ZBV-PICK', status: 'Verified' }).save({ validateBeforeSave: false });
  customer = await new User({ name: 'Cust', phone: '9876500044', zeebacId: 'ZBC-PICK' }).save({ validateBeforeSave: false });
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

describe('Store pickup handover requires the customer pickup code', () => {
  it('rejects handover without a code', async () => {
    const id = await makeOrder('pickup');
    const r = await call(updateOrderStatus, vendorReq(id, { status: 'DELIVERED' }));
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('PICKUP_OTP_REQUIRED');
    expect((await Order.findOne({ orderId: id })).orderStatus).toBe('READY_FOR_PICKUP');
  });

  it('rejects a wrong code', async () => {
    const id = await makeOrder('pickup');
    const r = await call(updateOrderStatus, vendorReq(id, { status: 'DELIVERED', deliveryOtp: '1111' }));
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('PICKUP_OTP_INVALID');
  });

  it('hands over with the correct code and never returns the code to the store', async () => {
    const id = await makeOrder('pickup');
    await call(confirmStoreBillPayment, vendorReq(id, { method: 'CASH' }));
    const r = await call(updateOrderStatus, vendorReq(id, { status: 'DELIVERED', deliveryOtp: '4321' }));
    expect(r.code).toBe(200);
    expect((await Order.findOne({ orderId: id })).orderStatus).toBe('DELIVERED');
    expect(r.body.data.order.riderDetails?.deliveryOtp).toBeUndefined();
  });

  it('vendor order list hides the pickup code but keeps delivery OTP behaviour', async () => {
    await makeOrder('pickup');
    const r = await call(getVendorOrders, { query: {}, user: { id: vendor._id.toString(), role: 'vendor' } });
    expect(r.code).toBe(200);
    const pickups = r.body.data.orders ? r.body.data.orders : r.body.data;
    const list = Array.isArray(pickups) ? pickups : pickups.orders || [];
    const pickupOrders = list.filter((o) => o.fulfillmentType === 'pickup');
    expect(pickupOrders.length).toBeGreaterThan(0);
    for (const o of pickupOrders) expect(o.riderDetails?.deliveryOtp).toBeUndefined();
  });

  it('delivery orders are unchanged: can complete without a code', async () => {
    const id = await makeOrder('delivery');
    const r = await call(updateOrderStatus, vendorReq(id, { status: 'DELIVERED' }));
    expect(r.code).toBe(200);
  });
});

describe('Store pickup in-store billing (Merchant Billing)', () => {
  it('blocks handover until payment is confirmed, even with the right code', async () => {
    const id = await makeOrder('pickup');
    const r = await call(updateOrderStatus, vendorReq(id, { status: 'DELIVERED', deliveryOtp: '4321' }));
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('PICKUP_PAYMENT_PENDING');
    expect((await Order.findOne({ orderId: id })).orderStatus).toBe('READY_FOR_PICKUP');
  });

  it('refuses a UPI bill when the seller has no UPI ID', async () => {
    const id = await makeOrder('pickup');
    const r = await call(generateStoreBill, vendorReq(id, {}));
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('SELLER_UPI_MISSING');
  });

  it('generates a UPI QR to the SELLER UPI ID, then confirms UPI without delivering', async () => {
    await Vendor.updateOne({ _id: vendor._id }, { $set: { upiId: 'pickupstore@okaxis' } });
    const id = await makeOrder('pickup');

    // UPI confirm before bill is generated is refused
    const early = await call(confirmStoreBillPayment, vendorReq(id, { method: 'UPI' }));
    expect(early.code).toBe(400);
    expect(early.body.code).toBe('BILL_NOT_GENERATED');

    const g = await call(generateStoreBill, vendorReq(id, {}));
    expect(g.code).toBe(200);
    expect(g.body.data.storeBill.payeeVpa).toBe('pickupstore@okaxis');
    expect(g.body.data.storeBill.upiUri).toContain('pa=pickupstore%40okaxis');
    expect(g.body.data.storeBill.upiUri).toContain('am=100.00');
    expect(g.body.data.order.riderDetails?.deliveryOtp).toBeUndefined();

    const c = await call(confirmStoreBillPayment, vendorReq(id, { method: 'UPI', utr: '123456789012' }));
    expect(c.code).toBe(200);
    const saved = await Order.findOne({ orderId: id });
    expect(saved.paymentStatus).toBe('PAID');
    expect(saved.storeBill.paidVia).toBe('UPI');
    expect(saved.storeBill.utr).toBe('123456789012');
    expect(saved.orderStatus).toBe('READY_FOR_PICKUP'); // payment != delivery

    const again = await call(confirmStoreBillPayment, vendorReq(id, { method: 'CASH' }));
    expect(again.body.code).toBe('ALREADY_PAID');

    const h = await call(updateOrderStatus, vendorReq(id, { status: 'DELIVERED', deliveryOtp: '4321' }));
    expect(h.code).toBe(200);
    expect((await Order.findOne({ orderId: id })).orderStatus).toBe('DELIVERED');
  });

  it('records cash with change and rejects short cash', async () => {
    const id = await makeOrder('pickup');
    const short = await call(confirmStoreBillPayment, vendorReq(id, { method: 'CASH', amountReceived: 50 }));
    expect(short.code).toBe(400);
    expect(short.body.code).toBe('AMOUNT_SHORT');
    const ok = await call(confirmStoreBillPayment, vendorReq(id, { method: 'CASH', amountReceived: 200 }));
    expect(ok.code).toBe(200);
    expect(ok.body.data.change).toBe(100);
    const saved = await Order.findOne({ orderId: id });
    expect(saved.paymentMethod).toBe('CASH');
    expect(saved.orderStatus).toBe('READY_FOR_PICKUP');
  });

  it('rejects billing on delivery orders and on another vendor orders', async () => {
    const d = await makeOrder('delivery');
    expect((await call(generateStoreBill, vendorReq(d, {}))).body.code).toBe('NOT_PICKUP_ORDER');
    const p = await makeOrder('pickup');
    const other = await call(confirmStoreBillPayment, {
      params: { orderId: p }, body: { method: 'CASH' }, user: { id: new mongoose.Types.ObjectId().toString(), role: 'vendor' },
    });
    expect(other.code).toBe(403);
  });
});
