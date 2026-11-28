import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';

const sent = vi.hoisted(() => []);
const emitted = vi.hoisted(() => []);
vi.mock('../config/firebase.admin.js', () => ({ firebaseInitialized: true, default: {} }));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (msg) => {
      sent.push(msg);
      const responses = msg.tokens.map((t) => (t.startsWith('dead') ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }));
      return { responses, successCount: responses.filter((r) => r.success).length, failureCount: responses.filter((r) => !r.success).length };
    },
  }),
}));
vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: (room) => ({ emit: (ev) => emitted.push({ room, ev }) }) }) }));

const { default: User } = await import('../models/User.js');
const { default: Vendor } = await import('../models/Vendor.js');
const { default: DeliveryPartner } = await import('../models/DeliveryPartner.js');
const { default: Notification } = await import('../models/Notification.js');
const { default: AdminBroadcast } = await import('../models/AdminBroadcast.js');
const { createBroadcast, previewBroadcast, cancelBroadcast, lookupRecipient } = await import('./adminBroadcast.controller.js');
const { deliverBroadcast, runDueBroadcasts, resumeStalledBroadcasts } = await import('../utils/adminBroadcast.util.js');
const { saveMobileFcmToken } = await import('./notification.controller.js');

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(async () => {
  sent.length = 0;
  emitted.length = 0;
  await clearCollections();
});

const oid = () => new mongoose.Types.ObjectId();
const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const admin = { id: String(oid()), name: 'Admin', role: 'super_admin' };
const waitFor = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
};
let seq = 0;
const cust = (extra = {}) => ({ _id: oid(), zeebacId: `ZBC-B${++seq}`, name: `Cust ${seq}`, phone: `91${String(seq).padStart(8, '0')}`, role: 'customer', status: 'Active', fcmTokens: [], ...extra });
const send = async (body) => {
  const r = res();
  await createBroadcast({ body, user: admin, ip: '1.1.1.1', headers: {} }, r);
  return r;
};

describe('Audience filters', () => {
  it('customers by city, vendors by category + plan, riders by zone', async () => {
    await User.collection.insertMany([cust({ location: { city: 'Lucknow' } }), cust({ location: { city: 'lucknow' } }), cust({ location: { city: 'Kanpur' } }), cust({ status: 'Banned', location: { city: 'Lucknow' } })]);
    await Vendor.collection.insertMany([
      { _id: oid(), zeebacId: 'V1', phone: '81', storeName: 'A', status: 'Verified', category: 'Groceries', subscription: { status: 'ACTIVE', tierCode: 'BRAND' } },
      { _id: oid(), zeebacId: 'V2', phone: '82', storeName: 'B', status: 'Verified', category: 'Groceries', subscription: { status: 'EXPIRED' } },
      { _id: oid(), zeebacId: 'V3', phone: '83', storeName: 'C', status: 'Pending', category: 'Groceries' },
    ]);
    const zone = oid();
    await DeliveryPartner.collection.insertMany([
      { _id: oid(), riderId: 'R1', phone: '71', name: 'R1', applicationStatus: 'APPROVED', workingZoneId: zone, fcmTokens: ['t1', 't2'] },
      { _id: oid(), riderId: 'R2', phone: '72', name: 'R2', applicationStatus: 'APPROVED', workingZoneId: oid() },
    ]);
    const p = async (audience) => {
      const r = res();
      await previewBroadcast({ body: { audience } }, r);
      return r.body.data;
    };
    expect((await p({ mode: 'group', role: 'customer', filters: { city: 'Lucknow' } })).recipients).toBe(2);
    expect((await p({ mode: 'group', role: 'customer' })).recipients).toBe(3);
    expect((await p({ mode: 'group', role: 'vendor', filters: { vendorCategory: 'groceries' } })).recipients).toBe(2);
    expect((await p({ mode: 'group', role: 'vendor', filters: { subscriptionTier: 'BRAND' } })).recipients).toBe(1);
    expect((await p({ mode: 'group', role: 'vendor', filters: { subscriptionTier: 'NONE' } })).recipients).toBe(1);
    expect(await p({ mode: 'group', role: 'delivery', filters: { zoneId: String(zone) } })).toMatchObject({ recipients: 1, pushDevices: 2, pushPeople: 1 });
  });
});

