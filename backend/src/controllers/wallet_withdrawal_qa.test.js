import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import Transaction from '../models/Transaction.js';
import { processWalletPayment, requestWithdrawal as userRequestWithdrawal } from './user.controller.js';
import { requestWithdrawal as vendorRequestWithdrawal } from './vendor.controller.js';
import { processPayout } from './admin.controller.js';

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

const makeVerifiedVendor = async (overrides = {}) => Vendor.create({
  zeebacId: 'ZBV-QA' + Math.floor(Math.random() * 100000),
  ownerName: 'QA Vendor', storeName: 'QA Store', phone: '9' + Math.floor(100000000 + Math.random() * 899999999),
  cashbackRate: 10, status: 'Verified',
  location: { type: 'Point', coordinates: [77.2090, 28.6139] },
  subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) },
  bankDetails: { accountHolderName: 'QA Vendor', bankName: 'Test Bank', accountNumber: '123456789012', ifscCode: 'TEST0001234', isVerified: true },
  ...overrides,
});

const makeCustomer = async (overrides = {}) => User.create({
  name: 'QA Customer', phone: '7' + Math.floor(100000000 + Math.random() * 899999999),
  zeebacId: 'ZBC-QA' + Math.floor(Math.random() * 100000), status: 'Active',
  ...overrides,
});

describe('processWalletPayment — duplicate/retry protection (QA regression)', () => {
  it('a retried identical payment within the dedup window returns the SAME transaction instead of debiting twice', async () => {
    const vendor = await makeVerifiedVendor();
    const customer = await makeCustomer();
    await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 1000 });
    await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 5000 });

    const req = { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 } };
    const res1 = mockRes();
    const res2 = mockRes();

    await Promise.all([
      processWalletPayment(req, res1),
      processWalletPayment(req, res2),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body.data.transaction.transactionId).toBe(res2.body.data.transaction.transactionId);

    // Only ONE Transaction record and ONE set of ledger entries should exist
    const txns = await Transaction.find({ customerId: customer._id });
    expect(txns).toHaveLength(1);

    const customerWallet = await Wallet.findOne({ ownerId: customer._id });
    // 1000 - 100 (bill) - 2 (2% default convenience fee) + 10 (10% cashback) = 908 — NOT 816 (which double-processing would produce)
    expect(customerWallet.balance).toBe(908);
  });

  it('blocks payment when wallet balance is insufficient, with no partial wallet movement', async () => {
    const vendor = await makeVerifiedVendor();
    const customer = await makeCustomer();
    await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 50 });

    const req = { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount: 100 } };
    const res = await processWalletPayment(req, mockRes());

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);

    const wallet = await Wallet.findOne({ ownerId: customer._id });
    expect(wallet.balance).toBe(50); // unchanged
    expect(await Transaction.countDocuments({ customerId: customer._id })).toBe(0);
  });

  it('rejects zero and negative amounts', async () => {
    const vendor = await makeVerifiedVendor();
    const customer = await makeCustomer();
    await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 1000 });

    for (const amount of [0, -50]) {
      const res = await processWalletPayment(
        { user: { id: customer._id.toString() }, body: { vendorZeebacId: vendor.zeebacId, amount } },
        mockRes()
      );
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('User requestWithdrawal — bank account gate + duplicate protection (QA regression)', () => {
  // Regression test: the customer-side withdrawal previously had NO check for
  // a linked bank account at all (unlike the vendor side), so a withdrawal
  // could be requested — and the wallet debited — with nowhere for the
  // money to go.
  it('blocks withdrawal with no bank account linked, moving no money', async () => {
    const customer = await makeCustomer();
    await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 1000 });

    const res = await userRequestWithdrawal({ user: { id: customer._id.toString() }, body: { amount: 300 } }, mockRes());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/link.*bank account/i);
    const wallet = await Wallet.findOne({ ownerId: customer._id });
    expect(wallet.balance).toBe(1000); // unchanged
    expect(await WalletTransaction.countDocuments({ ownerId: customer._id, category: 'cashout' })).toBe(0);
  });

  it('two concurrent identical withdrawal requests produce exactly one Pending record, not two', async () => {
    const customer = await makeCustomer({
      bankDetails: { accountHolderName: 'QA Customer', bankName: 'Test Bank', accountNumber: '998877665544', ifscCode: 'TEST0001234', isVerified: true },
    });
    await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 2000 });

    const req = { user: { id: customer._id.toString() }, body: { amount: 300 } };
    const res1 = mockRes();
    const res2 = mockRes();
    await Promise.all([
      userRequestWithdrawal(req, res1),
      userRequestWithdrawal(req, res2),
    ]);

    expect(res1.body.success).toBe(true);
    expect(res2.body.success).toBe(true);
    expect(res1.body.data._id.toString()).toBe(res2.body.data._id.toString()); // same record, not two

    const pending = await WalletTransaction.find({ ownerId: customer._id, category: 'cashout', status: 'Pending' });
    expect(pending).toHaveLength(1);

    const wallet = await Wallet.findOne({ ownerId: customer._id });
    expect(wallet.balance).toBe(1700); // debited exactly once (2000 - 300)
  });
});

