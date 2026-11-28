/**
 * Admin → users notifications.
 * Audience: one person, or a whole group (customers / vendors / riders) narrowed by filters.
 * Delivery: in-app notification (inbox + live socket) for every recipient, plus phone push (FCM)
 * to every registered device when sendPush is on. Large groups go out in batches.
 * A broadcast is claimed atomically (QUEUED/SCHEDULED → SENDING) so it is never sent twice,
 * even with several server instances running the scheduler.
 */
import mongoose from 'mongoose';
import { firebaseInitialized } from '../config/firebase.admin.js';
import { getMessaging } from 'firebase-admin/messaging';
import AdminBroadcast from '../models/AdminBroadcast.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import { getIO } from '../socket/socket.js';
import logger from './logger.js';

const BATCH = 500;
const escapeRx = (v) => new RegExp(`^${String(v).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

export const ROLE_CONFIG = {
  customer: { model: User, recipientType: 'customer', room: (id) => `user_${id}`, base: { role: 'customer', status: 'Active' }, label: 'name phone zeebacId' },
  vendor: { model: Vendor, recipientType: 'vendor', room: (id) => `vendor_${id}`, base: { status: 'Verified' }, label: 'storeName phone zeebacId' },
  delivery: { model: DeliveryPartner, recipientType: 'delivery', room: (id) => `rider_${id}`, base: { applicationStatus: 'APPROVED' }, label: 'name phone riderId' },
};

/** Mongo query for an audience. */
export const audienceQuery = (audience) => {
  const cfg = ROLE_CONFIG[audience.role];
  if (!cfg) throw new Error('Unknown audience');
  if (audience.mode === 'single') return { _id: new mongoose.Types.ObjectId(String(audience.recipientId)) };
  const f = audience.filters || {};
  const q = { ...cfg.base };
  if (audience.role === 'customer' && f.city) q['location.city'] = escapeRx(f.city);
  if (audience.role === 'vendor') {
    if (f.city) q['address.city'] = escapeRx(f.city);
    if (f.vendorCategory) q.category = escapeRx(f.vendorCategory);
    if (f.subscriptionTier === 'NONE') q['subscription.status'] = { $ne: 'ACTIVE' };
    else if (f.subscriptionTier) Object.assign(q, { 'subscription.status': 'ACTIVE', 'subscription.tierCode': f.subscriptionTier });
  }
  if (audience.role === 'delivery') {
    if (f.city) q['address.city'] = escapeRx(f.city);
    if (f.zoneId) q.workingZoneId = new mongoose.Types.ObjectId(String(f.zoneId));
  }
  return q;
};

/** How many people / push-enabled devices an audience reaches. */
export const previewAudience = async (audience) => {
  const cfg = ROLE_CONFIG[audience.role];
  const q = audienceQuery(audience);
  const [recipients, devicesAgg] = await Promise.all([
    cfg.model.countDocuments(q),
    cfg.model.aggregate([{ $match: q }, { $project: { n: { $size: { $ifNull: ['$fcmTokens', []] } } } }, { $group: { _id: null, devices: { $sum: '$n' }, people: { $sum: { $cond: [{ $gt: ['$n', 0] }, 1, 0] } } } }]),
  ]);
  return { recipients, pushDevices: devicesAgg[0]?.devices || 0, pushPeople: devicesAgg[0]?.people || 0, pushConfigured: Boolean(firebaseInitialized) };
};

const sendPushBatch = async ({ tokens, owners, broadcast, cfg }) => {
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: broadcast.title, body: broadcast.message },
    data: { type: 'admin_message', broadcastId: String(broadcast._id), role: broadcast.audience.role, url: broadcast.url || '' },
    android: { priority: 'high', notification: { sound: 'default' } },
    webpush: {
      headers: { Urgency: 'high' },
      notification: { title: broadcast.title, body: broadcast.message, icon: '/Logo (6).png', badge: '/Logo (6).png', data: { url: broadcast.url || '', role: broadcast.audience.role } },
    },
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push({ owner: owners[i], token: tokens[i] });
  });
  for (const d of dead) await cfg.model.updateOne({ _id: d.owner }, { $pull: { fcmTokens: d.token } }).catch(() => {});
  return { sent: res.successCount, failed: res.failureCount };
};

const STALE_MS = 2 * 60 * 1000; // no batch progress for this long ⇒ the sender died (restart / crash)
const MAX_RESUMES = 3;

/**
 * Sends a broadcast that has already been claimed (status SENDING).
 * Recipients who already have this broadcast's notification are skipped, so a resumed send
 * never notifies anyone twice. Stats continue from what was already delivered.
 */
const runDelivery = async (b) => {
  const cfg = ROLE_CONFIG[b.audience.role];
  const bid = String(b._id);
  const alreadyIds = await Notification.distinct('recipientId', { 'data.broadcastId': bid });
  const already = new Set(alreadyIds.map(String));
  const stats = {
    recipients: already.size,
    inApp: already.size,
    pushDevices: b.stats?.pushDevices || 0,
    pushSent: b.stats?.pushSent || 0,
    pushFailed: b.stats?.pushFailed || 0,
  };
  const canPush = b.sendPush && firebaseInitialized;
  try {
    const cursor = cfg.model.find(audienceQuery(b.audience)).select('_id fcmTokens').lean().cursor({ batchSize: BATCH });
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      stats.recipients += batch.length;
      const docs = await Notification.insertMany(
        batch.map((r) => ({
          recipientId: r._id,
          recipientType: cfg.recipientType,
          type: 'admin_message',
          title: b.title,
          message: b.message,
          icon: 'campaign',
          data: { broadcastId: bid, url: b.url || '' },
        })),
        { ordered: false }
      );
      stats.inApp += docs.length;
      try {
        const io = getIO();
        docs.forEach((n) => io.to(cfg.room(String(n.recipientId))).emit('new_notification', n));
      } catch {
        /* socket not initialised (scripts/tests) */
      }
      if (canPush) {
        const tokens = [];
        const owners = [];
        for (const r of batch) for (const t of r.fcmTokens || []) {
          tokens.push(t);
          owners.push(r._id);
        }
        stats.pushDevices += tokens.length;
        for (let i = 0; i < tokens.length; i += BATCH) {
          const out = await sendPushBatch({ tokens: tokens.slice(i, i + BATCH), owners: owners.slice(i, i + BATCH), broadcast: b, cfg });
          stats.pushSent += out.sent;
          stats.pushFailed += out.failed;
        }
      }
      batch = [];
      await AdminBroadcast.updateOne({ _id: b._id }, { $set: { stats, heartbeatAt: new Date() } }); // progress + heartbeat
    };
    for await (const r of cursor) {
      if (already.has(String(r._id))) continue; // delivered before the interruption
      batch.push(r);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    return AdminBroadcast.findByIdAndUpdate(b._id, { $set: { status: 'SENT', sentAt: new Date(), stats, heartbeatAt: new Date() } }, { new: true });
  } catch (err) {
    logger.error(`[deliverBroadcast] ${bid}: ${err.message}`);
    return AdminBroadcast.findByIdAndUpdate(b._id, { $set: { status: 'FAILED', error: err.message, stats } }, { new: true });
  }
};

/** Deliver one broadcast (claims it first). Returns the final document or null if not claimable. */
export const deliverBroadcast = async (broadcastId) => {
  const now = new Date();
  const b = await AdminBroadcast.findOneAndUpdate(
    { _id: broadcastId, status: { $in: ['QUEUED', 'SCHEDULED'] } },
    { $set: { status: 'SENDING', startedAt: now, heartbeatAt: now } },
    { new: true }
  );
  if (!b) return null;
  return runDelivery(b);
};

/**
 * Resume sends whose sender died mid-way (no heartbeat for STALE_MS). The claim moves the
 * heartbeat forward atomically, so only one server instance resumes a given broadcast.
 */
export const resumeStalledBroadcasts = async () => {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await AdminBroadcast.find({ status: 'SENDING', $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null }] }).select('_id').limit(10).lean();
  let resumed = 0;
  for (const s of stale) {
    const b = await AdminBroadcast.findOneAndUpdate(
      { _id: s._id, status: 'SENDING', $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null }] },
      { $set: { heartbeatAt: new Date() }, $inc: { resumeCount: 1 } },
      { new: true }
    );
    if (!b) continue; // another instance took it
    if (b.resumeCount > MAX_RESUMES) {
      await AdminBroadcast.updateOne({ _id: b._id }, { $set: { status: 'FAILED', error: `Stopped after ${MAX_RESUMES} interrupted attempts` } });
      continue;
    }
    logger.warn(`[broadcastScheduler] resuming interrupted broadcast ${b._id} (attempt ${b.resumeCount})`);
    await runDelivery(b);
    resumed += 1;
  }
  return resumed;
};

/** Scheduler tick: send every due scheduled broadcast. Safe to run on several instances. */
export const runDueBroadcasts = async () => {
  await resumeStalledBroadcasts();
  const due = await AdminBroadcast.find({ status: 'SCHEDULED', scheduledAt: { $lte: new Date() } }).select('_id').limit(20).lean();
  for (const d of due) await deliverBroadcast(d._id);
  return due.length;
};

let timer = null;
export const startBroadcastScheduler = (intervalMs = 30000) => {
  if (timer) return;
  timer = setInterval(() => {
    runDueBroadcasts().catch((err) => logger.warn(`[broadcastScheduler] ${err.message}`));
  }, intervalMs);
  timer.unref?.();
  // Right after a restart: pick up anything that was mid-send (once its heartbeat is stale)
  runDueBroadcasts().catch((err) => logger.warn(`[broadcastScheduler] ${err.message}`));
  logger.info('[broadcastScheduler] started');
};
