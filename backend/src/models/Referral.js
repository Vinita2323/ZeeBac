import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    referrerCode: {
      type: String,
      required: true,
      trim: true,
    },
    referrerName: {
      type: String,
    },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    referredPhone: {
      type: String,
      required: true,
    },
    rewardAmount: {
      type: Number,
      default: 150,
    },
    rewardStatus: {
      type: String,
      enum: ['Pending', 'Credited', 'Rejected'],
      default: 'Pending',
    },
    rewardCreditedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Invited', 'Signed Up', 'Converted', 'Expired'],
      default: 'Signed Up',
    }
  },
  { timestamps: true }
);

// Indexes for fast lookup
referralSchema.index({ referrerId: 1 });
referralSchema.index({ referrerCode: 1 });
referralSchema.index({ referredUserId: 1 });

const Referral = mongoose.model('Referral', referralSchema);
export default Referral;
