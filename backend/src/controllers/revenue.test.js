import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import RewardConfig from '../models/RewardConfig.js';
import { requestWithdrawal, createCashbackRequest } from './user.controller.js';
import { paySubscriptionFromWallet } from './vendor.controller.js';

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
  const vendor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(Math.random() * 100000)}`,
    ownerName: 'Test Vendor Owner',
    storeName: 'Test Store',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    shopType: 'Independent Store',
    cashbackRate: 5,
    subscription: { status: 'ACTIVE' },
    ...overrides,
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 1000 });
  return vendor;
};

const makeCustomer = async (overrides = {}) => {
  const user = await User.create({
    zeebacId: `ZBC-${Math.floor(Math.random() * 100000)}`,
    name: 'Test Customer',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
    ...overrides,
  });
  await Wallet.create({ ownerId: user._id, ownerType: 'User', ownerZeebacId: user.zeebacId, balance: 1000 });
  return user;
};

describe('Phase 6 Revenue Model & User Withdrawal Limits', () => {
  it('rejects withdrawal requests below the ₹250 threshold with HTTP 400', async () => {
    await RewardConfig.create({ userMinWithdrawalAmount: 250, userWithdrawalCommissionPercent: 2 });
    const user = await makeCustomer();

    const req = { user: { id: user._id.toString() }, body: { amount: 150 } };
    const res = makeRes();

    await requestWithdrawal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('Minimum withdrawal amount is ₹250');
  });

  it('rejects withdrawal requests exceeding the configured max limit with HTTP 400', async () => {
    await RewardConfig.create({ userMinWithdrawalAmount: 250, userMaxWithdrawalAmount: 5000, userWithdrawalCommissionPercent: 2 });
    const user = await makeCustomer();
    await Wallet.updateOne({ ownerId: user._id }, { balance: 10000 });

    const req = { user: { id: user._id.toString() }, body: { amount: 6000 } };
    const res = makeRes();

    await requestWithdrawal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('Maximum withdrawal limit per transaction is ₹5000');
  });

  it('accepts valid withdrawal requests >= ₹250 and computes net payout after commission fee', async () => {
    await RewardConfig.create({ userMinWithdrawalAmount: 250, userWithdrawalCommissionPercent: 2 });
    const user = await makeCustomer();

    const req = { user: { id: user._id.toString() }, body: { amount: 300 } };
    const res = makeRes();

    await requestWithdrawal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const txn = await WalletTransaction.findOne({ ownerId: user._id, category: 'cashout' });
    expect(txn).toBeTruthy();
    expect(txn.amount).toBe(300);
    expect(txn.feeAmount).toBe(6); // 2% of 300
    expect(txn.netPayout).toBe(294); // 300 - 6
  });

  it('blocks customer cashback requests if vendor subscription is EXPIRED', async () => {
    const expiredVendor = await makeVendor({ subscription: { status: 'EXPIRED' } });
    const customer = await makeCustomer();

    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: expiredVendor._id.toString(), amount: '500' },
      file: { filename: 'bill-test.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Cashback blocked due to subscription expiry');
  });

  it('blocks customer cashback requests if vendor wallet balance is 0', async () => {
    const zeroWalletVendor = await makeVendor({ subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) } });
    await Wallet.updateOne({ ownerId: zeroWalletVendor._id, ownerType: 'Vendor' }, { balance: 0 });
    const customer = await makeCustomer();

    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: zeroWalletVendor._id.toString(), amount: '500' },
      file: { filename: 'bill-test.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Cashback blocked due to insufficient cashback wallet balance.');
  });

  it('allows vendor subscription purchase / renewal for Monthly and Yearly plans via wallet payment', async () => {
    await RewardConfig.create({ independentStoreMonthlyPrice: 499, independentStoreYearlyPrice: 4999 });
    const vendor = await makeVendor({ shopType: 'Independent Store' });
    await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', balance: 1000, ownerZeebacId: vendor.zeebacId });

    const req = { user: { id: vendor._id.toString() }, body: { planType: 'Monthly' } };
    const res = makeRes();

    await paySubscriptionFromWallet(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.subscription.planType).toBe('Monthly');
    expect(updatedVendor.subscription.price).toBe(499);
    expect(updatedVendor.subscription.status).toBe('ACTIVE');
    expect(updatedVendor.subscription.expiresAt).toBeTruthy();

    const updatedWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(updatedWallet.balance).toBe(501);
  });
});
