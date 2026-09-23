import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import CashbackRequest from '../models/CashbackRequest.js';
import Transaction from '../models/Transaction.js';
import PosBill from '../models/PosBill.js';
import { createCustomerTransaction, verifyCashbackRequestCode, requestWithdrawal, getMyWallet } from './user.controller.js';
import { holdCashbackTransaction, unholdCashbackTransaction } from './vendor.controller.js';
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

const setupVendorAndCustomer = async ({ vendorLocation = [77.2090, 28.6139] } = {}) => {
  const vendor = await Vendor.create({
    zeebacId: 'ZBV-CASH01',
    ownerName: 'Vikas Sharma',
    storeName: 'Sharma Grocery Store',
    phone: '9811122233',
    email: 'sharma@test.com',
    password: 'hash',
    cashbackRate: 10,
    status: 'Verified',
    location: {
      type: 'Point',
      coordinates: vendorLocation, // [lng, lat]
    },
    subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
  });

  await Wallet.create({
    ownerId: vendor._id,
    ownerType: 'Vendor',
    ownerZeebacId: vendor.zeebacId,
    balance: 5000,
    totalEarned: 5000,
    totalWithdrawn: 0,
  });

  const customer = await User.create({
    name: 'Rahul Verma',
    phone: '9900112233',
    zeebacId: 'ZBC-CUST01',
    status: 'Active',
  });

  const customerWallet = await Wallet.create({
    ownerId: customer._id,
    ownerType: 'User',
    ownerZeebacId: customer.zeebacId,
    balance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
  });

  return { vendor, customer, customerWallet };
};

