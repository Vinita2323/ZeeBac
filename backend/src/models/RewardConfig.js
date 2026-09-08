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
  independentStoreMonthlyPrice: {
    type: Number,
    default: 499,
  },
  independentStoreYearlyPrice: {
    type: Number,
    default: 4999,
  },
  brandMonthlyPrice: {
    type: Number,
    default: 999,
  },
  brandYearlyPrice: {
    type: Number,
    default: 9999,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const RewardConfig = mongoose.model('RewardConfig', rewardConfigSchema);
export default RewardConfig;
