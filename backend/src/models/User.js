import mongoose from 'mongoose';

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
      type: String, // URL to uploaded image
    },
    linkedAccounts: {
      google: String,
      facebook: String,
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
    }
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model('User', userSchema);
export default User;
