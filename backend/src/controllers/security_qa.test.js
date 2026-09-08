import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import RewardConfig from '../models/RewardConfig.js';
import CashbackRequest from '../models/CashbackRequest.js';
import { creditWallet, debitWallet } from '../utils/wallet.util.js';
import { requestWithdrawal, createCashbackRequest } from './user.controller.js';
import { respondToCashbackRequest, updateProfile } from './vendor.controller.js';
import { refundTransaction } from './admin.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn() }));
vi.mock('../utils/adminNotification.js', () => ({
  checkAndNotifyFraud: vi.fn().mockResolvedValue(undefined),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
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
  const zeebacId = `ZBV-QA-${Math.floor(Math.random() * 100000)}`;
  const vendor = await Vendor.create({
    zeebacId,
    ownerName: 'QA Vendor Owner',
    storeName: 'QA Store',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    shopType: 'Independent Store',
    cashbackRate: 5,
    subscription: { status: 'ACTIVE' },
    ...overrides,
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 2000 });
  return vendor;
};

const makeCustomer = async (overrides = {}) => {
  const zeebacId = `ZBC-QA-${Math.floor(Math.random() * 100000)}`;
  const user = await User.create({
    zeebacId,
    name: 'QA Customer',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
    ...overrides,
  });
  await Wallet.create({ ownerId: user._id, ownerType: 'User', ownerZeebacId: user.zeebacId, balance: 1000 });
  return user;
};

describe('Phase 9 Final Security Re-Audit & Comprehensive QA', () => {

  it('Vulnerability Check #1: Atomic concurrency prevents race-condition double-dipping on wallet debits', async () => {
    const user = await makeCustomer();

    // 5 concurrent attempts to debit ₹300 from ₹1000 balance
    const results = await Promise.allSettled([
      debitWallet({ ownerId: user._id, ownerType: 'User', amount: 300, category: 'cashout', description: 'Test debit 1' }),
      debitWallet({ ownerId: user._id, ownerType: 'User', amount: 300, category: 'cashout', description: 'Test debit 2' }),
      debitWallet({ ownerId: user._id, ownerType: 'User', amount: 300, category: 'cashout', description: 'Test debit 3' }),
      debitWallet({ ownerId: user._id, ownerType: 'User', amount: 300, category: 'cashout', description: 'Test debit 4' }),
      debitWallet({ ownerId: user._id, ownerType: 'User', amount: 300, category: 'cashout', description: 'Test debit 5' }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Exactly 3 debits of ₹300 should succeed (3 * 300 = 900 <= 1000)
    expect(successes.length).toBe(3);
    expect(failures.length).toBe(2);

    const updatedWallet = await Wallet.findOne({ ownerId: user._id });
    expect(updatedWallet.balance).toBe(100);
  });

  it('Vulnerability Check #2: Cashback approval idempotency prevents double payout', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    const requestDoc = await CashbackRequest.create({
      customerId: customer._id,
      vendorId: vendor._id,
      amount: 1000,
      cashbackAmount: 50,
      billNumber: 'BILL-QA-999',
      billImageUrl: 'https://example.com/receipt.jpg',
      requestType: 'receipt_claim',
      status: 'Pending',
    });

    const req = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { id: requestDoc._id.toString(), requestId: requestDoc._id.toString() },
      body: { action: 'Approve' },
    };

    // Execute 2 concurrent approval attempts
    const [res1, res2] = await Promise.all([makeRes(), makeRes()]);
    await Promise.all([
      respondToCashbackRequest(req, res1),
      respondToCashbackRequest(req, res2),
    ]);

    const updatedRequest = await CashbackRequest.findById(requestDoc._id);
    expect(updatedRequest.status).toBe('Approved');

    // Customer wallet should be credited exactly once (+₹50)
    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(customerWallet.balance).toBe(1050);

    // Exactly one transaction should be logged
    const txns = await WalletTransaction.find({ ownerId: customer._id, category: 'cashback' });
    expect(txns.length).toBe(1);
  });

  it('Vulnerability Check #3: Shop-type rate bounds prevent rate tampering on vendor profiles', async () => {
    const independentVendor = await makeVendor({ shopType: 'Independent Store', cashbackRate: 5 });
    const brandVendor = await makeVendor({ shopType: 'Chain & Brand', cashbackRate: 10 });

    // Attempting to set Independent Store below 2% -> HTTP 400
    const req1 = { user: { id: independentVendor._id.toString() }, body: { cashbackRate: 1 } };
    const res1 = makeRes();
    await updateProfile(req1, res1);
    expect(res1.status).toHaveBeenCalledWith(400);

    // Attempting to set Chain & Brand below 5% -> HTTP 400
    const req2 = { user: { id: brandVendor._id.toString() }, body: { cashbackRate: 3 } };
    const res2 = makeRes();
    await updateProfile(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(400);

    // Valid rate update (8%) -> HTTP 200
    const req3 = { user: { id: independentVendor._id.toString() }, body: { cashbackRate: 8 } };
    const res3 = makeRes();
    await updateProfile(req3, res3);
    expect(res3.status).toHaveBeenCalledWith(200);
  });

  it('Vulnerability Check #4: Atomic refund path debits customer cashback & restores vendor wallet', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    const txn = await Transaction.create({
      transactionId: `TX-QA-REFUND-${Date.now()}`,
      customerId: customer._id,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      amount: 2000,
      cashbackAmount: 100,
      cashbackPercent: 5,
      type: 'manual',
      initiatedBy: 'vendor',
      source: 'vendor_manual',
      status: 'Approved',
    });

    // Customer balance has 1100
    await Wallet.updateOne({ ownerId: customer._id }, { balance: 1100 });

    const req = {
      params: { id: txn._id.toString() },
      body: { reason: 'Fraudulent receipt detected' },
      user: { id: 'admin123', role: 'admin' },
    };
    const res = makeRes();

    await refundTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Transaction status should be Refunded
    const updatedTxn = await Transaction.findById(txn._id);
    expect(updatedTxn.status).toBe('Refunded');

    // Customer balance debited back by 100 (1100 - 100 = 1000)
    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(customerWallet.balance).toBe(1000);

    // Vendor wallet credited back by 100 (2000 + 100 = 2100)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendorWallet.balance).toBe(2100);
  });

});
