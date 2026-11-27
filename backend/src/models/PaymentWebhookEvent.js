import mongoose from 'mongoose';

// Razorpay webhook de-duplication: each delivered event id is processed once.
const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: String,
    entityId: String,
    status: { type: String, enum: ['PROCESSING', 'PROCESSED', 'FAILED'], default: 'PROCESSING' },
    error: String,
    processedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.models.PaymentWebhookEvent || mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);
