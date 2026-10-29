import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import B2BInvoice from '../models/B2BInvoice.js';
import StockMovement from '../models/StockMovement.js';
import logger from '../utils/logger.js';
import { getIO } from '../socket/index.js';

// Helper to emit socket events safely
const safeSocketEmit = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    logger.warn(`[B2B Socket] Could not emit ${event}: ${err.message}`);
  }
};

/**
 * 1. Search products by Barcode, Product ID, or Name for Scanner / Cashier Billing
 * @route GET /api/b2b/products/search
 */
export const searchB2BProducts = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { query, barcode } = req.query;

    const filter = { vendorId: sellerId, isActive: true };

    if (barcode) {
      filter.barcode = barcode.trim();
    } else if (query && query.trim()) {
      const q = query.trim();
      const isObjectId = mongoose.Types.ObjectId.isValid(q);

      filter.$or = [
        { barcode: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
      ];
      if (isObjectId) {
        filter.$or.push({ _id: q });
      }
    }

    const products = await Product.find(filter)
      .select('name barcode mrp wholesalePrice price stock unit category image description cashbackPercentage branding')
      .limit(30)
      .lean();

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    logger.error(`[searchB2BProducts] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error searching products' });
  }
};

/**
 * 2. Search Wholesalers & Buyers by Zeebac ID, phone, or store name
 * @route GET /api/b2b/buyers/search
 */
export const searchB2BBuyers = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { query, businessType } = req.query;

    const filter = { _id: { $ne: sellerId }, status: 'Verified' };

    if (businessType) {
      filter.businessType = new RegExp(`^${businessType}$`, 'i');
    }

    if (query && query.trim()) {
      const q = query.trim();
      filter.$or = [
        { zeebacId: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { storeName: { $regex: q, $options: 'i' } },
        { ownerName: { $regex: q, $options: 'i' } },
      ];
    }

    const buyers = await Vendor.find(filter)
      .select('zeebacId storeName ownerName phone email businessType address city')
      .limit(20)
      .lean();

    return res.status(200).json({
      success: true,
      count: buyers.length,
      data: buyers,
    });
  } catch (error) {
    logger.error(`[searchB2BBuyers] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error searching buyers' });
  }
};

/**
 * 3. Create B2B Invoice with Barcode / Scanned Items & Direct UPI Intent
 * @route POST /api/b2b/invoices
 */
