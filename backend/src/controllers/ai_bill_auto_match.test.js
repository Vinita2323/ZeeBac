import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Wallet from '../models/Wallet.js';
import PosBill from '../models/PosBill.js';
import CashbackRequest from '../models/CashbackRequest.js';
import Transaction from '../models/Transaction.js';
import { createPosBill } from './pos.controller.js';
import { createCashbackRequest } from './user.controller.js';
import { authenticatePosOrVendor } from '../middlewares/auth.middleware.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn() }));
vi.mock('../utils/adminNotification.js', () => ({ notifyAdmins: vi.fn().mockResolvedValue({}) }));

vi.mock('tesseract.js', () => {
  const recognize = vi.fn().mockImplementation(async (buffer) => {
    let text = '';
    if (buffer && Buffer.isBuffer(buffer)) {
      text = buffer.toString('utf-8');
    } else if (typeof buffer === 'string') {
      text = buffer;
    }
    return {
      data: {
        text,
        confidence: 95,
      },
    };
  });
  return {
    default: { recognize },
    recognize,
  };
});

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = vi.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data) => {
    res.body = data;
    return res;
  });
  return res;
};

describe('AI POS Bill Auto-Verification & Instant Cashback Approval Suite', () => {
  beforeAll(connectTestDb, 60000);
  afterAll(disconnectTestDb, 60000);
  afterEach(async () => {
    await clearCollections();
  });

  const setupBaseVendorAndCustomer = async (vendorOverrides = {}, customerOverrides = {}) => {
    const vendor = await Vendor.create({
      zeebacId: vendorOverrides.zeebacId || 'ZB-STORE-A',
      ownerName: 'Vendor Owner A',
      storeName: vendorOverrides.storeName || 'Store A',
      phone: vendorOverrides.phone || '9811122233',
      email: vendorOverrides.email || 'vendorA@test.com',
      password: 'hashedpassword',
      cashbackRate: vendorOverrides.cashbackRate || 10,
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      location: { type: 'Point', coordinates: [80.94, 26.85] },
      ...vendorOverrides,
    });

    await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: vendorOverrides.walletBalance !== undefined ? vendorOverrides.walletBalance : 5000,
    });

    const customer = await User.create({
      phone: customerOverrides.phone || '9876501234',
      name: customerOverrides.name || 'Rohan Sharma',
      zeebacId: customerOverrides.zeebacId || 'ZB-CUST-01',
      status: 'Active',
      ...customerOverrides,
    });

    await Wallet.create({
      ownerId: customer._id,
      ownerType: 'User',
      ownerZeebacId: customer.zeebacId,
      balance: customerOverrides.walletBalance !== undefined ? customerOverrides.walletBalance : 100,
    });

    return { vendor, customer };
  };

  // TEST A — Normal valid flow
  it('TEST A: Normal valid flow auto-approves cashback, credits customer, debits vendor, and claims PosBill', async () => {
    const { vendor, customer } = await setupBaseVendorAndCustomer();

    // Vendor creates POS Bill
    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        billCode: 'INV1001',
        invoiceNumber: 'INV1001',
      },
    };
    const posRes = mockRes();
    await createPosBill(posReq, posRes);
    expect(posRes.statusCode).toBe(201);

    // Customer uploads valid receipt image with matching invoice text & amount
    const validReceiptText = 'STORE A\nTAX INVOICE NO: INV1001\nTOTAL AMOUNT: ₹500.00\nTHANK YOU';
    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV1001',
        description: 'Test purchase',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from(validReceiptText),
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/test-receipt.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    expect(userRes.statusCode).toBe(201);
    expect(userRes.body.success).toBe(true);
    expect(userRes.body.autoApproved).toBe(true);
    expect(userRes.body.cashbackEarned).toBe(50); // 10% of 500

    // PosBill marked as CLAIMED
    const claimedPos = await PosBill.findOne({ billCode: 'INV1001' });
    expect(claimedPos.status).toBe('CLAIMED');
    expect(claimedPos.claimedBy.toString()).toBe(customer._id.toString());

    // Customer wallet credited (+50 -> 150)
    const custWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(custWallet.balance).toBe(150);

    // Vendor wallet debited (-50 -> 4950)
    const vendWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendWallet.balance).toBe(4950);

    // Transaction created as Approved
    const txn = await Transaction.findOne({ customerId: customer._id });
    expect(txn.status).toBe('Approved');
    expect(txn.cashbackAmount).toBe(50);
  });

  // TEST B — Cross-vendor attack
  it('TEST B: Cross-vendor bill matching attack is blocked (Vendor A bill submitted for Vendor B)', async () => {
    const { vendor: vendorA, customer } = await setupBaseVendorAndCustomer(
      {
        zeebacId: 'ZB-STORE-A',
        storeName: 'Vendor Store A',
        phone: '9811122201',
        email: 'vendorA@test.com',
      },
      {
        zeebacId: 'ZB-CUST-01',
        phone: '9876501234',
      }
    );

    const vendorB = await Vendor.create({
      zeebacId: 'ZB-STORE-B',
      ownerName: 'Vendor Owner B',
      storeName: 'Vendor Store B',
      phone: '9811122202',
      email: 'vendorB@test.com',
      password: 'hashedpassword',
      cashbackRate: 10,
      subscription: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      location: { type: 'Point', coordinates: [80.94, 26.85] },
    });
    await Wallet.create({ ownerId: vendorB._id, ownerType: 'Vendor', ownerZeebacId: vendorB.zeebacId, balance: 5000 });

    // POS bill belongs to Vendor A
    const posReq = {
      body: {
        vendorZeebacId: vendorA.zeebacId,
        amount: 500,
        billCode: 'INV-A-1001',
        invoiceNumber: 'INV-A-1001',
      },
    };
    const posRes = mockRes();
    await createPosBill(posReq, posRes);
    expect(posRes.statusCode).toBe(201);

    // Customer submits cashback request claiming Vendor A bill against Vendor B!
    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendorB._id.toString(), // target Vendor B
        amount: '500',
        billNumber: 'INV-A-1001', // Vendor A's bill
        description: 'Cross-vendor attempt',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from('TAX INVOICE NO: INV-A-1001 TOTAL: 500'),
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/test-receipt.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    expect(userRes.statusCode).toBe(201);
    // MUST NOT auto-approve
    expect(userRes.body.autoApproved).toBe(false);

    // Vendor A wallet MUST NOT be debited
    const walletA = await Wallet.findOne({ ownerId: vendorA._id });
    expect(walletA.balance).toBe(5000);

    // Vendor B wallet MUST NOT be debited
    const walletB = await Wallet.findOne({ ownerId: vendorB._id });
    expect(walletB.balance).toBe(5000);

    // Customer wallet MUST NOT be credited
    const custWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(custWallet.balance).toBe(100);

    // PosBill of Vendor A MUST remain UNCLAIMED
    const posBillA = await PosBill.findOne({ billCode: 'INV-A-1001' });
    expect(posBillA.status).toBe('UNCLAIMED');
  });

  // TEST C — Fake image
  it('TEST C: Fake/blank image does NOT auto-approve even with valid invoice number entered', async () => {
    const { vendor, customer } = await setupBaseVendorAndCustomer();

    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        billCode: 'INV-REAL-100',
        invoiceNumber: 'INV-REAL-100',
      },
    };
    await createPosBill(posReq, mockRes());

    // Customer enters valid bill number, but uploads completely unrelated / blank image
    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV-REAL-100',
        description: 'Fake image upload',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from('Hello this is a photo of a cute puppy without any invoice or number'),
        filename: 'puppy.jpg',
        url: 'https://cloudinary.com/puppy.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    expect(userRes.statusCode).toBe(201);
    // MUST NOT auto-approve because OCR does not corroborate invoice number
    expect(userRes.body.autoApproved).toBe(false);

    // Bill remains UNCLAIMED
    const posBill = await PosBill.findOne({ billCode: 'INV-REAL-100' });
    expect(posBill.status).toBe('UNCLAIMED');

    // Customer wallet not credited
    const custWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(custWallet.balance).toBe(100);
  });

  // TEST D — Already claimed bill
  it('TEST D: Already claimed POS bill is hard-rejected with 400 and NOT placed in pending', async () => {
    const { vendor, customer } = await setupBaseVendorAndCustomer();

    // Setup POS Bill already marked CLAIMED
    await PosBill.create({
      billCode: 'INV-CLAIMED-99',
      invoiceNumber: 'INV-CLAIMED-99',
      vendorZeebacId: vendor.zeebacId,
      vendor: vendor._id,
      amount: 500,
      cashbackRate: 10,
      status: 'CLAIMED',
      claimedBy: customer._id,
      claimedAt: new Date(Date.now() - 3600000),
    });

    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV-CLAIMED-99',
        description: 'Trying to claim again',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from('TAX INVOICE NO: INV-CLAIMED-99 TOTAL: 500'),
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/test-receipt.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    // Must return HTTP 400 with alreadyClaimed flag
    expect(userRes.statusCode).toBe(400);
    expect(userRes.body.success).toBe(false);
    expect(userRes.body.alreadyClaimed).toBe(true);

    // No pending CashbackRequest should exist for this attempt
    const pendingReq = await CashbackRequest.findOne({ billNumber: 'INV-CLAIMED-99', status: 'Pending' });
    expect(pendingReq).toBeNull();
  });

  // TEST E — Concurrent claim
  it('TEST E: Concurrent claims for the same POS bill allow only ONE successful claim', async () => {
    const { vendor, customer: cust1 } = await setupBaseVendorAndCustomer();
    const cust2 = await User.create({
      phone: '9876599999',
      name: 'Second Customer',
      zeebacId: 'ZB-CUST-02',
      status: 'Active',
    });
    await Wallet.create({ ownerId: cust2._id, ownerType: 'User', ownerZeebacId: cust2.zeebacId, balance: 50 });

    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 800,
        billCode: 'INV-RACE-01',
        invoiceNumber: 'INV-RACE-01',
      },
    };
    await createPosBill(posReq, mockRes());

    const receiptBuffer = Buffer.from('TAX INVOICE NO: INV-RACE-01 TOTAL: 800');

    const req1 = {
      user: { id: cust1._id },
      body: { vendorId: vendor._id.toString(), amount: '800', billNumber: 'INV-RACE-01', paymentMethod: 'UPI' },
      file: { buffer: receiptBuffer, filename: 'receipt.jpg', url: 'https://cloudinary.com/receipt.jpg' },
    };
    const res1 = mockRes();

    const req2 = {
      user: { id: cust2._id },
      body: { vendorId: vendor._id.toString(), amount: '800', billNumber: 'INV-RACE-01', paymentMethod: 'UPI' },
      file: { buffer: receiptBuffer, filename: 'receipt.jpg', url: 'https://cloudinary.com/receipt.jpg' },
    };
    const res2 = mockRes();

    // Execute concurrently
    await Promise.all([
      createCashbackRequest(req1, res1),
      createCashbackRequest(req2, res2),
    ]);

    const autoApprovedCount = [res1.body?.autoApproved, res2.body?.autoApproved].filter(Boolean).length;

    // Exactly one must be auto-approved
    expect(autoApprovedCount).toBe(1);

    // The other request must be rejected or not auto-approved
    const claimedBills = await PosBill.find({ billCode: 'INV-RACE-01', status: 'CLAIMED' });
    expect(claimedBills.length).toBe(1);

    // Vendor wallet debited exactly once (10% of 800 = 80; 5000 - 80 = 4920)
    const vendWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendWallet.balance).toBe(4920);
  });

  // TEST F — Amount mismatch
  it('TEST F: Amount mismatch between customer input and POS bill blocks auto-approval', async () => {
    const { vendor, customer } = await setupBaseVendorAndCustomer();

    // POS bill is ₹500
    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        billCode: 'INV-AMT-500',
        invoiceNumber: 'INV-AMT-500',
      },
    };
    await createPosBill(posReq, mockRes());

    // Customer enters ₹5,000 for ₹500 bill
    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '5000', // 10x mismatch
        billNumber: 'INV-AMT-500',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from('TAX INVOICE NO: INV-AMT-500 TOTAL: 500'),
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/receipt.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    expect(userRes.statusCode).toBe(201);
    // Must NOT auto-approve
    expect(userRes.body.autoApproved).toBe(false);

    // POS bill remains UNCLAIMED
    const posBill = await PosBill.findOne({ billCode: 'INV-AMT-500' });
    expect(posBill.status).toBe('UNCLAIMED');

    // Vendor wallet not debited
    const vendWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendWallet.balance).toBe(5000);
  });

  // TEST G — Insufficient vendor wallet
  it('TEST G: Insufficient vendor wallet balance prevents auto-approval and rolls back atomically', async () => {
    // Vendor has only ₹10 balance, but cashback would be ₹50
    const { vendor, customer } = await setupBaseVendorAndCustomer({ walletBalance: 10 });

    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        billCode: 'INV-LOW-BAL',
        invoiceNumber: 'INV-LOW-BAL',
      },
    };
    await createPosBill(posReq, mockRes());

    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV-LOW-BAL',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from('TAX INVOICE NO: INV-LOW-BAL TOTAL: 500'),
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/receipt.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    expect(userRes.statusCode).toBe(201);
    // Auto-approval failed gracefully, fallback to pending review
    expect(userRes.body.autoApproved).toBe(false);

    // POS bill must NOT be marked CLAIMED
    const posBill = await PosBill.findOne({ billCode: 'INV-LOW-BAL' });
    expect(posBill.status).toBe('UNCLAIMED');

    // Balances unchanged
    const vendWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(vendWallet.balance).toBe(10);
    const custWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(custWallet.balance).toBe(100);
  });

  // TEST H — Unauthenticated POS bill creation
  it('TEST H: Unauthenticated POS bill creation is rejected by authenticatePosOrVendor middleware', async () => {
    const unauthReq = {
      headers: {},
      query: {},
      body: { vendorZeebacId: 'ZB-STORE-A', amount: 500 },
    };
    const unauthRes = mockRes();
    const nextFn = vi.fn();

    await authenticatePosOrVendor(unauthReq, unauthRes, nextFn);

    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.body.success).toBe(false);
    expect(nextFn).not.toHaveBeenCalled();
  });

  // TEST I — Expired bill
  it('TEST I: Expired POS bill is rejected and cannot be claimed', async () => {
    const { vendor, customer } = await setupBaseVendorAndCustomer();

    // Create expired bill
    await PosBill.create({
      billCode: 'INV-EXPIRED-99',
      invoiceNumber: 'INV-EXPIRED-99',
      vendorZeebacId: vendor.zeebacId,
      vendor: vendor._id,
      amount: 500,
      cashbackRate: 10,
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
    });

    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV-EXPIRED-99',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: Buffer.from('TAX INVOICE NO: INV-EXPIRED-99 TOTAL: 500'),
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/receipt.jpg',
      },
    };
    const userRes = mockRes();
    await createCashbackRequest(userReq, userRes);

    expect(userRes.statusCode).toBe(400);
    expect(userRes.body.success).toBe(false);
    expect(userRes.body.isExpired).toBe(true);
  });

  // TEST J — Retry after successful approval
  it('TEST J: Retrying the same bill after successful cashback is hard-rejected', async () => {
    const { vendor, customer } = await setupBaseVendorAndCustomer();

    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        billCode: 'INV-RETRY-01',
        invoiceNumber: 'INV-RETRY-01',
      },
    };
    await createPosBill(posReq, mockRes());

    const receiptBuffer = Buffer.from('TAX INVOICE NO: INV-RETRY-01 TOTAL: 500');
    const userReq = {
      user: { id: customer._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV-RETRY-01',
        paymentMethod: 'UPI',
      },
      file: {
        buffer: receiptBuffer,
        filename: 'receipt.jpg',
        url: 'https://cloudinary.com/receipt.jpg',
      },
    };

    // First attempt succeeds
    const res1 = mockRes();
    await createCashbackRequest(userReq, res1);
    expect(res1.statusCode).toBe(201);
    expect(res1.body.autoApproved).toBe(true);

    // Second retry attempt by same customer (blocked: duplicate request 429 or 400)
    const res2 = mockRes();
    await createCashbackRequest(userReq, res2);
    expect([400, 429]).toContain(res2.statusCode);
    expect(res2.body.success).toBe(false);

    // Third retry attempt by another customer for the same claimed bill
    const custRetry = await User.create({
      phone: '9876588888',
      name: 'Retry Customer',
      zeebacId: 'ZB-CUST-RETRY',
      status: 'Active',
    });
    await Wallet.create({ ownerId: custRetry._id, ownerType: 'User', ownerZeebacId: custRetry.zeebacId, balance: 100 });

    const retryReq = {
      user: { id: custRetry._id },
      body: {
        vendorId: vendor._id.toString(),
        amount: '500',
        billNumber: 'INV-RETRY-01',
        paymentMethod: 'UPI',
      },
      file: { buffer: receiptBuffer, filename: 'receipt.jpg', url: 'https://cloudinary.com/receipt.jpg' },
    };
    const res3 = mockRes();
    await createCashbackRequest(retryReq, res3);

    expect(res3.statusCode).toBe(400);
    expect(res3.body.success).toBe(false);
    expect(res3.body.alreadyClaimed).toBe(true);

    // Exactly one transaction created across all attempts
    const txnCount = await Transaction.countDocuments({ amount: 500, status: 'Approved' });
    expect(txnCount).toBe(1);
  });
});
