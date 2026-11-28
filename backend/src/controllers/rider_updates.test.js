import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import RiderUpdate from '../models/RiderUpdate.js';
import Notification from '../models/Notification.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import Order from '../models/Order.js';
import {
  getRiderUpdatesFeed,
  getRiderNotifications,
  markRiderNotificationRead,
  markAllRiderNotificationsRead,
  adminCreateRiderUpdate,
} from './riderUpdates.controller.js';
import { adminAssignDeliveryOrder, adminProcessRiderWithdrawal } from './delivery.controller.js';

const emits = [];
vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: (room) => ({ emit: (ev, data) => emits.push({ room, ev, data }) }) }) }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(async () => {
  emits.length = 0;
  await clearCollections();
});

const oid = () => new mongoose.Types.ObjectId();
const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const waitFor = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
let seq = 0;
const makeRider = async (extra = {}) => {
  seq += 1;
  const _id = oid();
  await DeliveryPartner.collection.insertOne({ _id, riderId: `RID-U${seq}`, phone: `93000${seq}`, name: `Rider ${seq}`, applicationStatus: 'APPROVED', isOnline: true, status: 'AVAILABLE', earningsLedger: [], totalEarnings: 0, ...extra });
  return _id;
};

describe('Rider updates feed', () => {
  it('shows only active, in-date items for the rider zone (or all-zone items)', async () => {
    const zoneA = oid();
    const zoneB = oid();
    const rider = await makeRider({ workingZoneId: zoneA });
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000);
    await RiderUpdate.insertMany([
      { kind: 'announcement', title: 'All riders', zoneIds: [] },
      { kind: 'announcement', title: 'Zone A only', zoneIds: [zoneA] },
      { kind: 'announcement', title: 'Zone B only', zoneIds: [zoneB] },
      { kind: 'announcement', title: 'Expired', endAt: past },
      { kind: 'announcement', title: 'Scheduled later', startAt: future },
      { kind: 'announcement', title: 'Switched off', isActive: false },
      { kind: 'story', title: 'Safety story', imageUrl: 'https://x/s.jpg' },
      { kind: 'video', title: 'Training', videoUrl: 'https://youtu.be/abc' },
    ]);
    const r = res();
    await getRiderUpdatesFeed({ user: { id: String(rider) } }, r);
    expect(r.body.data.announcements.map((a) => a.title).sort()).toEqual(['All riders', 'Zone A only']);
    expect(r.body.data.stories).toHaveLength(1);
    expect(r.body.data.videos).toHaveLength(1);
  });

  it('a rider with no zone sees only all-zone items', async () => {
    const rider = await makeRider();
    await RiderUpdate.insertMany([{ kind: 'announcement', title: 'All riders' }, { kind: 'announcement', title: 'Zone only', zoneIds: [oid()] }]);
    const r = res();
    await getRiderUpdatesFeed({ user: { id: String(rider) } }, r);
    expect(r.body.data.announcements.map((a) => a.title)).toEqual(['All riders']);
  });
});

describe('Admin validation', () => {
  const create = async (body) => {
    const r = res();
    await adminCreateRiderUpdate({ body, user: { id: String(oid()) } }, r);
    return r;
  };
  it('requires a title, a video link for videos, an image for stories, http(s) links, end after start', async () => {
    expect((await create({ kind: 'announcement' })).statusCode).toBe(400);
    expect((await create({ kind: 'video', title: 'T' })).statusCode).toBe(400);
    expect((await create({ kind: 'story', title: 'S' })).statusCode).toBe(400);
    expect((await create({ kind: 'video', title: 'T', videoUrl: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await create({ kind: 'announcement', title: 'A', startAt: '2027-01-02', endAt: '2027-01-01' })).statusCode).toBe(400);
    const ok = await create({ kind: 'announcement', title: 'Holiday hours', body: 'Hub closed Sunday', zoneIds: 'bad,' + String(oid()) });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.data.zoneIds).toHaveLength(1);
  });
});

describe('Rider notifications', () => {
  it('list with unread count; mark one / all read; riders only see their own', async () => {
    const me = await makeRider();
    const other = await makeRider();
    await Notification.insertMany([
      { recipientId: me, recipientType: 'delivery', type: 'rider_order', title: 'A', message: 'a' },
      { recipientId: me, recipientType: 'delivery', type: 'rider_payout', title: 'B', message: 'b' },
      { recipientId: other, recipientType: 'delivery', type: 'rider_payout', title: 'C', message: 'c' },
    ]);
    let r = res();
    await getRiderNotifications({ user: { id: String(me) }, query: {} }, r);
    expect(r.body.data).toMatchObject({ total: 2, unread: 2 });
    const first = r.body.data.rows[0]._id;
    await markRiderNotificationRead({ user: { id: String(me) }, params: { id: String(first) } }, res());
    r = res();
    await getRiderNotifications({ user: { id: String(me) }, query: {} }, r);
    expect(r.body.data.unread).toBe(1);
    // cannot mark someone else's
    const otherNotif = await Notification.findOne({ recipientId: other });
    await markRiderNotificationRead({ user: { id: String(me) }, params: { id: String(otherNotif._id) } }, res());
    expect((await Notification.findById(otherNotif._id)).isRead).toBe(false);
    await markAllRiderNotificationsRead({ user: { id: String(me) } }, res());
    r = res();
    await getRiderNotifications({ user: { id: String(me) }, query: {} }, r);
    expect(r.body.data.unread).toBe(0);
  });

  it('admin assigning an order creates a real rider notification (and live event)', async () => {
    const rider = await makeRider();
    const orderId = oid();
    await Order.collection.insertOne({
      _id: orderId, orderId: 'ORD-N1', vendorId: oid(), customerId: oid(), storeName: 'Fresh Mart', vendorZeebacId: 'Z', customerName: 'C', customerPhone: '9',
      fulfillmentType: 'delivery', paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'READY_FOR_PICKUP', items: [], totalAmount: 100, finalPayableAmount: 100, totalCashbackPoints: 0,
    });
    const r = res();
    await adminAssignDeliveryOrder({ body: { orderId: String(orderId), riderId: String(rider) }, user: { id: String(oid()) } }, r);
    expect(r.statusCode).toBe(200);
    expect(await waitFor(async () => (await Notification.countDocuments({ recipientId: rider, recipientType: 'delivery' })) === 1)).toBe(true);
    const n = await Notification.findOne({ recipientId: rider });
    expect(n.title).toBe('New order assigned: #ORD-N1');
    expect(emits.some((e) => e.room === `rider_${rider}` && e.ev === 'new_notification')).toBe(true);
  });

  it('withdrawal paid creates a payout notification with the UTR', async () => {
    const wid = oid();
    const rider = await makeRider({ earningsLedger: [{ _id: wid, type: 'WITHDRAWAL', status: 'PENDING', amount: -500, description: 'w', date: new Date() }] });
    const r = res();
    await adminProcessRiderWithdrawal({ params: { id: String(rider), requestId: String(wid) }, body: { action: 'Approve', payoutMethod: 'ONLINE', utr: 'UTR123456789' }, user: { name: 'Admin' } }, r);
    expect(r.statusCode).toBe(200);
    expect(await waitFor(async () => !!(await Notification.findOne({ recipientId: rider, type: 'rider_payout' })))).toBe(true);
    const n = await Notification.findOne({ recipientId: rider, type: 'rider_payout' });
    expect(n.title).toBe('Payout of ₹500 sent');
    expect(n.message).toContain('UTR123456789');
  });
});