export const createB2BInvoice = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { buyerId, buyerZeebacId, items, paymentMethod = 'UPI_INTENT', notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one product item is required' });
    }

    const seller = await Vendor.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    let buyer = null;
    if (buyerId) {
      buyer = await Vendor.findById(buyerId);
    } else if (buyerZeebacId) {
      buyer = await Vendor.findOne({ zeebacId: buyerZeebacId.trim().toUpperCase() });
    }

    if (!buyer) {
      return res.status(404).json({ success: false, message: 'Buyer (Wholesaler/Merchant) not found' });
    }

    if (String(buyer._id) === String(seller._id)) {
      return res.status(400).json({ success: false, message: 'Seller and Buyer cannot be the same entity' });
    }

    // Validate each item and check seller's stock
    const validatedItems = [];
    let subtotal = 0;
    let totalQuantity = 0;

    for (const item of items) {
      const product = await Product.findOne({ _id: item.productId, vendorId: seller._id });
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.name || item.productId} not found in seller inventory`,
        });
      }

      const requestedQty = Number(item.quantity) || 1;
      if (requestedQty <= 0) {
        return res.status(400).json({ success: false, message: `Invalid quantity for ${product.name}` });
      }

      if (product.stock < requestedQty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${requestedQty}`,
        });
      }

      const rate = Number(item.rate !== undefined ? item.rate : (product.wholesalePrice || product.price));
      const lineTotal = Math.round(rate * requestedQty * 100) / 100;

      validatedItems.push({
        productId: product._id,
        name: product.name,
        barcode: product.barcode || '',
        image: product.image || '',
        category: product.category || 'General',
        quantity: requestedQty,
        rate,
        mrp: product.mrp || product.price,
        unit: product.unit || 'Pcs',
        totalAmount: lineTotal,
        cashbackPercentage: product.cashbackPercentage || 0,
      });

      subtotal += lineTotal;
      totalQuantity += requestedQty;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const gstAmount = 0; // Default flat B2B net total
    const totalAmount = subtotal + gstAmount;

    // Generate unique invoice number
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const invoiceNumber = `INV-B2B-${Date.now().toString().slice(-4)}${randomSuffix.toString().slice(-3)}`;

    // Direct UPI Intent URI
    const sellerUpi = seller.bankDetails?.upiId || process.env.MERCHANT_UPI_ID || 'zeebac@icici';
    const upiPayeeName = encodeURIComponent(seller.storeName || 'Zeebac Merchant');
    const upiNote = encodeURIComponent(`B2B Invoice ${invoiceNumber}`);
    const upiIntentUri = `upi://pay?pa=${sellerUpi}&pn=${upiPayeeName}&am=${totalAmount.toFixed(2)}&cu=INR&tr=${invoiceNumber}&tn=${upiNote}`;

    const invoice = await B2BInvoice.create({
      invoiceNumber,
      sellerId: seller._id,
      sellerDetails: {
        storeName: seller.storeName || seller.ownerName,
        zeebacId: seller.zeebacId,
        phone: seller.phone,
        businessType: seller.businessType || 'Manufacturer',
        address: seller.address?.street || seller.address || '',
        city: seller.address?.city || seller.city || '',
      },
      buyerId: buyer._id,
      buyerDetails: {
        storeName: buyer.storeName || buyer.ownerName,
        zeebacId: buyer.zeebacId,
        phone: buyer.phone,
        businessType: buyer.businessType || 'Wholesaler',
        address: buyer.address?.street || buyer.address || '',
        city: buyer.address?.city || buyer.city || '',
      },
      items: validatedItems,
      subtotal,
      gstAmount,
      totalAmount,
      totalQuantity,
      paymentMethod,
      paymentStatus: 'PENDING',
      upiDetails: {
        intentUri: upiIntentUri,
      },
      isTransferred: false,
      status: 'ISSUED',
      notes,
    });

    safeSocketEmit(`vendor:${buyer._id}`, 'b2b:invoice_created', {
      invoiceNumber,
      sellerName: seller.storeName,
      totalAmount,
      totalQuantity,
      invoiceId: invoice._id,
    });

    logger.info(`[B2B] Invoice created: ${invoiceNumber} | Seller: ${seller.zeebacId} -> Buyer: ${buyer.zeebacId} | Total: ₹${totalAmount}`);

    return res.status(201).json({
      success: true,
      message: 'B2B Invoice generated successfully',
      data: {
        invoice,
        upiIntentUri,
      },
    });
  } catch (error) {
    logger.error(`[createB2BInvoice] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error creating B2B invoice' });
  }
};

/**
 * 4. Verify Payment & Automatically Transfer Products & Stock from Manufacturer to Wholesaler
 *    - Guarantees IDEMPOTENCY: Repeated calls will NOT double-transfer stock!
 * @route POST /api/b2b/invoices/:id/verify-and-transfer
 */
export const verifyAndTransferB2BStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod = 'UPI_INTENT', utr, cashConfirmed } = req.body;

    const invoice = await B2BInvoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'B2B Invoice not found' });
    }

    // ── IDEMPOTENCY GUARD ──
    // If invoice is already transferred, return existing state without duplicate stock movement!
    if (invoice.isTransferred) {
      logger.warn(`[B2B Transfer] Idempotency catch: Invoice ${invoice.invoiceNumber} has already been transferred.`);
      return res.status(200).json({
        success: true,
        alreadyTransferred: true,
        message: 'Payment verified and stock has already been transferred for this invoice.',
        data: { invoice },
      });
    }

    // ── PAYMENT VERIFICATION ──
    if (paymentMethod === 'UPI_INTENT') {
      if (!utr || !/^\d{12}$/.test(String(utr).trim())) {
        return res.status(400).json({ success: false, message: 'Please provide a valid 12-digit UPI UTR number' });
      }

      const cleanUtr = String(utr).trim();
      const existingUtr = await B2BInvoice.findOne({
        _id: { $ne: invoice._id },
        'upiDetails.utr': cleanUtr,
        paymentStatus: 'PAID',
      });

      if (existingUtr) {
        return res.status(400).json({
          success: false,
          message: `This UPI UTR (${cleanUtr}) has already been used for invoice ${existingUtr.invoiceNumber}`,
        });
      }

      invoice.upiDetails = {
        ...invoice.upiDetails,
        utr: cleanUtr,
        paidAt: new Date(),
      };
    } else if (paymentMethod === 'CASH') {
      if (!cashConfirmed) {
        return res.status(400).json({ success: false, message: 'Authorized cash-received confirmation is required' });
      }

      invoice.cashDetails = {
        receivedBy: req.user.storeName || req.user.name || 'Authorized Seller',
        confirmedAt: new Date(),
        notes: 'Cash received and authorized by seller',
      };
    }

    const seller = await Vendor.findById(invoice.sellerId);
    const buyer = await Vendor.findById(invoice.buyerId);

    if (!seller || !buyer) {
      return res.status(404).json({ success: false, message: 'Seller or Buyer vendor record not found' });
    }

    // ── ATOMIC STOCK DEDUCTION & WHOLESALER INVENTORY CLONE/UPDATE ──
    const transferAuditEntries = [];

    for (const item of invoice.items) {
      // 1. Decrement Seller's stock atomically
      const sellerProduct = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          vendorId: seller._id,
          stock: { $gte: item.quantity },
        },
        { $inc: { stock: -item.quantity } },
        { returnDocument: 'after' }
      );

      if (!sellerProduct) {
        return res.status(400).json({
          success: false,
          message: `Transfer failed: Insufficient stock for ${item.name} in seller inventory`,
        });
      }

      const sellerStockAfter = sellerProduct.stock;
      const sellerStockBefore = sellerStockAfter + item.quantity;

      // Record Seller OUT movement
      await StockMovement.create({
        vendorId: seller._id,
        productId: sellerProduct._id,
        barcode: sellerProduct.barcode || '',
        productName: sellerProduct.name,
        movementType: 'OUT',
        quantity: item.quantity,
        previousStock: sellerStockBefore,
        newStock: sellerStockAfter,
        reason: 'B2B_SALE',
        referenceId: invoice._id,
        referenceType: 'B2BInvoice',
        notes: `Sold to Wholesaler ${buyer.storeName} (${buyer.zeebacId})`,
      });

      // 2. Check if product already exists in Buyer's inventory (by sourceProductId OR barcode)
      const buyerQuery = {
        vendorId: buyer._id,
        $or: [
          { sourceProductId: sellerProduct._id },
        ],
      };
      if (sellerProduct.barcode) {
        buyerQuery.$or.push({ barcode: sellerProduct.barcode });
      }

      let buyerProduct = await Product.findOne(buyerQuery);
      let buyerStockBefore = 0;
      let buyerStockAfter = 0;

      if (buyerProduct) {
        // Product already exists in Wholesaler's inventory -> Increment stock!
        buyerStockBefore = buyerProduct.stock || 0;
        buyerProduct = await Product.findByIdAndUpdate(
          buyerProduct._id,
          {
            $inc: { stock: item.quantity },
            isActive: true,
            purchaseInvoiceId: invoice._id,
          },
          { returnDocument: 'after' }
        );
        buyerStockAfter = buyerProduct.stock;
      } else {
        // Product does NOT exist yet -> Automatically clone product for Wholesaler!
        buyerStockBefore = 0;
        buyerStockAfter = item.quantity;

        buyerProduct = await Product.create({
          vendorId: buyer._id,
          name: sellerProduct.name,
          price: sellerProduct.price || sellerProduct.mrp,
          discountPrice: sellerProduct.discountPrice,
          category: sellerProduct.category,
          sku: sellerProduct.sku,
          barcode: sellerProduct.barcode || item.barcode || '',
          mrp: sellerProduct.mrp || item.mrp || sellerProduct.price,
          wholesalePrice: sellerProduct.wholesalePrice || item.rate,
          unit: sellerProduct.unit || item.unit || 'Pcs',
          gst: sellerProduct.gst || 0,
          expiryDate: sellerProduct.expiryDate,
          brand: sellerProduct.brand,
          description: sellerProduct.description,
          image: sellerProduct.image,
          stock: item.quantity,
          isActive: true,
          cashbackPercentage: sellerProduct.cashbackPercentage || 0,
          branding: sellerProduct.branding,
          sourceProductId: sellerProduct._id,
          supplierId: seller._id,
          supplierDetails: {
            storeName: seller.storeName || seller.ownerName,
            zeebacId: seller.zeebacId,
            phone: seller.phone,
            businessType: seller.businessType || 'Manufacturer',
          },
          purchaseInvoiceId: invoice._id,
        });
      }

      // Record Buyer IN movement
      await StockMovement.create({
        vendorId: buyer._id,
        productId: buyerProduct._id,
        barcode: buyerProduct.barcode || '',
        productName: buyerProduct.name,
        movementType: 'IN',
        quantity: item.quantity,
        previousStock: buyerStockBefore,
        newStock: buyerStockAfter,
        reason: 'B2B_PURCHASE',
        referenceId: invoice._id,
        referenceType: 'B2BInvoice',
        notes: `Purchased from Manufacturer ${seller.storeName} (${seller.zeebacId})`,
      });

      transferAuditEntries.push({
        productId: sellerProduct._id,
        barcode: sellerProduct.barcode || '',
        name: sellerProduct.name,
        quantity: item.quantity,
        sellerStockBefore,
        sellerStockAfter,
        buyerStockBefore,
        buyerStockAfter,
        buyerProductId: buyerProduct._id,
      });
    }

    // 3. Mark Invoice as PAID and TRANSFERRED
    invoice.paymentStatus = 'PAID';
    invoice.paymentMethod = paymentMethod;
    invoice.isTransferred = true;
    invoice.transferredAt = new Date();
    invoice.status = 'COMPLETED';
    invoice.transferAudit = transferAuditEntries;
    await invoice.save();

    // 4. Real-time Socket Events
    safeSocketEmit(`vendor:${buyer._id}`, 'b2b:inventory_received', {
      invoiceNumber: invoice.invoiceNumber,
      sellerName: seller.storeName,
      itemsCount: invoice.items.length,
      totalQuantity: invoice.totalQuantity,
      transferredAt: invoice.transferredAt,
    });

    safeSocketEmit(`vendor:${seller._id}`, 'b2b:payment_received', {
      invoiceNumber: invoice.invoiceNumber,
      buyerName: buyer.storeName,
      amount: invoice.totalAmount,
    });

    logger.info(`[B2B Transfer] SUCCESS: Invoice ${invoice.invoiceNumber} | Transferred ${invoice.totalQuantity} items from ${seller.zeebacId} to ${buyer.zeebacId}`);

    return res.status(200).json({
      success: true,
      message: 'Payment verified and inventory successfully transferred to Wholesaler',
      data: {
        invoice,
        transferAudit: transferAuditEntries,
      },
    });
  } catch (error) {
    logger.error(`[verifyAndTransferB2BStock] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error verifying B2B transfer' });
  }
};

