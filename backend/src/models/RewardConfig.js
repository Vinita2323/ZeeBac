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
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const RewardConfig = mongoose.model('RewardConfig', rewardConfigSchema);
export default RewardConfig;
