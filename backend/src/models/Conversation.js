import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
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
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessageBy: {
      type: String,
      enum: ['customer', 'vendor'],
    },
    unreadByVendor: {
      type: Number,
      default: 0,
    },
    unreadByCustomer: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Ensure only one conversation exists between a specific customer and vendor
conversationSchema.index({ vendorId: 1, customerId: 1 }, { unique: true });

export default mongoose.model('Conversation', conversationSchema);
