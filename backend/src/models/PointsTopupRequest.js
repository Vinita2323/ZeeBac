import mongoose from 'mongoose';

/**
 * Vendor coin purchase / customer wallet top-up paid by UPI to Zeebac's UPI ID. Coins are credited ONLY when an admin
 * verifies the money arrived and approves. `activeUtr` is unique while a request is
 * PENDING/APPROVED, so the same UTR can never be credited twice; it is cleared on rejection
 * so a vendor can resubmit a genuine UTR that was rejected by mistake.
 */
const pointsTopupRequestSchema = new mongoose.Schema(
  {
    // Vendor coin purchase or customer wallet top-up
    ownerType: { type: String, enum: ['Vendor', 'User'], required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    ownerZeebacId: String,
    ownerName: String, // store name or customer name
    ownerPhone: String,
    amount: { type: Number, required: true, min: 1 },
    utr: { type: String, required: true, trim: true, index: true },
    activeUtr: { type: String, default: null },
    refId: String, // reference shown in the vendor's UPI intent
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId },
    reviewedAt: Date,
    adminNote: String,
    walletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction' },
  },
  { timestamps: true }
);

pointsTopupRequestSchema.index({ activeUtr: 1 }, { unique: true, partialFilterExpression: { activeUtr: { $type: 'string' } } });

export default mongoose.models.PointsTopupRequest || mongoose.model('PointsTopupRequest', pointsTopupRequestSchema);
