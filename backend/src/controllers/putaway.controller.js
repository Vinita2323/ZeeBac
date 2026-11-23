import mongoose from 'mongoose';
import PutawayTask from '../models/PutawayTask.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import Vendor from '../models/Vendor.js';
import logger from '../utils/logger.js';

// Helper to resolve effective vendorId from request
const resolveVendorId = async (req) => {
  if (req.user?.vendorId) return req.user.vendorId;
  if (req.user?.id) {
    const vendor = await Vendor.findOne({
      $or: [{ _id: req.user.id }, { userId: req.user.id }],
    }).select('_id');
    if (vendor) return vendor._id;
  }
  return req.user?.id || req.user?._id;
};

// Standard dark store zones & rack presets
const DARK_STORE_ZONES = [
  { zone: 'Zone A - FMCG & Staples', rackPrefix: 'A', racksCount: 4, shelvesCount: 4, binsPerShelf: 6 },
  { zone: 'Zone B - Snacks & Beverages', rackPrefix: 'B', racksCount: 3, shelvesCount: 4, binsPerShelf: 6 },
  { zone: 'Zone C - Dairy & Chilled', rackPrefix: 'C', racksCount: 2, shelvesCount: 3, binsPerShelf: 4 },
  { zone: 'Zone D - Personal Care & Home', rackPrefix: 'D', racksCount: 3, shelvesCount: 4, binsPerShelf: 6 },
];

// Helper to compute system-allocated bin for an item
export const calculateOptimalBinLocation = (category = '', productName = '', existingIndex = 0) => {
  const cat = String(category).toLowerCase();
  let zoneConfig = DARK_STORE_ZONES[0];

  if (cat.includes('beverage') || cat.includes('drink') || cat.includes('snack') || cat.includes('biscuit') || cat.includes('chips')) {
    zoneConfig = DARK_STORE_ZONES[1];
  } else if (cat.includes('dairy') || cat.includes('milk') || cat.includes('cold') || cat.includes('frozen') || cat.includes('curd')) {
    zoneConfig = DARK_STORE_ZONES[2];
  } else if (cat.includes('soap') || cat.includes('shampoo') || cat.includes('clean') || cat.includes('personal') || cat.includes('care')) {
    zoneConfig = DARK_STORE_ZONES[3];
  }

  // Derive deterministic or sequential rack/shelf/bin
  let hash = 0;
  for (let i = 0; i < (productName || 'item').length; i++) {
    hash = (hash * 31 + productName.charCodeAt(i)) >>> 0;
  }
  hash = (hash + existingIndex) >>> 0;

  const rackNum = String((hash % zoneConfig.racksCount) + 1).padStart(2, '0');
  const shelfNum = String((Math.floor(hash / 7) % zoneConfig.shelvesCount) + 1).padStart(2, '0');
  const binNum = String((Math.floor(hash / 13) % zoneConfig.binsPerShelf) + 1).padStart(2, '0');

  const rack = `R-${rackNum}`;
  const shelf = `S-${shelfNum}`;
  const bin = `B-${binNum}`;
  const binCode = `${zoneConfig.rackPrefix}${rackNum}-S${shelfNum}-B${binNum}`;

  return {
    zone: zoneConfig.zone,
    rack,
    shelf,
    bin,
    binCode,
  };
};

