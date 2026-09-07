import mongoose from 'mongoose';

const posBillSchema = new mongoose.Schema(
  {
    billCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    vendorZeebacId: {
      type: String,
      required: true,
      trim: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    cashbackRate: {
      type: Number,
      required: true,
      default: 10,
    },
    status: {
      type: String,
      enum: ['UNCLAIMED', 'CLAIMED', 'EXPIRED'],
      default: 'UNCLAIMED',
    },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    cashbackAmount: {
      type: Number,
      default: 0,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  },
  { timestamps: true }
);

// Index for fast lookup by billCode
posBillSchema.index({ billCode: 1, status: 1 });

const PosBill = mongoose.model('PosBill', posBillSchema);
export default PosBill;
