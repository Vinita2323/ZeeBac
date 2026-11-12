import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const userSchema = new mongoose.Schema(
  {
    zeebacId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    linkedAccounts: {
      google: String,
      facebook: String,
    },
    bankDetails: {
      accountHolderName: String,
      upiId: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      isVerified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
    },
    preferences: {
      pushNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: true },
      emailPromos: { type: Boolean, default: false },
    },
    favoriteVendors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    }],
    recentVendors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    }],
    location: {
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
      address: String,
      city: String,
      state: String,
      pincode: String,
    },
    savedAddresses: [
      {
        label: {
          type: String,
          default: 'Home',
          trim: true,
        },
        houseNo: {
          type: String,
          required: true,
          trim: true,
        },
        street: {
          type: String,
          default: '',
          trim: true,
        },
        landmark: {
          type: String,
          default: '',
          trim: true,
        },
        city: {
          type: String,
          default: 'Lucknow',
          trim: true,
        },
        state: {
          type: String,
          default: 'Uttar Pradesh',
          trim: true,
        },
        pincode: {
          type: String,
          default: '',
          trim: true,
        },
        receiverName: {
          type: String,
          default: '',
          trim: true,
        },
        receiverPhone: {
          type: String,
          default: '',
          trim: true,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ['Active', 'Suspended', 'Banned'],
      default: 'Active',
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
    },
    scratchCardsClaimed: {
      type: Number,
      default: 0
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    role: {
      type: String,
      default: 'customer',
      enum: ['customer'],
    },
    refreshToken: {
      type: String,
    },
    fcmTokens: [{ type: String }],  // FCM push notification tokens (multiple devices)
    security: {
      biometricEnabled: { type: Boolean, default: false },
      securityPin: { type: String, default: null },
      biometricCredentialId: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

const User = mongoose.model('User', userSchema);
export default User;
