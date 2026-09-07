import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import { refundTransaction, processPayout } from './admin.controller.js';

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

const makeVendor = async () => {
  const vendor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Refund Vendor',
    storeName: 'Refund Store',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    cashbackRate: 10,
  });
  const wallet = await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 1000 });
  return { vendor, wallet };
};

const makeCustomer = async () => {
  const customer = await User.create({
    zeebacId: `ZBC-${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Refund Customer',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
  });
  const wallet = await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 100 });
  return { customer, wallet };
};

describe('refundTransaction (Phase 4 Atomic Reversal)', () => {
  it('refunds an approved transaction by debiting customer cashback and crediting vendor wallet', async () => {
    const { vendor, wallet: vWallet } = await makeVendor();
    const { customer, wallet: cWallet } = await makeCustomer();

    const tx = await Transaction.create({
      transactionId: `TX-${Date.now()}-1`,
      customerId: customer._id,
      customerZeebacId: customer.zeebacId,
      customerPhone: customer.phone,
      customerName: customer.name,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      vendorName: vendor.storeName,
      vendorCategory: 'Retail',
      amount: 500,
      cashbackPercent: 10,
      cashbackAmount: 50,
      type: 'qr_cashback',
      initiatedBy: 'vendor',
      source: 'vendor_scan',
      status: 'Approved',
    });

    const req = { params: { id: tx._id.toString() }, body: { reason: 'Customer requested refund' } };
    const res = makeRes();

    await refundTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Customer wallet debited ₹50 (100 - 50 = 50)
    const updatedCustomerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(updatedCustomerWallet.balance).toBe(50);

    // Vendor wallet credited ₹50 (1000 + 50 = 1050)
    const updatedVendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(updatedVendorWallet.balance).toBe(1050);

    // Transaction marked as Refunded
    const updatedTx = await Transaction.findById(tx._id);
    expect(updatedTx.status).toBe('Refunded');
    expect(updatedTx.refundReason).toBe('Customer requested refund');
  });

  it('rejects refund for transaction that is already refunded or pending', async () => {
    const { vendor } = await makeVendor();
    const { customer } = await makeCustomer();

    const tx = await Transaction.create({
      transactionId: `TX-${Date.now()}-2`,
      customerId: customer._id,
      customerZeebacId: customer.zeebacId,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      amount: 500,
      cashbackPercent: 10,
      cashbackAmount: 50,
      type: 'qr_cashback',
      initiatedBy: 'vendor',
      source: 'vendor_scan',
      status: 'Pending',
    });

    const req = { params: { id: tx._id.toString() }, body: {} };
    const res = makeRes();

    await refundTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

describe('processPayout (Vendor Withdrawal Hardening)', () => {
  it('restores vendor balance atomically and creates a ledger record when withdrawal is rejected', async () => {
    const { vendor, wallet } = await makeVendor();

    const withdrawal = await WithdrawalRequest.create({
      vendorId: vendor._id,
      amount: 300,
      status: 'Pending',
      bankDetails: { upiId: 'vendor@upi' },
    });

    const req = {
      params: { id: withdrawal._id.toString() },
      body: {
        type: 'Vendor',
        action: 'Reject',
        remarks: 'Invalid bank account details',
      },
    };
    const res = makeRes();

    await processPayout(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Withdrawal status updated
    const updatedReq = await WithdrawalRequest.findById(withdrawal._id);
    expect(updatedReq.status).toBe('Rejected');

    // Vendor wallet balance restored (1000 + 300 = 1300)
    const updatedWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(updatedWallet.balance).toBe(1300);

    // Ledger record written
    const ledgerTx = await WalletTransaction.findOne({ referenceId: withdrawal._id, category: 'settlement' });
    expect(ledgerTx).toBeDefined();
    expect(ledgerTx.amount).toBe(300);
    expect(ledgerTx.type).toBe('credit');
  });
});
