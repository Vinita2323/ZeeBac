import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const emitted = [];
vi.mock('../socket/socket.js', () => ({
  getIO: () => ({ to: (room) => ({ emit: (event, data) => emitted.push({ room, event, data }) }) }),
}));
vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn().mockResolvedValue(true) }));

const Vendor = (await import('../models/Vendor.js')).default;
const User = (await import('../models/User.js')).default;
const Order = (await import('../models/Order.js')).default;
const { updateOrderStatus, getVendorOrders } = await import('./order.controller.js');

let replSet;
let vendor;
let customer;
let seq = 0;
const riderId = new mongoose.Types.ObjectId();

const call = async (h, req) => {
  const o = {};
  const res = { status(c) { o.code = c; return this; }, json(d) { o.body = d; if (!o.code) o.code = 200; return this; } };
  await h(req, res);
  return o;
};
const as = (role, id, orderId, body) => ({ params: { orderId }, body, query: {}, user: { id: String(id), role } });
const vendorSets = (orderId, status, extra = {}) => call(updateOrderStatus, as('vendor', vendor._id, orderId, { status, ...extra }));

const makeOrder = async (over = {}) => {
  seq += 1;
  const orderId = `RULE-${seq}`;
  await Order.collection.insertOne({
    orderId, customerId: customer._id, vendorId: vendor._id, storeName: 'S', vendorZeebacId: 'ZBV-RULE',
    customerName: 'C', customerPhone: '9876500244', items: [], itemTotal: 100, totalAmount: 100, finalPayableAmount: 100,
    totalCashbackPoints: 0, fulfillmentType: 'delivery', paymentMethod: 'CASH', paymentStatus: 'PENDING',
    orderStatus: 'PLACED', riderDetails: { deliveryOtp: '9999' }, financials: { settlementStatus: 'PENDING' },
    cashbackSettled: true, createdAt: new Date(), ...over,
  });
  return orderId;
};

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  vendor = await new Vendor({ storeName: 'Rule Store', ownerName: 'O', phone: '9876500233', zeebacId: 'ZBV-RULE', status: 'Verified' }).save({ validateBeforeSave: false });
  customer = await new User({ name: 'C', phone: '9876500244', zeebacId: 'ZBC-RULE' }).save({ validateBeforeSave: false });
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

describe('Store status rules', () => {
  it('store moves its own stages forward and the change is broadcast to customer, store, admins', async () => {
    const id = await makeOrder();
    emitted.length = 0;
    expect((await vendorSets(id, 'PREPARING')).code).toBe(200);
    expect((await vendorSets(id, 'READY_FOR_PICKUP')).code).toBe(200);
    const rooms = emitted.filter((e) => e.event === 'order:status_update').map((e) => e.room);
    expect(rooms).toEqual(expect.arrayContaining([`user_${customer._id}`, `vendor_${vendor._id}`, 'admins']));
  });

  it('store cannot go backwards or set rider stages', async () => {
    const id = await makeOrder({ orderStatus: 'READY_FOR_PICKUP' });
    expect((await vendorSets(id, 'PREPARING')).body.code).toBe('INVALID_TRANSITION');
    expect((await vendorSets(id, 'OUT_FOR_DELIVERY')).body.code).toBe('RIDER_ONLY_STATUS');
  });

  it('store cannot mark a delivery order delivered; the assigned rider is notified of store updates', async () => {
    const id = await makeOrder({ orderStatus: 'PREPARING', riderDetails: { riderId, name: 'R', phone: '9000000000', deliveryOtp: '9999' } });
    const r = await vendorSets(id, 'DELIVERED');
    expect(r.body.code).toBe('RIDER_OWNS_DELIVERY');
    emitted.length = 0;
    expect((await vendorSets(id, 'READY_FOR_PICKUP')).code).toBe(200);
    expect(emitted.some((e) => e.room === `rider_${riderId}` && e.event === 'order:status_update')).toBe(true);
  });

  it('store cannot self-deliver, with or without a rider on the order', async () => {
    const noRider = await makeOrder({ orderStatus: 'READY_FOR_PICKUP' });
    expect((await vendorSets(noRider, 'DELIVERED')).body.code).toBe('RIDER_OWNS_DELIVERY');
    const ownBoy = await makeOrder({ orderStatus: 'RIDER_ASSIGNED', riderDetails: { name: 'Own Boy', phone: '9000000001' } });
    expect((await vendorSets(ownBoy, 'DELIVERED')).body.code).toBe('RIDER_OWNS_DELIVERY');
  });

  it('admin can override; customers cannot change status', async () => {
    const id = await makeOrder({ orderStatus: 'OUT_FOR_DELIVERY', riderDetails: { riderId, deliveryOtp: '9999' } });
    expect((await call(updateOrderStatus, as('customer', customer._id, id, { status: 'DELIVERED' }))).code).toBe(403);
    expect((await call(updateOrderStatus, as('admin', new mongoose.Types.ObjectId(), id, { status: 'DELIVERED' }))).code).toBe(200);
  });

  it('accepted orders still cannot be cancelled by the store', async () => {
    const id = await makeOrder({ orderStatus: 'PREPARING' });
    expect((await vendorSets(id, 'CANCELLED')).body.message).toContain('cannot be rejected');
  });

  it("store never receives the customer's delivery code, and unpaid online orders stay hidden", async () => {
    await makeOrder({ riderDetails: { riderId, deliveryOtp: '4242' } });
    const unpaid = await makeOrder({ paymentMethod: 'ONLINE', paymentStatus: 'PENDING' });
    const r = await call(getVendorOrders, { query: { limit: 100 }, user: { id: String(vendor._id), role: 'vendor' } });
    const list = r.body.data.orders || r.body.data;
    expect(list.every((o) => !o.riderDetails?.deliveryOtp)).toBe(true);
    expect(list.find((o) => o.orderId === unpaid)).toBeUndefined();
  });
});
