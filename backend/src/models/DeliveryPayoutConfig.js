import mongoose from 'mongoose';

const deliveryPayoutConfigSchema = new mongoose.Schema(
  {
    // Base guaranteed fare for an order (e.g. ₹30)
    baseFare: {
      type: Number,
      required: true,
      default: 30,
      min: 0,
    },
    // Distance included in base fare (km). If 0, every km is billable: Base + (Dist * Rate)
    baseDistanceIncludedKm: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Rate per kilometer (e.g. ₹10/km)
    perKmRate: {
      type: Number,
      required: true,
      default: 10,
      min: 0,
    },
    // Minimum guaranteed payout floor (e.g. ₹30 or ₹35)
    minPayout: {
      type: Number,
      default: 30,
      min: 0,
    },
    // Rain, bad weather, or high-demand surge bonus (₹ added to every delivery)
    surgeBonus: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Night hours surge bonus (₹)
    nightSurgeBonus: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Maximum allowable delivery radius in km
    maxDeliveryRadiusKm: {
      type: Number,
      default: 20,
      min: 1,
    },
    // Free delivery radius for customer (km)
    freeDeliveryRadiusKm: {
      type: Number,
      default: 5,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      default: 'Dynamic distance-based rider payout formula: Base Fare + (Distance * Rate/km) + Surge',
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    updatedByName: {
      type: String,
      default: 'Admin',
      trim: true,
    },
    changeHistory: [
      {
        baseFare: Number,
        baseDistanceIncludedKm: Number,
        perKmRate: Number,
        minPayout: Number,
        surgeBonus: Number,
        changedBy: String,
        changedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

/**
 * Static method to fetch the active payout config or create a standard default if none exists.
 */
deliveryPayoutConfigSchema.statics.getEffectiveConfig = async function () {
  let config = await this.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (!config) {
    config = await this.create({
      baseFare: 30,
      baseDistanceIncludedKm: 0,
      perKmRate: 10,
      minPayout: 30,
      surgeBonus: 0,
      nightSurgeBonus: 0,
      maxDeliveryRadiusKm: 20,
      freeDeliveryRadiusKm: 5,
      isActive: true,
      notes: 'Initial default dynamic delivery payout rule',
      updatedByName: 'System Initializer',
    });
  }
  return config;
};

const DeliveryPayoutConfig = mongoose.model('DeliveryPayoutConfig', deliveryPayoutConfigSchema);
export default DeliveryPayoutConfig;