describe('Sending', () => {
  it('one person: in-app notification + live event + push to their devices; dead tokens dropped', async () => {
    const u = cust({ fcmTokens: ['live-token', 'dead-token'] });
    await User.collection.insertOne(u);
    const r = await send({ audience: { mode: 'single', role: 'customer', recipientId: String(u._id) }, title: 'Your refund is processed', message: '₹120 is back in your wallet', url: '/wallet' });
    expect(r.statusCode).toBe(202);
    expect(await waitFor(async () => (await AdminBroadcast.findById(r.body.data._id)).status === 'SENT')).toBe(true);
    const b = await AdminBroadcast.findById(r.body.data._id);
    expect(b.stats).toMatchObject({ recipients: 1, inApp: 1, pushDevices: 2, pushSent: 1, pushFailed: 1 });
    expect(b.audience.recipientLabel).toContain(u.phone);
    const n = await Notification.findOne({ recipientId: u._id });
    expect(n).toMatchObject({ type: 'admin_message', recipientType: 'customer', title: 'Your refund is processed' });
    expect(n.data.url).toBe('/wallet');
    expect(emitted.some((e) => e.room === `user_${u._id}` && e.ev === 'new_notification')).toBe(true);
    expect(sent[0].data).toMatchObject({ url: '/wallet', type: 'admin_message' });
    expect((await User.findById(u._id)).fcmTokens).toEqual(['live-token']);
  });

  it('a large group is delivered in batches, everyone exactly once', async () => {
    const many = Array.from({ length: 1200 }, () => cust({ fcmTokens: ['tok'] }));
    await User.collection.insertMany(many);
    const needConfirm = await send({ audience: { mode: 'group', role: 'customer' }, title: 'Diwali offers live', message: 'Extra cashback this week' });
    expect(needConfirm.statusCode).toBe(409);
    expect(needConfirm.body.code).toBe('CONFIRM_LARGE');
    const r = await send({ audience: { mode: 'group', role: 'customer' }, title: 'Diwali offers live', message: 'Extra cashback this week', confirmLarge: true });
    expect(r.statusCode).toBe(202);
    expect(await waitFor(async () => (await AdminBroadcast.findById(r.body.data._id)).status === 'SENT', 20000)).toBe(true);
    expect(await Notification.countDocuments({ type: 'admin_message' })).toBe(1200);
    const b = await AdminBroadcast.findById(r.body.data._id);
    expect(b.stats).toMatchObject({ recipients: 1200, inApp: 1200, pushSent: 1200 });
    expect(sent.length).toBe(3); // 500 + 500 + 200
    // delivering the same broadcast again does nothing
    expect(await deliverBroadcast(b._id)).toBeNull();
    expect(await Notification.countDocuments({ type: 'admin_message' })).toBe(1200);
  }, 60000);

  it('blocks the same message to the same audience within 10 minutes (unless forced)', async () => {
    const u = cust();
    await User.collection.insertOne(u);
    const body = { audience: { mode: 'single', role: 'customer', recipientId: String(u._id) }, title: 'Hi', message: 'Hello' };
    expect((await send(body)).statusCode).toBe(202);
    const dup = await send(body);
    expect(dup.statusCode).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE');
    expect((await send({ ...body, force: true })).statusCode).toBe(202);
  });

  it('validation: audience, title/message length, in-app links only, nobody matching', async () => {
    expect((await send({ audience: { mode: 'group' }, title: 'T', message: 'M' })).statusCode).toBe(400);
    expect((await send({ audience: { mode: 'single', role: 'customer' }, title: 'T', message: 'M' })).statusCode).toBe(400);
    expect((await send({ audience: { mode: 'group', role: 'customer' }, title: '', message: 'M' })).statusCode).toBe(400);
    expect((await send({ audience: { mode: 'group', role: 'customer' }, title: 'T', message: 'x'.repeat(501) })).statusCode).toBe(400);
    expect((await send({ audience: { mode: 'group', role: 'customer' }, title: 'T', message: 'M', url: 'https://evil.example' })).statusCode).toBe(400);
    expect((await send({ audience: { mode: 'group', role: 'customer', filters: { city: 'Nowhere' } }, title: 'T', message: 'M' })).statusCode).toBe(400);
  });
});

