import mongoose from 'mongoose';

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
    type: String, // Path or URL
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
    brandLogo: String,
    cashbackPercentage: Number,
  }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
export default Product;
