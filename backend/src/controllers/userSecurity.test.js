import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import User from '../models/User.js';
import { setupSecurityPin, toggleBiometricSecurity, verifySecurityPin, getUserProfile } from './user.controller.js';

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

describe('User Biometric Security & PIN Protection', () => {
  it('prevents enabling biometrics without a PIN first (PIN_REQUIRED)', async () => {
    const user = await User.create({
      zeebacId: 'ZBC-SEC01',
      name: 'Pawan Kumar',
      phone: '9811111111',
    });

    const req = {
      user: { id: user._id.toString() },
      body: { enabled: true },
    };
    const res = mockRes();

    await toggleBiometricSecurity(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PIN_REQUIRED');
  });

  it('sets up a 4-8 digit security PIN and saves hashed PIN in database', async () => {
    const user = await User.create({
      zeebacId: 'ZBC-SEC02',
      name: 'Simran Kaur',
      phone: '9822222222',
    });

    const req = {
      user: { id: user._id.toString() },
      body: { pin: '4567' },
    };
    const res = mockRes();

    await setupSecurityPin(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hasPin).toBe(true);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.security.securityPin).not.toBe('4567');
    const isMatch = await bcrypt.compare('4567', updatedUser.security.securityPin);
    expect(isMatch).toBe(true);
  });

  it('enables biometrics once PIN is set and saves biometricEnabled flag', async () => {
    const user = await User.create({
      zeebacId: 'ZBC-SEC03',
      name: 'Anjali Gupta',
      phone: '9833333333',
      security: {
        securityPin: await bcrypt.hash('1234', 10),
      },
    });

    const req = {
      user: { id: user._id.toString() },
      body: { enabled: true, credentialId: 'test_cred_id_abc123' },
    };
    const res = mockRes();

    await toggleBiometricSecurity(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.biometricEnabled).toBe(true);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.security.biometricEnabled).toBe(true);
    expect(updatedUser.security.biometricCredentialId).toBe('test_cred_id_abc123');
  });

  it('verifies security PIN successfully when correct, and rejects incorrect PIN', async () => {
    const user = await User.create({
      zeebacId: 'ZBC-SEC04',
      name: 'Vikram Seth',
      phone: '9844444444',
      security: {
        securityPin: await bcrypt.hash('9988', 10),
        biometricEnabled: true,
      },
    });

    // 1. Wrong PIN
    const wrongReq = {
      user: { id: user._id.toString() },
      body: { pin: '1111' },
    };
    const wrongRes = mockRes();
    await verifySecurityPin(wrongReq, wrongRes);
    expect(wrongRes.statusCode).toBe(401);
    expect(wrongRes.body.success).toBe(false);

    // 2. Correct PIN
    const correctReq = {
      user: { id: user._id.toString() },
      body: { pin: '9988' },
    };
    const correctRes = mockRes();
    await verifySecurityPin(correctReq, correctRes);
    expect(correctRes.statusCode).toBe(200);
    expect(correctRes.body.success).toBe(true);
  });

  it('getUserProfile does not expose plaintext or hashed PIN, but returns hasPin boolean', async () => {
    const user = await User.create({
      zeebacId: 'ZBC-SEC05',
      name: 'Sunita Mehra',
      phone: '9855555555',
      security: {
        securityPin: await bcrypt.hash('7788', 10),
        biometricEnabled: true,
      },
    });

    const req = {
      user: { id: user._id.toString() },
    };
    const res = mockRes();

    await getUserProfile(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.security.hasPin).toBe(true);
    expect(res.body.data.security.securityPin).toBeUndefined();
  });
});
