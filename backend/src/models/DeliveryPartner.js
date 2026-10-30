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

    // ── Performance & Metrics ──
    completedDeliveries: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 5.0,
    },

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
