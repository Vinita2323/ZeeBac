import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const b2bItemSchema = new mongoose.Schema({
  productIdString: {
    type: String,
    trim: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  barcode: {
    type: String,
    trim: true,
  },
  image: {
    type: String,
    get: sanitizeMediaUrl,
  },
  category: {
    type: String,
    default: 'General',
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  mrp: {
    type: Number,
  },
  unit: {
    type: String,
    default: 'Pcs',
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  cashbackPercentage: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const transferAuditSchema = new mongoose.Schema({
  productIdString: String,
  productId: mongoose.Schema.Types.ObjectId,
  barcode: String,
  name: String,
  quantity: Number,
  sellerStockBefore: Number,
  sellerStockAfter: Number,
  buyerStockBefore: Number,
  buyerStockAfter: Number,
  buyerProductId: mongoose.Schema.Types.ObjectId,
  transferredAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const b2bInvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  sellerDetails: {
    storeName: String,
    zeebacId: String,
    phone: String,
    businessType: String,
    address: String,
    city: String,
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  buyerDetails: {
    storeName: String,
    zeebacId: String,
    phone: String,
    businessType: String,
    address: String,
    city: String,
  },
  items: [b2bItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0,
  },
  gstAmount: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  totalQuantity: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['UPI_INTENT', 'CASH'],
    default: 'UPI_INTENT',
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  upiDetails: {
    intentUri: String,
    utr: {
      type: String,
      sparse: true,
      index: true,
    },
    paidAt: Date,
  },
  cashDetails: {
    receivedBy: String,
    confirmedAt: Date,
    notes: String,
  },
  // Idempotency: stock transfer must only happen ONCE upon verified payment
  isTransferred: {
    type: Boolean,
    default: false,
    index: true,
  },
  transferredAt: {
    type: Date,
  },
  transferAudit: [transferAuditSchema],
  status: {
    type: String,
    enum: ['ISSUED', 'COMPLETED', 'CANCELLED'],
    default: 'ISSUED',
  },
  notes: String,
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

const B2BInvoice = mongoose.model('B2BInvoice', b2bInvoiceSchema);
export default B2BInvoice;
