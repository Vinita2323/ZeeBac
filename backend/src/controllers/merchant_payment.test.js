import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import WalletTransaction from '../models/WalletTransaction.js';
import {
  updateProfile,
  searchMerchantForPayment,
  processMerchantPayment,
  getVendorTransactions,
  applyApplicationFields
} from './vendor.controller.js';

// Mock notification service
vi.mock('../services/notification.service.js', () => ({
  sendNotification: vi.fn(),
  sendToVendor: vi.fn(),
  sendToUser: vi.fn()
}));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeVendor = async (overrides = {}) => {
  const uniqueNum = Math.floor(100000 + Math.random() * 899999);
  const securityData = overrides.securityPinHash
    ? { securityPin: overrides.securityPinHash }
    : (overrides.security || {});

  const vendor = await Vendor.create({
    zeebacId: `ZEEBAC-MUM-${uniqueNum}`,
    ownerName: 'Test Merchant Owner',
    storeName: `Trade Store ${uniqueNum}`,
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    cashbackRate: 5,
    category: 'Electronics',
    businessType: 'Retailer',
    security: securityData,
    subscription: {
      status: 'ACTIVE',
      planType: 'Monthly',
      price: 499,
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    ...overrides,
  });

  const wallet = await Wallet.create({
    ownerId: vendor._id,
    ownerType: 'Vendor',
    ownerZeebacId: vendor.zeebacId,
    balance: overrides.walletBalance !== undefined ? overrides.walletBalance : 5000
  });

  return { vendor, wallet };
};

describe('Merchant Registration Types (Manufacturer, Wholesaler, Retailer)', () => {
  it('allows registering / updating as Manufacturer', async () => {
    const { vendor } = await makeVendor({ businessType: null });
    const req = {
      user: { id: vendor._id.toString() },
      body: { businessType: 'Manufacturer' }
    };
    const res = makeRes();

    await updateProfile(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const updated = await Vendor.findById(vendor._id);
    expect(updated.businessType).toBe('Manufacturer');
  });

  it('allows registering / updating as Wholesaler', async () => {
    const { vendor } = await makeVendor({ businessType: null });
    const req = {
      user: { id: vendor._id.toString() },
      body: { businessType: 'Wholesaler' }
    };
    const res = makeRes();

    await updateProfile(req, res);
    const updated = await Vendor.findById(vendor._id);
    expect(updated.businessType).toBe('Wholesaler');
  });

  it('allows registering / updating as Retailer', async () => {
    const { vendor } = await makeVendor({ businessType: null });
    const req = {
      user: { id: vendor._id.toString() },
      body: { businessType: 'Retailer' }
    };
    const res = makeRes();

    await updateProfile(req, res);
    const updated = await Vendor.findById(vendor._id);
    expect(updated.businessType).toBe('Retailer');
  });

  it('rejects invalid business types with explicit error', async () => {
    const { vendor } = await makeVendor({ businessType: 'Retailer' });
    const req = {
      user: { id: vendor._id.toString() },
      body: { businessType: 'Distributor' } // Not in allowed enum
    };
    const res = makeRes();

    await updateProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid business type')
      })
    );
  });

  it('safely handles existing merchants where businessType is null or missing', async () => {
    const { vendor } = await makeVendor({ businessType: null });
    expect(vendor.businessType).toBeNull();

    // Vendor profile fetch / update other fields should succeed seamlessly
    const req = {
      user: { id: vendor._id.toString() },
      body: { description: 'Updated vendor description' }
    };
    const res = makeRes();

    await updateProfile(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const check = await Vendor.findById(vendor._id);
    expect(check.description).toBe('Updated vendor description');
  });

  it('applies businessType through vendorApplication utility properly', () => {
    const vendorDoc = { applicationData: {} };
    applyApplicationFields(vendorDoc, { businessType: 'Wholesaler' });
    expect(vendorDoc.businessType).toBe('Wholesaler');
  });
});

