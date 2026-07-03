import mongoose from 'mongoose';

const otpVerificationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ['signup', 'login', 'reset'],
    required: true,
  },
  role: {
    type: String,
    enum: ['customer', 'vendor', 'admin'],
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 300 * 1000), // 5 mins
  }
});

// TTL Index: Deletes the document automatically when current time > expiresAt
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OtpVerification = mongoose.model('OtpVerification', otpVerificationSchema);
export default OtpVerification;
