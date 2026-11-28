import mongoose from 'mongoose';

/**
 * Admin-published content for the rider "Updates" page.
 *   announcement → notice card    story → circle in the stories row    video → training video
 * zoneIds empty = all riders; otherwise only riders whose workingZoneId is in the list.
 * Shown only while isActive and within [startAt, endAt].
 */
const riderUpdateSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['announcement', 'story', 'video'], required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, default: '', maxlength: 2000 },
    badge: { type: String, trim: true, default: '', maxlength: 30 }, // e.g. "Safety", "Festival"
    imageUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' }, // YouTube link or uploaded video URL
    zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryZone' }],
    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    lastPushedAt: { type: Date, default: null },
    pushStats: { riders: Number, devices: Number, sent: Number, failed: Number, pushEnabled: Boolean, at: Date },
  },
  { timestamps: true }
);
riderUpdateSchema.index({ isActive: 1, kind: 1, startAt: -1 });

export default mongoose.models.RiderUpdate || mongoose.model('RiderUpdate', riderUpdateSchema);
