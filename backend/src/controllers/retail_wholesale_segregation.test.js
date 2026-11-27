import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import { getStoreVisibilityQuery } from '../utils/subscription.util.js';
import { searchVendors, lookupVendorById } from './user.controller.js';
import { createOrder } from './order.controller.js';
import { searchB2BSuppliers } from './b2b.controller.js';

// Never call the real admin Razorpay account from tests
vi.mock('../utils/razorpay.util.js', () => ({
  getRazorpayInstance: () => ({
    orders: { create: async ({ amount, receipt }) => ({ id: `order_${receipt}`, amount, currency: 'INR' }) },
    payments: { fetch: async () => null, capture: async () => null, refund: async () => ({ id: 'rfnd_test', status: 'pending' }) },
  }),
  verifyRazorpaySignature: () => false,
  fetchVerifiedPaymentAmount: async () => 0,
}));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeMockRes = () => {
  let statusCode = 200;
  let responseData = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };
  return res;
};

describe('RETAIL VS WHOLESALE SEGREGATION & STORE VISIBILITY SUITE', () => {
  it('1. getStoreVisibilityQuery filters out Manufacturer, Wholesaler & Distributor by default', () => {
    const query = getStoreVisibilityQuery();
    expect(query.businessType).toBeDefined();
    expect(query.businessType.$nin).toContain('Manufacturer');
    expect(query.businessType.$nin).toContain('Wholesaler');
    expect(query.businessType.$nin).toContain('Distributor');
  });

  it('2. Customers searching stores only see Retailers (Manufacturers & Wholesalers are hidden online)', async () => {
    // 1. Create a verified active Retailer
    const retailer = await Vendor.create({
      zeebacId: 'ZBC-RET-01',
      storeName: 'Lucky Retail Supermart',
      ownerName: 'Ramesh Retailer',
      phone: '9888111111',
      businessType: 'Retailer',
      retailerSubtype: 'independent_store',
      status: 'Verified',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      category: 'Grocery',
      address: { city: 'Lucknow', fullAddress: 'Hazratganj, Lucknow' },
      subscription: { status: 'ACTIVE', planType: 'Monthly', expiresAt: new Date(Date.now() + 30 * 86400000) },
    });

    // 2. Create a verified active Wholesaler
    const wholesaler = await Vendor.create({
      zeebacId: 'ZBC-WHOLE-01',
      storeName: 'National Wholesale Traders',
      ownerName: 'Vikas Wholesaler',
      phone: '9888222222',
      businessType: 'Wholesaler',
      status: 'Verified',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      category: 'Grocery',
      address: { city: 'Lucknow', fullAddress: 'Transport Nagar, Lucknow' },
      subscription: { status: 'ACTIVE', planType: 'Monthly', expiresAt: new Date(Date.now() + 30 * 86400000) },
    });

    // 3. Create a verified active Manufacturer
    const manufacturer = await Vendor.create({
      zeebacId: 'ZBC-MFG-01',
      storeName: 'Pioneer FMCG Factory',
      ownerName: 'Mahesh Manufacturer',
      phone: '9888333333',
      businessType: 'Manufacturer',
      status: 'Verified',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      category: 'Grocery',
      address: { city: 'Kanpur', fullAddress: 'Industrial Area, Kanpur' },
      subscription: { status: 'ACTIVE', planType: 'Monthly', expiresAt: new Date(Date.now() + 30 * 86400000) },
    });

    // Customer searches for stores
    const req = { query: {} };
    const res = makeMockRes();
    await searchVendors(req, res);

    expect(res.getStatusCode()).toBe(200);
    const stores = res.getData().data;
    expect(Array.isArray(stores)).toBe(true);

    const storeIds = stores.map((s) => s.zeebacId);
    expect(storeIds).toContain('ZBC-RET-01');
    expect(storeIds).not.toContain('ZBC-WHOLE-01');
    expect(storeIds).not.toContain('ZBC-MFG-01');
  });

  it('3. Direct customer store lookup for Manufacturer or Wholesaler returns 403 wholesale supplier restriction', async () => {
    const wholesaler = await Vendor.create({
      zeebacId: 'ZBC-WHOLE-02',
      storeName: 'Apex Wholesale Hub',
      ownerName: 'Sanjay Wholesaler',
      phone: '9888444444',
      businessType: 'Wholesaler',
      status: 'Verified',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      category: 'Electronics',
      address: { city: 'Delhi', fullAddress: 'Chandni Chowk, Delhi' },
      subscription: { status: 'ACTIVE', planType: 'Monthly', expiresAt: new Date(Date.now() + 30 * 86400000) },
    });

    const req = { params: { id: wholesaler.zeebacId } };
    const res = makeMockRes();
    await lookupVendorById(req, res);

    expect(res.getStatusCode()).toBe(403);
    expect(res.getData().success).toBe(false);
    expect(res.getData().isWholesaleOnly).toBe(true);
    expect(res.getData().message).toContain('wholesale supplier accessible only to registered retail merchants');
  });

  it('4. Customer cannot place direct orders to Wholesalers or Manufacturers', async () => {
    const customer = await User.create({
      zeebacId: 'ZBC-CUST-999',
      name: 'Customer Pooja',
      phone: '9777123456',
      status: 'Active',
    });

    const manufacturer = await Vendor.create({
      zeebacId: 'ZBC-MFG-02',
      storeName: 'Royal Garments Mill',
      ownerName: 'Rajesh Mill',
      phone: '9888555555',
      businessType: 'Manufacturer',
      status: 'Verified',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      category: 'Apparel',
      address: { city: 'Surat', fullAddress: 'Textile Market, Surat' },
      subscription: { status: 'ACTIVE', planType: 'Monthly', expiresAt: new Date(Date.now() + 30 * 86400000) },
    });

    const product = await Product.create({
      name: 'Cotton Shirt Box (50 Pcs)',
      price: 15000,
      stock: 100,
      vendorId: manufacturer._id,
      category: 'Apparel',
      isActive: true,
    });

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: manufacturer.zeebacId,
        items: [{ productId: product._id.toString(), quantity: 1, price: 15000 }],
        paymentMethod: 'Cash',
      },
    };
    const res = makeMockRes();
    await createOrder(req, res);

    expect(res.getStatusCode()).toBe(400);
    expect(res.getData().success).toBe(false);
    expect(res.getData().message).toContain('Direct customer orders are not accepted by Manufacturers or Wholesalers');
  });

  it('5. searchB2BSuppliers allows retail merchants to discover Manufacturers and Wholesalers online', async () => {
    const retailer = await Vendor.create({
      zeebacId: 'ZBC-RET-02',
      storeName: 'City Mart Retail',
      ownerName: 'Kunal Retailer',
      phone: '9888666666',
      businessType: 'Retailer',
      status: 'Verified',
    });

    const manufacturer = await Vendor.create({
      zeebacId: 'ZBC-MFG-03',
      storeName: 'Organic Foods Factory',
      ownerName: 'Pradeep Factory',
      phone: '9888777777',
      businessType: 'Manufacturer',
      status: 'Verified',
      category: 'FMCG',
    });

    const wholesaler = await Vendor.create({
      zeebacId: 'ZBC-WHOLE-03',
      storeName: 'North India Grain Wholesalers',
      ownerName: 'Harish Wholesale',
      phone: '9888888888',
      businessType: 'Wholesaler',
      status: 'Verified',
      category: 'FMCG',
    });

    const req = {
      user: { id: retailer._id.toString() },
      query: {},
    };
    const res = makeMockRes();
    await searchB2BSuppliers(req, res);

    expect(res.getStatusCode()).toBe(200);
    const suppliers = res.getData().data;
    const supplierIds = suppliers.map((s) => s.zeebacId);

    expect(supplierIds).toContain('ZBC-MFG-03');
    expect(supplierIds).toContain('ZBC-WHOLE-03');
    expect(supplierIds).not.toContain('ZBC-RET-02'); // Should not include retailer themself
  });
});
