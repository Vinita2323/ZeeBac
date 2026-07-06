import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    text: {
      type: String,
      trim: true,
      default: '',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    reply: {
      text: { type: String, trim: true },
      repliedAt: Date,
    },
    isVisible: {
      type: Boolean,
      default: true,
    }
  },
  { timestamps: true }
);

// One review per customer per vendor
reviewSchema.index({ vendorId: 1, customerId: 1 }, { unique: true });

export default mongoose.model('Review', reviewSchema);