describe('Vendor requestWithdrawal — duplicate protection (QA regression)', () => {
  it('two concurrent identical withdrawal requests produce exactly one Pending record, not two', async () => {
    const vendor = await makeVerifiedVendor();
    await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 2000 });

    const req = { user: { id: vendor._id.toString() }, body: { amount: 300 } };
    const res1 = mockRes();
    const res2 = mockRes();
    await Promise.all([
      vendorRequestWithdrawal(req, res1),
      vendorRequestWithdrawal(req, res2),
    ]);

    expect(res1.body.success).toBe(true);
    expect(res2.body.success).toBe(true);
    expect(res1.body.data._id.toString()).toBe(res2.body.data._id.toString());

    const pending = await WithdrawalRequest.find({ vendorId: vendor._id, status: 'Pending' });
    expect(pending).toHaveLength(1);

    const wallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(wallet.balance).toBe(1700);
  });

  it('blocks withdrawal with no bank account linked', async () => {
    const vendor = await makeVerifiedVendor({ bankDetails: {} });
    await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 1000 });

    const res = await vendorRequestWithdrawal({ user: { id: vendor._id.toString() }, body: { amount: 300 } }, mockRes());
    expect(res.statusCode).toBe(400);
    const wallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(wallet.balance).toBe(1000);
  });
});

describe('Admin processPayout — double-approve protection (QA regression)', () => {
  // Regression test: processPayout used to read-then-save (find by id, check
  // status, mutate, save later) with no atomic status transition, so two
  // concurrent "Approve" clicks on the same request could both succeed —
  // the second overwriting the first admin's UTR with no error.
  it('two concurrent Approve clicks on the same user withdrawal: exactly one wins', async () => {
    const customer = await makeCustomer();
    const wallet = await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 700 });
    const tx = await WalletTransaction.create({
      walletId: wallet._id, ownerId: customer._id, ownerType: 'User', type: 'debit',
      category: 'cashout', amount: 300, balanceAfter: 700, status: 'Pending',
      description: 'Bank Withdrawal Request',
    });

    const res1 = mockRes();
    const res2 = mockRes();
    await Promise.all([
      processPayout({ params: { id: tx._id.toString() }, body: { type: 'User', action: 'Approve', transactionId: 'UTR-A' } }, res1),
      processPayout({ params: { id: tx._id.toString() }, body: { type: 'User', action: 'Approve', transactionId: 'UTR-B' } }, res2),
    ]);
    const results = [res1, res2];

    const succeeded = results.filter((r) => r.body.success);
    const failed = results.filter((r) => !r.body.success);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].body.message).toMatch(/already processed/i);

    const finalTx = await WalletTransaction.findById(tx._id);
    expect(finalTx.status).toBe('Success');
    expect(['UTR-A', 'UTR-B']).toContain(finalTx.adminTransactionId); // exactly one UTR recorded, not corrupted
  });

  it('two concurrent Approve clicks on the same vendor withdrawal: exactly one wins', async () => {
    const vendor = await makeVerifiedVendor();
    const wallet = await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 700 });
    const reqDoc = await WithdrawalRequest.create({
      vendorId: vendor._id, amount: 300, status: 'Pending',
      bankDetailsSnapshot: { accountNumber: '123456789012', bankName: 'Test Bank' },
    });
    await WalletTransaction.create({
      walletId: wallet._id, ownerId: vendor._id, ownerType: 'Vendor', type: 'debit',
      category: 'withdrawal', amount: 300, balanceAfter: 700,
      referenceId: reqDoc._id, referenceType: 'WithdrawalRequest', description: 'Withdrawal',
    });

    const res1 = mockRes();
    const res2 = mockRes();
    await Promise.all([
      processPayout({ params: { id: reqDoc._id.toString() }, body: { type: 'Vendor', action: 'Approve', transactionId: 'UTR-A' } }, res1),
      processPayout({ params: { id: reqDoc._id.toString() }, body: { type: 'Vendor', action: 'Approve', transactionId: 'UTR-B' } }, res2),
    ]);
    const results = [res1, res2];

    const succeeded = results.filter((r) => r.body.success);
    expect(succeeded).toHaveLength(1);

    const finalReq = await WithdrawalRequest.findById(reqDoc._id);
    expect(finalReq.status).toBe('Approved');
  });

  it('rejecting a withdrawal refunds the wallet exactly once even under a double-click', async () => {
    const customer = await makeCustomer();
    const wallet = await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 700 });
    const tx = await WalletTransaction.create({
      walletId: wallet._id, ownerId: customer._id, ownerType: 'User', type: 'debit',
      category: 'cashout', amount: 300, balanceAfter: 700, status: 'Pending',
      description: 'Bank Withdrawal Request',
    });

    await Promise.all([
      processPayout({ params: { id: tx._id.toString() }, body: { type: 'User', action: 'Reject' } }, mockRes()),
      processPayout({ params: { id: tx._id.toString() }, body: { type: 'User', action: 'Reject' } }, mockRes()),
    ]);

    const refreshedWallet = await Wallet.findById(wallet._id);
    expect(refreshedWallet.balance).toBe(1000); // refunded exactly once (700 + 300), not 1300
  });
});
