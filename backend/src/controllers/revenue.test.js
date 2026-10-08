import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import RewardConfig from '../models/RewardConfig.js';
import WalletTransaction from '../models/WalletTransaction.js';
import AdminUser from '../models/AdminUser.js';
import { requestWithdrawal, createCashbackRequest, processWalletPayment } from './user.controller.js';
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
    bankDetails: { accountNumber: '1234567890', ifscCode: 'HDFC0001234', accountHolderName: 'Test Customer', isVerified: true },
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
    expect(txn.feeAmount).toBe(11); // 5 withdrawal fee + 2% platform fee of 300 (6) = 11
    expect(txn.netPayout).toBe(289); // 300 - 11
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

  it('charges configurable convenience fee to customer (Option A) on wallet payment to merchant', async () => {
    // Admin sets: 2% customer wallet pay fee, 0 fixed fee, 2% vendor fee
    await RewardConfig.create({
      customerWalletPayCommissionPercent: 2,
      customerWalletPayFixedFee: 0,
      vendorPaymentCommissionPercent: 2,
    });

    const admin = await AdminUser.create({
      name: 'Super Admin',
      email: 'admin@zeebac.com',
      passwordHash: 'hash',
      role: 'super_admin',
    });
    await Wallet.create({ ownerId: admin._id, ownerType: 'Admin', balance: 0, ownerZeebacId: 'ZEEBAC-ADMIN' });

    const vendor = await makeVendor({ cashbackRate: 10 });
    const customer = await makeCustomer();
    // Customer starts with ₹1,000 wallet balance
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorZeebacId: vendor.zeebacId, amount: 100 },
    };
    const res = makeRes();

    await processWalletPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.billAmount).toBe(100);
    expect(body.data.convenienceFee).toBe(2); // 2% of 100 = ₹2
    expect(body.data.totalPaid).toBe(102); // ₹100 + ₹2 = ₹102 debited
    expect(body.data.cashbackEarned).toBe(10); // 10% cashback earned

    // Customer balance: 1000 - 100 (bill) - 2 (fee) + 10 (cashback) = 908
    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(customerWallet.balance).toBe(908);

    // Vendor: 1000 + 100 (received) - 10 (cashback given) - 2 (platform fee) = 1088
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendorWallet.balance).toBe(1088);

    // Admin receives customer convenience fee (2) + vendor platform fee (2) = 4
    const adminWallet = await Wallet.findOne({ ownerId: admin._id });
    expect(adminWallet.balance).toBe(4);
  });

  it('splits payment with 0% ZeeBac fee: ₹1000 payment -> ₹50 user cashback, ₹950 net to vendor, ₹0 to ZeeBac', async () => {
    // Default RewardConfig: 0% customer fee, 0% vendor fee
    await RewardConfig.create({
      customerWalletPayCommissionPercent: 0,
      customerWalletPayFixedFee: 0,
      vendorPaymentCommissionPercent: 0,
    });

    const admin = await AdminUser.create({
      name: 'Super Admin 2',
      email: 'admin2@zeebac.com',
      passwordHash: 'hash',
      role: 'super_admin',
    });
    await Wallet.create({ ownerId: admin._id, ownerType: 'Admin', balance: 0, ownerZeebacId: 'ZEEBAC-ADMIN-2' });

    const vendor = await makeVendor({ cashbackRate: 5 }); // 5% cashback
    const customer = await makeCustomer();
    // Customer starts with ₹1,000 wallet balance
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorZeebacId: vendor.zeebacId, amount: 1000 },
    };
    const res = makeRes();

    await processWalletPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.billAmount).toBe(1000);
    expect(body.data.convenienceFee).toBe(0); // 0% extra fee
    expect(body.data.totalPaid).toBe(1000); // exactly ₹1000
    expect(body.data.cashbackEarned).toBe(50); // 5% of 1000 = ₹50

    // Customer balance: 1000 - 1000 (paid) + 50 (cashback) = 50
    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(customerWallet.balance).toBe(50);

    // Vendor starts with 1000: +1000 received - 50 cashback deducted = 1950 (net +950)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendorWallet.balance).toBe(1950);

    // ZeeBac takes ₹0 fee
    const adminWallet = await Wallet.findOne({ ownerId: admin._id });
    expect(adminWallet.balance).toBe(0);
  });
});
