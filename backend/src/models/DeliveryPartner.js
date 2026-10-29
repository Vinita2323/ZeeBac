import mongoose from 'mongoose';
import { sanitizeMediaUrl } from '../utils/urlSanitizer.util.js';

const deliveryPartnerSchema = new mongoose.Schema({
  riderId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  profileImage: {
    type: String,
    get: sanitizeMediaUrl,
  },
  vehicleType: {
    type: String,
    enum: ['Bike', 'Scooter', 'EV', 'Cycle', 'Other'],
    default: 'Bike',
  },
  vehicleNo: {
    type: String,
    uppercase: true,
    trim: true,
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true,
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'BUSY', 'OFFLINE'],
    default: 'OFFLINE',
    index: true,
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    updatedAt: Date,
  },
  activeOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  completedDeliveries: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    default: 5.0,
  },
  bankDetails: {
    accountHolderName: String,
    upiId: String,
    bankName: String,
    accountNumber: String,
    ifscCode: String,
  },
  securityPin: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    default: 'delivery_partner',
  },
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

const DeliveryPartner = mongoose.model('DeliveryPartner', deliveryPartnerSchema);
export default DeliveryPartner;
