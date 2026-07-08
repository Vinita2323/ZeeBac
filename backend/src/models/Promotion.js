import mongoose from 'mongoose';

const promotionSchema = new mongoose.Schema({
  vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  title:       { type: String, required: true },
  description: { type: String, required: true },
  type:        { type: String, enum: ['percent', 'redeem', 'flat'], default: 'percent' },
  value:       { type: Number, default: 0 },
  minPurchase: { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true },
  validFrom:   { type: Date, default: Date.now },
  validUntil:  { type: Date },
}, { timestamps: true });

export default mongoose.model('Promotion', promotionSchema);
