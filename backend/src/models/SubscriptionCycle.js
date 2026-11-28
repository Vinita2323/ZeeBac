import mongoose from 'mongoose';

/**
 * One monthly billing cycle of a vendor's subscription.
 * Window is [cycleStart, cycleEnd) — cycleEnd is exclusive (the next cycle's start).
 *
 * Counters are maintained atomically by utils/orderUsage.util.js and can always be
 * rebuilt from OrderUsage rows (the source of truth) via recomputeCycleTotals().
 */
const subscriptionCycleSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    cycleAnchor: { type: Date, required: true },
    cycleIndex: { type: Number, required: true, min: 0 },
    cycleStart: { type: Date, required: true },
    cycleEnd: { type: Date, required: true },

    // Plan snapshot used for this cycle
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    planName: String,
    tierCode: String,
    freeLimit: { type: Number, default: null }, // null = unlimited
    extraRate: { type: Number, default: 0 },

    // Live counters (only COUNTED usages)
    freeUsed: { type: Number, default: 0 },
    extraOrders: { type: Number, default: 0 },
    unlimitedOrders: { type: Number, default: 0 },
    extraChargeTotal: { type: Number, default: 0 },

    // Lifetime counters for reporting
    reversedOrders: { type: Number, default: 0 },
    reversedChargeTotal: { type: Number, default: 0 },

    alerts: {
      nearLimitSentAt: Date,
      limitReachedSentAt: Date,
    },
  },
  { timestamps: true }
);

subscriptionCycleSchema.index({ vendorId: 1, cycleStart: 1 }, { unique: true });
subscriptionCycleSchema.index({ vendorId: 1, cycleStart: -1 });

export default mongoose.models.SubscriptionCycle || mongoose.model('SubscriptionCycle', subscriptionCycleSchema);
