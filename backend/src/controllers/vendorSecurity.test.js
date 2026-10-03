import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import { setupSecurityPin, toggleBiometricSecurity, verifySecurityPin, getProfile } from './vendor.controller.js';

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

const makeVendor = (overrides = {}) =>
  Vendor.create({
    zeebacId: overrides.zeebacId || 'ZBV-SEC01',
    ownerName: overrides.ownerName || 'Rohit Sharma',
    phone: overrides.phone || '9711111111',
    ...overrides,
  });

describe('Vendor Biometric Security & PIN Protection', () => {
  it('prevents enabling biometrics without a PIN first (PIN_REQUIRED)', async () => {
    const vendor = await makeVendor({ zeebacId: 'ZBV-SEC01', phone: '9711111111' });

    const req = { user: { id: vendor._id.toString() }, body: { enabled: true } };
    const res = mockRes();

    await toggleBiometricSecurity(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PIN_REQUIRED');
  });

  it('sets up a 4-8 digit security PIN on first-time setup without requiring currentPin', async () => {
    const vendor = await makeVendor({ zeebacId: 'ZBV-SEC02', phone: '9722222222' });

    const req = { user: { id: vendor._id.toString() }, body: { pin: '4567' } };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hasPin).toBe(true);

    const updated = await Vendor.findById(vendor._id);
    expect(updated.security.securityPin).not.toBe('4567');
    const isMatch = await bcrypt.compare('4567', updated.security.securityPin);
    expect(isMatch).toBe(true);
  });

  it('rejects empty new PIN on first-time setup without touching the database', async () => {
    const vendor = await makeVendor({ zeebacId: 'ZBV-SEC03', phone: '9733333333' });

    const req = { user: { id: vendor._id.toString() }, body: { pin: '' } };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);

    const unchanged = await Vendor.findById(vendor._id);
    expect(unchanged.security?.securityPin).toBeFalsy();
  });

  it('rejects a non-numeric PIN on first-time setup without touching the database', async () => {
    const vendor = await makeVendor({ zeebacId: 'ZBV-SEC10', phone: '9700011111' });

    const req = { user: { id: vendor._id.toString() }, body: { pin: 'ab12' } };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);

    const unchanged = await Vendor.findById(vendor._id);
    expect(unchanged.security?.securityPin).toBeFalsy();
  });

  it('requires currentPin when the vendor already has a PIN configured', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC04',
      phone: '9744444444',
      security: { securityPin: await bcrypt.hash('1111', 10) },
    });

    const req = { user: { id: vendor._id.toString() }, body: { pin: '2222' } };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Current PIN is required/i);

    // Database must be untouched — old PIN still verifies
    const unchanged = await Vendor.findById(vendor._id);
    const stillMatchesOld = await bcrypt.compare('1111', unchanged.security.securityPin);
    expect(stillMatchesOld).toBe(true);
  });

  it('rejects an incorrect currentPin on change without updating the database', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC05',
      phone: '9755555555',
      security: { securityPin: await bcrypt.hash('1111', 10) },
    });

    const req = { user: { id: vendor._id.toString() }, body: { pin: '2222', currentPin: '9999' } };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);

    const unchanged = await Vendor.findById(vendor._id);
    const stillMatchesOld = await bcrypt.compare('1111', unchanged.security.securityPin);
    expect(stillMatchesOld).toBe(true);
  });

  it('changes the PIN when the correct currentPin is supplied, and the old PIN stops working', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC06',
      phone: '9766666666',
      security: { securityPin: await bcrypt.hash('1111', 10) },
    });

    const req = { user: { id: vendor._id.toString() }, body: { pin: '2222', currentPin: '1111' } };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Vendor.findById(vendor._id);
    const oldStillMatches = await bcrypt.compare('1111', updated.security.securityPin);
    const newMatches = await bcrypt.compare('2222', updated.security.securityPin);
    expect(oldStillMatches).toBe(false);
    expect(newMatches).toBe(true);
  });

  it('enables biometrics once a PIN is set and persists the credential', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC07',
      phone: '9777777777',
      security: { securityPin: await bcrypt.hash('1234', 10) },
    });

    const req = { user: { id: vendor._id.toString() }, body: { enabled: true, credentialId: 'vendor_cred_abc' } };
    const res = mockRes();

    await toggleBiometricSecurity(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.biometricEnabled).toBe(true);

    const updated = await Vendor.findById(vendor._id);
    expect(updated.security.biometricEnabled).toBe(true);
    expect(updated.security.biometricCredentialId).toBe('vendor_cred_abc');
  });

  it('verifies the security PIN correctly and rejects a wrong one', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC08',
      phone: '9788888888',
      security: { securityPin: await bcrypt.hash('9988', 10), biometricEnabled: true },
    });

    const wrongRes = mockRes();
    await verifySecurityPin({ user: { id: vendor._id.toString() }, body: { pin: '1111' } }, wrongRes);
    expect(wrongRes.statusCode).toBe(401);
    expect(wrongRes.body.success).toBe(false);

    const correctRes = mockRes();
    await verifySecurityPin({ user: { id: vendor._id.toString() }, body: { pin: '9988' } }, correctRes);
    expect(correctRes.statusCode).toBe(200);
    expect(correctRes.body.success).toBe(true);

    // Non-4-digit verification
    const invalidRes = mockRes();
    await verifySecurityPin({ user: { id: vendor._id.toString() }, body: { pin: '123' } }, invalidRes);
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body.message).toBe('Security PIN must be exactly 4 digits');
  });

  it('rejects vendor PIN setup when PIN is not exactly 4 digits', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC10',
      phone: '9711111111',
    });

    const res5 = mockRes();
    await setupSecurityPin({ user: { id: vendor._id.toString() }, body: { pin: '12345' } }, res5);
    expect(res5.statusCode).toBe(400);
    expect(res5.body.message).toBe('Security PIN must be exactly 4 digits');

    const res3 = mockRes();
    await setupSecurityPin({ user: { id: vendor._id.toString() }, body: { pin: '999' } }, res3);
    expect(res3.statusCode).toBe(400);
    expect(res3.body.message).toBe('Security PIN must be exactly 4 digits');
  });

  it('getProfile never exposes the PIN hash, but reports hasPin correctly', async () => {
    const vendor = await makeVendor({
      zeebacId: 'ZBV-SEC09',
      phone: '9799999999',
      security: { securityPin: await bcrypt.hash('7788', 10), biometricEnabled: true },
    });

    const req = { user: { id: vendor._id.toString() } };
    const res = mockRes();

    await getProfile(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.security.hasPin).toBe(true);
    expect(res.body.data.security.securityPin).toBeUndefined();
  });
});
