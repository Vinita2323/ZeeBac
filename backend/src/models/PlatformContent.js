import mongoose from 'mongoose';

const legalDocSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    lastUpdated: { type: Date, default: null },
  },
  { _id: false }
);

const platformContentSchema = new mongoose.Schema(
  {
    privacyPolicy: {
      title: {
        type: String,
        default: 'Privacy Policy',
      },
      content: {
        type: String,
        default: '',
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    termsOfService: {
      title: {
        type: String,
        default: 'Terms of Service',
      },
      content: {
        type: String,
        default: '',
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    // Separate legal documents per app audience. Each is edited independently by admin.
    // (privacyPolicy / termsOfService above are the legacy shared copy, kept in sync with `customer`.)
    legal: {
      customer: { privacyPolicy: legalDocSchema, termsOfService: legalDocSchema },
      vendor: { privacyPolicy: legalDocSchema, termsOfService: legalDocSchema },
      delivery: { privacyPolicy: legalDocSchema, termsOfService: legalDocSchema },
    },
    supportWhatsapp: {
      type: String,
      default: '+919111966732',
      trim: true,
    },
    supportPhone: {
      type: String,
      default: '+919111966732',
      trim: true,
    },
    // Separate helpline for delivery riders (e.g. operations team). Empty = use supportPhone.
    riderSupportPhone: {
      type: String,
      default: '',
      trim: true,
    },
    supportEmail: {
      type: String,
      default: 'support@zeebac.com',
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
  },
  { timestamps: true }
);

const PlatformContent = mongoose.model('PlatformContent', platformContentSchema);
export default PlatformContent;
