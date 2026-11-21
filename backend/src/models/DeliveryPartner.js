import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const deliveryPartnerSchema = new mongoose.Schema(
  {
    riderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    profileImage: {
      type: String,
      get: sanitizeMediaUrl,
    },

    // ── Application & Approval Lifecycle ──
    applicationStatus: {
      type: String,
      enum: ['DRAFT', 'PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMITTED', 'SUSPENDED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    rejectedAt: Date,
    lastRejectionReason: String,
    resubmissionCount: {
      type: Number,
      default: 0,
    },
    resubmittedAt: Date,
    resubmittedChanges: [
      {
        resubmittedAt: { type: Date, default: Date.now },
        previousRejectionReason: String,
        changesCount: { type: Number, default: 0 },
        changedFields: [
          {
            field: String,
            label: String,
            category: String,
            oldValue: String,
            newValue: String,
            isDocument: { type: Boolean, default: false },
          },
        ],
      },
    ],
    approvedAt: Date,
    suspendedAt: Date,
    suspensionReason: String,
    isSuspended: {
      type: Boolean,
      default: false,
    },

    // ── Personal & Address Details ──
    dateOfBirth: String,
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', ''],
      default: '',
    },
    address: {
      currentAddress: { type: String, trim: true },
      city: { type: String, trim: true, default: 'Lucknow' },
      state: { type: String, trim: true, default: 'Uttar Pradesh' },
      pincode: { type: String, trim: true },
      permanentAddress: { type: String, trim: true },
    },

    // ── Vehicle Details ──
    vehicleType: {
      type: String,
      enum: ['Bike', 'Scooter', 'EV', 'Cycle', 'Other'],
      default: 'Bike',
    },
    vehicleNo: {
      type: String,
      uppercase: true,
      trim: true,
    },
    vehicleModel: {
      type: String,
      trim: true,
    },

    // ── Identity & Vehicle Documents (URLs/Uploads) ──
    documents: {
      profilePhoto: { type: String, get: sanitizeMediaUrl },
      aadhaarNo: { type: String, trim: true },
      aadhaarDoc: { type: String, get: sanitizeMediaUrl },
      panNo: { type: String, trim: true, uppercase: true },
      panDoc: { type: String, get: sanitizeMediaUrl },
      drivingLicenceNo: { type: String, trim: true, uppercase: true },
      drivingLicenceDoc: { type: String, get: sanitizeMediaUrl },
      vehicleRcDoc: { type: String, get: sanitizeMediaUrl },
      insuranceDoc: { type: String, get: sanitizeMediaUrl },
    },

    // ── Document Verification Checklist ──
    documentVerification: {
      aadhaarVerified: { type: Boolean, default: false },
      panVerified: { type: Boolean, default: false },
      drivingLicenceVerified: { type: Boolean, default: false },
      vehicleRcVerified: { type: Boolean, default: false },
    },

    // ── Availability & Live Location ──
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'BUSY', 'OFFLINE'],
      default: 'OFFLINE',
      index: true,
    },

    // ── Working Area, Clusters & Shift Gigs ──
    workingCity: {
      type: String,
      default: 'Lucknow',
      trim: true,
      index: true,
    },
    workingZone: {
      type: String,
      default: 'Gomti Nagar',
      trim: true,
      index: true,
    },
    workingZoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      default: null,
    },
    preferredZones: [
      {
        type: String,
        trim: true,
      },
    ],
    bookedGigs: [
      {
        gigId: { type: String, required: true },
        date: { type: String, required: true }, // 'YYYY-MM-DD'
        slotId: { type: String, required: true },
        timeRange: { type: String, required: true },
        label: { type: String, required: true },
        zone: { type: String, required: true },
        zoneId: { type: String },
        surgeBonus: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'],
          default: 'BOOKED',
        },
        bookedAt: { type: Date, default: Date.now },
        checkedInAt: { type: Date },
        completedAt: { type: Date },
        cancelledAt: { type: Date },
      },
    ],
    currentLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
      updatedAt: Date,
    },
    activeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    rejectedOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
      },
    ],

    // ── Performance & Metrics ──
    completedDeliveries: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    // ── Floating Cash In Hand (COD Collections) ──
    cashInHand: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxCashLimit: {
      type: Number,
      default: null, // If set, overrides global payoutConfig.maxCashInHandLimit for this rider
    },
    cashDepositHistory: [
      {
        amount: Number,
        method: {
          type: String,
          enum: ['EARNINGS_DEDUCTION', 'UPI', 'CASH_HUB', 'ADMIN_CLEARANCE'],
          default: 'UPI',
        },
        txnRef: String,
        utr: String,
        status: { type: String, enum: ['COMPLETED', 'PENDING', 'REJECTED'], default: 'COMPLETED' },
        settledAt: { type: Date, default: Date.now },
        verifiedBy: String,
        note: String,
      },
    ],
    rating: {
      type: Number,
      default: 5.0,
    },
    ratingsCount: {
      type: Number,
      default: 0,
    },
    vendorRatings: [
      {
        orderId: String,
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        vendorName: String,
        storeName: String,
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        tags: [String],
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // ── Banking & Settlement ──
    bankDetails: {
      accountHolderName: String,
      upiId: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
    },

    // ── Earnings History Ledger ──
    earningsLedger: [
      {
        orderId: String,
        amount: Number,
        type: { type: String, default: 'DELIVERY_PAYOUT' },
        description: String,
        distanceKm: Number,
        breakdown: {
          baseFare: Number,
          perKmRate: Number,
          billableDistanceKm: Number,
          distancePayout: Number,
          surgeBonus: Number,
        },
        date: { type: Date, default: Date.now },
      },
    ],

    // ── Admin Audit Logs ──
    adminAuditLogs: [
      {
        adminId: { type: mongoose.Schema.Types.Mixed },
        adminName: String,
        action: String,
        reason: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],

    securityPin: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: 'delivery_partner',
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

const DeliveryPartner = mongoose.model('DeliveryPartner', deliveryPartnerSchema);
export default DeliveryPartner;
