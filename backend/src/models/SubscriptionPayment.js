import mongoose from 'mongoose';

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
    },
    planType: {
      type: String,
      enum: ['Monthly', 'Yearly'],
      required: true,
    },
    shopType: {
      type: String,
      enum: ['Independent Store', 'Chain & Brand'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['RAZORPAY', 'WALLET'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    razorpayOrderId: {
      type: String,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      index: true,
    },
    razorpaySignature: {
      type: String,
    },
    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
    },
    transactionId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    paidAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const SubscriptionPayment = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
export default SubscriptionPayment;
