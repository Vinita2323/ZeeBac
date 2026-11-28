import mongoose from 'mongoose';

/**
 * One row per completed (DELIVERED) order counted against a vendor's monthly quota.
 * The unique index on orderId guarantees an order is counted — and charged — at most once,
 * no matter how many times the delivered event fires.
 */
const orderUsageSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderCode: String,
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionCycle', index: true },
    completedAt: { type: Date, required: true },

    // FREE      → consumed one free slot
    // EXTRA     → beyond free limit, chargeAmount deducted from vendor wallet
    // UNLIMITED → legacy plan without an order limit
    // NO_PLAN   → vendor had no active subscription when the order completed (not counted, not charged)
    // PENDING   → transient while being classified
    classification: {
      type: String,
      enum: ['PENDING', 'FREE', 'EXTRA', 'UNLIMITED', 'NO_PLAN'],
      default: 'PENDING',
      index: true,
    },
    chargeAmount: { type: Number, default: 0, min: 0 },
    // NONE → nothing to charge; PENDING → charge decided but wallet not debited yet;
    // DEDUCTED → wallet debited; REVERSED → refunded to wallet; CANCELLED → reversed before it was deducted
    chargeStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'DEDUCTED', 'REVERSED', 'CANCELLED'],
      default: 'NONE',
      index: true,
    },
    chargedAt: Date,

    status: { type: String, enum: ['COUNTED', 'REVERSED'], default: 'COUNTED', index: true },
    reversedAt: Date,
    reversalReason: String,
    reversedBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

orderUsageSchema.index({ orderId: 1 }, { unique: true });
orderUsageSchema.index({ vendorId: 1, completedAt: -1 });

export default mongoose.models.OrderUsage || mongoose.model('OrderUsage', orderUsageSchema);
