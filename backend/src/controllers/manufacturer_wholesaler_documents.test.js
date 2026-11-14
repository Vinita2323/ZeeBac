import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import CashbackRule from '../models/CashbackRule.js';
import { validateApplicationComplete, isFoodSector } from '../utils/vendorApplication.util.js';
import { submitApplication } from './vendor.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('Manufacturer and Wholesaler Document Requirements Test Suite', () => {
  describe('isFoodSector helper', () => {
    it('correctly detects food sector categories', () => {
      expect(isFoodSector('Food & Grocery')).toBe(true);
      expect(isFoodSector('Restaurant & Cafe')).toBe(true);
      expect(isFoodSector('Bakery & Sweets')).toBe(true);
      expect(isFoodSector('Dairy & Fresh')).toBe(true);
      expect(isFoodSector('FMCG')).toBe(true);
      expect(isFoodSector('Spices & Condiments')).toBe(true);
      expect(isFoodSector('Snacks & Beverages')).toBe(true);
      expect(isFoodSector('Electronics', 'Food Processing Equipment')).toBe(true);
    });

    it('correctly identifies non-food sector categories', () => {
      expect(isFoodSector('Textiles & Clothing')).toBe(false);
      expect(isFoodSector('Hardware & Sanitary')).toBe(false);
      expect(isFoodSector('Jewellery')).toBe(false);
      expect(isFoodSector('Electronics & Gadgets')).toBe(false);
      expect(isFoodSector(null)).toBe(false);
    });
  });

  describe('validateApplicationComplete validation logic', () => {
    it('passes for Manufacturer with Company Name, Trademark/Udyam, GST number & certificate (non-food sector)', () => {
      const vendorDoc = {
        storeName: 'Sunrise Manufacturing Ltd',
        businessType: 'Manufacturer',
        category: 'Textiles & Garments',
        cashbackRate: 5,
        gstNumber: '27AAAAA0000A1Z5',
        address: { fullAddress: 'Plot 42 MIDC Industrial Area', city: 'Mumbai', state: 'Maharashtra', pincode: '400093' },
        location: { coordinates: [72.8777, 19.0760] },
        documents: {
          udyamCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/udyam.pdf' },
          gstCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/gst.pdf' },
          // No aadhaarPan and no shopLicense!
        },
      };

      const missing = validateApplicationComplete(vendorDoc);
      expect(missing).toEqual([]);
    });

    it('flags missing Trademark/Udyam or GST certificate for Manufacturer', () => {
      const vendorDoc = {
        storeName: 'Apex Forge Pvt Ltd',
        businessType: 'Manufacturer',
        category: 'Auto Components',
        cashbackRate: 5,
        address: { fullAddress: 'Sector 58', city: 'Faridabad', state: 'Haryana', pincode: '121004' },
        location: { coordinates: [77.3178, 28.4089] },
        documents: {},
      };

      const missing = validateApplicationComplete(vendorDoc);
      expect(missing).toContain('Trademark certificate / Udyam certificate');
      expect(missing).toContain('GST Number (required for Manufacturer and Wholesaler)');
      expect(missing).toContain('GST Certificate');
      // Must NOT ask for Aadhaar or Shop License!
      expect(missing).not.toContain('Owner ID / KYC document');
      expect(missing).not.toContain('Business/Shop Registration document');
    });

    it('requires FSSAI License for Manufacturer in food sector', () => {
      const foodManufacturer = {
        storeName: 'Royal Spices & Food Processors',
        businessType: 'Manufacturer',
        category: 'Food & Spices',
        cashbackRate: 5,
        gstNumber: '23AAAAA0000A1Z5',
        address: { fullAddress: 'Food Park, Sanwer Road', city: 'Indore', state: 'Madhya Pradesh', pincode: '452015' },
        location: { coordinates: [75.8577, 22.7196] },
        documents: {
          udyamCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/udyam.pdf' },
          gstCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/gst.pdf' },
          // Missing fssaiCertificate!
        },
      };

      const missing = validateApplicationComplete(foodManufacturer);
      expect(missing).toContain('FSSAI License / Certificate (required for Food Sector)');

      // Now add FSSAI Certificate
      foodManufacturer.documents.fssaiCertificate = { fileUrl: 'https://cdn.zeebac.com/docs/fssai.pdf' };
      const missingAfterFssai = validateApplicationComplete(foodManufacturer);
      expect(missingAfterFssai).toEqual([]);
    });

    it('validates Wholesaler requires Trademark/Udyam, GST number & certificate without requiring Aadhaar/Shop License', () => {
      const wholesalerDoc = {
        storeName: 'Metro Wholesale Trading Co.',
        businessType: 'Wholesaler',
        category: 'Consumer Goods',
        cashbackRate: 3,
        gstNumber: '07AAAAA0000A1Z5',
        address: { fullAddress: 'Chandni Chowk', city: 'Delhi', state: 'Delhi', pincode: '110006' },
        location: { coordinates: [77.2300, 28.6562] },
        documents: {
          trademarkCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/trademark.pdf' },
          gstCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/gst.pdf' },
        },
      };

      const missing = validateApplicationComplete(wholesalerDoc);
      expect(missing).toEqual([]);
    });

    it('retains requirement for Aadhaar/PAN and Shop License for Retailers', () => {
      const retailerDoc = {
        storeName: 'Sharma General Store',
        businessType: 'Retailer',
        shopType: 'Independent Store',
        category: 'Grocery',
        cashbackRate: 2,
        address: { fullAddress: 'Main Road', city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
        location: { coordinates: [80.9462, 26.8467] },
        documents: {
          gstCertificate: { fileUrl: 'https://cdn.zeebac.com/docs/gst.pdf' },
        },
      };

      const missing = validateApplicationComplete(retailerDoc);
      expect(missing).toContain('Owner ID / KYC document');
      expect(missing).toContain('Business/Shop Registration document');
      expect(missing).not.toContain('Customer Cashback Percentage (%)');
    });

    it('does not flag missing cashbackRate during profile creation for Retailer', () => {
      const retailerDoc = {
        storeName: 'Verma Provisions',
        businessType: 'Retailer',
        shopType: 'Independent Store',
        category: 'Grocery',
        // Note: NO cashbackRate!
        address: { fullAddress: 'Main Road', city: 'Kanpur', state: 'Uttar Pradesh', pincode: '208001' },
        location: { coordinates: [80.3319, 26.4499] },
        documents: {
          aadhaarPan: { fileUrl: 'https://cdn.zeebac.com/docs/aadhaar.pdf' },
          shopLicense: { fileUrl: 'https://cdn.zeebac.com/docs/shop.pdf' },
        },
      };

      const missing = validateApplicationComplete(retailerDoc);
      expect(missing).toEqual([]);
    });
  });

  describe('submitApplication controller integration', () => {
    it('successfully submits Manufacturer application with only Enterprise Name, Trademark/Udyam, GST & FSSAI', async () => {
      // Create active cashback rule
      await CashbackRule.create({ shopType: 'Independent Store', minCashback: 2, isActive: true });

      const vendor = await Vendor.create({
        zeebacId: 'ZBV-99001',
        ownerName: 'Vikram Seth',
        phone: '9899001122',
        businessType: 'Manufacturer',
        applicationStatus: 'DRAFT',
      });

      const req = {
        user: { id: vendor._id.toString() },
        body: {
          storeName: 'Seth Organic Agro Industries',
          businessType: 'Manufacturer',
          category: 'Food & Spices',
          cashbackRate: 5,
          gstNumber: '29ABCDE1234F1Z5',
          fssaiNumber: '10019011000123',
          address: JSON.stringify({
            fullAddress: 'Plot 10, Industrial Estate',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560058',
          }),
          lat: 13.0285,
          lng: 77.5451,
        },
        files: {
          udyamCertificate: [{ originalname: 'udyam_cert.pdf', mimetype: 'application/pdf', filename: 'https://cdn.zeebac.com/udyam.pdf' }],
          gstCertificate: [{ originalname: 'gst_cert.pdf', mimetype: 'application/pdf', filename: 'https://cdn.zeebac.com/gst.pdf' }],
          fssaiCertificate: [{ originalname: 'fssai_lic.pdf', mimetype: 'application/pdf', filename: 'https://cdn.zeebac.com/fssai.pdf' }],
        },
      };

      const res = makeRes();
      await submitApplication(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            applicationStatus: 'PENDING_REVIEW',
            storeName: 'Seth Organic Agro Industries',
            businessType: 'Manufacturer',
            fssaiNumber: '10019011000123',
            documents: expect.objectContaining({
              udyamCertificate: expect.objectContaining({ fileName: 'udyam_cert.pdf' }),
              gstCertificate: expect.objectContaining({ fileName: 'gst_cert.pdf' }),
              fssaiCertificate: expect.objectContaining({ fileName: 'fssai_lic.pdf' }),
            }),
          }),
        })
      );

      const submitted = await Vendor.findById(vendor._id);
      expect(submitted.applicationStatus).toBe('PENDING_REVIEW');
      expect(submitted.documents.aadhaarPan?.fileUrl).toBeFalsy();
      expect(submitted.documents.shopLicense?.fileUrl).toBeFalsy();
    });

    it('successfully submits Manufacturer/Wholesaler application without customer cashbackRate (B2B only)', async () => {
      await CashbackRule.create({ shopType: 'Independent Store', minCashback: 5, isActive: true });

      const vendor = await Vendor.create({
        zeebacId: 'ZBV-99002',
        ownerName: 'Sunil Mittal',
        phone: '9899001133',
        businessType: 'Wholesaler',
        applicationStatus: 'DRAFT',
      });

      const req = {
        user: { id: vendor._id.toString() },
        body: {
          storeName: 'Mittal Wholesale Traders',
          businessType: 'Wholesaler',
          category: 'Textiles & Garments',
          // Note: NO cashbackRate passed!
          gstNumber: '07ABCDE1234F1Z5',
          address: JSON.stringify({
            fullAddress: 'Shop 15, Wholesale Textile Market',
            city: 'Delhi',
            state: 'Delhi',
            pincode: '110006',
          }),
          lat: 28.6562,
          lng: 77.2300,
        },
        files: {
          udyamCertificate: [{ originalname: 'udyam.pdf', mimetype: 'application/pdf', filename: 'https://cdn.zeebac.com/udyam.pdf' }],
          gstCertificate: [{ originalname: 'gst.pdf', mimetype: 'application/pdf', filename: 'https://cdn.zeebac.com/gst.pdf' }],
        },
      };

      const res = makeRes();
      await submitApplication(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            applicationStatus: 'PENDING_REVIEW',
            storeName: 'Mittal Wholesale Traders',
            businessType: 'Wholesaler',
            cashbackRate: 0,
          }),
        })
      );
    });
  });
});
