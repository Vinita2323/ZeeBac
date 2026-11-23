import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import PosBill from '../models/PosBill.js';
import Transaction from '../models/Transaction.js';
import {
  createPosBillIntent,
  getPosBillStatus,
  payPosBillIntent,
  autoConfirmPosBillUtr,
} from './pos.controller.js';
import { logPurchase } from './vendor.controller.js';

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

describe('POS Auto Billing & Customer Instant Payment Flows', () => {
  it('1. createPosBillIntent creates a valid pending bill intent with dynamic UPI URI', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-AUTO01',
      ownerName: 'Test Vendor Owner',
      storeName: 'QuickMart Store',
      phone: '9800000010',
      email: 'quickmart@test.com',
      password: 'hash',
      cashbackRate: 10,
      upiId: 'quickmart@upi',
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
    });

    const req = {
      user: { id: vendor._id },
      body: {
        amount: 250,
        items: [
          { name: 'Basmati Rice 1kg', quantity: 1, price: 150, total: 150 },
          { name: 'Mustard Oil 1L', quantity: 1, price: 100, total: 100 },
        ],
        customerPhone: '9876543210',
        customerZeebacId: 'ZBC-5266',
        customerName: 'Aman Kumar',
        billNumber: 'BILL-100201',
      },
    };
    const res = mockRes();

    await createPosBillIntent(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.billCode).toBe('BILL-100201');
    expect(res.body.data.amount).toBe(250);
    expect(res.body.data.cashbackAmount).toBe(25); // 10% of 250
    expect(res.body.data.upiUri).toContain('tr=BILL-100201');
    expect(res.body.data.upiUri).toContain('quickmart%40upi');

    const saved = await PosBill.findOne({ billCode: 'BILL-100201' });
    expect(saved).toBeDefined();
    expect(saved.status).toBe('UNCLAIMED');
    expect(saved.items.length).toBe(2);
  });

  it('2. getPosBillStatus correctly inspects bill payment state', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-AUTO02',
      ownerName: 'Test Vendor',
      storeName: 'Grocery Hub',
      phone: '9800000011',
      email: 'groceryhub@test.com',
      password: 'hash',
      cashbackRate: 5,
    });

    await PosBill.create({
      billCode: 'BILL-STATUS01',
      vendor: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      amount: 500,
      cashbackRate: 5,
      cashbackAmount: 25,
      status: 'UNCLAIMED',
      paymentMethod: 'UPI',
    });

    const req = { params: { billCode: 'BILL-STATUS01' } };
    const res = mockRes();

    await getPosBillStatus(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.paid).toBe(false);
    expect(res.body.data.amount).toBe(500);
  });

  it('3. payPosBillIntent via Customer Wallet debits wallet, credits cashback, and updates bill to CLAIMED', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-AUTO03',
      ownerName: 'Vendor 3',
      storeName: 'Tech Point',
      phone: '9800000012',
      email: 'techpoint@test.com',
      password: 'hash',
      cashbackRate: 10,
    });

    const customer = await User.create({
      zeebacId: 'ZBC-CUST03',
      name: 'Rohan Mehra',
      phone: '9876500001',
      email: 'rohan.mehra@test.com',
      password: 'hash',
    });

    // Seed customer wallet with ₹1000
    await Wallet.create({
      ownerId: customer._id,
      ownerType: 'User',
      ownerZeebacId: customer.zeebacId,
      balance: 1000,
    });

    const posBill = await PosBill.create({
      billCode: 'BILL-PAY01',
      vendor: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      amount: 300,
      cashbackRate: 10,
      cashbackAmount: 30,
      status: 'UNCLAIMED',
      items: [{ name: 'USB-C Cable', quantity: 2, price: 150, total: 300 }],
    });

    const req = {
      user: { id: customer._id },
      body: {
        billCode: 'BILL-PAY01',
        paymentMethod: 'Wallet',
      },
    };
    const res = mockRes();

    await payPosBillIntent(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(300);
    expect(res.body.data.cashbackEarned).toBe(30);
    expect(res.body.data.transactionId).toBeDefined();

    // Verify wallet: 1000 - 300 + 30 = 730
    const updatedWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(updatedWallet.balance).toBe(730);

    // Verify PosBill status updated to CLAIMED
    const updatedBill = await PosBill.findById(posBill._id);
    expect(updatedBill.status).toBe('CLAIMED');
    expect(updatedBill.claimedBy.toString()).toBe(customer._id.toString());

    // Verify Transaction created with correct items
    const tx = await Transaction.findOne({ billNumber: 'BILL-PAY01' });
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(300);
    expect(tx.cashbackAmount).toBe(30);
    expect(tx.items.length).toBe(1);
    expect(tx.items[0].name).toBe('USB-C Cable');
  });

  it('4. autoConfirmPosBillUtr confirms external UPI payment via 12-digit UTR', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-AUTO04',
      ownerName: 'Vendor 4',
      storeName: 'Fashion Hub',
      phone: '9800000013',
      email: 'fashionhub@test.com',
      password: 'hash',
      cashbackRate: 5,
    });

    const customer = await User.create({
      zeebacId: 'ZBC-CUST04',
      name: 'Pooja Verma',
      phone: '9876500002',
      email: 'pooja@test.com',
      password: 'hash',
    });

    await Wallet.create({
      ownerId: customer._id,
      ownerType: 'User',
      ownerZeebacId: customer.zeebacId,
      balance: 50,
    });

    await PosBill.create({
      billCode: 'BILL-UTR01',
      vendor: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      amount: 400,
      cashbackRate: 5,
      cashbackAmount: 20,
      customerPhone: '9876500002',
      status: 'UNCLAIMED',
      items: [{ name: 'Cotton T-Shirt', quantity: 1, price: 400, total: 400 }],
    });

    const req = {
      body: {
        billCode: 'BILL-UTR01',
        utr: '425512345678',
      },
    };
    const res = mockRes();

    await autoConfirmPosBillUtr(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedBill = await PosBill.findOne({ billCode: 'BILL-UTR01' });
    expect(updatedBill.status).toBe('CLAIMED');

    // Customer should have received 5% of 400 = 20 cashback: 50 + 20 = 70
    const updatedWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(updatedWallet.balance).toBe(70);
  });

  it('5. logPurchase successfully redeems customer points on offline bill & calculates cashback only on net paid', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-REDEEM01',
      ownerName: 'Vendor Redeem',
      storeName: 'Redeem Store',
      phone: '9800000014',
      email: 'redeemstore@test.com',
      password: 'hash',
      cashbackRate: 10,
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
      additionalRedemptionLimit: 1000,
      cashbackIssued: 500,
      cashbackRedeemed: 0,
    });

    // Seed vendor wallet with ₹500
    await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 500,
    });

    const customer = await User.create({
      zeebacId: 'ZBC-5266',
      name: 'Shiv',
      phone: '9335825081',
      email: 'shiv@test.com',
      password: 'hash',
    });

    // Seed customer with 50 points
    await Wallet.create({
      ownerId: customer._id,
      ownerType: 'User',
      ownerZeebacId: customer.zeebacId,
      balance: 50,
    });

    const req = {
      user: { id: vendor._id },
      body: {
        customerZeebacId: 'ZBC-5266',
        amount: 250,
        redeemPoints: 50,
        paymentMethod: 'Cash',
        billNumber: 'BILL-RED01',
        items: [{ name: 'Grocery Item', quantity: 1, price: 250, total: 250, cashbackPercentage: 10 }],
      },
    };
    const res = mockRes();

    await logPurchase(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const tx = res.body.data;
    expect(tx.amount).toBe(250);
    expect(tx.pointsRedeemed).toBe(50);
    expect(tx.totalPaid).toBe(200);
    // Cashback 10% on ₹200 net paid = ₹20 (not on 250!)
    expect(tx.cashbackAmount).toBe(20);

    // Customer wallet: 50 initial - 50 redeemed + 20 cashback = 20
    const custWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(custWallet.balance).toBe(20);

    // Vendor cashbackRedeemed increased by 50
    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.cashbackRedeemed).toBe(50);
  });
});
