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
      required: true,
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
      enum: ['qr_cashback', 'manual', 'receipt_claim'],
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
      enum: ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Other'],
      default: 'Cash',
    },
    
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Flagged', 'Rejected'],
      default: 'Pending',
    },
    flagReason: String,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    reviewedAt: Date,
    
    receiptUrl: String,
    hasReceipt: {
      type: Boolean,
      default: false,
    },
    
    source: {
      type: String,
      enum: ['vendor_scan', 'vendor_manual', 'customer_request'],
      required: true,
    },
    
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
