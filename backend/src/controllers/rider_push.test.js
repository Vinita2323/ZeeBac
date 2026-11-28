import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';

// Firebase mocked: record every multicast, mark tokens starting with "dead" as unregistered
const sent = vi.hoisted(() => []);
vi.mock('../config/firebase.admin.js', () => ({ firebaseInitialized: true, default: {} }));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (msg) => {
      sent.push(msg);
      const responses = msg.tokens.map((t) =>
        t.startsWith('dead') ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }
      );
      return { responses, successCount: responses.filter((r) => r.success).length, failureCount: responses.filter((r) => !r.success).length };
    },
  }),
}));
vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: () => {} }) }) }));

const { default: DeliveryPartner } = await import('../models/DeliveryPartner.js');
const { default: RiderUpdate } = await import('../models/RiderUpdate.js');
const { default: Order } = await import('../models/Order.js');
const { saveRiderFcmToken, adminPushRiderUpdate, adminCreateRiderUpdate } = await import('./riderUpdates.controller.js');
const { adminAssignDeliveryOrder, adminProcessRiderWithdrawal, deliveryLogout } = await import('./delivery.controller.js');

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(async () => {
  sent.length = 0;
  await clearCollections();
});

const oid = () => new mongoose.Types.ObjectId();
const tok = (p) => `${p}-${'x'.repeat(40)}`;
const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
};
let seq = 0;
const makeRider = async (extra = {}) => {
  seq += 1;
  const _id = oid();
  await DeliveryPartner.collection.insertOne({ _id, riderId: `RID-P${seq}`, phone: `94000${seq}`, name: `Rider ${seq}`, applicationStatus: 'APPROVED', isOnline: true, status: 'AVAILABLE', earningsLedger: [], totalEarnings: 0, fcmTokens: [], ...extra });
  return _id;
};

describe('Rider device registration', () => {
  it('stores the token once, keeps the newest 10, and moves a shared phone to the new rider', async () => {
    const a = await makeRider();
    const b = await makeRider();
    await saveRiderFcmToken({ user: { id: String(a) }, body: { token: tok('phone1') } }, res());
    await saveRiderFcmToken({ user: { id: String(a) }, body: { token: tok('phone1') } }, res());
    expect((await DeliveryPartner.findById(a)).fcmTokens).toEqual([tok('phone1')]);
    for (let i = 0; i < 12; i += 1) await saveRiderFcmToken({ user: { id: String(a) }, body: { token: tok(`d${i}`) } }, res());
    const after = (await DeliveryPartner.findById(a)).fcmTokens;
    expect(after).toHaveLength(10);
    expect(after.at(-1)).toBe(tok('d11'));
    await saveRiderFcmToken({ user: { id: String(b) }, body: { token: tok('d11') } }, res());
    expect((await DeliveryPartner.findById(a)).fcmTokens).not.toContain(tok('d11'));
    expect((await DeliveryPartner.findById(b)).fcmTokens).toEqual([tok('d11')]);
    const bad = res();
    await saveRiderFcmToken({ user: { id: String(a) }, body: { token: 'short' } }, bad);
    expect(bad.statusCode).toBe(400);
  });

  it('logout removes this device token', async () => {
    const a = await makeRider({ fcmTokens: [tok('p1'), tok('p2')] });
    await deliveryLogout({ user: { id: String(a) }, body: { fcmToken: tok('p1') } }, res());
    expect((await DeliveryPartner.findById(a)).fcmTokens).toEqual([tok('p2')]);
  });
});

