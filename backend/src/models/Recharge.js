import mongoose from 'mongoose';

const rechargeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    operator: {
      type: String,
      required: true,
      enum: ['Jio', 'Airtel', 'Vi', 'BSNL'],
    },
    circle: {
      type: String,
      default: 'Delhi NCR',
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    planDetails: {
      planName: String,
      validity: String,
      data: String,
      talktime: String,
      description: String,
    },
    status: {
      type: String,
      enum: ['Success', 'Pending', 'Failed'],
      default: 'Success',
    },
    operatorRefNumber: {
      type: String,
      required: true,
      unique: true,
    },
    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
    },
  },
  { timestamps: true }
);

const Recharge = mongoose.model('Recharge', rechargeSchema);
export default Recharge;
