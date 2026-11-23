import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import DeliveryPartner from '../models/DeliveryPartner.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';
import Order from '../models/Order.js';
import {
  toggleAvailability,
  getDeliveryOrders,
  acceptDeliveryOrder,
  updateDeliveryOrderStatus,
  getDeliveryEarnings,
  withdrawDeliveryEarnings,
  depositDeliveryCash,
  adminSettleRiderCash,
} from './delivery.controller.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Set default config with 1500 limit
  await DeliveryPayoutConfig.create({
    baseFare: 30,
    perKmRate: 10,
    minPayout: 30,
    maxCashInHandLimit: 1500,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Rider Floating COD Cash-In-Hand & Withdrawal Lock Suite', () => {
  let rider;
  let codOrder;
  const dummyCustId = new mongoose.Types.ObjectId();
  const dummyVendId = new mongoose.Types.ObjectId();

  it('delivering a COD order increases rider cashInHand and auto-pauses when limit exceeded', async () => {
    rider = await DeliveryPartner.create({
      riderId: 'DLV-COD-1',
      name: 'Ramesh Rider',
      phone: '9988776655',
      applicationStatus: 'APPROVED',
      isOnline: true,
      cashInHand: 1200,
      totalEarnings: 800,
      maxCashLimit: 1500,
      bankDetails: { upiId: 'ramesh@okaxis' },
    });

    codOrder = await Order.create({
      orderId: 'ZBC-COD-01',
      customerId: dummyCustId,
      customerName: 'Aman User',
      customerPhone: '9888877777',
      vendorId: dummyVendId,
      vendorZeebacId: 'ZBC-V-101',
      storeName: 'Shree Shyama',
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'Paneer Butter Masala', quantity: 1, price: 400 }],
      totalAmount: 400,
      finalPayableAmount: 400,
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      orderStatus: 'PICKED_UP',
      assignedDeliveryPartner: rider._id,
      riderDetails: {
        riderId: rider._id,
        name: rider.name,
        phone: rider.phone,
        status: 'ACCEPTED',
        deliveryOtp: '5678',
        pickupOtp: '1234',
      },
      pickupOtp: '1234',
      deliveryOtp: '5678',
      deliveryPayout: 50,
      deliveryDistanceKm: 2,
    });

    const req = {
      user: { id: rider._id.toString() },
      params: { id: codOrder._id.toString() },
      body: { status: 'DELIVERED', deliveryOtp: '5678' },
    };

    let statusCode;
    let resData;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      },
    };

    await updateDeliveryOrderStatus(req, res);
    expect(statusCode).toBe(200);
    expect(resData.success).toBe(true);
    expect(resData.data.cashInHand).toBe(1600); // 1200 + 400 = 1600

    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.cashInHand).toBe(1600);
    // Since 1600 >= 1500, duty is paused (isOnline = false)
    expect(updatedRider.isOnline).toBe(false);
  });

  it('blocks rider from going online when cash limit exceeded', async () => {
    const req = {
      user: { id: rider._id.toString() },
      body: { isOnline: true },
    };

    let statusCode;
    let resData;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      },
    };

    await toggleAvailability(req, res);
    expect(statusCode).toBe(403);
    expect(resData.success).toBe(false);
    expect(resData.code).toBe('CASH_LIMIT_EXCEEDED');
  });

  it('blocks order list and accepting orders when cash limit reached', async () => {
    const newOrder = await Order.create({
      orderId: 'ZBC-NEW-02',
      customerId: dummyCustId,
      customerName: 'Aman User',
      customerPhone: '9888877777',
      vendorId: dummyVendId,
      vendorZeebacId: 'ZBC-V-101',
      storeName: 'Shree Shyama',
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'Paneer Kulcha', quantity: 1, price: 300 }],
      totalAmount: 300,
      finalPayableAmount: 300,
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      orderStatus: 'READY_FOR_PICKUP',
      deliveryPayout: 40,
    });

    const reqOrders = { user: { id: rider._id.toString() } };
    let getCode;
    let getData;
    const resOrders = {
      status(c) { getCode = c; return this; },
      json(d) { getData = d; return this; },
    };

    await getDeliveryOrders(reqOrders, resOrders);
    expect(getCode).toBe(200);
    expect(getData.data.isCashLimitReached).toBe(true);
    expect(getData.data.availableOrders).toEqual([]); // empty because limit exceeded

    // Try accepting order directly
    const reqAccept = {
      user: { id: rider._id.toString() },
      params: { id: newOrder._id.toString() },
    };
    let acceptCode;
    let acceptData;
    const resAccept = {
      status(c) { acceptCode = c; return this; },
      json(d) { acceptData = d; return this; },
    };

    await acceptDeliveryOrder(reqAccept, resAccept);
    expect(acceptCode).toBe(403);
    expect(acceptData.code).toBe('CASH_LIMIT_EXCEEDED');
  });

  it('locks withdrawal of earnings while cashInHand > 0', async () => {
    const req = {
      user: { id: rider._id.toString() },
      body: { amount: 200 },
    };

    let statusCode;
    let resData;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      },
    };

    await withdrawDeliveryEarnings(req, res);
    expect(statusCode).toBe(403);
    expect(resData.success).toBe(false);
    expect(resData.code).toBe('CASH_IN_HAND_PENDING');
  });

  it('allows rider to deposit cash via EARNINGS_DEDUCTION or UPI and unlocks withdrawals', async () => {
    // Deposit 500 from pocket earnings
    const reqDep = {
      user: { id: rider._id.toString() },
      body: { amount: 500, method: 'EARNINGS_DEDUCTION' },
    };

    let depCode;
    let depData;
    const resDep = {
      status(c) { depCode = c; return this; },
      json(d) { depData = d; return this; },
    };

    await depositDeliveryCash(reqDep, resDep);
    expect(depCode).toBe(200);
    expect(depData.success).toBe(true);
    expect(depData.data.cashInHand).toBe(1100); // 1600 - 500 = 1100 (< 1500 limit)
    expect(depData.data.isCashLimitReached).toBe(false);

    // Now Admin settles the remaining ₹1100 cash collected at hub
    const reqAdminSettle = {
      params: { id: rider._id.toString() },
      body: { amount: 1100, note: 'Received cash in office drawer' },
    };
    let adminCode;
    let adminData;
    const resAdmin = {
      status(c) { adminCode = c; return this; },
      json(d) { adminData = d; return this; },
    };

    await adminSettleRiderCash(reqAdminSettle, resAdmin);
    expect(adminCode).toBe(200);
    expect(adminData.success).toBe(true);
    expect(adminData.data.cashInHand).toBe(0);

    // Rider cashInHand is 0, now withdrawal is unlocked!
    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.cashInHand).toBe(0);

    // Verify getDeliveryEarnings reports canWithdraw = true
    const reqEarn = { user: { id: rider._id.toString() } };
    let earnCode;
    let earnData;
    const resEarn = {
      status(c) { earnCode = c; return this; },
      json(d) { earnData = d; return this; },
    };

    await getDeliveryEarnings(reqEarn, resEarn);
    expect(earnCode).toBe(200);
    expect(earnData.data.cashInHand).toBe(0);
    expect(earnData.data.canWithdraw).toBe(true);
    expect(earnData.data.isCashLimitReached).toBe(false);
  });
});