describe('Scheduling', () => {
  it('scheduled sends wait until due, then go out once; cancel works before that', async () => {
    const u = cust();
    await User.collection.insertOne(u);
    const later = new Date(Date.now() + 3600e3).toISOString();
    const r = await send({ audience: { mode: 'single', role: 'customer', recipientId: String(u._id) }, title: 'Reminder', message: 'Offer ends tonight', scheduledAt: later });
    expect(r.body.data.status).toBe('SCHEDULED');
    expect(await runDueBroadcasts()).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);
    // time passes
    await AdminBroadcast.updateOne({ _id: r.body.data._id }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
    await Promise.all([runDueBroadcasts(), runDueBroadcasts()]); // two scheduler instances
    expect(await Notification.countDocuments()).toBe(1);
    expect((await AdminBroadcast.findById(r.body.data._id)).status).toBe('SENT');

    const r2 = await send({ audience: { mode: 'single', role: 'customer', recipientId: String(u._id) }, title: 'Other', message: 'Later', scheduledAt: later });
    const c = res();
    await cancelBroadcast({ params: { id: String(r2.body.data._id) }, user: admin, headers: {} }, c);
    expect(c.body.data.status).toBe('CANCELLED');
    await AdminBroadcast.updateOne({ _id: r2.body.data._id }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
    await runDueBroadcasts();
    expect(await Notification.countDocuments({ title: 'Other' })).toBe(0);
    expect((await send({ audience: { mode: 'single', role: 'customer', recipientId: String(u._id) }, title: 'Past', message: 'x', scheduledAt: '2020-01-01' })).statusCode).toBe(400);
  });
});

describe('Lookup & push-token security', () => {
  it('finds a person by phone / ZeeBac ID', async () => {
    const u = cust({ name: 'Asha', phone: '9876543210' });
    await User.collection.insertOne(u);
    const r = res();
    await lookupRecipient({ query: { role: 'customer', q: '98765' } }, r);
    expect(r.body.data[0]).toMatchObject({ name: 'Asha', phone: '9876543210' });
  });

  it('push-token save ignores a forged userId and uses the logged-in account', async () => {
    const victim = cust();
    const attacker = cust();
    await User.collection.insertMany([victim, attacker]);
    const r = res();
    await saveMobileFcmToken({ body: { token: 'attacker-phone-token', userId: String(victim._id), role: 'customer' }, user: { id: String(attacker._id), role: 'customer' } }, r);
    expect(r.statusCode).toBe(200);
    expect((await User.findById(victim._id)).fcmTokens || []).not.toContain('attacker-phone-token');
    expect((await User.findById(attacker._id)).fcmTokens).toContain('attacker-phone-token');
    const anon = res();
    await saveMobileFcmToken({ body: { token: 'x', userId: String(victim._id) } }, anon);
    expect(anon.statusCode).toBe(401);
  });
});

describe('Recovery after a restart mid-send', () => {
  const makeInterrupted = async ({ total, done, heartbeatAgoMs, resumeCount = 0 }) => {
    const users = Array.from({ length: total }, () => cust({ fcmTokens: ['tok'] }));
    await User.collection.insertMany(users);
    const b = await AdminBroadcast.create({
      audience: { mode: 'group', role: 'customer' },
      title: 'Big sale',
      message: 'Starts now',
      sendPush: true,
      status: 'SENDING',
      startedAt: new Date(Date.now() - heartbeatAgoMs),
      heartbeatAt: new Date(Date.now() - heartbeatAgoMs),
      resumeCount,
      stats: { recipients: done, inApp: done, pushDevices: done, pushSent: done, pushFailed: 0 },
    });
    // the first `done` people were delivered before the crash
    await Notification.insertMany(users.slice(0, done).map((u) => ({ recipientId: u._id, recipientType: 'customer', type: 'admin_message', title: 'Big sale', message: 'Starts now', data: { broadcastId: String(b._id) } })));
    return b;
  };

  it('resumes a stalled send and finishes it without notifying anyone twice', async () => {
    const b = await makeInterrupted({ total: 1200, done: 500, heartbeatAgoMs: 5 * 60e3 });
    expect(await resumeStalledBroadcasts()).toBe(1);
    const after = await AdminBroadcast.findById(b._id);
    expect(after.status).toBe('SENT');
    expect(after.resumeCount).toBe(1);
    expect(await Notification.countDocuments({ 'data.broadcastId': String(b._id) })).toBe(1200);
    const dupes = await Notification.aggregate([{ $match: { 'data.broadcastId': String(b._id) } }, { $group: { _id: '$recipientId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
    expect(dupes).toHaveLength(0);
    expect(after.stats).toMatchObject({ recipients: 1200, inApp: 1200, pushSent: 1200 }); // 500 before + 700 now
    expect(sent.reduce((n, m) => n + m.tokens.length, 0)).toBe(700); // pushes only to the remaining people
  }, 60000);

  it('does not touch a send that is still making progress', async () => {
    const b = await makeInterrupted({ total: 20, done: 5, heartbeatAgoMs: 10e3 });
    expect(await resumeStalledBroadcasts()).toBe(0);
    expect((await AdminBroadcast.findById(b._id)).status).toBe('SENDING');
  });

  it('two servers resuming at the same time: only one does it', async () => {
    const b = await makeInterrupted({ total: 600, done: 100, heartbeatAgoMs: 5 * 60e3 });
    const [r1, r2] = await Promise.all([resumeStalledBroadcasts(), resumeStalledBroadcasts()]);
    expect(r1 + r2).toBe(1);
    expect(await Notification.countDocuments({ 'data.broadcastId': String(b._id) })).toBe(600);
  }, 60000);

  it('gives up after 3 interrupted attempts', async () => {
    const b = await makeInterrupted({ total: 10, done: 2, heartbeatAgoMs: 5 * 60e3, resumeCount: 3 });
    await resumeStalledBroadcasts();
    const after = await AdminBroadcast.findById(b._id);
    expect(after.status).toBe('FAILED');
    expect(after.error).toMatch(/3 interrupted attempts/);
    expect(await Notification.countDocuments({ 'data.broadcastId': String(b._id) })).toBe(2);
  });
});
