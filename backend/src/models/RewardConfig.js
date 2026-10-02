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
  customerWalletPayCommissionPercent: {
    type: Number,
    default: 2, // 2% convenience fee by default when user pays merchant from wallet
  },
  customerWalletPayFixedFee: {
    type: Number,
    default: 0,
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
    default: 3,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const RewardConfig = mongoose.model('RewardConfig', rewardConfigSchema);
export default RewardConfig;
