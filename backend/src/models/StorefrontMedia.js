import mongoose from 'mongoose';

const storefrontMediaSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  type:     { type: String, enum: ['image', 'video'], default: 'image' },
  url:      { type: String, required: true },
  thumbnail: { type: String },
  caption:  { type: String, default: '' },
  sortOrder:{ type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('StorefrontMedia', storefrontMediaSchema);
