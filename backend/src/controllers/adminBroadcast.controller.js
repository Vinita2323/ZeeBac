import crypto from 'crypto';
import mongoose from 'mongoose';
import AdminBroadcast from '../models/AdminBroadcast.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import { ROLE_CONFIG, previewAudience, deliverBroadcast } from '../utils/adminBroadcast.util.js';
import { writeAudit } from '../utils/sellerSettlement.util.js';
import logger from '../utils/logger.js';

const ROLES = ['customer', 'vendor', 'delivery'];
const LARGE_SEND = 1000; // needs explicit confirmation
const DEDUPE_MS = 10 * 60 * 1000;

const readAudience = (body) => {
  const a = body?.audience || {};
  const f = a.filters || {};
  return {
    mode: a.mode === 'single' ? 'single' : 'group',
    role: ROLES.includes(a.role) ? a.role : null,
    recipientId: a.recipientId && mongoose.isValidObjectId(a.recipientId) ? a.recipientId : null,
    filters: {
      city: String(f.city || '').trim().slice(0, 60),
      vendorCategory: String(f.vendorCategory || '').trim().slice(0, 80),
      subscriptionTier: ['INDEPENDENT', 'ESTABLISHED', 'ENTERPRISE', 'BRAND', 'NONE'].includes(f.subscriptionTier) ? f.subscriptionTier : '',
      zoneId: f.zoneId && mongoose.isValidObjectId(f.zoneId) ? f.zoneId : null,
    },
  };
};
const audienceError = (a) => {
  if (!a.role) return 'Choose who receives it: customers, vendors or delivery partners';
  if (a.mode === 'single' && !a.recipientId) return 'Choose the person to notify';
  return null;
};

