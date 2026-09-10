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
      enum: ['Monthly', 'Yearly'],
      required: true,
      unique: true,
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

/**
 * Seed default subscription plans if none exist in the database.
 */
subscriptionPlanSchema.statics.seedDefaultsIfEmpty = async function () {
  const count = await this.countDocuments();
  if (count === 0) {
    await this.create([
      {
        name: 'Monthly Plan',
        planType: 'Monthly',
        durationDays: 30,
        pricing: {
          independentStore: 499,
          chainBrand: 999,
        },
        features: [
          'Listed on Customer Map & Search',
          'Offer Cashbacks to ZeeBac users',
          'QR Code & In-Store Payments',
          'Real-Time Analytics & Reports',
          'Standard Vendor Support',
        ],
        description: 'Perfect for local merchants looking to increase recurring customer footfall.',
        isActive: true,
      },
      {
        name: 'Yearly Plan',
        planType: 'Yearly',
        durationDays: 365,
        pricing: {
          independentStore: 4999,
          chainBrand: 9999,
        },
        features: [
          'All Monthly Plan Features',
          '2 Months Free (Save ~17%)',
          'Priority Placement in Search',
          'Dedicated Account Manager',
          'Promotional Banners on ZeeBac App',
        ],
        description: 'Best value for long-term growth with priority search boost and dedicated account manager.',
        isActive: true,
      },
    ]);
  }
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
export default SubscriptionPlan;
