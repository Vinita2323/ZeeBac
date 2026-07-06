import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: String,
      enum: ['customer', 'vendor'],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // Ref can be User or Vendor based on sender
    },
    text: {
      type: String,
      required: true,
    },
    attachments: [
      {
        type: {
          type: String,
          enum: ['image', 'file'],
        },
        url: String,
        fileName: String,
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for fetching messages of a conversation quickly
messageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model('Message', messageSchema);
