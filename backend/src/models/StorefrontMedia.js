import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const storefrontMediaSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  type:     { type: String, enum: ['image', 'video'], default: 'image' },
  url:      { type: String, required: true, get: sanitizeMediaUrl },
  thumbnail: { type: String, get: sanitizeMediaUrl },
  caption:  { type: String, default: '' },
  sortOrder:{ type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { 
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

export default mongoose.model('StorefrontMedia', storefrontMediaSchema);