describe('Merchant Search for Payment', () => {
  it('searches successfully by 10-digit mobile number', async () => {
    const { vendor: payer } = await makeVendor({ storeName: 'Buyer Store' });
    const { vendor: seller } = await makeVendor({
      storeName: 'Wholesale Hub',
      phone: '9876543210',
      businessType: 'Wholesaler',
      cashbackRate: 8
    });

    const req = {
      user: { id: payer._id.toString() },
      query: { query: '9876543210' }
    };
    const res = makeRes();

    await searchMerchantForPayment(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          zeebacId: seller.zeebacId,
          storeName: 'Wholesale Hub',
          businessType: 'Wholesaler',
          cashbackRate: 8,
          maskedPhone: expect.stringMatching(/^\d{2}\*{6}\d{2}$/)
        })
      })
    );
  });

  it('searches successfully by ZeeBac Merchant ID', async () => {
    const { vendor: payer } = await makeVendor();
    const { vendor: seller } = await makeVendor({
      zeebacId: 'ZEEBAC-MUM-5566',
      storeName: 'Apex Manufacturer',
      businessType: 'Manufacturer',
      cashbackRate: 10
    });

    const req = {
      user: { id: payer._id.toString() },
      query: { query: 'ZEEBAC-MUM-5566' }
    };
    const res = makeRes();

    await searchMerchantForPayment(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          zeebacId: 'ZEEBAC-MUM-5566',
          storeName: 'Apex Manufacturer',
          businessType: 'Manufacturer',
          cashbackRate: 10
        })
      })
    );
  });

  it('strictly rejects self-payment when searching own mobile or ZeeBac ID', async () => {
    const { vendor } = await makeVendor({ phone: '9988776655' });
    const req = {
      user: { id: vendor._id.toString() },
      query: { query: '9988776655' }
    };
    const res = makeRes();

    await searchMerchantForPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('cannot make a merchant payment to your own store')
      })
    );
  });

  it('returns 404 when merchant does not exist', async () => {
    const { vendor: payer } = await makeVendor();
    const req = {
      user: { id: payer._id.toString() },
      query: { query: '9999999999' }
    };
    const res = makeRes();

    await searchMerchantForPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects searching unverified or rejected merchants', async () => {
    const { vendor: payer } = await makeVendor();
    const { vendor: unverified } = await makeVendor({
      status: 'Pending',
      phone: '9123456789'
    });

    const req = {
      user: { id: payer._id.toString() },
      query: { query: '9123456789' }
    };
    const res = makeRes();

    await searchMerchantForPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('does NOT expose sensitive merchant data in search response', async () => {
    const { vendor: payer } = await makeVendor();
    const { vendor: seller } = await makeVendor({
      security: { securityPin: 'secret' },
      bankDetails: { accountNumber: '123456789012' }
    });

    const req = {
      user: { id: payer._id.toString() },
      query: { query: seller.zeebacId }
    };
    const res = makeRes();

    await searchMerchantForPayment(req, res);
    const data = res.json.mock.calls[0][0].data;
    expect(data.security).toBeUndefined();
    expect(data.securityPin).toBeUndefined();
    expect(data.bankDetails).toBeUndefined();
    expect(data.walletBalance).toBeUndefined();
  });
});

