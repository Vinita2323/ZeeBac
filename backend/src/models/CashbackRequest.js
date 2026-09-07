import mongoose from 'mongoose';

const cashbackRequestSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  // 'cash_claim' — quick "I paid cash" declaration from PayVendorScreen, no
  // proof expected beyond the vendor's own memory of the sale.
  // 'receipt_claim' — the full no-POS flow: customer submits a bill photo
  // (+ ideally GPS) as evidence, for a vendor who wasn't otherwise able to
  // log the sale in real time. billImageUrl is only required for this type.
  requestType: {
    type: String,
    enum: ['cash_claim', 'receipt_claim'],
    required: true,
    default: 'receipt_claim',
  },
  billImageUrl: {
    type: String,
    required: function () { return this.requestType === 'receipt_claim'; },
  },
  purchaseDate: {
    type: Date,
  },
  // GeoJSON — captured on submit for receipt claims when the browser grants
  // location permission. Never blocks submission on its own (see
  // distanceFromVendorMeters below); it's a fraud-review signal, not a hard gate.
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] }, // [longitude, latitude]
  },
  // Precomputed at submission time so admins/vendors reviewing the request
  // don't need to redo the geo math themselves. Null if either the customer
  // didn't grant location, or the vendor has no registered location yet.
  distanceFromVendorMeters: {
    type: Number,
  },
  // Amount >= HIGH_VALUE_THRESHOLD (see cashbackRequestLimits.util.js) —
  // surfaced to admins for visibility, doesn't block vendor approval.
  isHighValue: {
    type: Boolean,
    default: false,
  },
  description: {
    type: String
  },
  // How the customer says they paid. 'Cash' requests come from the
  // customer-declared "I paid cash" flow (no bill photo, needs vendor
  // approval since there's no other proof); other values come from the
  // receipt/bill-claim flow.
  paymentMethod: {
    type: String,
    enum: ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Other'],
    default: 'Cash',
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  }
}, {
  timestamps: true
});

export default mongoose.model('CashbackRequest', cashbackRequestSchema);
