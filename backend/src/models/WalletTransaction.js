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
      enum: ['User', 'Vendor'],
    },
    type: {
      type: String,
      required: true,
      enum: ['credit', 'debit'],
    },
    category: {
      type: String,
      required: true,
      enum: ['cashback', 'cashout', 'refund', 'settlement', 'welcome_bonus', 'referral_bonus', 'scratch_card_reward'],
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
      enum: ['Transaction', 'CashbackRequest', 'Cashout', 'Referral'],
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
    gatewayPaymentId: {
      type: String,
    },
    description: {
      type: String,
      required: true,
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
