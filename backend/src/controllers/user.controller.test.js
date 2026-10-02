import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import CashbackRequest from '../models/CashbackRequest.js';
import RewardConfig from '../models/RewardConfig.js';
import { createCustomerTransaction, createCashbackRequest, updateUserProfile } from './user.controller.js';

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
    cashbackRate: 5,
    subscription: {
      status: 'ACTIVE',
      planType: 'Monthly',
      price: 499,
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    ...overrides,
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 100000 });
  return vendor;
};

const makeCustomer = async (overrides = {}) => {
  return User.create({
    zeebacId: `ZBC-${Math.floor(Math.random() * 100000)}`,
    name: 'Test Customer',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
    ...overrides,
  });
};

describe('updateUserProfile — preferences persistence (QA regression)', () => {
  // Regression test: the "Push Notifications" toggle on the customer Settings
  // screen used to be purely local React state with no API call at all, so it
  // always reset to ON on reload and never reflected what the user chose.
  it('persists a preferences.pushNotifications update and leaves other preferences untouched', async () => {
    const customer = await makeCustomer();

    const res1 = makeRes();
    await updateUserProfile({ user: { id: customer._id.toString() }, body: { preferences: { pushNotifications: false } } }, res1);
    expect(res1.status).toHaveBeenCalledWith(200);
    expect(res1.json.mock.calls[0][0].data.preferences.pushNotifications).toBe(false);
    expect(res1.json.mock.calls[0][0].data.preferences.smsNotifications).toBe(true); // untouched default

    const reloaded = await User.findById(customer._id);
    expect(reloaded.preferences.pushNotifications).toBe(false);

    const res2 = makeRes();
    await updateUserProfile({ user: { id: customer._id.toString() }, body: { preferences: { pushNotifications: true } } }, res2);
    expect(res2.json.mock.calls[0][0].data.preferences.pushNotifications).toBe(true);
  });

  it('ignores a malformed preferences payload instead of corrupting stored preferences', async () => {
    const customer = await makeCustomer();
    const res = makeRes();
    await updateUserProfile({ user: { id: customer._id.toString() }, body: { preferences: 'not-an-object' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const reloaded = await User.findById(customer._id);
    expect(reloaded.preferences.pushNotifications).toBe(true); // schema default, unchanged
  });
});

describe('createCashbackRequest (receipt claim)', () => {
  it('rejects with 400 when no bill photo is attached', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: vendor._id.toString(), amount: '500' },
      file: undefined,
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(await CashbackRequest.countDocuments()).toBe(0);
  });

  it('creates a receipt_claim with the uploaded file path, bill number, and flags amounts >= 2000 as high-value', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: vendor._id.toString(), amount: '2500', paymentMethod: 'UPI', purchaseDate: '2026-01-01', billNumber: 'INV-998822' },
      file: { url: 'https://res.cloudinary.com/zeebac/image/upload/v1/receipts/billImg-123456.jpg', filename: 'billImg-123456.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const request = await CashbackRequest.findOne({ customerId: customer._id });
    expect(request.requestType).toBe('receipt_claim');
    expect(request.billImageUrl).toBe('https://res.cloudinary.com/zeebac/image/upload/v1/receipts/billImg-123456.jpg');
    expect(request.billNumber).toBe('INV-998822');
    expect(request.isHighValue).toBe(true);
  });

  it('does not flag an amount just under the high-value threshold', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: vendor._id.toString(), amount: '1999' },
      file: { url: 'https://res.cloudinary.com/zeebac/image/upload/v1/receipts/billImg-x.jpg', filename: 'billImg-x.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    const request = await CashbackRequest.findOne({ customerId: customer._id });
    expect(request.isHighValue).toBe(false);
  });

  it('computes distance from vendor location when both vendor and customer GPS are available', async () => {
    // Vendor at [longitude, latitude] — roughly central London for round numbers.
    const vendor = await makeVendor({ location: { type: 'Point', coordinates: [-0.1276, 51.5072] } });
    const customer = await makeCustomer();
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: vendor._id.toString(), amount: '300', latitude: '51.5074', longitude: '-0.1278' },
      file: { url: 'https://res.cloudinary.com/zeebac/image/upload/v1/receipts/billImg-y.jpg', filename: 'billImg-y.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    const request = await CashbackRequest.findOne({ customerId: customer._id });
    expect(request.location.coordinates).toEqual([-0.1278, 51.5074]);
    expect(request.distanceFromVendorMeters).toBeLessThan(100); // a couple hundred meters apart at most
  });

  it('does NOT block a claim just because GPS is far from the vendor or missing entirely', async () => {
    const vendor = await makeVendor({ location: { type: 'Point', coordinates: [0, 0] } });
    const customer = await makeCustomer();
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: vendor._id.toString(), amount: '300', latitude: '51.5074', longitude: '-0.1278' }, // far from vendor
      file: { url: 'https://res.cloudinary.com/zeebac/image/upload/v1/receipts/billImg-z.jpg', filename: 'billImg-z.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(201); // still accepted — GPS is advisory only, per product decision
  });
});

describe('createCustomerTransaction (cash claim)', () => {
  it('creates a cash_claim request with no bill photo required', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const req = {
      user: { id: customer._id.toString() },
      body: { vendorZeebacId: vendor.zeebacId, amount: 500, paymentMethod: 'Cash' },
    };
    const res = makeRes();

    await createCustomerTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const request = await CashbackRequest.findOne({ customerId: customer._id });
    expect(request.requestType).toBe('cash_claim');
    expect(request.billImageUrl).toBeUndefined();
  });
});

