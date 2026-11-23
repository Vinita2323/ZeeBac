import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Wallet from '../models/Wallet.js';
import CashbackSettlement from '../models/CashbackSettlement.js';
import {
  getVendorRedemptionCapacity,
  getVendorIssuanceCapacity,
  getVendorSettlementSummary,
  recordCashbackIssuance,
  recordCashbackRedemption,
} from '../utils/cashbackSettlement.util.js';
import { createOrder, updateOrderStatus } from './order.controller.js';
import { logPurchase, getSmartCashbackSettlement } from './vendor.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);

describe('ZEEBAC – SMART CASHBACK & SETTLEMENT SYSTEM SUITE', () => {
  let vendor;
  let customer;
  let product1;
  let product2;
  let customerWallet;

  it('1. Computes Vendor Redemption Capacity accurately according to business formulas', () => {
    // Fresh merchant with default ₹1,000 additional limit
    const freshCapacity = getVendorRedemptionCapacity({
      cashbackIssued: 0,
      cashbackRedeemed: 0,
      additionalRedemptionLimit: 1000,
    });

    expect(freshCapacity.totalCapacity).toBe(1000);
    expect(freshCapacity.remainingCapacity).toBe(1000);
    expect(freshCapacity.canRedeemPoints).toBe(true);
    expect(freshCapacity.netSettlementBalance).toBe(0);
    expect(freshCapacity.settlementStatus).toBe('SETTLED');

    // User's exact example:
    // Cashback Issued: ₹2,000
    // Additional Limit: ₹1,000
    // Total Capacity: ₹3,000
    // Already Redeemed: ₹2,200
    // Remaining Capacity: ₹800
    // Net Balance = 2,000 - 2,200 = -200 (Zeebac owes Merchant)
    const userExample = getVendorRedemptionCapacity({
      cashbackIssued: 2000,
      cashbackRedeemed: 2200,
      additionalRedemptionLimit: 1000,
    });

    expect(userExample.totalCapacity).toBe(3000);
    expect(userExample.remainingCapacity).toBe(800);
    expect(userExample.canRedeemPoints).toBe(true);
    expect(userExample.netSettlementBalance).toBe(-200);
    expect(userExample.settlementStatus).toBe('ZEEBAC_OWES_MERCHANT');

    // Fully exhausted limit: Redeemed = Total Capacity
    const exhaustedCapacity = getVendorRedemptionCapacity({
      cashbackIssued: 500,
      cashbackRedeemed: 1500,
      additionalRedemptionLimit: 1000,
    });
    expect(exhaustedCapacity.remainingCapacity).toBe(0);
    expect(exhaustedCapacity.canRedeemPoints).toBe(false);
  });

  it('2. Seeds Merchant, Customer, Wallet, and Products with cashback percentages', async () => {
    vendor = await Vendor.create({
      zeebacId: 'ZBC-STORE-LUCKNOW',
      storeName: 'Lucknow Mega Supermart',
      ownerName: 'Vipin Kumar',
      phone: '9888877001',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      city: 'Lucknow',
      cashbackRate: 5,
      cashbackIssued: 0,
      cashbackRedeemed: 0,
      additionalRedemptionLimit: 1000, // Welcome limit of 1000 points
      deliverySettings: {
        deliveryCharge: 0,
        packagingCharge: 0,
        freeDeliveryAbove: 0,
      },
      subscription: {
        planType: 'Monthly',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    customer = await User.create({
      zeebacId: 'ZBC-CUST-LKO-101',
      name: 'Rohan Cashback User',
      phone: '9988771122',
      status: 'Active',
      city: 'Lucknow',
    });

    // Seed customer wallet with 500 Zeebac Points
    customerWallet = await Wallet.create({
      ownerId: customer._id,
      ownerType: 'User',
      ownerZeebacId: customer.zeebacId,
      balance: 500,
    });

    // Product 1: 10% Cashback Rate
    product1 = await Product.create({
      vendorId: vendor._id,
      name: 'Premium Basmati Rice 5kg',
      price: 500,
      stock: 50,
      cashbackPercentage: 10,
      isActive: true,
    });

    // Product 2: 5% Cashback Rate
    product2 = await Product.create({
      vendorId: vendor._id,
      name: 'Organic Desi Ghee 1L',
      price: 500,
      stock: 50,
      cashbackPercentage: 5,
      isActive: true,
    });
  });

  it('3. Rejects points redemption when merchant redemption capacity is exhausted', async () => {
    // Exhaust vendor capacity by simulating totalCapacity = 1000 and cashbackRedeemed = 1000
    await Vendor.updateOne({ _id: vendor._id }, { cashbackIssued: 0, cashbackRedeemed: 1000 });

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [{ productId: product1._id.toString(), quantity: 1, price: 500 }],
        redeemPoints: 100, // Try to redeem points
        fulfillmentType: 'pickup',
      },
    };

    let responseStatus;
    let responseData;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => { responseData = data; },
        };
      },
    };

    await createOrder(req, res);

    expect(responseStatus).toBe(400);
    expect(responseData.success).toBe(false);
    expect(responseData.message).toContain("Customer can't redeem points / Reason: Redemption limit reached for this store");
    expect(responseData.reason).toBe('Redemption limit reached');
  });

  it('4. Allows redemption within capacity and calculates cashback strictly on NET PAID amount', async () => {
    // Reset vendor capacity: Total Capacity = 1000 (Issued 0 + Additional 1000)
    await Vendor.updateOne({ _id: vendor._id }, { cashbackIssued: 0, cashbackRedeemed: 0 });

    // Order: 1x Rice (₹500, 10% cb) + 1x Ghee (₹500, 5% cb) = Gross Total ₹1,000
    // Customer redeems 400 Zeebac Points.
    // Net Paid Amount = ₹600.
    // Gross cashback would have been: (500 * 0.10) + (500 * 0.05) = 50 + 25 = 75 points.
    // Pro-rata on actual paid (600 / 1000 = 0.60): 75 * 0.60 = 45 points!
    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [
          { productId: product1._id.toString(), quantity: 1, price: 500, cashbackPercentage: 10 },
          { productId: product2._id.toString(), quantity: 1, price: 500, cashbackPercentage: 5 },
        ],
        redeemPoints: 400,
        fulfillmentType: 'pickup',
        paymentMethod: 'CASH',
      },
    };

    let responseStatus;
    let responseData;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => { responseData = data; },
        };
      },
    };

    await createOrder(req, res);

    expect(responseStatus).toBe(201);
    expect(responseData.success).toBe(true);
    const order = responseData.data.order;

    expect(order.totalAmount).toBe(1000);
    expect(order.pointsRedeemed).toBe(400);
    expect(order.finalPayableAmount).toBe(600);
    // CRITICAL: Cashback is 45 points (calculated on paid ₹600), NOT 75 points!
    expect(order.totalCashbackPoints).toBe(45);

    // Customer wallet deducted by 400 points (500 - 400 = 100)
    const updatedCustWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(updatedCustWallet.balance).toBe(100);

    // Vendor cashbackRedeemed incremented by 400 points
    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.cashbackRedeemed).toBe(400);

    // Check CashbackSettlement record created with type 'REDEEMED'
    const redemptionRecord = await CashbackSettlement.findOne({
      vendorId: vendor._id,
      orderId: order.orderId,
      type: 'REDEEMED',
    });
    expect(redemptionRecord).toBeDefined();
    expect(redemptionRecord.amount).toBe(400);
    expect(redemptionRecord.remainingCapacityAfter).toBe(600); // 1000 - 400 = 600 remaining
  });

  it('5. Yields 0 cashback points when order is 100% paid by Zeebac Points', async () => {
    // Customer has 100 points left. Product costs 100.
    const freeProduct = await Product.create({
      vendorId: vendor._id,
      name: 'Snack Biscuit',
      price: 100,
      stock: 10,
      cashbackPercentage: 10,
      isActive: true,
    });

    const req = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [{ productId: freeProduct._id.toString(), quantity: 1, price: 100, cashbackPercentage: 10 }],
        redeemPoints: 100, // 100% Points payment
        fulfillmentType: 'pickup',
      },
    };

    let responseData;
    const res = {
      status: () => ({
        json: (data) => { responseData = data; },
      }),
    };

    await createOrder(req, res);
    const order = responseData.data.order;

    expect(order.pointsRedeemed).toBe(100);
    expect(order.finalPayableAmount).toBe(0);
    // ZERO actual money was paid, so ZERO cashback points issued!
    expect(order.totalCashbackPoints).toBe(0);
  });

  it('6. On order delivery, credits customer wallet and records cashbackIssued in Merchant Ledger', async () => {
    // Deliver the order from test 4
    const pendingOrder = await Order.findOne({ pointsRedeemed: 400, totalCashbackPoints: 45 });
    expect(pendingOrder).toBeDefined();

    const req = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: pendingOrder.orderId },
      body: { status: 'DELIVERED' },
    };

    let responseStatus;
    let responseData;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => { responseData = data; },
        };
      },
    };

    await updateOrderStatus(req, res);
    expect(responseStatus).toBe(200);

    // Customer wallet received 45 cashback points (balance was 0 after test 5, now 45)
    const deliveredCustWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: 'User' });
    expect(deliveredCustWallet.balance).toBe(45);

    // Vendor cashbackIssued incremented by 45
    const deliveredVendor = await Vendor.findById(vendor._id);
    expect(deliveredVendor.cashbackIssued).toBe(45);

    // Check CashbackSettlement record created with type 'ISSUED'
    const issuanceRecord = await CashbackSettlement.findOne({
      vendorId: vendor._id,
      orderId: pendingOrder.orderId,
      type: 'ISSUED',
    });
    expect(issuanceRecord).toBeDefined();
    expect(issuanceRecord.amount).toBe(45);
    expect(issuanceRecord.eligiblePaidAmount).toBe(600);
  });

  it('7. Smart Cashback Settlement API accurately reports Net Balance and Status', async () => {
    // At this point:
    // Vendor cashbackIssued: 45
    // Vendor cashbackRedeemed: 500 (400 from test 4 + 100 from test 5)
    // Net Balance = 45 - 500 = -455 (Negative -> Zeebac owes Merchant ₹455!)
    // Total Capacity = 45 + 1000 = 1045
    // Remaining Capacity = 1045 - 500 = 545
    const req = {
      user: { id: vendor._id.toString() },
      query: { page: 1, limit: 10 },
    };

    let responseData;
    const res = {
      status: () => ({
        json: (data) => { responseData = data; },
      }),
    };

    await getSmartCashbackSettlement(req, res);
    expect(responseData.success).toBe(true);

    const data = responseData.data;
    expect(data.cashbackIssued).toBe(45);
    expect(data.cashbackRedeemed).toBe(500);
    expect(data.netSettlementBalance).toBe(-455);
    expect(data.settlementStatus).toBe('ZEEBAC_OWES_MERCHANT');
    expect(data.totalCapacity).toBe(1045);
    expect(data.remainingCapacity).toBe(545);
    expect(data.canRedeemPoints).toBe(true);
    expect(data.settlements.length).toBeGreaterThan(0);
    expect(data.rangeStats).toBeDefined();
    expect(data.rangeStats.totalCount).toBeGreaterThan(0);
  });

  it('7b. getSmartCashbackSettlement filters entries by date range and type', async () => {
    const today = new Date().toISOString().split('T')[0];
    const reqFiltered = {
      user: { id: vendor._id.toString() },
      query: {
        page: 1,
        limit: 10,
        startDate: today,
        endDate: today,
        type: 'ISSUED',
      },
    };

    let responseData;
    const res = {
      status: () => ({
        json: (data) => { responseData = data; },
      }),
    };

    await getSmartCashbackSettlement(reqFiltered, res);
    expect(responseData.success).toBe(true);
    expect(responseData.data.settlements).toBeDefined();
    // All returned settlements must be of type 'ISSUED'
    for (const item of responseData.data.settlements) {
      expect(item.type).toBe('ISSUED');
    }
    expect(responseData.data.rangeStats.rangeIssued).toBeGreaterThanOrEqual(0);
  });

  it('8. POS Billing (logPurchase) calculates cashback on net paid amount and updates ledger', async () => {
    // Test POS billing with 20 points redeemed on ₹200 purchase with 10% cashback
    // Net Paid = ₹180 -> 10% cashback = ₹18 (NOT ₹20!)
    const req = {
      user: { id: vendor._id.toString() },
      body: {
        customerZeebacId: customer.zeebacId,
        amount: 200,
        redeemPoints: 20,
        paymentMethod: 'Cash',
        billNumber: 'POS-TEST-101',
        cashbackPercent: 10,
      },
    };

    let responseStatus;
    let responseData;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => { responseData = data; },
        };
      },
    };

    await logPurchase(req, res);
    expect(responseStatus).toBe(201);
    expect(responseData.success).toBe(true);

    // Cashback credited should be ₹18 (calculated on paid ₹180)
    expect(responseData.data.cashbackAmount).toBe(18);
    expect(responseData.data.totalPaid).toBe(180);
    expect(responseData.data.pointsRedeemed).toBe(20);

    // Check ledger recorded
    const posIssuance = await CashbackSettlement.findOne({
      vendorId: vendor._id,
      billNumber: 'POS-TEST-101',
      type: 'ISSUED',
    });
    expect(posIssuance).toBeDefined();
    expect(posIssuance.amount).toBe(18);
  });

  it('9. Calculates 1,000-point Issuance Limit alongside 1,000-point Redemption Limit', () => {
    // A fresh merchant with 0 issued and 0 redeemed
    const fresh = getVendorSettlementSummary({
      cashbackIssued: 0,
      cashbackRedeemed: 0,
      initialIssuanceLimit: 1000,
      additionalRedemptionLimit: 1000,
    });

    expect(fresh.initialIssuanceLimit).toBe(1000);
    expect(fresh.totalIssuanceCapacity).toBe(1000);
    expect(fresh.remainingIssuanceCapacity).toBe(1000);
    expect(fresh.canIssueCashback).toBe(true);

    expect(fresh.additionalRedemptionLimit).toBe(1000);
    expect(fresh.totalRedemptionCapacity).toBe(1000);
    expect(fresh.remainingRedemptionCapacity).toBe(1000);
    expect(fresh.canRedeemPoints).toBe(true);
    expect(fresh.netSettlementBalance).toBe(0);

    // Merchant who has issued 800 and redeemed 300
    const active = getVendorSettlementSummary({
      cashbackIssued: 800,
      cashbackRedeemed: 300,
      initialIssuanceLimit: 1000,
      additionalRedemptionLimit: 1000,
    });

    // Total issuance capacity = 1000 (base) + 300 (redeemed) = 1300
    // Remaining issuance = 1300 - 800 = 500
    expect(active.totalIssuanceCapacity).toBe(1300);
    expect(active.remainingIssuanceCapacity).toBe(500);
    expect(active.canIssueCashback).toBe(true);

    // Total redemption capacity = 800 (issued) + 1000 (buffer) = 1800
    // Remaining redemption = 1800 - 300 = 1500
    expect(active.totalRedemptionCapacity).toBe(1800);
    expect(active.remainingRedemptionCapacity).toBe(1500);
    expect(active.netSettlementBalance).toBe(500); // Merchant owes Zeebac ₹500

    // Merchant who has completely exhausted 1,000-point issuance limit
    const exhaustedIssuance = getVendorSettlementSummary({
      cashbackIssued: 1000,
      cashbackRedeemed: 0,
      initialIssuanceLimit: 1000,
      additionalRedemptionLimit: 1000,
    });
    expect(exhaustedIssuance.remainingIssuanceCapacity).toBe(0);
    expect(exhaustedIssuance.canIssueCashback).toBe(false);
  });

  it('10. logPurchase blocks cashback issuance when merchant reaches 1,000-point issuance limit', async () => {
    // Create a merchant who has exhausted their 1,000-point issuance credit
    const exhaustedVendor = await Vendor.create({
      zeebacId: 'ZBC-STORE-EXHAUSTED',
      storeName: 'Exhausted Limit Store',
      ownerName: 'Amit Shah',
      phone: '9777711223',
      applicationStatus: 'APPROVED',
      isStoreOpen: true,
      city: 'Delhi',
      cashbackRate: 10,
      cashbackIssued: 1000, // Entire 1,000 limit used
      cashbackRedeemed: 0,
      initialIssuanceLimit: 1000,
      additionalRedemptionLimit: 1000,
      subscription: {
        planType: 'Monthly',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    const req = {
      user: { id: exhaustedVendor._id.toString() },
      body: {
        customerZeebacId: customer.zeebacId,
        amount: 500,
        redeemPoints: 0,
        paymentMethod: 'Cash',
        billNumber: 'POS-EXHAUSTED-01',
        cashbackPercent: 10,
      },
    };

    let responseStatus;
    let responseData;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => { responseData = data; },
        };
      },
    };

    await logPurchase(req, res);
    expect(responseStatus).toBe(400);
    expect(responseData.success).toBe(false);
    expect(responseData.reason).toBe('Issuance limit reached');
    expect(responseData.remainingIssuanceCapacity).toBe(0);
  });
});
