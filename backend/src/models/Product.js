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
  images: [{
    type: String,
    get: sanitizeMediaUrl,
  }],
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
  barcode: {
    type: String,
    index: true,
    trim: true,
  },
  mrp: {
    type: Number,
  },
  wholesalePrice: {
    type: Number,
  },
  unit: {
    type: String,
    default: 'Pcs',
    trim: true,
  },
  gst: {
    type: Number,
    default: 0,
  },
  expiryDate: {
    type: String,
  },
  brand: {
    type: String,
    trim: true,
  },
  documents: [{
    name: String,
    url: { type: String, get: sanitizeMediaUrl },
    docType: String,
  }],
  sourceProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },
  supplierDetails: {
    storeName: String,
    zeebacId: String,
    phone: String,
    businessType: String,
  },
  purchaseInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BInvoice',
    default: null,
  },
  cashbackPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
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

