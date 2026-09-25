import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  withdrawalFee: {
    type: Number,
    default: 5,
  },
  platformFee: {
    type: Number,
    default: 0,
  },
  gstAmount: {
    type: Number,
    default: 0,
  },
  feeAmount: {
    type: Number,
    default: 0,
  },
  netPayout: {
    type: Number,
  },
  feePercent: {
    type: Number,
    default: 2,
  },
  gstPercent: {
    type: Number,
    default: 18,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  bankDetailsSnapshot: {
    type: Object, // Store the bank details at the time of request just in case they change it later
    default: {},
  },
  adminRemarks: {
    type: String,
    default: '',
  },
  adminTransactionId: {
    type: String, // UTR or Bank Reference entered by admin during manual payout
  },
}, { timestamps: true });

const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
export default WithdrawalRequest;
