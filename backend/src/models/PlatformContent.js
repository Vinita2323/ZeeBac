import mongoose from 'mongoose';

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
