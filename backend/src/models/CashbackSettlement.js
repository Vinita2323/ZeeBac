import mongoose from 'mongoose';

const cashbackSettlementSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    vendorZeebacId: {
      type: String,
      required: true,
      index: true,
    },
    storeName: {
      type: String,
    },
    type: {
      type: String,
      enum: ['ISSUED', 'REDEEMED', 'ADMIN_ADJUSTMENT', 'PAYMENT_SETTLED'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    customerZeebacId: String,
    customerName: String,
    orderId: String,
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    referenceType: {
      type: String,
      enum: ['Order', 'Transaction', 'ManualAdjustment'],
      default: 'Order',
    },
    billNumber: String,
    paymentMethod: String,
    eligiblePaidAmount: Number,
    cashbackPercentage: Number,
    notes: String,
    // Ledger balance snapshots at the moment this entry was posted
    cashbackIssuedAfter: {
      type: Number,
      default: 0,
    },
    cashbackRedeemedAfter: {
      type: Number,
      default: 0,
    },
    netBalanceAfter: {
      type: Number,
      default: 0,
    },
    remainingCapacityAfter: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

cashbackSettlementSchema.index({ vendorId: 1, createdAt: -1 });

export default mongoose.model('CashbackSettlement', cashbackSettlementSchema);
