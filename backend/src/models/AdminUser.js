import mongoose from 'mongoose';

const adminUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: 'admin',
      enum: ['admin', 'super_admin'],
    },
    permissions: [{
      type: String, // e.g., 'vendors', 'users', 'transactions', 'settings'
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
    refreshToken: {
      type: String,
    }
  },
  {
    timestamps: true,
  }
);

const AdminUser = mongoose.model('AdminUser', adminUserSchema);
export default AdminUser;
