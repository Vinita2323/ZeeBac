import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['General', 'Cashback', 'Wallet', 'Security', 'Account', 'Orders', 'Subscription'],
      default: 'General',
    },
    target: {
      type: String,
      enum: ['all', 'customer', 'vendor'],
      default: 'all',
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
  },
  { timestamps: true }
);

faqSchema.index({ target: 1, isActive: 1, order: 1 });
faqSchema.index({ category: 1 });

export default mongoose.model('Faq', faqSchema);
