import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import CashbackRequest from '../models/CashbackRequest.js';
import { logPurchase, respondToCashbackRequest, updateProfile } from './vendor.controller.js';

// The controllers call sendNotification (Firebase) as a side effect — mock it
// out so tests don't depend on Firebase being configured.
vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn() }));

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
    cashbackRate: 5,
    ...overrides,
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 1000 });
  return vendor;
};

const makeCustomer = async (overrides = {}) => {
  return User.create({
    zeebacId: `ZBC-${Math.floor(Math.random() * 100000)}`,
    name: 'Test Customer',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    ...overrides,
  });
};

describe('logPurchase', () => {
  it('moves cashback from vendor to customer and writes one Transaction', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    const req = { user: { id: vendor._id.toString() }, body: { customerPhone: customer.phone, amount: 1000 } };
    const res = makeRes();

    await logPurchase(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    // 5% of 1000 = 50
    expect(vendorWallet.balance).toBe(950);
    expect(customerWallet.balance).toBe(50);

    const txns = await Transaction.find({ vendorId: vendor._id });
    expect(txns).toHaveLength(1);
    expect(txns[0].status).toBe('Approved');
    expect(txns[0].cashbackAmount).toBe(50);
  });

  it('rejects with 400 and moves no money when the vendor wallet cannot cover the cashback', async () => {
    const vendor = await makeVendor();
    await Wallet.findOneAndUpdate({ ownerId: vendor._id, ownerType: 'Vendor' }, { balance: 1 });
    const customer = await makeCustomer();

    const req = { user: { id: vendor._id.toString() }, body: { customerPhone: customer.phone, amount: 1000 } };
    const res = makeRes();

    await logPurchase(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const txns = await Transaction.find({ vendorId: vendor._id });
    expect(txns).toHaveLength(0);
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(vendorWallet.balance).toBe(1); // untouched
  });
});

describe('respondToCashbackRequest', () => {
  it('pays out exactly once when the same request is approved twice concurrently', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const request = await CashbackRequest.create({
      customerId: customer._id, vendorId: vendor._id, amount: 1000, requestType: 'cash_claim', status: 'Pending',
    });

    const makeReq = () => ({
      params: { id: request._id.toString() },
      body: { action: 'Approve' },
      user: { id: vendor._id.toString() },
    });

    const [res1, res2] = [makeRes(), makeRes()];

    // Fire both concurrently, exactly like a double-tap or a retried request.
    await Promise.all([
      respondToCashbackRequest(makeReq(), res1),
      respondToCashbackRequest(makeReq(), res2),
    ]);

    const statuses = [res1.status.mock.calls[0][0], res2.status.mock.calls[0][0]];
    expect(statuses).toContain(200);
    expect(statuses.filter((s) => s !== 200)).toHaveLength(1); // the loser gets a non-200 ("already processed")

    const txns = await Transaction.find({ vendorId: vendor._id });
    expect(txns).toHaveLength(1); // paid out exactly once, not twice

    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(vendorWallet.balance).toBe(950); // debited once (5% of 1000), not twice
    expect(customerWallet.balance).toBe(50); // credited once, not twice

    const finalRequest = await CashbackRequest.findById(request._id);
    expect(finalRequest.status).toBe('Approved');
  });

  it('rejects a request without moving any money', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const request = await CashbackRequest.create({
      customerId: customer._id, vendorId: vendor._id, amount: 500, requestType: 'cash_claim', status: 'Pending',
    });

    const req = { params: { id: request._id.toString() }, body: { action: 'Reject' }, user: { id: vendor._id.toString() } };
    const res = makeRes();

    await respondToCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const finalRequest = await CashbackRequest.findById(request._id);
    expect(finalRequest.status).toBe('Rejected');
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(vendorWallet.balance).toBe(1000); // untouched
  });
});

describe('updateProfile (Phase 5 Rate Bounds)', () => {
  it('rejects cashback rate updates below shop-type minimums with 400', async () => {
    const brandVendor = await makeVendor({ shopType: 'Chain & Brand', cashbackRate: 5 });
    const req = { user: { id: brandVendor._id.toString() }, body: { cashbackRate: 3 } };
    const res = makeRes();

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('minimum required rate of 5%');
  });

  it('accepts valid cashback rate updates at or above shop-type minimums', async () => {
    const indVendor = await makeVendor({ shopType: 'Independent Store', cashbackRate: 5 });
    const req = { user: { id: indVendor._id.toString() }, body: { cashbackRate: 3 } };
    const res = makeRes();

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const updated = await Vendor.findById(indVendor._id);
    expect(updated.cashbackRate).toBe(3);
  });
});
