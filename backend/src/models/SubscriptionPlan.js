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
 * Seed default subscription plans (1 Month, 3 Months, Yearly) if missing.
 */
subscriptionPlanSchema.statics.seedDefaultsIfEmpty = async function () {
  const defaultPlans = [
    {
      name: '1 Month Plan',
      planType: '1 Month',
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
      name: '3 Months Plan',
      planType: '3 Months',
      durationDays: 90,
      pricing: {
        independentStore: 1299,
        chainBrand: 2699,
      },
      features: [
        'All 1 Month Plan Features',
        'Save ~13% on Quarterly Billing',
        'Priority Listing in Search Results',
        'Enhanced Business Analytics',
        'Priority Merchant Support',
      ],
      description: 'Our most popular quarterly plan for established stores seeking steady footfall growth.',
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
        'All 3 Months Plan Features',
        '2 Months Free (Save ~17%)',
        'Top Priority Placement in Search',
        'Dedicated Account Manager',
        'Promotional Banners on ZeeBac App',
      ],
      description: 'Best value for long-term growth with top priority search boost and dedicated manager.',
      isActive: true,
    },
  ];

  for (const defPlan of defaultPlans) {
    // Check if this plan or its alias already exists
    let existing;
    if (defPlan.planType === '1 Month') {
      existing = await this.findOne({ planType: { $in: ['1 Month', 'Monthly'] } });
    } else if (defPlan.planType === '3 Months') {
      existing = await this.findOne({ planType: { $in: ['3 Months', '3 Month'] } });
    } else {
      existing = await this.findOne({ planType: 'Yearly' });
    }

    if (!existing) {
      await this.create(defPlan);
    }
  }
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
export default SubscriptionPlan;
