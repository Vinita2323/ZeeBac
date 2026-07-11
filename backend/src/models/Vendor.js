import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    zeebacId: {
      type: String,
      required: true,
      unique: true,
    },
    storeName: {
      type: String,
      required: true,
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
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    description: String,
    gstNumber: {
      type: String,
    },
    registrationNumber: String,
    address: {
      fullAddress: { type: String, required: true },
      landmark: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
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
      accountHolderName: { type: String, required: true },
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      ifscCode: { type: String, required: true },
      upiId: String,
    },
    documents: {
      aadhaarPan: {
        fileName: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: Date,
      },
      gstCertificate: {
        fileName: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: Date,
      },
      shopLicense: {
        fileName: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: Date,
      },
      cancelledCheque: {
        fileName: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: Date,
      },
    },
    socialLinks: {
      website: String,
      instagram: String,
      facebook: String,
      whatsapp: String,
    },
    cashbackRate: Number,
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
    operatingHours: {
      type: String,
      default: "Open Daily: 09:00 AM - 10:00 PM",
    },
    storeLogo: {
      type: String, // S3 URL or file ref
    },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected', 'Suspended'],
      default: 'Pending',
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    rejectionReason: String,
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
