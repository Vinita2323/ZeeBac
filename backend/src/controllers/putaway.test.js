import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import PutawayTask from '../models/PutawayTask.js';
import StockMovement from '../models/StockMovement.js';
import {
  getPutawayTasks,
  scanPutawayItem,
  verifyPutawayBin,
  confirmPutaway,
  createPutawayTask,
  getDarkStoreBins,
} from './putaway.controller.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Dark Store & Warehouse Putaway End-to-End Suite', () => {
  let vendor;
  let product;
  let task;

  it('sets up dark store vendor and catalog product for putaway', async () => {
    vendor = await Vendor.create({
      zeebacId: 'ZBC-DS-101',
      storeName: 'Zepto Dark Store Indore Central',
      ownerName: 'Vikas Store Manager',
      phone: '9811122334',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      city: 'Indore',
    });

    product = await Product.create({
      vendorId: vendor._id,
      name: 'Amul Taaza Homogenised Milk 1L',
      category: 'Dairy & Chilled',
      barcode: '8901262010053',
      sku: 'SKU-MILK-1L',
      price: 72,
      stock: 0,
      isActive: false,
      putawayStatus: 'PENDING',
    });

    expect(product._id).toBeDefined();
    expect(product.stock).toBe(0);
  });

  it('creates an inbound Putaway task with system-allocated dark store bin', async () => {
    const req = {
      user: { id: vendor._id.toString(), vendorId: vendor._id.toString(), name: 'Vikas Manager' },
      body: {
        productId: product._id.toString(),
        inwardQuantity: 24,
        batchNumber: 'BAT-202611-01',
        expiryDate: '2026-12-15',
        notes: 'Inbound truck delivery from Amul dairy depot',
      },
    };

    let statusCode;
    let resData;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await createPutawayTask(req, res);
    expect(statusCode).toBe(201);
    expect(resData.success).toBe(true);
    expect(resData.data.taskNumber).toMatch(/^PUT-/);
    expect(resData.data.inwardQuantity).toBe(24);
    expect(resData.data.targetLocation).toBeDefined();
    expect(resData.data.targetLocation.binCode).toBeDefined();

    task = resData.data;
  });

  it('scans product barcode at receiving station and finds assigned putaway task', async () => {
    const req = {
      user: { id: vendor._id.toString(), vendorId: vendor._id.toString() },
      body: { barcode: '8901262010053' },
    };

    let statusCode;
    let resData;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await scanPutawayItem(req, res);
    expect(statusCode).toBe(200);
    expect(resData.success).toBe(true);
    expect(resData.data.productName).toBe('Amul Taaza Homogenised Milk 1L');
    expect(resData.data.targetLocation.binCode).toBe(task.targetLocation.binCode);
  });

  it('rejects verification if worker scans WRONG bin barcode at the shelf', async () => {
    const req = {
      user: { id: vendor._id.toString(), vendorId: vendor._id.toString() },
      body: {
        taskId: task._id.toString(),
        binCode: 'WRONG-BIN-99',
      },
    };

    let statusCode;
    let resData;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await verifyPutawayBin(req, res);
    expect(statusCode).toBe(400);
    expect(resData.success).toBe(false);
    expect(resData.code).toBe('BIN_MISMATCH');
    expect(resData.message).toContain('Wrong Bin Scanned');
  });

  it('approves verification when worker scans the CORRECT target bin barcode', async () => {
    const req = {
      user: { id: vendor._id.toString(), vendorId: vendor._id.toString() },
      body: {
        taskId: task._id.toString(),
        binCode: task.targetLocation.binCode,
      },
    };

    let statusCode;
    let resData;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await verifyPutawayBin(req, res);
    expect(statusCode).toBe(200);
    expect(resData.success).toBe(true);
    expect(resData.verified).toBe(true);
  });

  it('confirms putaway: updates task to COMPLETED, increases stock, marks LIVE, and logs StockMovement', async () => {
    const req = {
      user: { id: vendor._id.toString(), vendorId: vendor._id.toString(), name: 'Vikas Manager' },
      body: {
        taskId: task._id.toString(),
        quantity: 24,
        binCode: task.targetLocation.binCode,
        notes: 'Placed neatly in cold dairy shelf',
      },
    };

    let statusCode;
    let resData;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await confirmPutaway(req, res);
    expect(statusCode).toBe(200);
    expect(resData.success).toBe(true);
    expect(resData.data.newStock).toBe(24);
    expect(resData.data.task.status).toBe('COMPLETED');

    // Verify Product record
    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(24);
    expect(updatedProduct.isActive).toBe(true);
    expect(updatedProduct.putawayStatus).toBe('COMPLETED');
    expect(updatedProduct.warehouseLocation.binCode).toBe(task.targetLocation.binCode);

    // Verify StockMovement audit trail
    const movement = await StockMovement.findOne({ referenceId: task._id });
    expect(movement).toBeDefined();
    expect(movement.movementType).toBe('IN');
    expect(movement.quantity).toBe(24);
    expect(movement.reason).toBe('PUTAWAY_CONFIRMED');
  });

  it('retrieves dark store bin grid with accurate occupancy data', async () => {
    const req = {
      user: { id: vendor._id.toString(), vendorId: vendor._id.toString() },
    };

    let statusCode;
    let resData;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await getDarkStoreBins(req, res);
    expect(statusCode).toBe(200);
    expect(resData.success).toBe(true);
    expect(resData.data.totalBins).toBeGreaterThan(0);
    expect(resData.data.occupiedBinsCount).toBeGreaterThanOrEqual(1);

    // Verify our task's bin is marked occupied
    const occupiedBin = resData.data.bins.find((b) => b.binCode === task.targetLocation.binCode);
    expect(occupiedBin).toBeDefined();
    expect(occupiedBin.isOccupied).toBe(true);
    expect(occupiedBin.totalStock).toBe(24);
  });
});
