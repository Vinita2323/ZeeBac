import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    planType: {
      type: String,
      enum: ['1 Month', '3 Months', 'Yearly', 'Monthly', '3 Month'],
      required: true,
    },
    // Order-based tier (Independent Seller / Established Retailers / Business
    // Enterprise / Brand-Manufacturer). Legacy duration plans have no tierCode.
    tierCode: {
      type: String,
      enum: ['INDEPENDENT', 'ESTABLISHED', 'ENTERPRISE', 'BRAND', null],
      default: null,
    },
    // Free completed online orders per monthly billing cycle (null = unlimited / legacy plan)
    freeOrdersPerMonth: {
      type: Number,
      min: 0,
      default: null,
    },
    // Charge (INR) deducted from the vendor wallet for every completed order beyond the free limit
    extraChargePerOrder: {
      type: Number,
      min: 0,
      default: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    durationDays: {
      type: Number,
      required: true,
      default: 30,
    },
    pricing: {
      independentStore: {
        type: Number,
        required: true,
        default: 499,
      },
      chainBrand: {
        type: Number,
        required: true,
        default: 999,
      },
    },
    features: [
      {
        type: String,
      },
    ],
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ tierCode: 1 }, { unique: true, partialFilterExpression: { tierCode: { $type: 'string' } } });

/**
 * The four order-based monthly tiers. Price is the same for every shop type,
 * so both pricing fields carry the monthly fee (keeps resolvePlanPrice simple).
 */
export const DEFAULT_TIER_PLANS = [
  { tierCode: 'INDEPENDENT', name: 'Independent Seller', price: 499, freeOrdersPerMonth: 150, extraChargePerOrder: 6, sortOrder: 1 },
  { tierCode: 'ESTABLISHED', name: 'Established Retailers', price: 799, freeOrdersPerMonth: 200, extraChargePerOrder: 5, sortOrder: 2 },
  { tierCode: 'ENTERPRISE', name: 'Business Enterprise', price: 999, freeOrdersPerMonth: 300, extraChargePerOrder: 4, sortOrder: 3 },
  { tierCode: 'BRAND', name: 'Brand/Manufacturer', price: 1499, freeOrdersPerMonth: 500, extraChargePerOrder: 4, sortOrder: 4 },
];

let legacyIndexChecked = false;

/**
 * Seeds the four monthly order-based tiers if missing.
 * The first time tiers are created, the old duration-based plans (1 Month /
 * 3 Months / Yearly) are deactivated so vendors only see the new tiers.
 * Admin can re-activate them from the plans page.
 */
subscriptionPlanSchema.statics.seedDefaultsIfEmpty = async function () {
  // planType used to be unique; four tiers share planType "1 Month", so drop the old index once.
  if (!legacyIndexChecked) {
    legacyIndexChecked = true;
    try {
      const indexes = await this.collection.indexes();
      const legacy = indexes.find((i) => i.key && i.key.planType === 1 && i.unique);
      if (legacy) await this.collection.dropIndex(legacy.name);
    } catch (_) {
      // collection may not exist yet
    }
  }

  const existingTiers = await this.countDocuments({ tierCode: { $type: 'string' } });
  if (existingTiers >= DEFAULT_TIER_PLANS.length) return;

  if (existingTiers === 0) {
    await this.updateMany({ $or: [{ tierCode: null }, { tierCode: { $exists: false } }] }, { $set: { isActive: false } });
  }

  for (const t of DEFAULT_TIER_PLANS) {
    const found = await this.findOne({ tierCode: t.tierCode });
    if (found) continue;
    try {
      await this.create({
        name: t.name,
        planType: '1 Month',
        tierCode: t.tierCode,
        durationDays: 30,
        pricing: { independentStore: t.price, chainBrand: t.price },
        freeOrdersPerMonth: t.freeOrdersPerMonth,
        extraChargePerOrder: t.extraChargePerOrder,
        sortOrder: t.sortOrder,
        features: [
          `${t.freeOrdersPerMonth} free completed online orders every billing cycle`,
          `₹${t.extraChargePerOrder} per completed order after the free limit (deducted from wallet)`,
          'Listed on Customer Map & Search',
          'Offer Cashbacks to ZeeBac users',
          'QR Code & In-Store Payments',
        ],
        description: `₹${t.price}/month · ${t.freeOrdersPerMonth} free orders · ₹${t.extraChargePerOrder}/extra order`,
        isActive: true,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err; // created concurrently
    }
  }
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
export default SubscriptionPlan;