// GET /admin/broadcasts/lookup?role=customer&q=98765 — find one person by phone / ZeeBac ID / name
export const lookupRecipient = async (req, res) => {
  try {
    const role = req.query.role;
    const q = String(req.query.q || '').trim();
    if (!ROLES.includes(role) || q.length < 3) return res.json({ success: true, data: [] });
    const cfg = ROLE_CONFIG[role];
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const or = [{ phone: rx }];
    if (role === 'customer') or.push({ zeebacId: rx }, { name: rx });
    if (role === 'vendor') or.push({ zeebacId: rx }, { storeName: rx });
    if (role === 'delivery') or.push({ riderId: rx }, { name: rx });
    const rows = await cfg.model.find({ $or: or }).select(`${cfg.label} fcmTokens`).limit(10).lean();
    res.json({
      success: true,
      data: rows.map((r) => ({
        _id: r._id,
        name: r.storeName || r.name || '—',
        phone: r.phone,
        code: r.zeebacId || r.riderId || '',
        pushDevices: (r.fcmTokens || []).length,
      })),
    });
  } catch (err) {
    logger.error(`lookupRecipient: ${err.message}`);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

// GET /admin/broadcasts/filters — options for the group filters
export const getBroadcastFilterOptions = async (req, res) => {
  try {
    const DeliveryZone = (await import('../models/DeliveryZone.js')).default;
    const [customerCities, vendorCities, vendorCategories, riderCities, zones] = await Promise.all([
      User.distinct('location.city', { role: 'customer' }),
      Vendor.distinct('address.city', { status: 'Verified' }),
      Vendor.distinct('category', { status: 'Verified' }),
      DeliveryPartner.distinct('address.city', { applicationStatus: 'APPROVED' }),
      DeliveryZone.find({}).select('name city').sort({ city: 1, name: 1 }).lean(),
    ]);
    const clean = (a) => [...new Set(a.filter(Boolean).map((x) => String(x).trim()))].sort();
    res.json({
      success: true,
      data: {
        customer: { cities: clean(customerCities) },
        vendor: { cities: clean(vendorCities), categories: clean(vendorCategories), tiers: ['INDEPENDENT', 'ESTABLISHED', 'ENTERPRISE', 'BRAND', 'NONE'] },
        delivery: { cities: clean(riderCities), zones },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load filters' });
  }
};

// POST /admin/broadcasts/preview { audience } → { recipients, pushDevices, pushPeople }
export const previewBroadcast = async (req, res) => {
  try {
    const audience = readAudience(req.body);
    const err = audienceError(audience);
    if (err) return res.status(400).json({ success: false, message: err });
    res.json({ success: true, data: await previewAudience(audience) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Preview failed' });
  }
};

// POST /admin/broadcasts { audience, title, message, url?, sendPush?, scheduledAt?, confirmLarge?, force? }
export const createBroadcast = async (req, res) => {
  try {
    const audience = readAudience(req.body);
    const aErr = audienceError(audience);
    if (aErr) return res.status(400).json({ success: false, message: aErr });
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const url = String(req.body?.url || '').trim();
    if (!title || title.length > 80) return res.status(400).json({ success: false, message: 'Title is required (max 80 characters)' });
    if (!message || message.length > 500) return res.status(400).json({ success: false, message: 'Message is required (max 500 characters)' });
    if (url && !/^\/[A-Za-z0-9/_\-?=&.#]*$/.test(url)) return res.status(400).json({ success: false, message: 'Link must be an in-app path like /wallet' });
    let scheduledAt = null;
    if (req.body?.scheduledAt) {
      scheduledAt = new Date(req.body.scheduledAt);
      if (isNaN(scheduledAt)) return res.status(400).json({ success: false, message: 'Invalid schedule time' });
      if (scheduledAt.getTime() < Date.now() - 60000) return res.status(400).json({ success: false, message: 'Schedule time is in the past' });
      if (scheduledAt.getTime() > Date.now() + 90 * 86400000) return res.status(400).json({ success: false, message: 'Schedule within the next 90 days' });
    }

    const preview = await previewAudience(audience);
    if (!preview.recipients) return res.status(400).json({ success: false, message: 'Nobody matches this audience' });
    if (preview.recipients >= LARGE_SEND && !req.body?.confirmLarge) {
      return res.status(409).json({ success: false, code: 'CONFIRM_LARGE', message: `This will notify ${preview.recipients} people. Confirm to send.`, data: preview });
    }

    // Same message to the same audience twice in 10 minutes is almost always a double-click
    const dedupeKey = crypto.createHash('sha1').update(JSON.stringify({ audience, title, message })).digest('hex');
    if (!req.body?.force) {
      const recent = await AdminBroadcast.findOne({ dedupeKey, status: { $ne: 'CANCELLED' }, createdAt: { $gte: new Date(Date.now() - DEDUPE_MS) } }).select('_id');
      if (recent) return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'This exact message was already sent to this audience in the last 10 minutes.' });
    }

    let recipientLabel;
    if (audience.mode === 'single') {
      const cfg = ROLE_CONFIG[audience.role];
      const r = await cfg.model.findById(audience.recipientId).select(cfg.label).lean();
      if (!r) return res.status(404).json({ success: false, message: 'That person was not found' });
      recipientLabel = `${r.storeName || r.name || ''} ${r.phone ? `(${r.phone})` : ''}`.trim();
    }

    const doc = await AdminBroadcast.create({
      audience: { ...audience, recipientLabel },
      title,
      message,
      url,
      sendPush: req.body?.sendPush !== false && req.body?.sendPush !== 'false',
      scheduledAt,
      status: scheduledAt && scheduledAt.getTime() > Date.now() ? 'SCHEDULED' : 'QUEUED',
      stats: { recipients: preview.recipients },
      createdBy: req.user?.id,
      createdByName: req.user?.name || req.user?.email || 'Admin',
      dedupeKey,
    });
    await writeAudit(req, {
      action: doc.status === 'SCHEDULED' ? 'NOTIFICATION_SCHEDULED' : 'NOTIFICATION_SENT',
      entityType: 'AdminBroadcast',
      entityId: String(doc._id),
      meta: { audience: doc.audience, title, recipients: preview.recipients, sendPush: doc.sendPush, scheduledAt },
    });

    if (doc.status === 'QUEUED') {
      // Send in the background; the history list shows progress
      setImmediate(() => deliverBroadcast(doc._id).catch((e) => logger.error(`deliverBroadcast: ${e.message}`)));
    }
    res.status(202).json({
      success: true,
      message: doc.status === 'SCHEDULED' ? `Scheduled for ${scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : `Sending to ${preview.recipients} ${preview.recipients === 1 ? 'person' : 'people'}…`,
      data: doc,
    });
  } catch (err) {
    logger.error(`createBroadcast: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
};

// GET /admin/broadcasts?page=1
export const listBroadcasts = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const [rows, total] = await Promise.all([
      AdminBroadcast.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-dedupeKey').lean(),
      AdminBroadcast.countDocuments({}),
    ]);
    res.json({ success: true, data: { rows, total, page, limit } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load history' });
  }
};

// POST /admin/broadcasts/:id/cancel — only scheduled ones that have not started
export const cancelBroadcast = async (req, res) => {
  try {
    const doc = await AdminBroadcast.findOneAndUpdate({ _id: req.params.id, status: 'SCHEDULED' }, { $set: { status: 'CANCELLED' } }, { new: true });
    if (!doc) return res.status(400).json({ success: false, message: 'Only scheduled notifications that have not started can be cancelled' });
    await writeAudit(req, { action: 'NOTIFICATION_CANCELLED', entityType: 'AdminBroadcast', entityId: String(doc._id), meta: { title: doc.title } });
    res.json({ success: true, message: 'Cancelled', data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Cancel failed' });
  }
};
