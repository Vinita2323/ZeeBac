import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import PosBill from '../models/PosBill.js';
import Transaction from '../models/Transaction.js';
import { createPosBill, claimPosBill } from './pos.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

describe('POS Billing Flows (createPosBill & claimPosBill)', () => {
  it('Option 1: creates an UNCLAIMED POS Bill with QR code payload when phone number is omitted', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-POS01',
      ownerName: 'Test Owner',
      storeName: 'Reliance Retail',
      phone: '9800000001',
      email: 'rel@test.com',
      password: 'hash',
      cashbackRate: 10,
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
    });

    const req = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 1000,
      },
    };
    const res = mockRes();

    await createPosBill(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mode).toBe('QR_SCAN');
    expect(res.body.data.billCode).toMatch(/^ZEEBAC-/);
    expect(res.body.data.qrPayload).toBe(res.body.data.billCode);
    expect(res.body.data.cashbackAmount).toBe(100);

    const savedBill = await PosBill.findOne({ billCode: res.body.data.billCode });
    expect(savedBill).toBeDefined();
    expect(savedBill.status).toBe('UNCLAIMED');
    expect(savedBill.claimMode).toBe('SCAN');
  });

  it('Option 2: automatically credits registered customer wallet when customerPhone is provided', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-POS02',
      ownerName: 'Test Owner',
      storeName: 'Shoppers Stop',
      phone: '9800000002',
      email: 'ss@test.com',
      password: 'hash',
      cashbackRate: 10,
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
    });

    // Seed vendor prepaid cashback wallet with ₹500
    await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 500,
    });

    // Seed customer
    const customer = await User.create({
      zeebacId: 'ZBC-CUST01',
      name: 'Rohan Sharma',
      phone: '9876543210',
      email: 'rohan@test.com',
      password: 'hash',
    });

    const req = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 2000, // 10% = ₹200 cashback
        customerPhone: '9876543210',
      },
    };
    const res = mockRes();

    await createPosBill(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mode).toBe('AUTO_CREDITED');
    expect(res.body.data.cashbackEarned).toBe(200);
    expect(res.body.data.customer.name).toBe('Rohan Sharma');

    // Verify Customer Wallet got ₹200
    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(customerWallet.balance).toBe(200);

    // Verify Vendor Wallet was debited ₹200 (500 - 200 = 300)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendorWallet.balance).toBe(300);

    // Verify PosBill record is marked CLAIMED with AUTO_PHONE mode
    const bill = await PosBill.findOne({ billCode: res.body.data.billCode });
    expect(bill.status).toBe('CLAIMED');
    expect(bill.claimMode).toBe('AUTO_PHONE');
    expect(String(bill.claimedBy)).toBe(String(customer._id));

    // Verify Transaction record
    const tx = await Transaction.findOne({ customerId: customer._id });
    expect(tx.source).toBe('pos_auto_credit');
    expect(tx.status).toBe('Approved');
    expect(tx.cashbackAmount).toBe(200);
  });

  it('Option 2 Fallback: generates claimable QR receipt when customerPhone is not yet registered', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-POS03',
      ownerName: 'Test Owner',
      storeName: 'Lifestyle Stores',
      phone: '9800000003',
      email: 'life@test.com',
      password: 'hash',
      cashbackRate: 15,
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
    });

    const req = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 1000,
        customerPhone: '919999988888', // Unregistered Indian phone with 91 prefix
      },
    };
    const res = mockRes();

    await createPosBill(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mode).toBe('UNREGISTERED_CUSTOMER_QR');
    expect(res.body.data.customerPhone).toBe('9999988888'); // Normalized 10 digits
    expect(res.body.data.cashbackAmount).toBe(150);

    const bill = await PosBill.findOne({ billCode: res.body.data.billCode });
    expect(bill.status).toBe('UNCLAIMED');
    expect(bill.customerPhone).toBe('9999988888');
  });

  it('claimPosBill allows customer to claim an UNCLAIMED POS receipt code via app scan', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-POS04',
      ownerName: 'Test Owner',
      storeName: 'Croma Retail',
      phone: '9800000004',
      email: 'croma@test.com',
      password: 'hash',
      cashbackRate: 5,
    });

    await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 1000,
    });

    const customer = await User.create({
      zeebacId: 'ZBC-CUST02',
      name: 'Pooja Verma',
      phone: '9822233344',
      email: 'pooja@test.com',
      password: 'hash',
    });

    // Create an unclaimed bill
    const bill = await PosBill.create({
      billCode: 'ZEEBAC-44556',
      vendorZeebacId: vendor.zeebacId,
      vendor: vendor._id,
      amount: 5000,
      cashbackRate: 5,
      status: 'UNCLAIMED',
      claimMode: 'SCAN',
    });

    const req = {
      body: { billCode: 'ZEEBAC-44556' },
      user: { id: customer._id },
    };
    const res = mockRes();

    await claimPosBill(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cashbackEarned).toBe(250); // 5% of 5000

    const updatedBill = await PosBill.findById(bill._id);
    expect(updatedBill.status).toBe('CLAIMED');
    expect(String(updatedBill.claimedBy)).toBe(String(customer._id));
  });
});
