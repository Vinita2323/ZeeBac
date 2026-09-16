import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    customerZeebacId: String,
    customerPhone: String,
    customerName: String,
    
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    vendorZeebacId: String,
    vendorName: String,
    vendorPhone: String,
    vendorCategory: String,

    type: {
      type: String,
      enum: ['qr_cashback', 'manual', 'receipt_claim', 'pos_bill'],
      required: true,
    },
    initiatedBy: {
      type: String,
      enum: ['customer', 'vendor'],
      required: true,
    },
    
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    cashbackPercent: {
      type: Number,
      required: true,
    },
    cashbackAmount: {
      type: Number,
      required: true,
    },
    
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Wallet', 'Other', 'Cash (POS Bill Scan)', 'Cash (POS Auto Credit)', 'POS'],
      default: 'Cash',
    },
    
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Flagged', 'Rejected', 'Refunded'],
      default: 'Pending',
    },
    flagReason: String,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    reviewedAt: Date,
    refundReason: String,
    refundedAt: Date,
    
    receiptUrl: String,
    hasReceipt: {
      type: Boolean,
      default: false,
    },
    
    source: {
      type: String,
      enum: ['vendor_scan', 'vendor_manual', 'customer_request', 'pos_bill_scan', 'pos_auto_credit', 'upi_qr_scan', 'upi_utr_claim'],
      required: true,
    },
    
    gateway: {
      gatewayName: String,
      gatewayOrderId: String,
      gatewayPaymentId: String,
      utr: { type: String, index: true },
    },
    
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