// ─────────────────────────────────────────────────────────────
// 1. GET PUTAWAY TASKS & STATS
// ─────────────────────────────────────────────────────────────
export const getPutawayTasks = async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req);
    const { status = 'ALL', search, page = 1, limit = 20 } = req.query;

    const query = { vendorId };

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { productName: regex },
        { barcode: regex },
        { sku: regex },
        { taskNumber: regex },
        { 'targetLocation.binCode': regex },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [tasks, total, pendingCount, completedCount, inProgressCount] = await Promise.all([
      PutawayTask.find(query)
        .sort({ status: 1, createdAt: -1 }) // PENDING first
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PutawayTask.countDocuments(query),
      PutawayTask.countDocuments({ vendorId, status: 'PENDING' }),
      PutawayTask.countDocuments({ vendorId, status: 'COMPLETED' }),
      PutawayTask.countDocuments({ vendorId, status: 'IN_PROGRESS' }),
    ]);

    // Calculate total pending units
    const pendingUnitsAgg = await PutawayTask.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$inwardQuantity' } } },
    ]);
    const totalUnitsPending = pendingUnitsAgg[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
      stats: {
        pendingTasksCount: pendingCount,
        completedTasksCount: completedCount,
        inProgressTasksCount: inProgressCount,
        totalTasksCount: pendingCount + completedCount + inProgressCount,
        totalUnitsPending,
      },
    });
  } catch (error) {
    logger.error(`[getPutawayTasks] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch putaway tasks' });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. SCAN PRODUCT / LPN BARCODE (START PUTAWAY WORKFLOW)
// ─────────────────────────────────────────────────────────────
export const scanPutawayItem = async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req);
    const { barcode, productId } = req.body;

    const trimmedBarcode = String(barcode || '').trim();

    if (!trimmedBarcode && !productId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide product barcode or product ID to scan',
      });
    }

    // 1. Check if there is already a PENDING or IN_PROGRESS task for this item
    const taskQuery = { vendorId, status: { $in: ['PENDING', 'IN_PROGRESS'] } };
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      taskQuery.productId = productId;
    } else {
      taskQuery.$or = [
        { barcode: trimmedBarcode },
        { sku: trimmedBarcode },
        { taskNumber: trimmedBarcode },
      ];
    }

    let task = await PutawayTask.findOne(taskQuery);

    if (task) {
      task.status = 'IN_PROGRESS';
      await task.save();

      return res.status(200).json({
        success: true,
        isExistingTask: true,
        message: `Task found for "${task.productName}". Proceed to target Bin ${task.targetLocation.binCode}.`,
        data: task,
      });
    }

    // 2. If no pending task exists, find the product in vendor's catalog
    const productQuery = { vendorId };
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      productQuery._id = productId;
    } else {
      productQuery.$or = [
        { barcode: trimmedBarcode },
        { productId: trimmedBarcode },
        { sku: trimmedBarcode },
      ];
    }

    const product = await Product.findOne(productQuery);

    if (!product) {
      return res.status(404).json({
        success: false,
        code: 'PRODUCT_NOT_FOUND',
        message: `No product found in your store catalog matching barcode "${trimmedBarcode}". Please add product or check the barcode.`,
      });
    }

    // 3. Allocate optimal bin location
    const targetLocation =
      product.warehouseLocation?.binCode && product.warehouseLocation.binCode !== 'A01-S01-B01'
        ? product.warehouseLocation
        : calculateOptimalBinLocation(product.category, product.name);

    // 4. Create active PutawayTask
    const taskNumber = `PUT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const inwardQuantity = Number(req.body.inwardQuantity) || 10;

    task = await PutawayTask.create({
      taskNumber,
      vendorId,
      productId: product._id,
      productName: product.name,
      barcode: product.barcode || trimmedBarcode,
      sku: product.sku || product.productId || '',
      image: product.image || (product.images?.[0] || ''),
      category: product.category || 'General',
      batchNumber: product.batchNumber || `BAT-${new Date().toISOString().slice(2, 7).replace('-', '')}`,
      expiryDate: product.expiryDate || '',
      inwardQuantity,
      putawayQuantity: 0,
      targetLocation,
      status: 'IN_PROGRESS',
      putawayBy: req.user?.name || req.user?.phone || 'Dark Store Operator',
      putawayUserId: req.user?.id,
    });

    // Mark product as pending putaway until confirmed
    product.putawayStatus = 'PENDING';
    product.warehouseLocation = targetLocation;
    await product.save();

    logger.info(`[Putaway] New task created: ${task.taskNumber} for ${product.name} -> Target: ${targetLocation.binCode}`);

    return res.status(200).json({
      success: true,
      isExistingTask: false,
      message: `Product identified: "${product.name}". Proceed to target Bin ${targetLocation.binCode}.`,
      data: task,
    });
  } catch (error) {
    logger.error(`[scanPutawayItem] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error processing barcode scan' });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. VERIFY BIN / SHELF BARCODE (RACK SCAN VALIDATION)
// ─────────────────────────────────────────────────────────────
export const verifyPutawayBin = async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req);
    const { taskId, binCode } = req.body;

    if (!taskId || !binCode) {
      return res.status(400).json({
        success: false,
        message: 'Task ID and scanned bin barcode are required',
      });
    }

    const task = await PutawayTask.findOne({ _id: taskId, vendorId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Putaway task not found' });
    }

    const normalize = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const expected = normalize(task.targetLocation.binCode);
    const scanned = normalize(binCode);

    // Allow exact match or if barcode contains the target bin code
    const isMatch = scanned === expected || scanned.includes(expected) || expected.includes(scanned);

    if (!isMatch) {
      logger.warn(
        `[Putaway Bin Mismatch] Task: ${task.taskNumber}. Expected: ${task.targetLocation.binCode}, Scanned: ${binCode}`
      );
      return res.status(400).json({
        success: false,
        code: 'BIN_MISMATCH',
        message: `⚠️ Wrong Bin Scanned! You scanned "${binCode.toUpperCase()}", but this item belongs in "${task.targetLocation.binCode}" (${task.targetLocation.rack}, ${task.targetLocation.shelf}, ${task.targetLocation.bin}). Please scan the correct shelf.`,
        targetLocation: task.targetLocation,
        scannedCode: binCode,
      });
    }

    task.scannedBinBarcode = binCode.trim().toUpperCase();
    task.status = 'IN_PROGRESS';
    await task.save();

    return res.status(200).json({
      success: true,
      verified: true,
      message: `✅ Bin Location Verified (${task.targetLocation.binCode})! Place the items on the shelf and confirm quantity.`,
      data: task,
    });
  } catch (error) {
    logger.error(`[verifyPutawayBin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Error verifying bin barcode' });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. CONFIRM PUTAWAY (UPDATE INVENTORY & MAKE STOCK LIVE)
// ─────────────────────────────────────────────────────────────
export const confirmPutaway = async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req);
    const { taskId, quantity, binCode, notes } = req.body;

    if (!taskId) {
      return res.status(400).json({ success: false, message: 'Task ID is required' });
    }

    const task = await PutawayTask.findOne({ _id: taskId, vendorId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Putaway task not found' });
    }

    const putawayQty = Number(quantity) > 0 ? Number(quantity) : task.inwardQuantity;
    if (isNaN(putawayQty) || putawayQty <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid quantity greater than 0' });
    }

    // 1. Update task to COMPLETED
    task.putawayQuantity = putawayQty;
    task.status = 'COMPLETED';
    task.scannedBinBarcode = binCode ? String(binCode).trim().toUpperCase() : task.targetLocation.binCode;
    task.completedAt = new Date();
    task.putawayBy = req.user?.name || req.user?.phone || 'Dark Store Operator';
    task.putawayUserId = req.user?.id;
    if (notes) task.notes = String(notes).trim();

    await task.save();

    // 2. Update Product: increase stock, set active, update warehouse location
    const product = await Product.findOne({ _id: task.productId, vendorId });
    let previousStock = 0;
    let newStock = putawayQty;

    if (product) {
      previousStock = Number(product.stock) || 0;
      newStock = previousStock + putawayQty;

      product.stock = newStock;
      product.isActive = true;
      product.putawayStatus = 'COMPLETED';
      product.warehouseLocation = task.targetLocation;
      product.lastPutawayAt = new Date();
      product.lastPutawayBy = task.putawayBy;

      if (task.batchNumber) product.batchNumber = task.batchNumber;
      if (task.expiryDate) product.expiryDate = task.expiryDate;

      await product.save();
    }

    // 3. Record Audit in StockMovement
    await StockMovement.create({
      movementId: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      productIdString: product?.productId || String(task.productId),
      vendorId,
      productId: task.productId,
      barcode: task.barcode || '',
      productName: task.productName,
      movementType: 'IN',
      quantity: putawayQty,
      previousStock,
      newStock,
      reason: 'PUTAWAY_CONFIRMED',
      referenceId: task._id,
      referenceType: 'PutawayTask',
      notes: `Putaway verified into dark store Bin ${task.targetLocation.binCode} (${task.targetLocation.rack}, ${task.targetLocation.shelf}) by ${task.putawayBy}`,
    });

    logger.info(
      `[Putaway Confirmed] Task: ${task.taskNumber}. Product: ${task.productName} (+${putawayQty} units). New stock: ${newStock}. Location: ${task.targetLocation.binCode}`
    );

    return res.status(200).json({
      success: true,
      message: `🎉 Putaway Confirmed! ${putawayQty} units placed in Bin ${task.targetLocation.binCode}. Stock is now LIVE for pickers!`,
      data: {
        task,
        product,
        newStock,
        putawayQuantity: putawayQty,
        binLocation: task.targetLocation,
      },
    });
  } catch (error) {
    logger.error(`[confirmPutaway] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error completing putaway' });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. CREATE NEW INBOUND PUTAWAY TASK (MANUAL OR INWARDING)
// ─────────────────────────────────────────────────────────────
export const createPutawayTask = async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req);
    const { productId, inwardQuantity = 1, batchNumber, expiryDate, notes, targetLocation: customLoc } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    const product = await Product.findOne({ _id: productId, vendorId });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found in vendor catalog' });
    }

    const targetLocation =
      customLoc?.binCode
        ? customLoc
        : product.warehouseLocation?.binCode && product.warehouseLocation.binCode !== 'A01-S01-B01'
        ? product.warehouseLocation
        : calculateOptimalBinLocation(product.category, product.name);

    const taskNumber = `PUT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const task = await PutawayTask.create({
      taskNumber,
      vendorId,
      productId: product._id,
      productName: product.name,
      barcode: product.barcode || '',
      sku: product.sku || product.productId || '',
      image: product.image || (product.images?.[0] || ''),
      category: product.category || 'General',
      batchNumber: batchNumber || product.batchNumber || `BAT-${Date.now().toString().slice(-4)}`,
      expiryDate: expiryDate || product.expiryDate || '',
      inwardQuantity: Number(inwardQuantity) || 1,
      putawayQuantity: 0,
      targetLocation,
      status: 'PENDING',
      putawayBy: req.user?.name || req.user?.phone || 'Dark Store Operator',
      putawayUserId: req.user?.id,
      notes: notes || '',
    });

    product.putawayStatus = 'PENDING';
    await product.save();

    return res.status(201).json({
      success: true,
      message: `Inbound Putaway task ${taskNumber} created successfully!`,
      data: task,
    });
  } catch (error) {
    logger.error(`[createPutawayTask] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create putaway task' });
  }
};

// ─────────────────────────────────────────────────────────────
// 6. GET DARK STORE BIN LAYOUT & LABELS (PRINTABLE SHELF TAGS)
// ─────────────────────────────────────────────────────────────
export const getDarkStoreBins = async (req, res) => {
  try {
    const vendorId = await resolveVendorId(req);

    // Fetch existing mapped products grouped by binCode
    const mappedProducts = await Product.find({
      vendorId,
      'warehouseLocation.binCode': { $exists: true, $ne: null },
    })
      .select('name barcode image stock category warehouseLocation')
      .lean();

    const binOccupancyMap = {};
    for (const p of mappedProducts) {
      const code = p.warehouseLocation?.binCode;
      if (code) {
        if (!binOccupancyMap[code]) {
          binOccupancyMap[code] = [];
        }
        binOccupancyMap[code].push({
          id: p._id,
          name: p.name,
          stock: p.stock,
          barcode: p.barcode,
        });
      }
    }

    // Generate comprehensive rack/shelf/bin grid
    const allBins = [];
    for (const z of DARK_STORE_ZONES) {
      for (let r = 1; r <= z.racksCount; r++) {
        const rackCode = `R-${String(r).padStart(2, '0')}`;
        for (let s = 1; s <= z.shelvesCount; s++) {
          const shelfCode = `S-${String(s).padStart(2, '0')}`;
          for (let b = 1; b <= z.binsPerShelf; b++) {
            const binCodeShort = `B-${String(b).padStart(2, '0')}`;
            const fullBinCode = `${z.rackPrefix}${String(r).padStart(2, '0')}-S${String(s).padStart(2, '0')}-B${String(b).padStart(2, '0')}`;
            const storedProducts = binOccupancyMap[fullBinCode] || [];

            allBins.push({
              zone: z.zone,
              rack: rackCode,
              shelf: shelfCode,
              bin: binCodeShort,
              binCode: fullBinCode,
              itemsCount: storedProducts.length,
              totalStock: storedProducts.reduce((sum, item) => sum + (item.stock || 0), 0),
              products: storedProducts,
              isOccupied: storedProducts.length > 0,
            });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        zones: DARK_STORE_ZONES,
        bins: allBins,
        totalBins: allBins.length,
        occupiedBinsCount: allBins.filter((b) => b.isOccupied).length,
      },
    });
  } catch (error) {
    logger.error(`[getDarkStoreBins] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to fetch bin layout' });
  }
};

// ─────────────────────────────────────────────────────────────
// 7. ADMIN: GET ALL PUTAWAYS TELEMETRY ACROSS STORES
// ─────────────────────────────────────────────────────────────
export const getAdminPutawayTelemetry = async (req, res) => {
  try {
    const { status, vendorId, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== 'ALL') query.status = status;
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) query.vendorId = vendorId;

    const skip = (Number(page) - 1) * Number(limit);

    const [tasks, total, totalCompleted, totalPending] = await Promise.all([
      PutawayTask.find(query)
        .populate('vendorId', 'storeName ownerName phone city')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PutawayTask.countDocuments(query),
      PutawayTask.countDocuments({ status: 'COMPLETED' }),
      PutawayTask.countDocuments({ status: 'PENDING' }),
    ]);

    return res.status(200).json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
      stats: {
        totalTasks: totalCompleted + totalPending,
        totalCompleted,
        totalPending,
      },
    });
  } catch (error) {
    logger.error(`[getAdminPutawayTelemetry] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error loading putaway telemetry' });
  }
};
