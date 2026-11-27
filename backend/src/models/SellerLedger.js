import mongoose from 'mongoose';

// Append-only ledger of what admin owes each seller (centralized collection model).
// Positive amount = admin owes seller more; negative = reduces what admin owes.
// Every entry carries a unique idempotencyKey so retries / duplicate webhooks
// can never double-credit or double-pay.
const sellerLedgerSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    type: {
      type: String,
      enum: [
        'ORDER_CREDIT', // seller share of a delivered order
        'ORDER_REVERSAL', // refund / cancellation clawback
        'PAYOUT', // admin paid the seller (debit)
        'PAYOUT_REVERSAL', // a recorded payout was voided
        'ADJUSTMENT', // manual admin adjustment (+/-)
      ],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    // Credits start ON_HOLD for COD until admin confirms the cash was collected.
    status: { type: String, enum: ['ON_HOLD', 'AVAILABLE'], default: 'AVAILABLE', index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    orderCode: String,
    payoutRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerPayoutRequest' },
    paymentMode: { type: String, enum: ['ONLINE', 'COD', 'POINTS', 'OTHER'] },
    breakdown: { type: mongoose.Schema.Types.Mixed },
    payout: {
      method: { type: String, enum: ['BANK_TRANSFER', 'UPI', 'CASH', 'RAZORPAY_PAYOUT', 'OTHER'] },
      utr: String,
    },
    note: String,
    idempotencyKey: { type: String, required: true, unique: true },
    releasedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId },
    createdByRole: String,
  },
  { timestamps: true }
);

sellerLedgerSchema.index({ vendorId: 1, createdAt: -1 });
sellerLedgerSchema.index({ 'payout.utr': 1 }, { unique: true, partialFilterExpression: { 'payout.utr': { $type: 'string' } } });

export default mongoose.models.SellerLedger || mongoose.model('SellerLedger', sellerLedgerSchema);
