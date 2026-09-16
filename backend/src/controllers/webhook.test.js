import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import { handleRazorpayWebhook } from './webhook.controller.js';
import { claimUpiCashbackByUtr } from './user.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn().mockResolvedValue({}) }));
import { sendNotification } from '../services/notification.service.js';

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

const makeVendor = async (custom = {}) => {
  const vendor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Webhook Vendor',
    storeName: 'Webhook Store',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    cashbackRate: 10,
    subscription: {
      planType: '1 Month',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
    ...custom,
  });
  await Wallet.create({ ownerId: vendor._id, ownerType: 'Vendor', ownerZeebacId: vendor.zeebacId, balance: 1000 });
  return vendor;
};

const makeCustomer = async (phone = null) => {
  const customer = await User.create({
    zeebacId: `ZBC-${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Webhook Customer',
    phone: phone || `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
    role: 'customer',
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

  it('automatically credits cashback when customer pays via PhonePe UPI without customerId in notes', async () => {
    const vendor = await makeVendor();
    const customerPhone = '9335812345';
    const customer = await makeCustomer(customerPhone);
    const paymentId = `pay_phonepe_${Date.now()}`;
    const orderId = `order_phonepe_${Date.now()}`;

    // Direct PhonePe scan at counter QR: notes only has vendorZeebacId (no customerId!)
    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 50000, // ₹500
            vpa: `${customerPhone}@ybl`, // PhonePe UPI ID format
            notes: {
              vendorZeebacId: vendor.zeebacId,
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        type: 'customer_purchase',
        registered: true,
        cashbackAmount: 50,
      }),
    }));

    // Customer wallet credited ₹50
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(customerWallet.balance).toBe(50);

    // Vendor wallet debited ₹50 (1000 - 50 = 950)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(vendorWallet.balance).toBe(950);

    // Approved Transaction created
    const tx = await Transaction.findOne({ 'gateway.gatewayPaymentId': paymentId });
    expect(tx).toBeDefined();
    expect(tx.status).toBe('Approved');
    expect(tx.source).toBe('upi_qr_scan');
    expect(tx.customerPhone).toBe(customerPhone);
    expect(tx.cashbackAmount).toBe(50);

    // Notification dispatched to customer: "Aapko Webhook Store se ₹50 cashback mila!"
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: customer._id,
      recipientType: 'customer',
      title: 'Cashback Received! 💸',
      message: `Aapko ${vendor.storeName} se ₹50 cashback mila!`,
    }));
  });

  it('records payment for vendor with ₹0 cashback when customer is NOT registered in ZeeBac', async () => {
    const vendor = await makeVendor();
    const unregisteredPhone = '9876543210';
    const paymentId = `pay_paytm_${Date.now()}`;
    const orderId = `order_paytm_${Date.now()}`;

    // Direct Paytm scan at counter QR: phone is not registered in ZeeBac
    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 50000, // ₹500
            vpa: `${unregisteredPhone}@paytm`, // Paytm UPI ID format
            notes: {
              vendorZeebacId: vendor.zeebacId,
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        type: 'customer_purchase',
        registered: false,
        cashbackAmount: 0,
      }),
    }));

    // Vendor wallet remains 1000 (NO cashback debited!)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(vendorWallet.balance).toBe(1000);

    // Approved Transaction created for guest
    const tx = await Transaction.findOne({ 'gateway.gatewayPaymentId': paymentId });
    expect(tx).toBeDefined();
    expect(tx.status).toBe('Approved');
    expect(tx.source).toBe('upi_qr_scan');
    expect(tx.customerId).toBeNull();
    expect(tx.customerPhone).toBe(unregisteredPhone);
    expect(tx.cashbackAmount).toBe(0);

    // Vendor notified of unregistered payment with no cashback debited
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: vendor._id,
      recipientType: 'vendor',
      title: 'Payment Received (Unregistered Customer)',
    }));
  });

  it('matches customer via Google Pay contact number with +91 prefix and credits cashback', async () => {
    const vendor = await makeVendor();
    const customerPhone = '9335899999';
    const customer = await makeCustomer(customerPhone);
    const paymentId = `pay_gpay_${Date.now()}`;
    const orderId = `order_gpay_${Date.now()}`;

    // Google Pay: bank VPA (no phone in handle) but gateway provides contact with +91
    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 30000, // ₹300
            contact: `+91${customerPhone}`,
            vpa: 'john.smith@okaxis',
            notes: {
              vendorZeebacId: vendor.zeebacId,
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

    // Customer wallet credited with ₹30 (10% of ₹300)
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(customerWallet.balance).toBe(30);

    // Vendor wallet debited ₹30 (1000 - 30 = 970)
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(vendorWallet.balance).toBe(970);
  });

  describe('claimUpiCashbackByUtr (GPay Backup Flow)', () => {
    it('allows a customer to claim cashback using the 12-digit UPI UTR when GPay hides contact', async () => {
      const vendor = await makeVendor();
      const customer = await makeCustomer();
      const utr12Digit = '425598761234';
      const paymentId = `pay_gpay_hidden_${Date.now()}`;
      const orderId = `order_gpay_hidden_${Date.now()}`;

      // 1. Payment captured via webhook with hidden/missing customer contact
      const payloadObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 50000, // ₹500
              vpa: 'randomuser@okhdfcbank', // GPay bank VPA without phone
              contact: null, // Hidden phone
              acquirer_data: {
                rrn: utr12Digit, // 12-digit bank reference number
              },
              notes: {
                vendorZeebacId: vendor.zeebacId,
              },
            },
          },
        },
      };

      const { body, signature } = signWebhookPayload(payloadObj);
      const webhookReq = {
        headers: { 'x-razorpay-signature': signature },
        body: payloadObj,
        rawBody: body,
      };
      const webhookRes = makeRes();

      await handleRazorpayWebhook(webhookReq, webhookRes);

      expect(webhookRes.status).toHaveBeenCalledWith(200);

      // Verify transaction was recorded with UTR and ₹0 initial cashback
      const savedTx = await Transaction.findOne({ 'gateway.utr': utr12Digit });
      expect(savedTx).toBeDefined();
      expect(savedTx.customerId).toBeNull();
      expect(savedTx.cashbackAmount).toBe(0);

      // 2. Customer opens ZeeBac app and enters the 12-digit UPI UTR to claim cashback
      const claimReq = {
        user: { id: customer._id.toString() },
        body: { utr: utr12Digit },
      };
      const claimRes = makeRes();

      await claimUpiCashbackByUtr(claimReq, claimRes);

      expect(claimRes.status).toHaveBeenCalledWith(200);
      expect(claimRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          cashbackEarned: 50,
          vendorName: vendor.storeName,
        }),
      }));

      // Customer wallet credited with ₹50 (10% of ₹500)
      const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
      expect(customerWallet.balance).toBe(50);

      // Vendor wallet debited with ₹50 (1000 - 50 = 950)
      const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
      expect(vendorWallet.balance).toBe(950);

      // Transaction updated to customer with Approved status
      const updatedTx = await Transaction.findOne({ 'gateway.utr': utr12Digit });
      expect(updatedTx.customerId.toString()).toBe(customer._id.toString());
      expect(updatedTx.customerPhone).toBe(customer.phone);
      expect(updatedTx.cashbackAmount).toBe(50);
      expect(updatedTx.source).toBe('upi_utr_claim');

      // Notification sent to customer
      expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
        recipientId: customer._id,
        recipientType: 'customer',
        title: 'Cashback Claimed! 💸',
        message: `Aapko ${vendor.storeName} se ₹50 cashback mila!`,
      }));
    });

    it('rejects duplicate attempts to claim the same UPI UTR', async () => {
      const vendor = await makeVendor();
      const customer1 = await makeCustomer();
      const customer2 = await makeCustomer();
      const utr12Digit = '425511223344';

      // Seed a transaction that was already claimed
      await Transaction.create({
        transactionId: `TX-CLAIMED-${Date.now()}`,
        customerId: customer1._id,
        customerZeebacId: customer1.zeebacId,
        customerPhone: customer1.phone,
        vendorId: vendor._id,
        vendorZeebacId: vendor.zeebacId,
        vendorName: vendor.storeName,
        amount: 400,
        cashbackPercent: 10,
        cashbackAmount: 40,
        type: 'qr_cashback',
        initiatedBy: 'customer',
        source: 'upi_utr_claim',
        status: 'Approved',
        paymentMethod: 'UPI',
        gateway: {
          gatewayName: 'Razorpay',
          gatewayPaymentId: 'pay_already_claimed',
          utr: utr12Digit,
        },
      });

      const claimReq = {
        user: { id: customer2._id.toString() },
        body: { utr: utr12Digit },
      };
      const claimRes = makeRes();

      await claimUpiCashbackByUtr(claimReq, claimRes);

      expect(claimRes.status).toHaveBeenCalledWith(400);
      expect(claimRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringMatching(/already been claimed/i),
      }));
    });

    it('returns 404 when UPI UTR is not found in the system', async () => {
      const customer = await makeCustomer();
      const claimReq = {
        user: { id: customer._id.toString() },
        body: { utr: '999999999999' },
      };
      const claimRes = makeRes();

      await claimUpiCashbackByUtr(claimReq, claimRes);

      expect(claimRes.status).toHaveBeenCalledWith(404);
      expect(claimRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringMatching(/no payment found/i),
      }));
    });
  });
});
