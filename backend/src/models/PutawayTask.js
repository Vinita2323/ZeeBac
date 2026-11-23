import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const putawayTaskSchema = new mongoose.Schema(
  {
    taskNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    barcode: {
      type: String,
      index: true,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      get: sanitizeMediaUrl,
    },
    category: {
      type: String,
      default: 'General',
    },
    batchNumber: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: String,
      trim: true,
    },
    inwardQuantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    putawayQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    targetLocation: {
      zone: { type: String, default: 'Zone A - FMCG' },
      rack: { type: String, required: true },
      shelf: { type: String, required: true },
      bin: { type: String, required: true },
      binCode: { type: String, required: true, trim: true, uppercase: true },
    },
    scannedBinBarcode: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    putawayBy: {
      type: String,
      default: 'Dark Store Operator',
    },
    putawayUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    completedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Indexes for fast searching in handheld scanner
putawayTaskSchema.index({ vendorId: 1, status: 1 });
putawayTaskSchema.index({ vendorId: 1, barcode: 1 });
putawayTaskSchema.index({ 'targetLocation.binCode': 1 });

const PutawayTask = mongoose.model('PutawayTask', putawayTaskSchema);
export default PutawayTask;
