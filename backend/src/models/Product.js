import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const productSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  discountPrice: {
    type: Number,
  },
  category: {
    type: String,
    default: 'Bestsellers',
  },
  sku: {
    type: String,
  },
  description: {
    type: String,
  },
  image: {
    type: String,
    get: sanitizeMediaUrl,
  },
  isHighlight: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  stock: {
    type: Number,
    default: 0,
  },
  branding: {
    isBranded: { type: Boolean, default: false },
    brandName: String,
    brandCompany: String,
    brandWebsite: String,
    brandDescription: String,
    brandEmail: String,
    brandContact: String,
    brandLogo: { type: String, get: sanitizeMediaUrl },
    cashbackPercentage: Number,
  }
}, { 
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

const Product = mongoose.model('Product', productSchema);
export default Product;

