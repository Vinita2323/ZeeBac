import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import { handleRazorpayWebhook } from './webhook.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn() }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const WEBHOOK_SECRET = 'test_webhook_secret_12345';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeVendor = async () => {
  const vendor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Webhook Vendor',
    storeName: 'Webhook Store',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    cashbackRate: 10,
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 1000 });
  return vendor;
};

const makeCustomer = async () => {
  const customer = await User.create({
    zeebacId: `ZBC-${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Webhook Customer',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
  });
  await Wallet.create({ ownerId: customer._id, ownerType: 'User', ownerZeebacId: customer.zeebacId, balance: 0 });
  return customer;
};

const signWebhookPayload = (payloadObj) => {
  const body = JSON.stringify(payloadObj);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  return { body, signature };
};

describe('handleRazorpayWebhook', () => {
  it('rejects payload when signature is missing or invalid', async () => {
    const req = {
      headers: { 'x-razorpay-signature': 'invalid_sig' },
      body: { event: 'payment.captured' },
      rawBody: JSON.stringify({ event: 'payment.captured' }),
    };
    const res = makeRes();

    await handleRazorpayWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Invalid webhook signature' }));
  });

  it('processes payment.captured for customer online payment and credits cashback', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const paymentId = `pay_${Date.now()}_1`;
    const orderId = `order_${Date.now()}_1`;

    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 50000, // ₹500 in paise
            notes: {
              vendorZeebacId: vendor.zeebacId,
              customerId: customer._id.toString(),
            },
          },
        },
      },
    };

    const { body, signature } = signWebhookPayload(payloadObj);
    const req = {
      headers: { 'x-razorpay-signature': signature },
      body: payloadObj,
      rawBody: body,
    };
    const res = makeRes();

    await handleRazorpayWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    // Customer wallet should be credited with ₹50 cashback (10% of ₹500)
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(customerWallet.balance).toBe(50);

    // Vendor wallet should be debited ₹50 (1000 - 50 = 950)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(vendorWallet.balance).toBe(950);

    // Transaction record created
    const tx = await Transaction.findOne({ 'gateway.gatewayPaymentId': paymentId });
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(500);
    expect(tx.cashbackAmount).toBe(50);
  });

  it('handles idempotency gracefully when payment was already processed', async () => {
    const vendor = await makeVendor();
    const customer = await makeCustomer();
    const paymentId = `pay_${Date.now()}_dup`;
    const orderId = `order_${Date.now()}_dup`;

    // Pre-insert transaction as if client verified it first
    await WalletTransaction.create({
      walletId: (await Wallet.findOne({ ownerId: customer._id }))._id,
      ownerId: customer._id,
      ownerType: 'User',
      type: 'credit',
      category: 'cashback',
      amount: 50,
      balanceAfter: 50,
      description: 'Client verified payment',
      gatewayPaymentId: paymentId,
      gatewayOrderId: orderId,
    });

    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 50000,
            notes: {
              vendorZeebacId: vendor.zeebacId,
              customerId: customer._id.toString(),
            },
          },
        },
      },
    };

    const { body, signature } = signWebhookPayload(payloadObj);
    const req = {
      headers: { 'x-razorpay-signature': signature },
      body: payloadObj,
      rawBody: body,
    };
    const res = makeRes();

    await handleRazorpayWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status: 'already_processed' }));
  });

  it('processes payment.failed cleanly', async () => {
    const payloadObj = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_123',
            error_description: 'Payment authentication failed',
          },
        },
      },
    };

    const { body, signature } = signWebhookPayload(payloadObj);
    const req = {
      headers: { 'x-razorpay-signature': signature },
      body: payloadObj,
      rawBody: body,
    };
    const res = makeRes();

    await handleRazorpayWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Payment failure logged' }));
  });
});
