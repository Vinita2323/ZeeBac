import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'ownerType',
    },
    ownerType: {
      type: String,
      required: true,
      enum: ['User', 'Vendor', 'Admin'],
    },
    ownerZeebacId: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    purchasedPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    redeemedPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
    // ── Vendor coin buckets (bucketsVersion >= 1). balance = purchasedPoints + earnedCoins + cashEarnings ──
    // purchasedPoints : coins the vendor bought (Razorpay / admin-approved UPI). Usable for cashback; withdrawable.
    // earnedCoins     : coins customers spent at this store (+ cashback the vendor itself received). Cashback only; never withdrawable.
    // cashEarnings    : real money received (customer QR / B2B payments). Withdrawable; never used for cashback.
    earnedCoins: { type: Number, default: 0 },
    cashEarnings: { type: Number, default: 0 },
    // 0/absent = legacy single-balance wallet (pre-migration behaviour); 1 = buckets enforced, no negatives
    bucketsVersion: { type: Number, default: 0 },
    lastCashoutAt: {
      type: Date,
    },
    lastCashoutAmount: {
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

export default mongoose.model('Wallet', walletSchema);
