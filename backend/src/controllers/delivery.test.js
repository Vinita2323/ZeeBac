import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import {
  deliveryLogin,
  toggleAvailability,
  getDeliveryOrders,
  acceptDeliveryOrder,
  updateDeliveryOrderStatus,
  getDeliveryHistory,
} from './delivery.controller.js';

vi.mock('../socket/index.js', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
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

const setupDeliveryEnvironment = async () => {
  const vendor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Vendor Owner',
    storeName: 'Zeebac Gourmet Store',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
  });

  const vendorWallet = await Wallet.create({
    ownerId: vendor._id,
    ownerType: 'Vendor',
    ownerZeebacId: vendor.zeebacId,
    balance: 2000, // Prepaid Cashback Reserve Pool
    totalEarned: 2000,
  });

  const customer = await User.create({
    zeebacId: `ZBC-${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Aman Customer',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
  });

  const custWallet = await Wallet.create({
    ownerId: customer._id,
    ownerType: 'User',
    ownerZeebacId: customer.zeebacId,
    balance: 50,
    totalEarned: 50,
  });

  const order = await Order.create({
    orderId: `ZBC-ORD-${Date.now()}`,
    customerId: customer._id,
    customerName: customer.name,
    customerPhone: customer.phone,
    vendorId: vendor._id,
    vendorZeebacId: vendor.zeebacId,
    storeName: vendor.storeName,
    customerDetails: {
      name: customer.name,
      phone: customer.phone,
      deliveryAddress: 'Flat 402, Royal Palms, Hazratganj, Lucknow',
    },
    items: [
      {
        productId: new Vendor()._id,
        name: 'Organic Wheat Flour 5kg',
        price: 300,
        quantity: 1,
        cashbackPercentage: 10,
        cashbackPoints: 30,
      },
    ],
    totalAmount: 300,
    pointsRedeemed: 0,
    finalPayableAmount: 300,
    totalCashbackPoints: 30, // 30 Zeebac Points to be awarded on delivery
    fulfillmentType: 'delivery',
    paymentMethod: 'UPI_INTENT',
    paymentStatus: 'PAID',
    orderStatus: 'PREPARING',
  });

  return { vendor, vendorWallet, customer, custWallet, order };
};

describe('Delivery Partner (Rider) System Suite', () => {
  it('logs in / onboards delivery partner with phone number and returns JWT', async () => {
    const req = {
      body: {
        phone: '9888877777',
        name: 'Raju Rider',
        vehicleType: 'Bike',
        vehicleNo: 'UP32 AB 9999',
      },
    };
    const res = makeRes();

    await deliveryLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.rider.phone).toBe('9888877777');
    expect(body.data.rider.isOnline).toBe(true);
    expect(body.data.rider.status).toBe('AVAILABLE');
  });

  it('toggles rider availability between Online and Offline', async () => {
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1001',
      name: 'Raju Rider',
      phone: '9888877777',
      isOnline: true,
      status: 'AVAILABLE',
    });

    const req = {
      user: { id: rider._id.toString() },
      body: { isOnline: false },
    };
    const res = makeRes();

    await toggleAvailability(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.isOnline).toBe(false);
    expect(body.data.status).toBe('OFFLINE');
  });

  it('fetches available delivery orders and accepts an order with 4-digit OTP generation', async () => {
    const { order } = await setupDeliveryEnvironment();
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1002',
      name: 'Raju Rider',
      phone: '9888877777',
      vehicleNo: 'UP32 ZZ 1111',
      isOnline: true,
      status: 'AVAILABLE',
    });

    // 1. Get orders
    const getReq = { user: { id: rider._id.toString() } };
    const getRes = makeRes();
    await getDeliveryOrders(getReq, getRes);

    const getBody = getRes.json.mock.calls[0][0];
    expect(getBody.data.availableOrders.length).toBeGreaterThan(0);

    // 2. Accept order
    const acceptReq = {
      user: { id: rider._id.toString() },
      params: { id: order._id.toString() },
    };
    const acceptRes = makeRes();
    await acceptDeliveryOrder(acceptReq, acceptRes);

    expect(acceptRes.status).toHaveBeenCalledWith(200);
    const acceptBody = acceptRes.json.mock.calls[0][0];
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.data.order.orderStatus).toBe('RIDER_ASSIGNED');
    expect(acceptBody.data.order.riderDetails.deliveryOtp).toBeDefined();
    expect(acceptBody.data.order.riderDetails.deliveryOtp.length).toBe(4);

    // Verify rider status is BUSY
    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.status).toBe('BUSY');
    expect(updatedRider.activeOrderId.toString()).toBe(order._id.toString());
  });

  it('progresses order to PICKED_UP and completes DELIVERED with OTP verification and automatic settlement', async () => {
    const { order, customer, custWallet, vendorWallet } = await setupDeliveryEnvironment();
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1003',
      name: 'Raju Rider',
      phone: '9888877777',
      vehicleNo: 'UP32 ZZ 2222',
      isOnline: true,
      status: 'AVAILABLE',
    });

    // Accept order
    await acceptDeliveryOrder(
      { user: { id: rider._id.toString() }, params: { id: order._id.toString() } },
      makeRes()
    );

    const assignedOrder = await Order.findById(order._id);
    const deliveryOtp = assignedOrder.riderDetails.deliveryOtp;

    // 1. Mark PICKED_UP
    const pickUpRes = makeRes();
    await updateDeliveryOrderStatus(
      {
        user: { id: rider._id.toString() },
        params: { id: order._id.toString() },
        body: { status: 'PICKED_UP' },
      },
      pickUpRes
    );
    expect(pickUpRes.status).toHaveBeenCalledWith(200);
    expect(pickUpRes.json.mock.calls[0][0].data.order.orderStatus).toBe('OUT_FOR_DELIVERY');

    // 2. Try delivering with wrong OTP -> fails
    const wrongOtpRes = makeRes();
    await updateDeliveryOrderStatus(
      {
        user: { id: rider._id.toString() },
        params: { id: order._id.toString() },
        body: { status: 'DELIVERED', deliveryOtp: '0000' },
      },
      wrongOtpRes
    );
    expect(wrongOtpRes.status).toHaveBeenCalledWith(400);

    // 3. Deliver with correct OTP -> success!
    const deliverRes = makeRes();
    await updateDeliveryOrderStatus(
      {
        user: { id: rider._id.toString() },
        params: { id: order._id.toString() },
        body: { status: 'DELIVERED', deliveryOtp },
      },
      deliverRes
    );
    expect(deliverRes.status).toHaveBeenCalledWith(200);

    // Customer Zeebac Points credited: 50 + 30 = 80 Points
    const updatedCustWallet = await Wallet.findById(custWallet._id);
    expect(updatedCustWallet.balance).toBe(80);

    // Vendor Reserve Pool debited: 2000 - 30 = 1970
    const updatedVendWallet = await Wallet.findById(vendorWallet._id);
    expect(updatedVendWallet.balance).toBe(1970);

    // Rider earnings credited (+₹50 delivery payout) & status reset to AVAILABLE
    const finalRider = await DeliveryPartner.findById(rider._id);
    expect(finalRider.completedDeliveries).toBe(1);
    expect(finalRider.totalEarnings).toBe(50);
    expect(finalRider.status).toBe('AVAILABLE');
    expect(finalRider.activeOrderId).toBeNull();
  });

  it('fetches delivery history with earnings summary', async () => {
    const { order } = await setupDeliveryEnvironment();
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1004',
      name: 'Raju Rider',
      phone: '9888877777',
      totalEarnings: 50,
      completedDeliveries: 1,
    });

    order.riderDetails = {
      name: rider.name,
      phone: rider.phone,
      deliveredAt: new Date(),
    };
    order.orderStatus = 'DELIVERED';
    await order.save();

    const req = { user: { id: rider._id.toString() }, query: {} };
    const res = makeRes();

    await getDeliveryHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.history.length).toBe(1);
    expect(body.data.totalEarnings).toBe(50);
    expect(body.data.totalDeliveries).toBe(1);
  });
});
