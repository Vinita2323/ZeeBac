import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import SubscriptionPayment from '../models/SubscriptionPayment.js';
import { searchVendors, createCashbackRequest } from './user.controller.js';
import {
  subscribePlan,
  createSubscriptionRazorpayOrder,
  verifySubscriptionRazorpayPayment,
  cancelSubscriptionRazorpayOrder,
  paySubscriptionFromWallet,
} from './vendor.controller.js';
import { getVendorSubscriptionState, GRACE_PERIOD_MS, calculateNewSubscriptionDates } from '../utils/subscription.util.js';

// Mock Razorpay SDK
vi.mock('../utils/razorpay.util.js', () => ({
  getRazorpayInstance: vi.fn(() => ({
    orders: {
      create: vi.fn(async (options) => ({
        id: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt,
      })),
    },
  })),
  verifyRazorpaySignature: vi.fn((orderId, paymentId, signature) => {
    return signature === 'valid_mock_signature';
  }),
  fetchVerifiedPaymentAmount: vi.fn(async (paymentId) => {
    if (paymentId === 'pay_failed') {
      throw new Error('Payment not captured');
    }
    if (paymentId === 'pay_monthly_indep') return 499;
    if (paymentId === 'pay_yearly_indep') return 4999;
    if (paymentId === 'pay_monthly_brand') return 999;
    if (paymentId === 'pay_yearly_brand') return 9999;
    return 499;
  }),
}));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('Vendor Subscription End-to-End & Payment Flow', () => {
  beforeEach(async () => {
    await SubscriptionPlan.seedDefaultsIfEmpty();
  });

  // 1. Basic Plan Seeding & Discovery Visibility
  it('correctly seeds default Monthly and Yearly plans', async () => {
    const plans = await SubscriptionPlan.find().sort({ durationDays: 1 });
    expect(plans.length).toBe(2);
    expect(plans[0].planType).toBe('Monthly');
    expect(plans[0].pricing.independentStore).toBe(499);
    expect(plans[0].pricing.chainBrand).toBe(999);
    expect(plans[1].planType).toBe('Yearly');
    expect(plans[1].pricing.independentStore).toBe(4999);
    expect(plans[1].pricing.chainBrand).toBe(9999);
  });

  it('hides vendors without an active subscription (status NONE) from search', async () => {
    await Vendor.create({
      zeebacId: 'ZBV-NONE-1',
      storeName: 'Unsubscribed Store',
      ownerName: 'Owner 1',
      phone: '9876543210',
      status: 'Verified',
      subscription: { status: 'NONE' },
    });

    const req = { query: { q: 'Unsubscribed' } };
    const res = makeRes();

    await searchVendors(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data.length).toBe(0);
  });

  it('shows vendors with an ACTIVE subscription in search', async () => {
    await Vendor.create({
      zeebacId: 'ZBV-ACTIVE-1',
      storeName: 'Active Super Store',
      ownerName: 'Owner 2',
      phone: '9876543211',
      status: 'Verified',
      subscription: {
        status: 'ACTIVE',
        planType: 'Monthly',
        price: 499,
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const req = { query: { q: 'Super Store' } };
    const res = makeRes();

    await searchVendors(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data.length).toBe(1);
    expect(data[0].storeName).toBe('Active Super Store');
  });

  it('shows vendors in 24-hour grace period (< 24h expired) in search, but blocks cashback', async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const graceVendor = await Vendor.create({
      zeebacId: 'ZBV-GRACE-1',
      storeName: 'Grace Period Store',
      ownerName: 'Owner 3',
      phone: '9876543212',
      status: 'Verified',
      subscription: {
        status: 'EXPIRED',
        planType: 'Monthly',
        price: 499,
        startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        expiresAt: sixHoursAgo,
        expiredAt: sixHoursAgo,
      },
    });

    await Wallet.create({
      ownerId: graceVendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: graceVendor.zeebacId,
      balance: 1000,
    });

    // 1. Search listing visible
    const searchReq = { query: { q: 'Grace Period' } };
    const searchRes = makeRes();
    await searchVendors(searchReq, searchRes);

    expect(searchRes.status).toHaveBeenCalledWith(200);
    const searchData = searchRes.json.mock.calls[0][0].data;
    expect(searchData.length).toBe(1);

    // 2. Cashback blocked
    const customer = await User.create({
      zeebacId: 'ZBU-CUST-1',
      name: 'Customer 1',
      phone: '9123456780',
      role: 'customer',
      status: 'Active',
    });

    const cashReq = {
      user: { id: customer._id.toString() },
      body: { vendorId: graceVendor._id.toString(), amount: '200' },
      file: { filename: 'bill-grace.jpg' },
    };
    const cashRes = makeRes();

    await createCashbackRequest(cashReq, cashRes);

    expect(cashRes.status).toHaveBeenCalledWith(400);
    expect(cashRes.json.mock.calls[0][0].message).toBe('Cashback blocked due to subscription expiry');
  });

  it('hides vendors whose subscription expired more than 24 hours ago (> 24h expired)', async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await Vendor.create({
      zeebacId: 'ZBV-HIDDEN-1',
      storeName: 'Hidden Expired Store',
      ownerName: 'Owner 4',
      phone: '9876543213',
      status: 'Verified',
      subscription: {
        status: 'EXPIRED',
        planType: 'Monthly',
        price: 499,
        startDate: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
        expiresAt: thirtyHoursAgo,
        expiredAt: thirtyHoursAgo,
      },
    });

    const searchReq = { query: { q: 'Hidden Expired' } };
    const searchRes = makeRes();
    await searchVendors(searchReq, searchRes);

    expect(searchRes.status).toHaveBeenCalledWith(200);
    const searchData = searchRes.json.mock.calls[0][0].data;
    expect(searchData.length).toBe(0);
  });

  it('blocks customer cashback when vendor wallet balance is 0 even if subscription is active', async () => {
    const activeVendor = await Vendor.create({
      zeebacId: 'ZBV-WALLET-0',
      storeName: 'Zero Balance Store',
      ownerName: 'Owner 5',
      phone: '9876543214',
      status: 'Verified',
      subscription: {
        status: 'ACTIVE',
        planType: 'Monthly',
        price: 499,
        startDate: new Date(),
        expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    });

    await Wallet.create({
      ownerId: activeVendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: activeVendor.zeebacId,
      balance: 0,
    });

    const customer = await User.create({
      zeebacId: 'ZBU-CUST-2',
      name: 'Customer 2',
      phone: '9123456781',
      role: 'customer',
      status: 'Active',
    });

    const req = {
      user: { id: customer._id.toString() },
      body: { vendorId: activeVendor._id.toString(), amount: '500' },
      file: { filename: 'bill-zero.jpg' },
    };
    const res = makeRes();

    await createCashbackRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Cashback blocked due to insufficient cashback wallet balance.');
  });

  // 2. Direct Subscribe Shortcut Removal
  it('rejects direct subscribePlan shortcut with HTTP 400', async () => {
    const req = { user: { id: new mongoose.Types.ObjectId() }, body: { planType: 'Monthly' } };
    const res = makeRes();

    await subscribePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('Direct subscription is not permitted');
  });

  // 3. Razorpay Order Creation & Pricing Security
  it('creates Razorpay order for Monthly plan using authoritative backend price', async () => {
    const indepVendor = await Vendor.create({
      zeebacId: 'ZBV-RZP-1',
      storeName: 'Indep Razorpay Store',
      ownerName: 'Indep Owner',
      phone: '9876543215',
      shopType: 'Independent Store',
      status: 'Verified',
    });

    const req = {
      user: { id: indepVendor._id.toString() },
      body: { planType: 'Monthly', fakeAmount: 1 }, // frontend trying to send ₹1
    };
    const res = makeRes();

    await createSubscriptionRazorpayOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data.amount).toBe(499); // Authoritative backend price, not fakeAmount
    expect(data.orderId).toBeTruthy();

    const paymentRecord = await SubscriptionPayment.findOne({ razorpayOrderId: data.orderId });
    expect(paymentRecord).toBeTruthy();
    expect(paymentRecord.paymentStatus).toBe('PENDING');
    expect(paymentRecord.amount).toBe(499);
    expect(paymentRecord.shopType).toBe('Independent Store');
  });

  it('creates Razorpay order for Chain & Brand Yearly plan with correct price', async () => {
    const brandVendor = await Vendor.create({
      zeebacId: 'ZBV-RZP-BRAND',
      storeName: 'Brand Razorpay Store',
      ownerName: 'Brand Owner',
      phone: '9876543216',
      shopType: 'Chain & Brand',
      status: 'Verified',
    });

    const req = {
      user: { id: brandVendor._id.toString() },
      body: { planType: 'Yearly' },
    };
    const res = makeRes();

    await createSubscriptionRazorpayOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data.amount).toBe(9999); // Chain & Brand yearly price
  });

  // 4. Razorpay Signature Verification & Activation
  it('rejects invalid Razorpay signature and does NOT activate subscription', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-RZP-SIG',
      storeName: 'Sig Test Store',
      ownerName: 'Owner Sig',
      phone: '9876543217',
      status: 'Verified',
      subscription: { status: 'NONE' },
    });

    const req = {
      user: { id: vendor._id.toString() },
      body: {
        razorpay_order_id: 'order_test_sig',
        razorpay_payment_id: 'pay_monthly_indep',
        razorpay_signature: 'tampered_signature',
        planType: 'Monthly',
      },
    };
    const res = makeRes();

    await verifySubscriptionRazorpayPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Invalid payment signature');

    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.subscription.status).toBe('NONE'); // not activated
  });

  it('verifies valid Razorpay signature, captures payment, activates subscription, and records transaction', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-RZP-OK',
      storeName: 'Verified RZP Store',
      ownerName: 'Owner OK',
      phone: '9876543218',
      shopType: 'Independent Store',
      status: 'Verified',
      subscription: { status: 'NONE' },
    });

    // 1. Create order
    const orderReq = { user: { id: vendor._id.toString() }, body: { planType: 'Monthly' } };
    const orderRes = makeRes();
    await createSubscriptionRazorpayOrder(orderReq, orderRes);
    const orderId = orderRes.json.mock.calls[0][0].data.orderId;

    // 2. Verify payment
    const verifyReq = {
      user: { id: vendor._id.toString() },
      body: {
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_monthly_indep',
        razorpay_signature: 'valid_mock_signature',
        planType: 'Monthly',
      },
    };
    const verifyRes = makeRes();
    await verifySubscriptionRazorpayPayment(verifyReq, verifyRes);

    expect(verifyRes.status).toHaveBeenCalledWith(200);

    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.subscription.status).toBe('ACTIVE');
    expect(updatedVendor.subscription.planType).toBe('Monthly');
    expect(updatedVendor.subscription.price).toBe(499);
    expect(updatedVendor.subscription.expiresAt).toBeTruthy();

    const paymentRecord = await SubscriptionPayment.findOne({ razorpayOrderId: orderId });
    expect(paymentRecord.paymentStatus).toBe('SUCCESS');
    expect(paymentRecord.paidAt).toBeTruthy();
    expect(paymentRecord.razorpayPaymentId).toBe('pay_monthly_indep');
  });

  it('marks subscription payment as FAILED when cancelSubscriptionRazorpayOrder is called', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-RZP-CANCEL',
      storeName: 'Cancel Store',
      ownerName: 'Owner Cancel',
      phone: '9876543219',
      shopType: 'Independent Store',
      status: 'Verified',
      subscription: { status: 'NONE' },
    });

    const orderReq = { user: { id: vendor._id.toString() }, body: { planType: 'Monthly' } };
    const orderRes = makeRes();
    await createSubscriptionRazorpayOrder(orderReq, orderRes);
    const orderId = orderRes.json.mock.calls[0][0].data.orderId;

    const cancelReq = { body: { razorpay_order_id: orderId, reason: 'Modal dismissed' } };
    const cancelRes = makeRes();
    await cancelSubscriptionRazorpayOrder(cancelReq, cancelRes);

    expect(cancelRes.status).toHaveBeenCalledWith(200);
    const payment = await SubscriptionPayment.findOne({ razorpayOrderId: orderId });
    expect(payment.paymentStatus).toBe('FAILED');
    expect(payment.errorMessage).toBe('Modal dismissed');

    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.subscription.status).toBe('NONE');
  });

  // 5. Pay From Vendor Wallet Flow
  it('rejects wallet subscription purchase when wallet balance is insufficient', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-WLT-LOW',
      storeName: 'Low Balance Store',
      ownerName: 'Low Owner',
      phone: '9876543220',
      shopType: 'Independent Store',
      status: 'Verified',
      subscription: { status: 'NONE' },
    });

    await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 200, // less than ₹499
    });

    const req = { user: { id: vendor._id.toString() }, body: { planType: 'Monthly' } };
    const res = makeRes();

    await paySubscriptionFromWallet(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('Insufficient wallet balance');

    const wallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(wallet.balance).toBe(200); // untouched

    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.subscription.status).toBe('NONE');
  });

  it('atomically deducts balance, creates transactions, and activates subscription on sufficient wallet balance', async () => {
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-WLT-OK',
      storeName: 'Wallet Paid Store',
      ownerName: 'Wallet Owner',
      phone: '9876543221',
      shopType: 'Independent Store',
      status: 'Verified',
      subscription: { status: 'NONE' },
    });

    await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 1500,
    });

    const req = { user: { id: vendor._id.toString() }, body: { planType: 'Monthly' } };
    const res = makeRes();

    await paySubscriptionFromWallet(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const resData = res.json.mock.calls[0][0].data;
    expect(resData.walletBalance).toBe(1001); // 1500 - 499 = 1001

    // Wallet balance deducted in DB
    const wallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    expect(wallet.balance).toBe(1001);

    // Wallet debit ledger row created
    const walletTxn = await WalletTransaction.findOne({ ownerId: vendor._id, category: 'subscription' });
    expect(walletTxn).toBeTruthy();
    expect(walletTxn.amount).toBe(499);
    expect(walletTxn.type).toBe('debit');

    // Subscription payment record created
    const subPayment = await SubscriptionPayment.findOne({ vendorId: vendor._id, paymentMethod: 'WALLET' });
    expect(subPayment).toBeTruthy();
    expect(subPayment.amount).toBe(499);
    expect(subPayment.paymentStatus).toBe('SUCCESS');

    // Vendor subscription activated
    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.subscription.status).toBe('ACTIVE');
    expect(updatedVendor.subscription.planType).toBe('Monthly');
    expect(updatedVendor.subscription.price).toBe(499);
  });

  // 6. Renewal Extension Logic
  it('correctly extends subscription dates without losing days when renewed while active', async () => {
    const now = new Date();
    // 10 days remaining
    const currentExpiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    const currentSub = {
      status: 'ACTIVE',
      planType: 'Monthly',
      startDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
      expiresAt: currentExpiresAt,
    };

    // Renew for Monthly (30 days)
    const newDates = calculateNewSubscriptionDates(currentSub, 30);

    // Expected: currentExpiresAt + 30 days
    const expectedExpires = new Date(currentExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(newDates.expiresAt.getTime()).toBe(expectedExpires.getTime());
    expect(newDates.status).toBe('ACTIVE');
    expect(newDates.expiredAt).toBeNull();
  });
});
