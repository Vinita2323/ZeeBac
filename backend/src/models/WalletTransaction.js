import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'ownerType',
    },
    ownerType: {
      type: String,
      required: true,
      enum: ['User', 'Vendor', 'user', 'vendor', 'customer', 'Customer'],
    },
    type: {
      type: String,
      required: true,
      enum: ['credit', 'debit'],
    },
    category: {
      type: String,
      required: true,
      enum: ['cashback', 'cashout', 'refund', 'settlement', 'welcome_bonus', 'referral_bonus', 'scratch_card_reward', 'payment_received', 'withdrawal', 'cashback_payout', 'cashback_earned', 'purchase'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'referenceType',
    },
    referenceType: {
      type: String,
      enum: ['Transaction', 'CashbackRequest', 'Cashout', 'Referral', 'WithdrawalRequest'],
    },
    // External Gateway info (for recharges via Razorpay etc.)
    gatewayName: {
      type: String,
      enum: ['Razorpay', 'None'],
      default: 'None',
    },
    gatewayOrderId: {
      type: String,
    },
    // Unique + sparse: at most one ledger row can ever exist per Razorpay
    // payment id, so a replayed/retried verify request fails at the database
    // level even if the application-level idempotency check is bypassed.
    // Sparse because most ledger rows (cash/manual transactions) have no
    // gateway payment at all.
    gatewayPaymentId: {
      type: String,
      index: { unique: true, sparse: true },
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Success', 'Failed', 'Refunded'],
      default: 'Success',
    },
    feeAmount: {
      type: Number,
      default: 0,
    },
    netPayout: {
      type: Number,
    },
    adminTransactionId: {
      type: String, // UTR or Bank Reference entered by admin during manual payout
    },
    vendorName: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('WalletTransaction', walletTransactionSchema);
