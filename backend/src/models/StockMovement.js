import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  },
  barcode: {
    type: String,
    trim: true,
    index: true,
  },
  productName: {
    type: String,
    required: true,
  },
  movementType: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  previousStock: {
    type: Number,
    required: true,
  },
  newStock: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    enum: ['B2B_SALE', 'B2B_PURCHASE', 'ORDER_DELIVERY', 'MANUAL_ADJUSTMENT', 'INITIAL_IMPORT'],
    required: true,
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  referenceType: {
    type: String,
    enum: ['B2BInvoice', 'Order', 'Manual'],
    default: 'B2BInvoice',
  },
  notes: String,
}, {
  timestamps: true,
});

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