/**
 * 5. Get Invoices Issued by Seller (Sales)
 * @route GET /api/b2b/invoices/seller
 */
export const getSellerInvoices = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { status, paymentStatus, page = 1, limit = 20 } = req.query;

    const filter = { sellerId };
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      B2BInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      B2BInvoice.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getSellerInvoices] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching seller invoices' });
  }
};

/**
 * 6. Get Invoices Received by Buyer (Purchases)
 * @route GET /api/b2b/invoices/buyer
 */
export const getBuyerInvoices = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { status, paymentStatus, page = 1, limit = 20 } = req.query;

    const filter = { buyerId };
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      B2BInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      B2BInvoice.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getBuyerInvoices] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching buyer invoices' });
  }
};

/**
 * 7. Get Single B2B Invoice by ID
 * @route GET /api/b2b/invoices/:id
 */
export const getB2BInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await B2BInvoice.findById(id).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'B2B Invoice not found' });
    }

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error(`[getB2BInvoiceById] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching invoice' });
  }
};

/**
 * 8. Stock Movement History / Audit Ledger
 * @route GET /api/b2b/stock-ledger
 */
export const getStockLedger = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { productId, barcode, movementType, page = 1, limit = 30 } = req.query;

    const filter = { vendorId };
    if (productId) filter.productId = productId;
    if (barcode) filter.barcode = barcode;
    if (movementType) filter.movementType = movementType;

    const skip = (Number(page) - 1) * Number(limit);
    const [movements, total] = await Promise.all([
      StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      StockMovement.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: movements,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getStockLedger] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching stock ledger' });
  }
};

/**
 * 9. Manufacturer Dashboard Stats
 * @route GET /api/b2b/dashboard-stats
 */
export const getManufacturerDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const [totalProducts, activeProducts, stockAggregation, salesAggregation] = await Promise.all([
      Product.countDocuments({ vendorId }),
      Product.countDocuments({ vendorId, isActive: true }),
      Product.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: { _id: null, totalUnits: { $sum: '$stock' } } },
      ]),
      B2BInvoice.aggregate([
        { $match: { sellerId: new mongoose.Types.ObjectId(vendorId), isTransferred: true } },
        {
          $group: {
            _id: null,
            totalSalesVolume: { $sum: '$totalAmount' },
            totalUnitsSold: { $sum: '$totalQuantity' },
            totalInvoicesCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalStockUnits = stockAggregation[0]?.totalUnits || 0;
    const totalSalesVolume = salesAggregation[0]?.totalSalesVolume || 0;
    const totalUnitsSold = salesAggregation[0]?.totalUnitsSold || 0;
    const totalInvoicesCount = salesAggregation[0]?.totalInvoicesCount || 0;

    return res.status(200).json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        totalStockUnits,
        totalSalesVolume,
        totalUnitsSold,
        totalInvoicesCount,
      },
    });
  } catch (error) {
    logger.error(`[getManufacturerDashboardStats] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching dashboard stats' });
  }
};
