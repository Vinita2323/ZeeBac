import mongoose from 'mongoose';

const rewardConfigSchema = new mongoose.Schema({
  milestoneInterval: {
    type: Number,
    default: 5,
  },
  minScratchReward: {
    type: Number,
    default: 5,
  },
  maxScratchReward: {
    type: Number,
    default: 50,
  },
  referralReward: {
    type: Number,
    default: 150,
  },
  userMinWithdrawalAmount: {
    type: Number,
    default: 250,
  },
  userMaxWithdrawalAmount: {
    type: Number,
    default: 10000,
  },
  userWithdrawalCommissionPercent: {
    type: Number,
    default: 2,
  },
  vendorWithdrawalCommissionPercent: {
    type: Number,
    default: 2,
  },
  withdrawalFixedFee: {
    type: Number,
    default: 5,
  },
  withdrawalGstPercent: {
    type: Number,
    default: 18,
  },
  enableWithdrawalGst: {
    type: Boolean,
    default: false,
  },
  orderGstTaxPercent: {
    type: Number,
    default: 5,
    min: 0,
    max: 28,
  },
  enableOrderTax: {
    type: Boolean,
    default: true,
  },
  // ── Centralized order pricing (admin-controlled; these amounts go to admin) ──
  orderDeliveryCharge: { type: Number, default: 40, min: 0 },
  orderFreeDeliveryAbove: { type: Number, default: 0, min: 0 }, // 0 = never free
  orderPlatformFeeFixed: { type: Number, default: 0, min: 0 },
  orderPlatformFeePercent: { type: Number, default: 0, min: 0, max: 50 },
  // Commission admin keeps from the seller's share (item total + packaging)
  sellerCommissionPercent: { type: Number, default: 0, min: 0, max: 50 },
  sellerMinPayoutRequest: { type: Number, default: 100, min: 1 },
  customerWalletPayCommissionPercent: {
    type: Number,
    default: 0, // 0% convenience fee - zero extra charges when paying merchant from wallet
  },
  customerWalletPayFixedFee: {
    type: Number,
    default: 0,
  },
  vendorPaymentCommissionPercent: {
    type: Number,
    default: 0, // ZeeBac takes 0% fee on customer payments to merchant
  },
  independentStoreMonthlyPrice: {
    type: Number,
    default: 499,
  },
  independentStoreThreeMonthPrice: {
    type: Number,
    default: 1299,
  },
  independentStoreYearlyPrice: {
    type: Number,
    default: 4999,
  },
  brandMonthlyPrice: {
    type: Number,
    default: 999,
  },
  brandThreeMonthPrice: {
    type: Number,
    default: 2699,
  },
  brandYearlyPrice: {
    type: Number,
    default: 9999,
  },
  newUserBonusDays: {
    type: Number,
    default: 10,
  },
  // How many cashback requests (cash_claim + receipt_claim combined) one
  // customer may file at the SAME shop per rolling 24 hours. Scoped per
  // vendor, not a platform-wide total — a customer visiting 3 different
  // shops gets this limit at each one independently. A specific vendor can
  // be given a different limit via Vendor.dailyRequestLimitOverride.
  dailyCashbackRequestsPerShop: {
    type: Number,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const RewardConfig = mongoose.model('RewardConfig', rewardConfigSchema);
export default RewardConfig;
