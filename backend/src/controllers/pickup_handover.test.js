import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { updateOrderStatus, getVendorOrders } from './order.controller.js';

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
