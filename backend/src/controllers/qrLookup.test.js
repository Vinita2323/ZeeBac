import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import { lookupVendorById, getMyQrToken } from './user.controller.js';
import { lookupCustomerByPhone, getVendorQrToken } from './vendor.controller.js';
import { signQrToken } from '../utils/qr.util.js';

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

const makeVendor = async () => Vendor.create({
  zeebacId: `ZBV-${Math.floor(Math.random() * 100000)}`,
  ownerName: 'QR Vendor Owner',
  storeName: 'QR Test Store',
  phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
  status: 'Verified',
  cashbackRate: 8,
});

const makeCustomer = async () => User.create({
  zeebacId: `ZBC-${Math.floor(Math.random() * 100000)}`,
  name: 'QR Test Customer',
  phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
  status: 'Active',
});

describe('getVendorQrToken / getMyQrToken', () => {
  it('issues a token that resolves back to the same vendor via lookupVendorById', async () => {
    const vendor = await makeVendor();
    const tokenRes = makeRes();
    await getVendorQrToken({ user: { id: vendor._id.toString() } }, tokenRes);
    const { token } = tokenRes.json.mock.calls[0][0].data;

    const lookupRes = makeRes();
    await lookupVendorById({ params: { query: token } }, lookupRes);

    expect(lookupRes.status).toHaveBeenCalledWith(200);
    const returnedVendor = lookupRes.json.mock.calls[0][0].data;
    expect(returnedVendor.zeebacId).toBe(vendor.zeebacId);
  });

  it('issues a token that resolves back to the same customer via lookupCustomerByPhone', async () => {
    const customer = await makeCustomer();
    const tokenRes = makeRes();
    await getMyQrToken({ user: { id: customer._id.toString() } }, tokenRes);
    const { token } = tokenRes.json.mock.calls[0][0].data;

    const lookupRes = makeRes();
    await lookupCustomerByPhone({ params: { phone: token } }, lookupRes);

    expect(lookupRes.status).toHaveBeenCalledWith(200);
    const returnedCustomer = lookupRes.json.mock.calls[0][0].data;
    expect(returnedCustomer.zeebacId).toBe(customer.zeebacId);
  });
});

describe('lookupVendorById — manual entry still works alongside QR scanning', () => {
  it('resolves a plain typed Zeebac ID (no token involved)', async () => {
    const vendor = await makeVendor();
    const res = makeRes();
    await lookupVendorById({ params: { query: vendor.zeebacId } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a well-formed but wrong-type token (a customer token used where a vendor is expected)', async () => {
    const customer = await makeCustomer();
    const customerToken = signQrToken({ type: 'customer', id: customer._id, zeebacId: customer.zeebacId }, 900);
    const res = makeRes();
    await lookupVendorById({ params: { query: customerToken } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects an expired vendor token with a clear message instead of a 500', async () => {
    const vendor = await makeVendor();
    const expiredToken = signQrToken({ type: 'vendor', id: vendor._id, zeebacId: vendor.zeebacId }, -1);
    const res = makeRes();
    await lookupVendorById({ params: { query: expiredToken } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('lookupCustomerByPhone — manual entry still works alongside QR scanning', () => {
  it('resolves a plain typed phone number (no token involved)', async () => {
    const customer = await makeCustomer();
    const res = makeRes();
    await lookupCustomerByPhone({ params: { phone: customer.phone } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a well-formed but wrong-type token (a vendor token used where a customer is expected)', async () => {
    const vendor = await makeVendor();
    const vendorToken = signQrToken({ type: 'vendor', id: vendor._id, zeebacId: vendor.zeebacId }, 900);
    const res = makeRes();
    await lookupCustomerByPhone({ params: { phone: vendorToken } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
