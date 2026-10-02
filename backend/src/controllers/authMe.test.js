import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { getMe } from './auth.controller.js';
import { setupSecurityPin as setupUserPin } from './user.controller.js';
import { setupSecurityPin as setupVendorPin } from './vendor.controller.js';

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

// Regression coverage for the "Current PIN is required" bug: GET /auth/me
// (called on every app load to restore `currentUser`) used to return the
// raw security subdocument untouched — leaking the bcrypt PIN hash to the
// client and never exposing `hasPin`. The frontend's PIN modal decides
// setup-vs-change from `currentUser.security.hasPin`, so after any reload
// it always fell back to the "setup" form (no Current PIN field) even when
// a PIN already existed in the database, and the backend then correctly
// rejected the request for missing currentPin with no way to supply it.
describe('GET /auth/me — security field sanitization', () => {
  it('customer: computes hasPin and strips the PIN hash when no PIN is set', async () => {
    const user = await User.create({ zeebacId: 'ZBC-ME01', name: 'Neha Verma', phone: '9700000001' });

    const res = mockRes();
    await getMe({ user: { id: user._id.toString(), role: 'customer' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.security.hasPin).toBe(false);
    expect(res.body.data.security.securityPin).toBeUndefined();
  });

  it('customer: reports hasPin true and never leaks the hash once a PIN exists', async () => {
    const user = await User.create({ zeebacId: 'ZBC-ME02', name: 'Arjun Nair', phone: '9700000002' });
    await setupUserPin({ user: { id: user._id.toString() }, body: { pin: '4321' } }, mockRes());

    const res = mockRes();
    await getMe({ user: { id: user._id.toString(), role: 'customer' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.security.hasPin).toBe(true);
    expect(res.body.data.security.securityPin).toBeUndefined();
  });

  it('vendor: computes hasPin and strips the PIN hash when no PIN is set', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-ME01', ownerName: 'Kiran Rao', phone: '9700000003' });

    const res = mockRes();
    await getMe({ user: { id: vendor._id.toString(), role: 'vendor' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.security.hasPin).toBe(false);
    expect(res.body.data.security.securityPin).toBeUndefined();
  });

  it('vendor: reports hasPin true and never leaks the hash once a PIN exists', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-ME02', ownerName: 'Deepika Joshi', phone: '9700000004' });
    await setupVendorPin({ user: { id: vendor._id.toString() }, body: { pin: '9876' } }, mockRes());

    const res = mockRes();
    await getMe({ user: { id: vendor._id.toString(), role: 'vendor' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.security.hasPin).toBe(true);
    expect(res.body.data.security.securityPin).toBeUndefined();
  });

  it('end-to-end: reload (getMe) after first-time setup still allows a correct PIN change afterwards', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-ME03', ownerName: 'Manoj Tiwari', phone: '9700000005' });

    // First-time setup — no currentPin supplied, must succeed.
    const setupRes = mockRes();
    await setupVendorPin({ user: { id: vendor._id.toString() }, body: { pin: '1357' } }, setupRes);
    expect(setupRes.statusCode).toBe(200);

    // Simulate an app reload: the frontend re-fetches the profile via getMe
    // and rebuilds `currentUser.security` entirely from this response.
    const meRes = mockRes();
    await getMe({ user: { id: vendor._id.toString(), role: 'vendor' } }, meRes);
    expect(meRes.body.data.security.hasPin).toBe(true);

    // A follow-up change WITHOUT currentPin must still be correctly rejected
    // (backend stays authoritative — this is not "make currentPin optional").
    const missingCurrentRes = mockRes();
    await setupVendorPin({ user: { id: vendor._id.toString() }, body: { pin: '2468' } }, missingCurrentRes);
    expect(missingCurrentRes.statusCode).toBe(400);
    expect(missingCurrentRes.body.message).toMatch(/Current PIN is required/i);

    // With the correct currentPin (which the UI can now ask for, since
    // hasPin correctly reflects reality after reload), the change succeeds.
    const changeRes = mockRes();
    await setupVendorPin(
      { user: { id: vendor._id.toString() }, body: { pin: '2468', currentPin: '1357' } },
      changeRes
    );
    expect(changeRes.statusCode).toBe(200);

    const updated = await Vendor.findById(vendor._id);
    expect(await bcrypt.compare('2468', updated.security.securityPin)).toBe(true);
    expect(await bcrypt.compare('1357', updated.security.securityPin)).toBe(false);
  });
});
