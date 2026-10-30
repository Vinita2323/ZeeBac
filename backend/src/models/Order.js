import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // Product-specific cashback percentage decided per-product or per-company
    cashbackPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Calculated cashback points earned on this product line (1 Point = ₹1)
    cashbackPoints: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
      get: sanitizeMediaUrl,
    },
    category: String,
    brandName: String,
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    vendorZeebacId: {
      type: String,
      required: true,
    },
    storeName: {
      type: String,
      required: true,
    },
    items: [orderItemSchema],

    // Item subtotal before charges and taxes
    itemTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Delivery charge set by store owner
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Packaging & handling charge set by store owner
    packagingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Statutory GST tax decided by Admin
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Gross bill total (itemTotal + deliveryCharge + packagingCharge + taxAmount)
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Zeebac points redeemed by customer (1 Point = ₹1 discount/purchase)
    pointsRedeemed: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Amount to be paid via UPI / Cash after points redemption
    finalPayableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Total cashback points customer will receive upon delivery
    totalCashbackPoints: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    fulfillmentType: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    deliveryAddress: {
      type: String,
      trim: true,
    },
    orderNotes: {
      type: String,
      trim: true,
    },

    paymentMethod: {
      type: String,
      enum: ['UPI_INTENT', 'ZEEBAC_POINTS', 'CASH'],
      default: 'UPI_INTENT',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    upiDetails: {
      payeeVpa: String,
      payeeName: String,
      txnRef: String,
      upiUri: String,
      utr: { type: String, index: true },
      paidAt: Date,
    },

    orderStatus: {
      type: String,
      enum: [
        'PLACED',
        'CONFIRMED',
        'PREPARING',
        'RIDER_ASSIGNED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
      ],
      default: 'PLACED',
      index: true,
    },

    riderDetails: {
      name: String,
      phone: String,
      vehicleNo: String,
      deliveryOtp: String,
      assignedAt: Date,
      deliveredAt: Date,
    },

    // Tracks if cashback points were settled to customer and debited from vendor pool
    cashbackSettled: {
      type: Boolean,
      default: false,
      index: true,
    },
    settledAt: Date,
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

export default mongoose.model('Order', orderSchema);