describe('Zero-Fraud Cash Cashback Architecture', () => {
  it('1. Blocks customer cash request over ₹1,000 with HTTP 400', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 1500, // > 1000
        paymentMethod: 'Cash',
        latitude: 28.6139,
        longitude: 77.2090,
      },
    };
    const res = mockRes();

    await createCustomerTransaction(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/limited to ₹1000/i);
  });

  it('2. Enforces geofence: Blocks cash request when customer is far (> 300m) from shop', async () => {
    const { vendor, customer } = await setupVendorAndCustomer({ vendorLocation: [77.2090, 28.6139] });

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        paymentMethod: 'Cash',
        latitude: 28.6500, // ~4 km away
        longitude: 77.2500,
      },
    };
    const res = mockRes();

    await createCustomerTransaction(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/within 300m/i);
  });

  it('3. Enforces daily limit: Blocks 4th cash request for same shop in 24 hours with HTTP 429', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    // Create 3 cash requests
    for (let i = 1; i <= 3; i++) {
      await CashbackRequest.create({
        customerId: customer._id,
        vendorId: vendor._id,
        amount: 100 * i,
        requestType: 'cash_claim',
        paymentMethod: 'Cash',
        status: 'Approved',
      });
    }

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 200,
        paymentMethod: 'Cash',
        latitude: 28.6139,
        longitude: 77.2090,
      },
    };
    const res = mockRes();

    await createCustomerTransaction(req, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/(daily limit|limit of \d+)/i);
  });

  it('4. Successfully creates cash request <= ₹1,000 and generates 3-digit verification code', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 800,
        paymentMethod: 'Cash',
        latitude: 28.61395,
        longitude: 77.20905, // very close (~10m)
      },
    };
    const res = mockRes();

    await createCustomerTransaction(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);

    const savedRequest = await CashbackRequest.findById(res.body.data.requestId);
    expect(savedRequest).toBeDefined();
    expect(savedRequest.verificationCode).toMatch(/^\d{3}$/);
    expect(savedRequest.status).toBe('Pending');
  });

  it('5. Auto-approves request when customer enters matching 3-digit code and locks cashback for 24 hours', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    // Create request
    const createReq = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 600,
        paymentMethod: 'Cash',
        latitude: 28.6139,
        longitude: 77.2090,
      },
    };
    const createRes = mockRes();
    await createCustomerTransaction(createReq, createRes);
    const requestId = createRes.body.data.requestId;

    const savedRequest = await CashbackRequest.findById(requestId);
    const validCode = savedRequest.verificationCode;

    // Test invalid code first
    const invalidVerifyReq = {
      user: { id: customer._id.toString() },
      params: { id: requestId },
      body: { code: '000' },
    };
    const invalidVerifyRes = mockRes();
    await verifyCashbackRequestCode(invalidVerifyReq, invalidVerifyRes);
    expect(invalidVerifyRes.statusCode).toBe(400);
    expect(invalidVerifyRes.body.message).toMatch(/invalid verification code/i);

    // Test valid code
    const validVerifyReq = {
      user: { id: customer._id.toString() },
      params: { id: requestId },
      body: { code: validCode },
    };
    const validVerifyRes = mockRes();
    await verifyCashbackRequestCode(validVerifyReq, validVerifyRes);

    expect(validVerifyRes.statusCode).toBe(200);
    expect(validVerifyRes.body.success).toBe(true);
    expect(validVerifyRes.body.data.status).toBe('Approved');
    expect(validVerifyRes.body.data.cashbackAmount).toBe(60); // 10% of 600

    // Check request status
    const approvedRequest = await CashbackRequest.findById(requestId);
    expect(approvedRequest.status).toBe('Approved');
    expect(approvedRequest.lockedUntil).toBeDefined();
    expect(new Date(approvedRequest.lockedUntil).getTime()).toBeGreaterThan(Date.now());

    // Check customer wallet & ledger transaction
    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(customerWallet.balance).toBe(60);

    const creditTxn = await WalletTransaction.findOne({ ownerId: customer._id, type: 'credit' });
    expect(creditTxn).toBeDefined();
    expect(creditTxn.amount).toBe(60);
    expect(creditTxn.lockedUntil).toBeDefined();
    expect(new Date(creditTxn.lockedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('6. Blocks bank withdrawal during the 24-hour lock period', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    // Credit ₹500 locked cashback
    const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await Wallet.findOneAndUpdate({ ownerId: customer._id }, { $inc: { balance: 500 } });
    await WalletTransaction.create({
      walletId: new mongoose.Types.ObjectId(),
      ownerId: customer._id,
      ownerType: 'User',
      type: 'credit',
      category: 'cashback',
      amount: 500,
      balanceAfter: 500,
      description: 'Cash payment cashback',
      lockedUntil,
    });

    // Check wallet API reflects locked balance
    const walletReq = { user: { id: customer._id.toString() } };
    const walletRes = mockRes();
    await getMyWallet(walletReq, walletRes);

    expect(walletRes.statusCode).toBe(200);
    expect(walletRes.body.data.wallet.balance).toBe(500);
    expect(walletRes.body.data.wallet.lockedBalance).toBe(500);
    expect(walletRes.body.data.wallet.withdrawableBalance).toBe(0);

    // Attempt withdrawal of ₹300
    const withdrawReq = {
      user: { id: customer._id.toString() },
      body: { amount: 300 },
    };
    const withdrawRes = mockRes();
    await requestWithdrawal(withdrawReq, withdrawRes);

    expect(withdrawRes.statusCode).toBe(400);
    expect(withdrawRes.body.success).toBe(false);
    expect(withdrawRes.body.message).toMatch(/Insufficient withdrawable balance/i);
  });

  it('7. Vendor can put cashback on hold; customer withdrawal remains blocked', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    const request = await CashbackRequest.create({
      customerId: customer._id,
      vendorId: vendor._id,
      amount: 400,
      requestType: 'cash_claim',
      paymentMethod: 'Cash',
      status: 'Approved',
    });

    const holdReq = {
      user: { id: vendor._id.toString(), storeName: vendor.storeName },
      params: { id: request._id.toString() },
      body: { reason: 'Customer disputed bill amount' },
    };
    const holdRes = mockRes();

    await holdCashbackTransaction(holdReq, holdRes);

    expect(holdRes.statusCode).toBe(200);
    expect(holdRes.body.success).toBe(true);

    const heldReq = await CashbackRequest.findById(request._id);
    expect(heldReq.isHeld).toBe(true);
    expect(heldReq.status).toBe('Held');
    expect(heldReq.holdReason).toBe('Customer disputed bill amount');

    // Vendor releases hold
    const unholdReq = {
      user: { id: vendor._id.toString(), storeName: vendor.storeName },
      params: { id: request._id.toString() },
    };
    const unholdRes = mockRes();
    await unholdCashbackTransaction(unholdReq, unholdRes);

    expect(unholdRes.statusCode).toBe(200);
    const unheldReq = await CashbackRequest.findById(request._id);
    expect(unheldReq.isHeld).toBe(false);
    expect(unheldReq.status).toBe('Approved');
  });

  it('8. Cash bills > ₹1,000: Vendor generates one-time POS QR code, customer scans and gains instant withdrawable cashback', async () => {
    const { vendor, customer } = await setupVendorAndCustomer();

    // 1. Vendor generates POS Bill for ₹2,500
    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 2500,
        paymentMethod: 'Cash (POS Bill)',
      },
    };
    const posRes = mockRes();
    await createPosBill(posReq, posRes);

    expect(posRes.statusCode).toBe(201);
    expect(posRes.body.success).toBe(true);
    const billCode = posRes.body.data.billCode;
    expect(billCode).toMatch(/^ZEEBAC-/);

    // 2. Customer scans and claims POS Bill
    const claimReq = {
      user: { id: customer._id.toString() },
      body: { billCode },
    };
    const claimRes = mockRes();
    await claimPosBill(claimReq, claimRes);

    expect(claimRes.statusCode).toBe(200);
    expect(claimRes.body.success).toBe(true);
    expect(claimRes.body.data.cashbackEarned).toBe(250); // 10% of 2500

    // 3. Verify cashback is instantly withdrawable (lockedUntil is null)
    const claimedTxn = await WalletTransaction.findOne({ ownerId: customer._id, type: 'credit' });
    expect(claimedTxn.lockedUntil).toBeNull();
    expect(claimedTxn.isHeld).toBe(false);

    // Check getMyWallet shows ₹250 withdrawable
    const walletReq = { user: { id: customer._id.toString() } };
    const walletRes = mockRes();
    await getMyWallet(walletReq, walletRes);
    expect(walletRes.body.data.wallet.balance).toBe(250);
    expect(walletRes.body.data.wallet.lockedBalance).toBe(0);
    expect(walletRes.body.data.wallet.withdrawableBalance).toBe(250);
  });
});
