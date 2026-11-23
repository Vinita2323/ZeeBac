import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import {
  createOrder,
  getVendorOrders,
  startOrderPicking,
  pickOrderItem,
  finishOrderPacking,
} from './order.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);

describe('Dark Store WMS Location-Based Putaway & Picking End-to-End Suite', () => {
  let vendor;
  let customer;
  let milkProduct;
  let chipsProduct;
  let order;

  it('sets up dark store vendor, customer, and products with physical shelf/bin locations', async () => {
    vendor = await Vendor.create({
      zeebacId: 'ZBC-DARKSTORE-INDORE',
      storeName: 'Zeebac Dark Store Indore',
      ownerName: 'Vikas Manager',
      phone: '9888877771',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      city: 'Indore',
    });

    customer = await User.create({
      zeebacId: 'ZBC-CUST-901',
      name: 'Aman Picker Tester',
      phone: '9999988881',
      status: 'Active',
      city: 'Indore',
    });

    // Product 1: In Chilled Dairy Rack C01, Shelf S02, Bin B04
    milkProduct = await Product.create({
      vendorId: vendor._id,
      name: 'Amul Taaza Milk 1L',
      category: 'Dairy',
      barcode: '8901262010051',
      price: 72,
      stock: 48,
      warehouseLocation: {
        rack: 'C01',
        shelf: 'S02',
        bin: 'B04',
        binCode: 'C01-S02-B04',
      },
      batchNumber: 'LOT-MILK-2026',
      expiryDate: '2026-12-15',
    });

    // Product 2: In Snacks Rack A01, Shelf S03, Bin B02
    chipsProduct = await Product.create({
      vendorId: vendor._id,
      name: "Lay's Classic Salted 50g",
      category: 'Snacks',
      barcode: '8901491101824',
      price: 20,
      stock: 100,
      warehouseLocation: {
        rack: 'A01',
        shelf: 'S03',
        bin: 'B02',
        binCode: 'A01-S03-B02',
      },
      batchNumber: 'LOT-CHIPS-2026',
      expiryDate: '2027-04-10',
    });

    expect(milkProduct.warehouseLocation.binCode).toBe('C01-S02-B04');
    expect(chipsProduct.warehouseLocation.binCode).toBe('A01-S03-B02');
  });

  it('creates customer order and automatically binds physical shelf & bin locations to order items', async () => {
    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        paymentMethod: 'CASH',
        items: [
          { productId: milkProduct._id.toString(), quantity: 2 },
          { productId: chipsProduct._id.toString(), quantity: 3 },
        ],
      },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await createOrder(req, res);

    expect(responseData.code).toBe(201);
    expect(responseData.success).toBe(true);
    expect(responseData.data.order).toBeDefined();

    order = responseData.data.order;
    expect(order.items.length).toBe(2);

    const milkItem = order.items.find((i) => i.name === 'Amul Taaza Milk 1L');
    const chipsItem = order.items.find((i) => i.name === "Lay's Classic Salted 50g");

    // Location verification: items have exact bin locations for picker boy
    expect(milkItem.binCode).toBe('C01-S02-B04');
    expect(milkItem.warehouseLocation.binCode).toBe('C01-S02-B04');
    expect(milkItem.barcode).toBe('8901262010051');
    expect(milkItem.picked).toBe(false);

    expect(chipsItem.binCode).toBe('A01-S03-B02');
    expect(chipsItem.warehouseLocation.binCode).toBe('A01-S03-B02');
    expect(chipsItem.barcode).toBe('8901491101824');
    expect(chipsItem.picked).toBe(false);
  });

  it('fetches vendor orders and exposes populated bin locations for store display and picker checklist', async () => {
    const req = {
      user: { id: vendor._id.toString() },
      query: {},
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await getVendorOrders(req, res);

    expect(responseData.code).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.data.length).toBeGreaterThan(0);

    const vendorOrd = responseData.data.find((o) => o.orderId === order.orderId);
    expect(vendorOrd).toBeDefined();
    expect(vendorOrd.items[0].binCode).toBeDefined();
    expect(vendorOrd.items[0].warehouseLocation.rack).toBeDefined();
  });

  it('starts dark store picking session, assigns Tote ID and sets status to PICKING_IN_PROGRESS', async () => {
    const req = {
      user: { id: vendor._id.toString() },
      params: { orderId: order.orderId },
      body: { toteNumber: 'TOTE-09' },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await startOrderPicking(req, res);

    expect(responseData.code).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.data.order.packingStatus).toBe('PICKING_IN_PROGRESS');
    expect(responseData.data.order.toteNumber).toBe('TOTE-09');
    expect(responseData.data.order.pickingStartedAt).toBeDefined();
  });

  it('rejects barcode scan if picker scans WRONG product barcode at the bin', async () => {
    const milkItem = order.items.find((i) => i.name === 'Amul Taaza Milk 1L');

    const req = {
      user: { id: vendor._id.toString() },
      params: { orderId: order.orderId },
      body: {
        itemId: milkItem._id.toString(),
        barcode: '9999999999999_WRONG_BARCODE',
        quantity: 2,
        isManualConfirm: false,
      },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await pickOrderItem(req, res);

    expect(responseData.code).toBe(400);
    expect(responseData.success).toBe(false);
    expect(responseData.message).toContain('Barcode Mismatch');
  });

  it('confirms pick on scanning correct barcode and marks item as picked', async () => {
    const milkItem = order.items.find((i) => i.name === 'Amul Taaza Milk 1L');

    const req = {
      user: { id: vendor._id.toString() },
      params: { orderId: order.orderId },
      body: {
        itemId: milkItem._id.toString(),
        barcode: '8901262010051', // Matching Milk barcode
        quantity: 2,
        isManualConfirm: false,
      },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await pickOrderItem(req, res);

    expect(responseData.code).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.data.item.picked).toBe(true);
    expect(responseData.data.item.pickedQuantity).toBe(2);
    expect(responseData.data.allPicked).toBe(false); // Chips item still pending
  });

  it('allows manual pick confirmation for second item, sets order packingStatus to PICKED', async () => {
    const chipsItem = order.items.find((i) => i.name === "Lay's Classic Salted 50g");

    const req = {
      user: { id: vendor._id.toString() },
      params: { orderId: order.orderId },
      body: {
        itemId: chipsItem._id.toString(),
        quantity: 3,
        isManualConfirm: true,
      },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await pickOrderItem(req, res);

    expect(responseData.code).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.data.item.picked).toBe(true);
    expect(responseData.data.allPicked).toBe(true); // Both items picked!
    expect(responseData.data.order.packingStatus).toBe('PICKED');
  });

  it('finishes packing, stages bag on dispatch counter, calculates pick duration, and sets READY_FOR_PICKUP', async () => {
    const req = {
      user: { id: vendor._id.toString() },
      params: { orderId: order.orderId },
      body: { toteNumber: 'TOTE-09' },
    };

    let responseData;
    const res = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, ...data };
          return responseData;
        },
      }),
    };

    await finishOrderPacking(req, res);

    expect(responseData.code).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.data.order.packingStatus).toBe('READY_FOR_PICKUP');
    expect(responseData.data.order.orderStatus).toBe('READY_FOR_PICKUP');
    expect(responseData.data.order.pickingCompletedAt).toBeDefined();
    expect(responseData.data.order.pickingDurationSeconds).toBeGreaterThanOrEqual(0);
  });
});
