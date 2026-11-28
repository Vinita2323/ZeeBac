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
    binCode: {
      type: String,
      default: '',
      trim: true,
    },
    warehouseLocation: {
      rack: { type: String, default: '' },
      shelf: { type: String, default: '' },
      bin: { type: String, default: '' },
      binCode: { type: String, default: '' },
    },
    barcode: {
      type: String,
      default: '',
      trim: true,
    },
    batchNumber: {
      type: String,
      default: '',
      trim: true,
    },
    expiryDate: {
      type: String,
      default: '',
    },
    picked: {
      type: Boolean,
      default: false,
    },
    pickedQuantity: {
      type: Number,
      default: 0,
    },
    pickedAt: {
      type: Date,
    },
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

    // Tip for delivery partner/rider
    tipAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Store preparation time estimation in minutes
    estimatedPrepTime: {
      type: Number,
      default: 15,
      min: 5,
      max: 120,
    },
    prepTimeSelectedAt: Date,

    fulfillmentType: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    deliverySchedule: {
      deliveryType: {
        type: String,
        enum: ['INSTANT', 'SCHEDULED'],
        default: 'INSTANT',
      },
      scheduledDate: String,
      scheduledSlot: String,
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
      enum: ['UPI_INTENT', 'ZEEBAC_POINTS', 'CASH', 'ONLINE', 'RAZORPAY'],
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

    // Admin platform / convenience fee (set by admin, goes to admin)
    platformFee: { type: Number, default: 0, min: 0 },

    // ── Centralized collection: Razorpay (admin account) payment for cart orders ──
    razorpay: {
      orderId: { type: String, index: { unique: true, sparse: true } },
      paymentId: { type: String, index: { unique: true, sparse: true } },
      status: { type: String, enum: ['CREATED', 'CAPTURED', 'FAILED'] },
      method: String,
      amountPaid: Number,
      fee: Number, // total Razorpay fee incl. GST (₹)
      tax: Number, // GST portion of the fee (₹)
      capturedAt: Date,
      capturedVia: { type: String, enum: ['CLIENT_VERIFY', 'WEBHOOK'] },
      failureReason: String,
    },
    refunds: [
      {
        refundId: String,
        amount: Number,
        status: { type: String, enum: ['PENDING', 'PROCESSED', 'FAILED'], default: 'PENDING' },
        reason: String,
        sellerReversal: Number,
        initiatedBy: { type: mongoose.Schema.Types.ObjectId },
        createdAt: { type: Date, default: Date.now },
        processedAt: Date,
      },
    ],
    refundedAmount: { type: Number, default: 0 },

    // ── Order-wise financial breakdown & seller settlement state ──
    financials: {
      grossTotal: Number, // everything the bill adds up to (before points)
      customerPaid: Number, // money actually collected (online or COD)
      sellerGross: Number, // itemTotal + packagingCharge
      pointsRedeemed: Number, // settled via existing cashback ledger, not here
      commissionPercent: Number,
      commissionAmount: Number,
      gatewayFee: Number, // Razorpay fee incl. GST, borne by seller (online only)
      sellerPayable: Number, // credited to seller ledger
      adminShare: Number, // delivery + platform fee + GST + tip − gateway fee retained by admin
      settlementStatus: {
        type: String,
        enum: ['NOT_APPLICABLE', 'PENDING', 'ON_HOLD', 'CREDITED', 'REVERSED'],
        default: 'PENDING',
        index: true,
      },
      creditedAt: Date,
      codConfirmedAt: Date,
      codConfirmedBy: { type: mongoose.Schema.Types.ObjectId },
    },

    // ── Store Pickup: in-store billing by merchant (pay directly to seller UPI or cash) ──
    // Payment confirmation is a separate step from handover (DELIVERED).
    storeBill: {
      status: { type: String, enum: ['NONE', 'GENERATED', 'PAID'], default: 'NONE' },
      billRef: String,
      amount: Number,
      payeeVpa: String,
      payeeName: String,
      upiUri: String,
      generatedAt: Date,
      paidVia: { type: String, enum: ['UPI', 'CASH'] },
      amountReceived: Number,
      utr: String,
      confirmedAt: Date,
      confirmedBy: { type: mongoose.Schema.Types.ObjectId },
    },

    orderStatus: {
      type: String,
      enum: [
        'PLACED',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'RIDER_ASSIGNED',
        'ARRIVED_AT_PICKUP',
        'PICKED_UP',
        'OUT_FOR_DELIVERY',
        'ARRIVED_AT_CUSTOMER',
        'DELIVERED',
        'CANCELLED',
        'FAILED_DELIVERY',
      ],
      default: 'PLACED',
      index: true,
    },

    pickupCoordinates: {
      latitude: Number,
      longitude: Number,
    },
    deliveryCoordinates: {
      latitude: Number,
      longitude: Number,
    },

    riderDetails: {
      riderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DeliveryPartner',
      },
      name: String,
      phone: String,
      vehicleNo: String,
      pickupOtp: String,
      deliveryOtp: String,
      assignedAt: Date,
      currentLocation: {
        latitude: Number,
        longitude: Number,
        heading: Number,
        speed: Number,
        updatedAt: Date,
      },
      pickupProofImage: {
        type: String,
        default: null,
      },
      pickedUpAt: Date,
      deliveredAt: Date,
    },

    // ── Dark Store WMS Picking & Packing Details (Zepto / Blinkit Flow) ──
    toteNumber: {
      type: String,
      default: '',
      trim: true,
    },
    packingStatus: {
      type: String,
      enum: ['PENDING', 'PICKING_IN_PROGRESS', 'PICKED', 'PACKED', 'READY_FOR_PICKUP'],
      default: 'PENDING',
      index: true,
    },
    pickingStartedAt: Date,
    pickingCompletedAt: Date,
    pickingDurationSeconds: Number,

    // ── Zomato-style Store Pickup OTP (Generated on order confirmation, verified by rider at store) ──
    pickupOtp: {
      type: String,
      default: () => Math.floor(1000 + Math.random() * 9000).toString(),
    },

    // ── Rider Rejection Audit History ──
    riderRejections: [
      {
        riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryPartner' },
        riderName: String,
        riderPhone: String,
        reason: String,
        rejectedAt: { type: Date, default: Date.now },
      },
    ],

    // ── Order Cancellation Details ──
    cancellationReason: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledBy: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'ADMIN', 'SYSTEM'],
      default: null,
    },
    cancelledAt: Date,

    // ── Inventory reduced when the store accepted the order (restored on cancel / return) ──
    stockDeduction: {
      deducted: { type: Boolean, default: false },
      deductedAt: Date,
      restored: { type: Boolean, default: false },
      restoredAt: Date,
      items: [
        {
          _id: false,
          productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
          name: String,
          ordered: Number, // quantity on the order
          quantity: Number, // quantity actually taken from stock
        },
      ],
    },

    // ── Online payment kept (not refunded) when the rider returns the order after Out for Delivery ──
    paymentForfeited: {
      forfeited: { type: Boolean, default: false },
      amount: { type: Number, default: 0 },
      reason: String,
      at: Date,
    },

    // ── Zeebac points deducted for a COD cancel / return after Out for Delivery ──
    lateCancellationPenalty: {
      applied: { type: Boolean, default: false },
      amount: { type: Number, default: 0 },
      basis: { type: String, enum: ['ENTIRE_ORDER', 'DELIVERY_CHARGE', null], default: null },
      stage: String, // orderStatus at the moment of cancel/return
      actor: String, // CUSTOMER | RIDER | ADMIN
      reason: String,
      appliedAt: Date,
      balanceAfter: Number,
    },

    // ── Rider Dynamic Payout & Distance ──
    deliveryDistanceKm: {
      type: Number,
      default: 2.0,
      min: 0,
    },
    deliveryPayout: {
      type: Number,
      default: 50,
      min: 0,
    },
    deliveryPayoutBreakdown: {
      baseFare: { type: Number, default: 30 },
      baseDistanceIncludedKm: { type: Number, default: 0 },
      distanceKm: { type: Number, default: 2.0 },
      billableDistanceKm: { type: Number, default: 2.0 },
      perKmRate: { type: Number, default: 10 },
      distancePayout: { type: Number, default: 20 },
      surgeBonus: { type: Number, default: 0 },
      minPayout: { type: Number, default: 30 },
      totalPayout: { type: Number, default: 50 },
    },

    // Customer Feedback & Ratings
    vendorFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true },
      tags: [{ type: String }],
      ratedAt: Date,
    },
    riderFeedbackFromVendor: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true },
      tags: [{ type: String }],
      ratedAt: Date,
    },
    riderFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true },
      tags: [{ type: String }],
      ratedAt: Date,
    },

    // Tracks if cashback points were settled to customer and debited from vendor pool
    cashbackSettled: {
      type: Boolean,
      default: false,
      index: true,
    },
    settledAt: Date,
    // Coins actually funded by the store at delivery (cashback stops when the store has no coins)
    cashbackIssued: { type: Number, default: null },
    cashbackShortfall: { type: Number, default: 0 },
    // Coins credited to this store's earnedCoins for points the customer redeemed on this order
    redemptionCoinsCredited: { type: Number, default: null },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

export default mongoose.model('Order', orderSchema);
