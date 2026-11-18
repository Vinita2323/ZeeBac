import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import { getVendorProducts } from './user.controller.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('getVendorProducts tests', () => {
  it('returns empty array [] for a newly registered vendor without uploading products (no dummy products)', async () => {
    const vendor = await Vendor.create({
      storeName: 'Crystal cafe & restaurant',
      ownerName: 'Test Owner',
      phone: '9999988888',
      email: 'crystal@example.com',
      password: 'hashedpassword',
      category: 'Dining & Cafe',
      zeebacId: 'ZBV-9988',
      address: 'Hazratganj, Lucknow',
      status: 'Verified'
    });

    // Test with MongoDB _id
    let resData = null;
    const req1 = { params: { vendorId: vendor._id.toString() } };
    const res1 = {
      status: (code) => ({
        json: (data) => {
          resData = { code, ...data };
          return resData;
        }
      })
    };

    await getVendorProducts(req1, res1);
    expect(resData.success).toBe(true);
    expect(resData.data).toEqual([]);
    expect(resData.data.length).toBe(0);

    // Test with zeebacId
    let resData2 = null;
    const req2 = { params: { vendorId: vendor.zeebacId } };
    const res2 = {
      status: (code) => ({
        json: (data) => {
          resData2 = { code, ...data };
          return resData2;
        }
      })
    };

    await getVendorProducts(req2, res2);
    expect(resData2.success).toBe(true);
    expect(resData2.data).toEqual([]);
    expect(resData2.data.length).toBe(0);

    // Now vendor uploads a real product
    await Product.create({
      vendorId: vendor._id,
      name: 'Special Cold Coffee',
      price: 120,
      category: 'Beverages',
      isActive: true
    });

    let resData3 = null;
    await getVendorProducts(req2, res2);
    expect(resData.success).toBe(true);
    // Real product is returned
    const req3 = { params: { vendorId: vendor.zeebacId } };
    const res3 = {
      status: (code) => ({
        json: (data) => {
          resData3 = { code, ...data };
          return resData3;
        }
      })
    };
    await getVendorProducts(req3, res3);
    expect(resData3.success).toBe(true);
    expect(resData3.data.length).toBe(1);
    expect(resData3.data[0].name).toBe('Special Cold Coffee');
  });
});
