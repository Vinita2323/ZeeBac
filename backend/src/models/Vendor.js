import mongoose from 'mongoose';

const changedFieldSchema = new mongoose.Schema(
  {
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const applicationHistorySchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    action: {
      type: String,
      enum: ['SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED'],
      required: true,
    },
    actionAt: { type: Date, default: Date.now },
    actionByRole: { type: String, enum: ['vendor', 'admin'], required: true },
    actionByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    rejectionCategory: String,
    rejectionComment: String,
    changedFields: [changedFieldSchema],
    snapshot: mongoose.Schema.Types.Mixed,
  },
  { _id: true }
);

const documentFieldSchema = {
  fileName: String,
  fileUrl: String,
  fileType: String,
  uploadedAt: Date,
};

const vendorSchema = new mongoose.Schema(
  {
    zeebacId: {
      type: String,
      required: true,
      unique: true,
    },
    storeName: {
      type: String,
      trim: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    shopType: {
      type: String,
      enum: ['Independent Store', 'Chain & Brand'],
    },
    category: {
      type: String,
    },
    subCategory: {
      type: String,
      trim: true,
    },
    description: String,
    businessContactNumber: {
      type: String,
      trim: true,
    },
    businessEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    gstNumber: {
      type: String,
    },
    registrationNumber: String,
    address: {
      fullAddress: { type: String },
      landmark: String,
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    location: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      }
    },
    bankDetails: {
      accountHolderName: { type: String },
      bankName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      upiId: String,
    },
    documents: {
      aadhaarPan: documentFieldSchema,
      gstCertificate: documentFieldSchema,
      shopLicense: documentFieldSchema,
      cancelledCheque: documentFieldSchema,
      panCard: documentFieldSchema,
      additionalDoc: documentFieldSchema,
    },
    socialLinks: {
      website: String,
      instagram: String,
      facebook: String,
      whatsapp: String,
    },
    // Bounded 0-100 — previously unbounded, so a bad request or bug could set
    // a negative or >100% rate with nothing stopping it from being applied
    // to real transactions.
    cashbackRate: { type: Number, min: 0, max: 100 },
    subscription: {
      plan: {
        type: String,
        enum: ['Basic Plan (Free)', 'Pro Plan (Paid)', 'Enterprise Plan'],
      },
      startDate: Date,
      endDate: Date,
      isActive: Boolean,
    },
    aadhaar: String,
    pan: String,
    profilePic: {
      type: String, // Store logo URL
    },
    storeCoverImage: String,
    storeImages: [{ type: String }],
    operatingHours: {
      type: String,
      default: "Open Daily: 09:00 AM - 10:00 PM",
    },
    businessHours: {
      openingTime: String,
      closingTime: String,
      workingDays: [{ type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }],
    },
    storeLogo: {
      type: String, // S3 URL or file ref
    },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected', 'Suspended'],
      default: 'Pending',
    },
    // Fine-grained onboarding workflow state, kept in sync with `status` by the
    // approve/reject/submit controllers. `status` still gates trading/login access;
    // this drives the vendor-facing wizard/status screens and admin filters.
    applicationStatus: {
      type: String,
      enum: ['DRAFT', 'Draft', 'PENDING_REVIEW', 'Pending Review', 'APPROVED', 'Approved', 'REJECTED', 'Rejected', 'RESUBMITTED', 'Resubmitted'],
      default: 'DRAFT',
      set: (val) => (val ? val.toUpperCase().replace(/\s+/g, '_') : val),
    },
    resubmissionCount: { type: Number, default: 0 },
    submittedAt: Date,
    lastSubmittedAt: Date,
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    rejectionReason: String,
    rejectionCategory: {
      type: String,
      enum: ['Incomplete information', 'Invalid document', 'Document unclear', 'Business details mismatch', 'Location issue', 'Verification failed', 'Other'],
    },
    applicationHistory: [applicationHistorySchema],
    stats: {
      totalCustomers: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
    },
    qrCodeUrl: String,
    role: {
      type: String,
      default: 'vendor',
      enum: ['vendor'],
    },
    refreshToken: {
      type: String,
    },
    fcmTokens: [{ type: String }],  // FCM push notification tokens (multiple devices)
  },
  {
    timestamps: true,
  }
);

vendorSchema.index({ location: "2dsphere" });

const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
