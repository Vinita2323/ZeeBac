import mongoose from 'mongoose';

const partnerOfferSchema = new mongoose.Schema({
  brandName: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  pointsRequired: {
    type: String,
  },
  logoUrl: {
    type: String,
  },
  claimUrl: {
    type: String,
  },
  couponCode: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const PartnerOffer = mongoose.model('PartnerOffer', partnerOfferSchema);
export default PartnerOffer;
