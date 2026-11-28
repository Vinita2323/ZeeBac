import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import Wallet from '../models/Wallet.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import {
  getVendorWallet,
  requestWithdrawal,
  updateVendorUpiId,
} from './vendor.controller.js';
import { claimVendorCashbackReserveUpi } from './order.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);

describe('Vendor Zeebac Points Wallet, Purchase & UPI Claim Suite', () => {
  let vendor;
  let wallet;

  beforeEach(async () => {
    await Vendor.deleteMany({});
    await Wallet.deleteMany({});
    await WithdrawalRequest.deleteMany({});

    vendor = await Vendor.create({
      storeName: 'Shree Krishna General Store',
      ownerName: 'Himanshu Sharma',
      phone: '9876543210',
      email: 'himanshu@example.com',
      zeebacId: 'ZBC-VND-TEST-01',
      status: 'Verified',
      businessType: 'Retailer',
      bankDetails: {
        upiId: 'himanshu@upi',
      },
    });

    wallet = await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 1500,
      purchasedPoints: 1000,
      redeemedPoints: 500,
    });
  });

  const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.data = data;
      return res;
    };
    return res;
  };

  it('1. getVendorWallet returns points wallet with purchased vs redeemed breakdown and UPI ID', async () => {
    const req = { user: { id: vendor._id.toString() } };
    const res = mockRes();

    await getVendorWallet(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.purchasedPoints).toBe(1000);
    expect(res.data.data.redeemedPoints).toBe(500);
    expect(res.data.data.upiId).toBe('himanshu@upi');
    expect(res.data.data.wallet.balance).toBe(1500);
  });

  it('2. claimVendorCashbackReserveUpi purchases points and adds directly to purchasedPoints', async () => {
    const req = {
      user: { id: vendor._id.toString() },
      body: {
        amount: 800,
        utr: '987654321099',
      },
    };
    const res = mockRes();

    await claimVendorCashbackReserveUpi(req, res);

    // Pending until admin approves
    expect(res.statusCode).toBe(202);
    expect(res.data.success).toBe(true);
    expect((await Wallet.findOne({ ownerId: vendor._id })).balance).toBe(1500);

    const { approveTopupRequest } = await import('../utils/pointsTopup.util.js');
    await approveTopupRequest({ requestId: res.data.data.request._id, adminId: vendor._id });
    const updatedWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(updatedWallet.balance).toBe(2300); // 1500 + 800
    expect(updatedWallet.purchasedPoints).toBe(1800); // 1000 + 800
  });

  it('3. rejects claim if vendor tries to claim more than purchasedPoints (attempting to claim redeemed points)', async () => {
    // Vendor has 1000 purchased points, but total balance is 1500 (500 are customer redeemed points)
    const req = {
      user: { id: vendor._id.toString() },
      body: {
        amount: 1200, // Exceeds 1000 purchased points
        upiId: 'himanshu@upi',
      },
    };
    const res = mockRes();

    await requestWithdrawal(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toContain('purchased points');
  });

  it('4. successfully claims purchased points to UPI without requiring bank account or IFSC', async () => {
    const req = {
      user: { id: vendor._id.toString() },
      body: {
        amount: 600,
        upiId: 'himanshu@okicici',
      },
    };
    const res = mockRes();

    await requestWithdrawal(req, res);

    expect([200, 201]).toContain(res.statusCode);
    expect(res.data.success).toBe(true);

    // Verify wallet deduction
    const updatedWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(updatedWallet.balance).toBe(900); // 1500 - 600
    expect(updatedWallet.purchasedPoints).toBe(400); // 1000 - 600
    expect(updatedWallet.redeemedPoints).toBe(500); // Redeemed points untouched

    // Verify WithdrawalRequest has UPI snapshot
    const withdrawal = await WithdrawalRequest.findOne({ vendorId: vendor._id });
    expect(withdrawal).toBeDefined();
    expect(withdrawal.amount).toBe(600);
    expect(withdrawal.bankDetailsSnapshot.upiId).toBe('himanshu@okicici');
    expect(withdrawal.bankDetailsSnapshot.payoutMethod).toBe('UPI');
  });

  it('5. allows vendor to update payout UPI ID via updateVendorUpiId', async () => {
    const req = {
      user: { id: vendor._id.toString() },
      body: {
        upiId: 'store.pay@okhdfcbank',
      },
    };
    const res = mockRes();

    await updateVendorUpiId(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.upiId).toBe('store.pay@okhdfcbank');

    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.bankDetails.upiId).toBe('store.pay@okhdfcbank');
    expect(updatedVendor.upiId).toBe('store.pay@okhdfcbank');
  });
});
