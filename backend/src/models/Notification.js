import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'recipientType',
    },
    recipientType: {
      type: String,
      required: true,
      enum: ['customer', 'vendor', 'admin'],
    },
    type: {
      type: String,
      required: true,
      enum: ['approval', 'credit', 'referral', 'system', 'promotion', 'VENDOR_KYC', 'FRAUD_ALERT', 'SUPPORT_TICKET', 'PAYOUT_REQUEST'],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: 'notifications',
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    referenceType: {
      type: String,
      enum: ['transaction', 'cashback_request', 'vendor', 'referral', null],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast recipient queries
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