describe('Push when an order is assigned / money moves', () => {
  it('assigning an order pushes to all rider devices, opens the dashboard, data is all strings; dead tokens are removed', async () => {
    const rider = await makeRider({ fcmTokens: [tok('live'), tok('dead')] });
    const orderId = oid();
    await Order.collection.insertOne({
      _id: orderId, orderId: 'ORD-P1', vendorId: oid(), customerId: oid(), storeName: 'Fresh Mart', vendorZeebacId: 'Z', customerName: 'C', customerPhone: '9',
      fulfillmentType: 'delivery', paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'READY_FOR_PICKUP', items: [], totalAmount: 100, finalPayableAmount: 100, totalCashbackPoints: 0,
    });
    const r = res();
    await adminAssignDeliveryOrder({ body: { orderId: String(orderId), riderId: String(rider) }, user: { id: String(oid()) } }, r);
    expect(r.statusCode).toBe(200);
    expect(await waitFor(() => sent.length === 1)).toBe(true);
    const msg = sent[0];
    expect(msg.tokens).toEqual([tok('live'), tok('dead')]);
    expect(msg.notification.title).toBe('New order assigned: #ORD-P1');
    expect(msg.data.url).toBe('/delivery/dashboard');
    expect(Object.values(msg.data).every((v) => typeof v === 'string')).toBe(true);
    expect(Object.values(msg.webpush.notification.data).every((v) => typeof v === 'string')).toBe(true);
    expect(await waitFor(async () => (await DeliveryPartner.findById(rider)).fcmTokens.length === 1)).toBe(true);
    expect((await DeliveryPartner.findById(rider)).fcmTokens).toEqual([tok('live')]);
  });

  it('payout push carries the amount as a string and opens Pocket', async () => {
    const wid = oid();
    const rider = await makeRider({ fcmTokens: [tok('p')], earningsLedger: [{ _id: wid, type: 'WITHDRAWAL', status: 'PENDING', amount: -250, description: 'w', date: new Date() }] });
    await adminProcessRiderWithdrawal({ params: { id: String(rider), requestId: String(wid) }, body: { action: 'Approve', payoutMethod: 'CASH' }, user: { name: 'A' } }, res());
    expect(await waitFor(() => sent.length === 1)).toBe(true);
    expect(sent[0].notification.title).toBe('Payout of ₹250 sent');
    expect(sent[0].data).toMatchObject({ url: '/delivery/earnings', amount: '250' });
  });

  it('a rider with no devices gets the in-app notification but no push', async () => {
    const rider = await makeRider();
    const orderId = oid();
    await Order.collection.insertOne({ _id: orderId, orderId: 'ORD-P2', vendorId: oid(), customerId: oid(), storeName: 'S', vendorZeebacId: 'Z', customerName: 'C', customerPhone: '9', fulfillmentType: 'delivery', paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'READY_FOR_PICKUP', items: [], totalAmount: 1, finalPayableAmount: 1, totalCashbackPoints: 0 });
    await adminAssignDeliveryOrder({ body: { orderId: String(orderId), riderId: String(rider) }, user: { id: String(oid()) } }, res());
    const Notification = (await import('../models/Notification.js')).default;
    expect(await waitFor(async () => (await Notification.countDocuments({ recipientId: rider })) === 1)).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe('Admin pushes an update', () => {
  it('targets only riders in the chosen zones, counts devices, blocks a repeat within 5 minutes', async () => {
    const zA = oid();
    const zB = oid();
    await makeRider({ workingZoneId: zA, fcmTokens: [tok('a1'), tok('a2')] });
    await makeRider({ workingZoneId: zB, fcmTokens: [tok('b1')] });
    await makeRider({ workingZoneId: zA, fcmTokens: [tok('a3')], applicationStatus: 'SUSPENDED' });
    const u = await RiderUpdate.create({ kind: 'announcement', title: 'Hub closed Sunday', body: 'Deposit cash on Saturday', zoneIds: [zA] });
    const r = res();
    await adminPushRiderUpdate({ params: { id: String(u._id) } }, r);
    expect(r.body.data).toMatchObject({ riders: 1, devices: 2, sent: 2, failed: 0, pushEnabled: true });
    expect(sent[0].tokens.sort()).toEqual([tok('a1'), tok('a2')].sort());
    expect(sent[0].data.url).toBe('/delivery/updates');
    const again = res();
    await adminPushRiderUpdate({ params: { id: String(u._id) } }, again);
    expect(again.statusCode).toBe(429);
    expect(sent).toHaveLength(1);
  });

  it('switched-off items cannot be pushed; publishing with "send push" pushes to all riders', async () => {
    await makeRider({ fcmTokens: [tok('x1')] });
    await makeRider({ fcmTokens: [tok('x2')] });
    const off = await RiderUpdate.create({ kind: 'announcement', title: 'Off', isActive: false });
    const r1 = res();
    await adminPushRiderUpdate({ params: { id: String(off._id) } }, r1);
    expect(r1.statusCode).toBe(400);
    const r2 = res();
    await adminCreateRiderUpdate({ body: { kind: 'video', title: 'OTP training', videoUrl: 'https://youtu.be/abcdefgh', sendPush: 'true' }, user: { id: String(oid()) } }, r2);
    expect(r2.statusCode).toBe(201);
    expect(r2.body.push).toMatchObject({ riders: 2, devices: 2, sent: 2 });
    expect(sent[0].notification.body).toBe('New training video');
  });
});