describe('daily request limit + duplicate detection (shared across both request types)', () => {
  it('rejects a 4th request within 24 hours with 429, after 3 have gone through', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    for (let i = 0; i < 3; i++) {
      const req = { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 + i } };
      await createCustomerTransaction(req, makeRes());
    }
    expect(await CashbackRequest.countDocuments({ customerId: customer._id })).toBe(3);

    const fourthReq = { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 999 } };
    const fourthRes = makeRes();
    await createCustomerTransaction(fourthReq, fourthRes);

    expect(fourthRes.status).toHaveBeenCalledWith(429);
    expect(await CashbackRequest.countDocuments({ customerId: customer._id })).toBe(3); // still 3, the 4th was rejected
  });

  it('rejects an immediate resubmit of the same customer+vendor+amount as a duplicate', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const body = { vendorZeebacId: vendor.zeebacId, amount: 750 };

    await createCustomerTransaction({ user: { id: customer._id.toString() }, body }, makeRes());
    const secondRes = makeRes();
    await createCustomerTransaction({ user: { id: customer._id.toString() }, body }, secondRes);

    expect(secondRes.status).toHaveBeenCalledWith(429);
    expect(await CashbackRequest.countDocuments({ customerId: customer._id })).toBe(1);
  });

  it('does not count another customer’s requests toward this customer’s daily limit', async () => {
    const vendor = await makeVendor();
    const customerA = await makeCustomer();
    const customerB = await makeCustomer();

    for (let i = 0; i < 3; i++) {
      await createCustomerTransaction(
        { user: { id: customerA._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 + i } },
        makeRes()
      );
    }

    const resB = makeRes();
    await createCustomerTransaction(
      { user: { id: customerB._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 500 } },
      resB
    );

    expect(resB.status).toHaveBeenCalledWith(201); // customer B is unaffected by customer A's limit
  });

  // Regression test: the limit used to be one shared pool across every
  // vendor combined, so hitting it at Shop A silently blocked Shop B too —
  // it must be scoped per shop.
  it('hitting the limit at one shop does not block a different shop the same day', async () => {
    const shopA = await makeVendor();
    const shopB = await makeVendor();
    const customer = await makeCustomer();

    for (let i = 0; i < 3; i++) {
      const res = makeRes();
      await createCustomerTransaction(
        { user: { id: customer._id.toString() }, body: { vendorZeebacId: shopA.zeebacId, amount: 100 + i } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(201);
    }
    const fourthAtShopA = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: shopA.zeebacId, amount: 999 } },
      fourthAtShopA
    );
    expect(fourthAtShopA.status).toHaveBeenCalledWith(429); // Shop A's own limit is hit

    const firstAtShopB = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: shopB.zeebacId, amount: 150 } },
      firstAtShopB
    );
    expect(firstAtShopB.status).toHaveBeenCalledWith(201); // Shop B has its own independent limit
  });

  it('honors an admin-configured platform-wide daily limit instead of the hardcoded default', async () => {
    await RewardConfig.create({ dailyCashbackRequestsPerShop: 1 });
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    const first = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 } },
      first
    );
    expect(first.status).toHaveBeenCalledWith(201);

    const second = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 200 } },
      second
    );
    expect(second.status).toHaveBeenCalledWith(429); // configured limit of 1 already reached
  });

  it('allows unlimited requests when dailyCashbackRequestsPerShop is null and no vendor override exists', async () => {
    await RewardConfig.create({ dailyCashbackRequestsPerShop: null });
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    for (const amount of [100, 200, 300, 400, 500]) {
      const res = makeRes();
      await createCustomerTransaction(
        { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(201);
    }
  });

  it('a per-vendor override takes precedence over the platform-wide default', async () => {
    await RewardConfig.create({ dailyCashbackRequestsPerShop: 3 });
    const vendor = await makeVendor({ dailyRequestLimitOverride: 1 });
    const customer = await makeCustomer();

    const first = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 } },
      first
    );
    expect(first.status).toHaveBeenCalledWith(201);

    const second = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 200 } },
      second
    );
    expect(second.status).toHaveBeenCalledWith(429); // vendor override of 1, even though platform default is 3
  });

  // A resubmission to the same vendor auto-cancels the customer's own
  // earlier Pending request (see createCustomerTransaction), so the limit
  // must count every genuine submission attempt regardless of what
  // eventually happened to it — otherwise resubmitting indefinitely (each
  // one cancelling the last) would never consume the daily quota at all.
  it('every submission attempt counts toward the limit, even ones later rejected or auto-cancelled', async () => {
    await RewardConfig.create({ dailyCashbackRequestsPerShop: 2 });
    const vendor = await makeVendor();
    const customer = await makeCustomer();

    const first = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 } },
      first
    );
    expect(first.status).toHaveBeenCalledWith(201);
    const firstRequestId = first.json.mock.calls[0][0].data.requestId;
    await CashbackRequest.findByIdAndUpdate(firstRequestId, { status: 'Rejected' });

    // Second attempt still goes through (1 prior attempt < limit of 2) —
    // this also auto-cancels nothing here since the first is already Rejected.
    const second = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 200 } },
      second
    );
    expect(second.status).toHaveBeenCalledWith(201);

    // Third attempt is blocked — 2 prior attempts have been made today for
    // this shop, regardless of the first one being rejected.
    const third = makeRes();
    await createCustomerTransaction(
      { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 300 } },
      third
    );
    expect(third.status).toHaveBeenCalledWith(429);
  });
});
