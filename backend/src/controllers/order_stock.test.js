import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import { updateOrderStatus } from './order.controller.js';
import { updateDeliveryOrderStatus } from './delivery.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn(async () => ({})) }));
vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: () => {} }) }) }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const oid = () => new mongoose.Types.ObjectId();
const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

let seq = 0;
const setup = async ({ stock = 10, qty = 3, status = 'PLACED', riderPhone } = {}) => {
  seq += 1;
  const vendorId = oid();
  const customerId = oid();
  const productId = oid();
  await mongoose.connection.collection('vendors').insertOne({ _id: vendorId, zeebacId: `ZV-S${seq}`, phone: `70000${seq}`, storeName: 'S', category: 'Groceries' });
  await mongoose.connection.collection('users').insertOne({ _id: customerId, zeebacId: `ZU-S${seq}`, phone: `60000${seq}` });
  await Product.collection.insertOne({ _id: productId, vendorId, name: 'Rice 1kg', stock });
  const _id = oid();
  await Order.collection.insertOne({
    _id,
    orderId: `ORD-S-${seq}`,
    customerId,
    vendorId,
    storeName: 'S',
    vendorZeebacId: 'ZV',
    customerName: 'C',
    customerPhone: '9',
    fulfillmentType: 'delivery',
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    orderStatus: status,
    items: [{ productId, name: 'Rice 1kg', quantity: qty, price: 50, total: 50 * qty }],
    deliveryCharge: 0,
    totalAmount: 50 * qty,
    finalPayableAmount: 50 * qty,
    pointsRedeemed: 0,
    totalCashbackPoints: 0,
    refunds: [],
    riderDetails: riderPhone ? { phone: riderPhone } : {},
  });
  return { _id, orderId: `ORD-S-${seq}`, vendorId, productId };
};
const stockOf = async (productId) => (await Product.findById(productId)).stock;
const vendorSets = async (o, status) => {
  const res = makeRes();
  await updateOrderStatus({ params: { orderId: o.orderId }, user: { id: String(o.vendorId), role: 'vendor' }, body: { status } }, res);
  return res;
};
const adminCancel = async (o) => {
  const res = makeRes();
  await updateOrderStatus({ params: { orderId: o.orderId }, user: { id: String(oid()), role: 'admin' }, body: { status: 'CANCELLED', reason: 'test' } }, res);
  return res;
};

describe('Online order stock', () => {
  it('store accepting reduces stock once; later stages do not reduce again', async () => {
    const o = await setup({ stock: 10, qty: 3 });
    const r0 = await vendorSets(o, 'CONFIRMED');
    expect(r0.statusCode).toBe(200);
    expect(await stockOf(o.productId)).toBe(7);
    await vendorSets(o, 'PREPARING');
    await vendorSets(o, 'READY_FOR_PICKUP');
    expect(await stockOf(o.productId)).toBe(7);
    const mv = await StockMovement.find({ referenceId: o._id });
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ movementType: 'OUT', quantity: 3, previousStock: 10, newStock: 7, reason: 'ORDER_ACCEPTED' });
  });

  it('a PLACED order (not accepted) does not touch stock and cancel changes nothing', async () => {
    const o = await setup({ stock: 10 });
    await adminCancel(o);
    expect(await stockOf(o.productId)).toBe(10);
    expect(await StockMovement.countDocuments()).toBe(0);
  });

  it('cancel after acceptance restores exactly once', async () => {
    const o = await setup({ stock: 10, qty: 4 });
    await vendorSets(o, 'CONFIRMED');
    expect(await stockOf(o.productId)).toBe(6);
    expect((await adminCancel(o)).statusCode).toBe(200);
    expect(await stockOf(o.productId)).toBe(10);
    await adminCancel(o); // already cancelled → rejected, no double restore
    expect(await stockOf(o.productId)).toBe(10);
    const saved = await Order.findById(o._id);
    expect(saved.stockDeduction).toMatchObject({ deducted: true, restored: true });
  });

  it('short stock: takes only what exists (never negative) and restores only that', async () => {
    const o = await setup({ stock: 2, qty: 5 });
    await vendorSets(o, 'CONFIRMED');
    expect(await stockOf(o.productId)).toBe(0);
    const saved = await Order.findById(o._id);
    expect(saved.stockDeduction.items[0]).toMatchObject({ ordered: 5, quantity: 2 });
    await adminCancel(o);
    expect(await stockOf(o.productId)).toBe(2);
  });

  it('rider return (customer unavailable) puts the items back in stock', async () => {
    const o = await setup({ stock: 10, qty: 3, riderPhone: '9555555555' });
    await vendorSets(o, 'CONFIRMED');
    await Order.updateOne({ _id: o._id }, { $set: { orderStatus: 'OUT_FOR_DELIVERY', deliveryPayout: 30 } });
    const riderId = oid();
    await DeliveryPartner.collection.insertOne({ _id: riderId, riderId: 'RID-S', phone: '9555555555', name: 'R', isOnline: true, status: 'BUSY', activeOrderId: o._id, earningsLedger: [] });
    const res = makeRes();
    await updateDeliveryOrderStatus({ params: { id: String(o._id) }, user: { id: String(riderId) }, body: { status: 'FAILED_DELIVERY', reasonCode: 'REFUSED' } }, res);
    expect(res.statusCode).toBe(200);
    expect(await stockOf(o.productId)).toBe(10);
    const back = await StockMovement.findOne({ referenceId: o._id, movementType: 'IN' });
    expect(back).toMatchObject({ quantity: 3, reason: 'ORDER_RETURN' });
  });

  it("another store's product is never touched", async () => {
    const o = await setup({ stock: 10, qty: 3 });
    await Product.updateOne({ _id: o.productId }, { $set: { vendorId: oid() } });
    await vendorSets(o, 'CONFIRMED');
    expect(await stockOf(o.productId)).toBe(10);
  });
});
