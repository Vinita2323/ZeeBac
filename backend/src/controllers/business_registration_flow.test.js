import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import bcrypt from 'bcryptjs';
import OtpVerification from '../models/OtpVerification.js';
import { vendorRegister } from './signup.controller.js';
import { updateProfile, getProfile } from './vendor.controller.js';
import { getAllVendors } from './admin.controller.js';

// Mock notification service
vi.mock('../services/notification.service.js', () => ({
  sendNotification: vi.fn(),
  sendToVendor: vi.fn(),
  sendToUser: vi.fn(),
}));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  return res;
};

const setupOtp = async (phone, otpCode = '1234') => {
  await OtpVerification.deleteMany({ phone });
  const otpHash = await bcrypt.hash(otpCode, 10);
  await OtpVerification.create({
    phone,
    otpHash,
    purpose: 'signup',
    role: 'vendor',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
};

describe('End-to-End Business Registration Flow (Manufacturer, Wholesaler, Retailer)', () => {
  it('registers vendor as Manufacturer and persists businessType properly', async () => {
    const phone = '9811111101';
    await setupOtp(phone);

    const req = {
      body: {
        name: 'Alpha Manufacturer',
        phone,
        otp: '1234',
        email: 'alpha@manufacturer.com',
        businessType: 'Manufacturer',
      },
    };
    const res = makeRes();

    await vendorRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        vendor: expect.objectContaining({
          businessType: 'Manufacturer',
          retailerSubtype: null,
        }),
      })
    );

    const vendor = await Vendor.findOne({ phone });
    expect(vendor).toBeTruthy();
    expect(vendor.businessType).toBe('Manufacturer');
    expect(vendor.retailerSubtype).toBeNull();
  });

  it('registers vendor with case-insensitive businessType (wholesaler -> Wholesaler)', async () => {
    const phone = '9811111102';
    await setupOtp(phone);

    const req = {
      body: {
        name: 'Beta Wholesaler',
        phone,
        otp: '1234',
        email: 'beta@wholesaler.com',
        businessType: 'wholesaler',
      },
    };
    const res = makeRes();

    await vendorRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(201);

    const vendor = await Vendor.findOne({ phone });
    expect(vendor.businessType).toBe('Wholesaler');
    expect(vendor.retailerSubtype).toBeNull();
  });

  it('registers vendor as Retailer with independent_store subtype', async () => {
    const phone = '9811111103';
    await setupOtp(phone);

    const req = {
      body: {
        name: 'Corner Kirana',
        phone,
        otp: '1234',
        email: 'kirana@store.com',
        businessType: 'Retailer',
        retailerSubtype: 'independent_store',
      },
    };
    const res = makeRes();

    await vendorRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        vendor: expect.objectContaining({
          businessType: 'Retailer',
          retailerSubtype: 'independent_store',
          shopType: 'Independent Store',
        }),
      })
    );

    const vendor = await Vendor.findOne({ phone });
    expect(vendor.businessType).toBe('Retailer');
    expect(vendor.retailerSubtype).toBe('independent_store');
    expect(vendor.shopType).toBe('Independent Store');
  });

  it('registers vendor as Retailer with chain_brand subtype', async () => {
    const phone = '9811111104';
    await setupOtp(phone);

    const req = {
      body: {
        name: 'Mega Retail Chain',
        phone,
        otp: '1234',
        email: 'admin@megachain.com',
        businessType: 'Retailer',
        retailerSubtype: 'chain_brand',
      },
    };
    const res = makeRes();

    await vendorRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        vendor: expect.objectContaining({
          businessType: 'Retailer',
          retailerSubtype: 'chain_brand',
          shopType: 'Chain & Brand',
        }),
      })
    );

    const vendor = await Vendor.findOne({ phone });
    expect(vendor.businessType).toBe('Retailer');
    expect(vendor.retailerSubtype).toBe('chain_brand');
    expect(vendor.shopType).toBe('Chain & Brand');
  });

  it('rejects invalid businessType on registration with HTTP 400', async () => {
    const phone = '9811111105';
    await setupOtp(phone);

    const req = {
      body: {
        name: 'Invalid Trade',
        phone,
        otp: '1234',
        businessType: 'FranchiseBroker', // Invalid
      },
    };
    const res = makeRes();

    await vendorRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid business type'),
      })
    );
  });

  it('rejects invalid retailerSubtype on registration with HTTP 400', async () => {
    const phone = '9811111106';
    await setupOtp(phone);

    const req = {
      body: {
        name: 'Invalid Retailer Subtype',
        phone,
        otp: '1234',
        businessType: 'Retailer',
        retailerSubtype: 'hyper_mall', // Invalid
      },
    };
    const res = makeRes();

    await vendorRegister(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid retailer subtype'),
      })
    );
  });

  it('allows updating retailerSubtype and syncs shopType via updateProfile', async () => {
    const phone = '9811111107';
    await setupOtp(phone);

    const regReq = {
      body: {
        name: 'Growth Retailer',
        phone,
        otp: '1234',
        businessType: 'Retailer',
        retailerSubtype: 'independent_store',
      },
    };
    const regRes = makeRes();
    await vendorRegister(regReq, regRes);

    const vendor = await Vendor.findOne({ phone });

    // Upgrade to chain_brand
    const updateReq = {
      user: { id: vendor._id.toString() },
      body: {
        retailerSubtype: 'chain_brand',
      },
    };
    const updateRes = makeRes();
    await updateProfile(updateReq, updateRes);
    expect(updateRes.status).not.toHaveBeenCalledWith(400);

    const updated = await Vendor.findById(vendor._id);
    expect(updated.retailerSubtype).toBe('chain_brand');
    expect(updated.shopType).toBe('Chain & Brand');
  });

  it('fetches profile including businessType and retailerSubtype accurately', async () => {
    const phone = '9811111108';
    await setupOtp(phone);

    const regReq = {
      body: {
        name: 'Super Wholesale Hub',
        phone,
        otp: '1234',
        businessType: 'Wholesaler',
      },
    };
    const regRes = makeRes();
    await vendorRegister(regReq, regRes);

    const vendor = await Vendor.findOne({ phone });

    const getReq = { user: { id: vendor._id.toString() } };
    const getRes = makeRes();
    await getProfile(getReq, getRes);

    expect(getRes.status).toHaveBeenCalledWith(200);
    expect(getRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          businessType: 'Wholesaler',
          retailerSubtype: null,
        }),
      })
    );
  });

  it('admin getAllVendors can filter by businessType and retailerSubtype', async () => {
    // Seed 2 merchants: one Wholesaler, one Retailer chain_brand
    await Vendor.create([
      {
        zeebacId: 'ZBV-10001',
        ownerName: 'Admin Test Wholesaler',
        phone: '9822222201',
        businessType: 'Wholesaler',
        status: 'Verified',
      },
      {
        zeebacId: 'ZBV-10002',
        ownerName: 'Admin Test Chain',
        phone: '9822222202',
        businessType: 'Retailer',
        retailerSubtype: 'chain_brand',
        shopType: 'Chain & Brand',
        status: 'Verified',
      },
    ]);

    const reqWholesale = { query: { businessType: 'Wholesaler' } };
    const resWholesale = makeRes();
    await getAllVendors(reqWholesale, resWholesale);

    expect(resWholesale.status).toHaveBeenCalledWith(200);
    const wholesaleData = resWholesale.json.mock.calls[0][0].data;
    expect(wholesaleData.some(v => v.businessType === 'Wholesaler')).toBe(true);
    expect(wholesaleData.every(v => v.businessType === 'Wholesaler')).toBe(true);

    const reqChain = { query: { retailerSubtype: 'chain_brand' } };
    const resChain = makeRes();
    await getAllVendors(reqChain, resChain);

    expect(resChain.status).toHaveBeenCalledWith(200);
    const chainData = resChain.json.mock.calls[0][0].data;
    expect(chainData.some(v => v.retailerSubtype === 'chain_brand')).toBe(true);
  });
});
