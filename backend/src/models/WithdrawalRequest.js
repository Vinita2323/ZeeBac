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
