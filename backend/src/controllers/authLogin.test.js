import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { customerLogin, vendorLogin, sendOtp } from './auth.controller.js';
import Referral from '../models/Referral.js';
import { setupSecurityPin as setupUserPin } from './user.controller.js';
import { setupSecurityPin as setupVendorPin } from './vendor.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

// Regression coverage: customerLogin/vendorLogin never included `security`
// in their response at all. The app-open PIN/biometric lock reads
// currentUser.security straight from what login() caches, so right after a
// fresh OTP login the lock silently never engaged — until something else
// (e.g. visiting Profile) happened to backfill the local store with a
// complete security object from getMe/getProfile instead, at which point it
// would suddenly start appearing on the next reload. Same bug, two symptoms.
describe('customerLogin / vendorLogin — security field included at login (QA regression)', () => {
  it('customer: login response reports hasPin true and never leaks the hash', async () => {
    const user = await User.create({ zeebacId: 'ZBC-LOGIN01', name: 'Priya Das', phone: '9800000001' });
    await setupUserPin({ user: { id: user._id.toString() }, body: { pin: '1234' } }, mockRes());

    const res = mockRes();
    await customerLogin({ body: { phone: user.phone, otp: '1234' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.security.hasPin).toBe(true);
    expect(res.body.user.security.securityPin).toBeUndefined();
  });

  it('customer: login response reports hasPin false for an account with no PIN set', async () => {
    const user = await User.create({ zeebacId: 'ZBC-LOGIN02', name: 'Rohit Khanna', phone: '9800000002' });

    const res = mockRes();
    await customerLogin({ body: { phone: user.phone, otp: '1234' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.security.hasPin).toBe(false);
    expect(res.body.user.security.biometricEnabled).toBe(false);
  });

  it('vendor: login response reports hasPin true and never leaks the hash', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-LOGIN01', ownerName: 'Sanya Kapoor', phone: '9800000003' });
    await setupVendorPin({ user: { id: vendor._id.toString() }, body: { pin: '5678' } }, mockRes());

    const res = mockRes();
    await vendorLogin({ body: { phone: vendor.phone, otp: '1234' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.vendor.security.hasPin).toBe(true);
    expect(res.body.vendor.security.securityPin).toBeUndefined();
  });
  it('sendOtp: seamlessly sends OTP to a brand new customer without 404', async () => {
    const res = mockRes();
    await sendOtp({ body: { phone: '9899887766', purpose: 'login', role: 'customer' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('customerLogin: auto-creates brand new customer on OTP verification (1-step onboarding)', async () => {
    const referrer = await User.create({ zeebacId: 'ZBC-REF01', name: 'Original User', phone: '9811223344', referralCode: 'ZEEBACORIG150' });

    const res = mockRes();
    await customerLogin({
      body: {
        phone: '9899887766',
        otp: '1234',
        referralCode: 'ZEEBACORIG150',
      }
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.phone).toBe('9899887766');
    expect(res.body.user.zeebacId).toMatch(/^ZBC/);
    expect(res.body.user.referralCode).toBeDefined();

    // Verify User was saved in DB with referrer
    const createdUser = await User.findOne({ phone: '9899887766' });
    expect(createdUser).toBeDefined();
    expect(createdUser.referredBy?.toString()).toBe(referrer._id.toString());

    // Verify Referral document was recorded
    const referralDoc = await Referral.findOne({ referredPhone: '9899887766' });
    expect(referralDoc).toBeDefined();
    expect(referralDoc.referrerCode).toBe('ZEEBACORIG150');
  });
});