describe('Merchant-to-Merchant Payment & Cashback Flow', () => {
  it('completes atomic M2M payment with correct wallet debit/credit and cashback', async () => {
    // Payer has ₹10,000 in wallet
    const { vendor: payer, wallet: payerWallet } = await makeVendor({
      storeName: 'Retailer Mart',
      businessType: 'Retailer',
      walletBalance: 10000
    });

    // Seller has ₹2,000 in wallet, 5% cashback rate
    const { vendor: seller, wallet: sellerWallet } = await makeVendor({
      storeName: 'Apex Wholesaler',
      businessType: 'Wholesaler',
      cashbackRate: 5,
      walletBalance: 2000
    });

    // Payer purchases ₹2,000 goods
    // Expected:
    // - Payer debited ₹2,000 for purchase
    // - Seller credited ₹2,000 for sale
    // - Seller debited 5% of ₹2,000 = ₹100 cashback
    // - Payer credited ₹100 cashback
    // Net payer balance: 10000 - 2000 + 100 = 8100
    // Net seller balance: 2000 + 2000 - 100 = 3900

    const req = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: 2000
      }
    };
    const res = makeRes();

    await processMerchantPayment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          billAmount: 2000,
          cashbackEarned: 100,
          newBalance: 8100
        })
      })
    );

    // Verify balances in database
    const updatedPayerWallet = await Wallet.findOne({ ownerId: payer._id });
    const updatedSellerWallet = await Wallet.findOne({ ownerId: seller._id });

    expect(updatedPayerWallet.balance).toBe(8100);
    expect(updatedSellerWallet.balance).toBe(3900);

    // Verify Transaction record created
    const tx = await Transaction.findOne({
      type: 'merchant_payment',
      payerVendorId: payer._id,
      vendorId: seller._id
    });
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(2000);
    expect(tx.cashbackAmount).toBe(100);
    expect(tx.status).toBe('Approved');
    expect(tx.payerStoreName).toBe('Retailer Mart');
    expect(tx.vendorName).toBe('Apex Wholesaler');

    // Verify Wallet ledger transactions
    const payerEntries = await WalletTransaction.find({ walletId: payerWallet._id });
    expect(payerEntries.length).toBe(2); // 1 debit for payment + 1 credit for cashback
    const debitEntry = payerEntries.find((e) => e.type === 'debit');
    const cashbackEntry = payerEntries.find((e) => e.type === 'credit');
    expect(debitEntry.amount).toBe(2000);
    expect(cashbackEntry.amount).toBe(100);
  });

  it('rejects payment if payer wallet balance is insufficient', async () => {
    const { vendor: payer } = await makeVendor({ walletBalance: 500 });
    const { vendor: seller } = await makeVendor({ walletBalance: 1000 });

    const req = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: 2000 // exceeds 500
      }
    };
    const res = makeRes();

    await processMerchantPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Insufficient wallet balance')
      })
    );

    // Ensure wallet wasn't debited
    const wallet = await Wallet.findOne({ ownerId: payer._id });
    expect(wallet.balance).toBe(500);
  });

  it('rejects zero, negative, or invalid amounts', async () => {
    const { vendor: payer } = await makeVendor({ walletBalance: 5000 });
    const { vendor: seller } = await makeVendor();

    const req = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: -100
      }
    };
    const res = makeRes();

    await processMerchantPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid payment amount')
      })
    );
  });

  it('enforces PIN verification when payer has security PIN configured', async () => {
    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash('1234', salt);

    const { vendor: payer } = await makeVendor({
      walletBalance: 5000,
      securityPinHash: pinHash
    });
    const { vendor: seller } = await makeVendor();

    // Wrong PIN attempt
    const badReq = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: 500,
        pin: '9999'
      }
    };
    const badRes = makeRes();
    await processMerchantPayment(badReq, badRes);

    expect(badRes.status).toHaveBeenCalledWith(400);
    expect(badRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid Security PIN')
      })
    );

    // Correct PIN attempt
    const goodReq = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: 500,
        pin: '1234'
      }
    };
    const goodRes = makeRes();
    await processMerchantPayment(goodReq, goodRes);

    expect(goodRes.status).not.toHaveBeenCalledWith(400);
    expect(goodRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('prevents rapid double-spending within deduplication window', async () => {
    const { vendor: payer } = await makeVendor({ walletBalance: 5000 });
    const { vendor: seller } = await makeVendor();

    const req1 = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: 300
      }
    };
    const res1 = makeRes();
    await processMerchantPayment(req1, res1);
    expect(res1.status).not.toHaveBeenCalledWith(400);

    // Immediate duplicate payment with same recipient and amount
    const req2 = {
      user: { id: payer._id.toString() },
      body: {
        recipientZeebacId: seller.zeebacId,
        amount: 300
      }
    };
    const res2 = makeRes();
    await processMerchantPayment(req2, res2);

    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Duplicate payment detected')
      })
    );
  });

  it('retrieves transaction in getVendorTransactions for both payer and seller', async () => {
    const { vendor: payer } = await makeVendor({ storeName: 'Buyer Shop', walletBalance: 5000 });
    const { vendor: seller } = await makeVendor({ storeName: 'Wholesale Depot', walletBalance: 5000 });

    // Execute payment
    const payReq = {
      user: { id: payer._id.toString() },
      body: { recipientZeebacId: seller.zeebacId, amount: 1500 }
    };
    const payRes = makeRes();
    await processMerchantPayment(payReq, payRes);

    // Payer's transaction list
    const payerTxReq = { user: { id: payer._id.toString() } };
    const payerTxRes = makeRes();
    await getVendorTransactions(payerTxReq, payerTxRes);
    const payerList = payerTxRes.json.mock.calls[0][0].data;
    expect(payerList.some((t) => t.type === 'merchant_payment' && t.amount === 1500)).toBe(true);

    // Seller's transaction list
    const sellerTxReq = { user: { id: seller._id.toString() } };
    const sellerTxRes = makeRes();
    await getVendorTransactions(sellerTxReq, sellerTxRes);
    const sellerList = sellerTxRes.json.mock.calls[0][0].data;
    expect(sellerList.some((t) => t.type === 'merchant_payment' && t.amount === 1500)).toBe(true);
  });
});
