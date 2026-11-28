import mongoose from 'mongoose';

/**
 * A notification written by admin and sent to one person or a group
 * (customers / vendors / delivery partners, optionally filtered).
 * Delivered as an in-app notification (always) + phone push (optional).
 */
const adminBroadcastSchema = new mongoose.Schema(
  {
    audience: {
      mode: { type: String, enum: ['single', 'group'], required: true },
      role: { type: String, enum: ['customer', 'vendor', 'delivery'], required: true },
      recipientId: { type: mongoose.Schema.Types.ObjectId, default: null }, // single
      recipientLabel: String, // name / phone shown in history
      filters: {
        city: { type: String, default: '' },
        vendorCategory: { type: String, default: '' },
        subscriptionTier: { type: String, default: '' }, // vendor plan tierCode, or 'NONE' = no active plan
        zoneId: { type: mongoose.Schema.Types.ObjectId, default: null }, // rider working zone
      },
    },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    url: { type: String, default: '' }, // in-app path opened on tap, e.g. /wallet
    sendPush: { type: Boolean, default: true },
    scheduledAt: { type: Date, default: null },
    status: { type: String, enum: ['QUEUED', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'], default: 'QUEUED', index: true },
    stats: {
      recipients: { type: Number, default: 0 },
      inApp: { type: Number, default: 0 },
      pushDevices: { type: Number, default: 0 },
      pushSent: { type: Number, default: 0 },
      pushFailed: { type: Number, default: 0 },
    },
    error: String,
    startedAt: Date,
    heartbeatAt: Date, // updated after every batch; a stale SENDING broadcast is resumed by the scheduler
    resumeCount: { type: Number, default: 0 },
    sentAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    createdByName: String,
    dedupeKey: { type: String, index: true },
  },
  { timestamps: true }
);
adminBroadcastSchema.index({ status: 1, scheduledAt: 1 });

export default mongoose.models.AdminBroadcast || mongoose.model('AdminBroadcast', adminBroadcastSchema);
