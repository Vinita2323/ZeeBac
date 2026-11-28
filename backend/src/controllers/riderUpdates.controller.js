import mongoose from 'mongoose';
import RiderUpdate from '../models/RiderUpdate.js';
import Notification from '../models/Notification.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import logger from '../utils/logger.js';
import { pushRiderUpdate } from '../utils/riderNotify.util.js';

const KINDS = ['announcement', 'story', 'video'];
const isHttpUrl = (v) => !v || /^https?:\/\//i.test(String(v));

// ═══════════════════ RIDER ═══════════════════

// GET /delivery/updates → { stories, videos, announcements } for this rider (zone + date filtered)
export const getRiderUpdatesFeed = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).select('workingZoneId');
    const now = new Date();
    const zoneFilter = rider?.workingZoneId
      ? { $or: [{ zoneIds: { $size: 0 } }, { zoneIds: rider.workingZoneId }] }
      : { zoneIds: { $size: 0 } };
    const items = await RiderUpdate.find({
      isActive: true,
      startAt: { $lte: now },
      $and: [{ $or: [{ endAt: null }, { endAt: { $gte: now } }] }, zoneFilter],
    })
      .sort({ priority: -1, startAt: -1 })
      .limit(60)
      .select('-createdBy -zoneIds')
      .lean();
    res.json({
      success: true,
      data: {
        stories: items.filter((i) => i.kind === 'story'),
        videos: items.filter((i) => i.kind === 'video'),
        announcements: items.filter((i) => i.kind === 'announcement'),
      },
    });
  } catch (err) {
    logger.error(`getRiderUpdatesFeed: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load updates' });
  }
};

// GET /delivery/notifications?page=1
export const getRiderNotifications = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const q = { recipientId: new mongoose.Types.ObjectId(req.user.id), recipientType: 'delivery' };
    const [rows, total, unread] = await Promise.all([
      Notification.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(q),
      Notification.countDocuments({ ...q, isRead: false }),
    ]);
    res.json({ success: true, data: { rows, total, unread, page, limit } });
  } catch (err) {
    logger.error(`getRiderNotifications: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
};

// PATCH /delivery/notifications/:id/read
export const markRiderNotificationRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    await Notification.updateOne(
      { _id: req.params.id, recipientId: req.user.id, recipientType: 'delivery' },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

// POST /delivery/notifications/read-all
export const markAllRiderNotificationsRead = async (req, res) => {
  try {
    const r = await Notification.updateMany(
      { recipientId: req.user.id, recipientType: 'delivery', isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true, data: { updated: r.modifiedCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
};

// ═══════════════════ ADMIN ═══════════════════

const readBody = (req) => {
  const b = req.body || {};
  const fileUrl = req.file ? req.file.url || (req.file.filename?.startsWith('http') ? req.file.filename : null) : null;
  const isVideoFile = req.file && /^video\//.test(req.file.mimetype || '');
  let zoneIds = b.zoneIds;
  if (typeof zoneIds === 'string') {
    try {
      zoneIds = zoneIds.trim().startsWith('[') ? JSON.parse(zoneIds) : zoneIds.split(',');
    } catch {
      zoneIds = [];
    }
  }
  const out = {};
  if (b.kind !== undefined) out.kind = b.kind;
  if (b.title !== undefined) out.title = String(b.title).trim();
  if (b.body !== undefined) out.body = String(b.body).trim();
  if (b.badge !== undefined) out.badge = String(b.badge).trim();
  if (b.imageUrl !== undefined) out.imageUrl = String(b.imageUrl).trim();
  if (b.videoUrl !== undefined) out.videoUrl = String(b.videoUrl).trim();
  if (fileUrl) out[isVideoFile ? 'videoUrl' : 'imageUrl'] = fileUrl;
  if (zoneIds !== undefined) out.zoneIds = (Array.isArray(zoneIds) ? zoneIds : []).filter((z) => mongoose.isValidObjectId(z));
  if (b.startAt !== undefined) out.startAt = b.startAt ? new Date(b.startAt) : new Date();
  if (b.endAt !== undefined) out.endAt = b.endAt ? new Date(b.endAt) : null;
  if (b.isActive !== undefined) out.isActive = b.isActive === true || b.isActive === 'true';
  if (b.priority !== undefined) out.priority = Number(b.priority) || 0;
  return out;
};

const validate = (d, { creating }) => {
  if (creating && !KINDS.includes(d.kind)) return 'Type must be announcement, story or video';
  if (d.kind !== undefined && !KINDS.includes(d.kind)) return 'Type must be announcement, story or video';
  if ((creating || d.title !== undefined) && !d.title) return 'Title is required';
  if (!isHttpUrl(d.imageUrl)) return 'Image must be an http(s) link';
  if (!isHttpUrl(d.videoUrl)) return 'Video must be an http(s) link';
  if (creating && d.kind === 'video' && !d.videoUrl) return 'Add a YouTube link or upload a video';
  if (creating && d.kind === 'story' && !d.imageUrl) return 'Stories need an image';
  if (d.startAt && isNaN(d.startAt)) return 'Invalid start date';
  if (d.endAt && isNaN(d.endAt)) return 'Invalid end date';
  if (d.startAt && d.endAt && d.endAt < d.startAt) return 'End date must be after the start date';
  return null;
};

// GET /admin/delivery/updates?kind=
export const adminListRiderUpdates = async (req, res) => {
  try {
    const q = KINDS.includes(req.query.kind) ? { kind: req.query.kind } : {};
    const rows = await RiderUpdate.find(q).sort({ createdAt: -1 }).limit(200).populate('zoneIds', 'name city').lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load rider updates' });
  }
};

// POST /admin/delivery/updates (multipart; optional file field "storyMedia")
export const adminCreateRiderUpdate = async (req, res) => {
  try {
    const d = readBody(req);
    const err = validate(d, { creating: true });
    if (err) return res.status(400).json({ success: false, message: err });
    const doc = await RiderUpdate.create({ ...d, createdBy: req.user?.id });
    // Optional: also send as a phone push right away (only if it is live now)
    let push = null;
    const liveNow = doc.isActive && doc.startAt <= new Date() && (!doc.endAt || doc.endAt >= new Date());
    if ((req.body?.sendPush === true || req.body?.sendPush === 'true') && liveNow) {
      doc.lastPushedAt = new Date();
      push = await pushRiderUpdate(doc);
      doc.pushStats = { ...push, at: doc.lastPushedAt };
      await doc.save();
    }
    res.status(201).json({
      success: true,
      message: push ? (push.pushEnabled ? `Published and pushed to ${push.sent} device(s)` : 'Published (push not configured on the server)') : 'Published to riders',
      data: doc,
      push,
    });
  } catch (err) {
    logger.error(`adminCreateRiderUpdate: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to create rider update' });
  }
};

// PUT /admin/delivery/updates/:id
export const adminUpdateRiderUpdate = async (req, res) => {
  try {
    const doc = await RiderUpdate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const d = readBody(req);
    const err = validate({ ...doc.toObject(), ...d }, { creating: false });
    if (err) return res.status(400).json({ success: false, message: err });
    Object.assign(doc, d);
    await doc.save();
    res.json({ success: true, message: 'Updated', data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update rider update' });
  }
};

// DELETE /admin/delivery/updates/:id
export const adminDeleteRiderUpdate = async (req, res) => {
  try {
    const r = await RiderUpdate.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete rider update' });
  }
};

// GET /admin/delivery/zones — for targeting rider updates
export const adminListDeliveryZones = async (req, res) => {
  try {
    const DeliveryZone = (await import('../models/DeliveryZone.js')).default;
    await DeliveryZone.seedDefaultZonesIfEmpty?.();
    const zones = await DeliveryZone.find({}).select('name city isActive').sort({ city: 1, name: 1 }).lean();
    res.json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load zones' });
  }
};

const MAX_DEVICES = 10;

// POST /delivery/fcm-token { token } — register this phone for rider push notifications
export const saveRiderFcmToken = async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token || token.length < 20 || token.length > 4096) return res.status(400).json({ success: false, message: 'Invalid device token' });
    // A phone belongs to one rider at a time (e.g. a shared device after re-login)
    await DeliveryPartner.updateMany({ _id: { $ne: req.user.id }, fcmTokens: token }, { $pull: { fcmTokens: token } });
    await DeliveryPartner.updateOne({ _id: req.user.id }, { $pull: { fcmTokens: token } });
    await DeliveryPartner.updateOne({ _id: req.user.id }, { $push: { fcmTokens: { $each: [token], $slice: -MAX_DEVICES } } });
    res.json({ success: true, message: 'Push notifications enabled on this device' });
  } catch (err) {
    logger.error(`saveRiderFcmToken: ${err.message}`);
    res.status(500).json({ success: false, message: 'Could not enable push notifications' });
  }
};

const PUSH_COOLDOWN_MS = 5 * 60 * 1000;

// POST /admin/delivery/updates/:id/push — send this announcement / story / video as a phone push
export const adminPushRiderUpdate = async (req, res) => {
  try {
    const doc = await RiderUpdate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    if (!doc.isActive) return res.status(400).json({ success: false, message: 'Turn this item on before sending it as a push' });
    if (doc.lastPushedAt && Date.now() - doc.lastPushedAt.getTime() < PUSH_COOLDOWN_MS) {
      return res.status(429).json({ success: false, message: 'Already sent in the last 5 minutes' });
    }
    doc.lastPushedAt = new Date();
    await doc.save();
    const result = await pushRiderUpdate(doc);
    doc.pushStats = { ...result, at: doc.lastPushedAt };
    await doc.save();
    if (!result.pushEnabled) {
      return res.json({ success: true, message: 'Push is not configured on the server (Firebase). Riders will still see it on the Updates page.', data: result });
    }
    res.json({ success: true, message: `Sent to ${result.sent} device(s) of ${result.riders} rider(s)`, data: result });
  } catch (err) {
    logger.error(`adminPushRiderUpdate: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to send push' });
  }
};
