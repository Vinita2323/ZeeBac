import mongoose from 'mongoose';

// Immutable audit trail of financial admin actions.
const adminAuditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, index: true },
    adminRole: String,
    action: { type: String, required: true, index: true },
    entityType: { type: String, index: true },
    entityId: { type: String, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, index: true },
    amount: Number,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    meta: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminAuditLogSchema.index({ createdAt: -1 });

export default mongoose.models.AdminAuditLog || mongoose.model('AdminAuditLog', adminAuditLogSchema);
