import mongoose from 'mongoose';

const gstFilingSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    vendorZeebacId: {
      type: String,
      required: true,
      index: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },
    storeName: {
      type: String,
      required: true,
    },
    period: {
      type: String,
      required: true,
      index: true, // e.g. "2026-11" or "Q3-2026"
    },
    periodName: {
      type: String,
      default: 'November 2026',
    },
    financialYear: {
      type: String,
      default: '2026-27',
    },
    // Sales (Outward)
    totalSalesTaxable: {
      type: Number,
      default: 0,
    },
    totalOutputGst: {
      type: Number,
      default: 0,
    },
    salesInvoicesCount: {
      type: Number,
      default: 0,
    },
    // Purchases (Inward / ITC)
    totalPurchasesTaxable: {
      type: Number,
      default: 0,
    },
    totalInputGst: {
      type: Number,
      default: 0,
    },
    purchaseInvoicesCount: {
      type: Number,
      default: 0,
    },
    // Net
    netGstPayable: {
      type: Number,
      default: 0,
    },
    itcCarryForward: {
      type: Number,
      default: 0,
    },
    // Filing Details
    status: {
      type: String,
      enum: ['READY_TO_FILE', 'FILED', 'VERIFIED'],
      default: 'FILED',
      index: true,
    },
    filingType: {
      type: String,
      enum: ['GSTR_1', 'GSTR_3B', 'COMBINED'],
      default: 'COMBINED',
    },
    arn: {
      type: String, // Application Reference Number (from GST portal)
      trim: true,
    },
    filingMode: {
      type: String,
      enum: ['DIRECT_PORTAL', 'CA_ASSISTED', 'SELF_ASSISTED', 'ZEEBAC_AUTO'],
      default: 'ZEEBAC_AUTO',
    },
    filedAt: {
      type: Date,
      default: Date.now,
    },
    acknowledgementNumber: {
      type: String,
    },
    notes: {
      type: String,
    },
    gstr1Summary: {
      type: mongoose.Schema.Types.Mixed,
    },
    gstr3bSummary: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index so a vendor has one filing per period
gstFilingSchema.index({ vendorId: 1, period: 1 }, { unique: true });

const GstFiling = mongoose.model('GstFiling', gstFilingSchema);
export default GstFiling;
