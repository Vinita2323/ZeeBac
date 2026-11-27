import mongoose from 'mongoose';

// Seller asks admin to pay out (part of) their available settlement balance.
// Admin can pay it in one or more partial payments, or reject it.
const sellerPayoutRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    requestedAmount: { type: Number, required: true, min: 1 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['REQUESTED', 'PARTIALLY_PAID', 'PAID', 'REJECTED', 'CANCELLED'],
      default: 'REQUESTED',
      index: true,
    },
    bankSnapshot: {
      accountHolderName: String,
      bankName: String,
      accountNumberMasked: String,
      ifscCode: String,
      upiId: String,
    },
    sellerNote: String,
    adminNote: String,
    payments: [
      {
        ledgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerLedger' },
        amount: Number,
        method: String,
        utr: String,
        paidAt: Date,
        paidBy: { type: mongoose.Schema.Types.ObjectId },
      },
    ],
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

export default mongoose.models.SellerPayoutRequest || mongoose.model('SellerPayoutRequest', sellerPayoutRequestSchema);
