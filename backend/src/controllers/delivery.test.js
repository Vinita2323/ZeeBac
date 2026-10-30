import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import {
  deliveryRegister,
  deliveryLogin,
  getDeliveryStatus,
  resubmitApplication,
  toggleAvailability,
  getDeliveryOrders,
  acceptDeliveryOrder,
  updateDeliveryOrderStatus,
  getDeliveryHistory,
  getDeliveryEarnings,
  adminApproveDeliveryPartner,
  adminRejectDeliveryPartner,
  adminSuspendDeliveryPartner,
  adminReactivateDeliveryPartner,
  adminAssignDeliveryOrder,
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
    totalCashbackPoints: 30, // 30 Zeebac Points awarded on delivery
    fulfillmentType: 'delivery',
    paymentMethod: 'UPI_INTENT',
    paymentStatus: 'PAID',
    orderStatus: 'PREPARING',
  });

  return { vendor, vendorWallet, customer, custWallet, order };
};

describe('Production Delivery Partner (Rider) & Admin Suite', () => {
  it('registers a new delivery partner and sets status to PENDING_REVIEW', async () => {
    const req = {
      body: {
        name: 'Raju Sharma',
        phone: '9888877777',
        email: 'raju@example.com',
        vehicleType: 'Bike',
        vehicleNo: 'UP32 AB 1234',
        vehicleModel: 'Hero Splendor',
        address: {
          street: '12 Vikas Nagar',
          city: 'Lucknow',
          pincode: '226022',
        },
        documents: {
          aadhaarNo: '123456789012',
          drivingLicenceNo: 'UP3220200001234',
        },
        bankDetails: {
          accountHolderName: 'Raju Sharma',
          bankName: 'SBI',
          accountNumber: '12345678901',
          ifscCode: 'SBIN0001234',
          upiId: 'raju@upi',
        },
      },
    };
    const res = makeRes();

    await deliveryRegister(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.rider.applicationStatus).toBe('PENDING_REVIEW');
    expect(body.data.rider.isOnline).toBe(false);
  });

  it('rejects unregistered mobile on login with 404', async () => {
    const req = { body: { phone: '9000000000' } };
    const res = makeRes();

    await deliveryLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.isRegistered).toBe(false);
  });

  it('logs in an existing partner and returns JWT token and rider details', async () => {
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1001',
      name: 'Raju Sharma',
      phone: '9888877777',
      applicationStatus: 'APPROVED',
      isOnline: false,
    });

    const req = { body: { phone: '9888877777' } };
    const res = makeRes();

    await deliveryLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.rider.riderId).toBe('DLV-1001');
  });

  it('admin approves delivery partner and rider is then allowed to go online', async () => {
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1002',
      name: 'Mohit Verma',
      phone: '9777766666',
      applicationStatus: 'PENDING_REVIEW',
      isOnline: false,
    });

    // 1. Try toggling availability while PENDING_REVIEW -> must fail with 403
    const unapprovedReq = {
      user: { id: rider._id.toString() },
      body: { isOnline: true },
    };
    const unapprovedRes = makeRes();
    await toggleAvailability(unapprovedReq, unapprovedRes);
    expect(unapprovedRes.status).toHaveBeenCalledWith(403);

    // 2. Admin approves partner
    const adminReq = {
      user: { id: 'admin123', name: 'Super Admin' },
      params: { id: rider._id.toString() },
      body: {},
    };
    const adminRes = makeRes();
    await adminApproveDeliveryPartner(adminReq, adminRes);
    expect(adminRes.status).toHaveBeenCalledWith(200);

    // 3. Partner can now go online!
    const approvedRes = makeRes();
    await toggleAvailability(unapprovedReq, approvedRes);
    expect(approvedRes.status).toHaveBeenCalledWith(200);
    expect(approvedRes.json.mock.calls[0][0].data.isOnline).toBe(true);
  });

  it('fetches available delivery orders and accepts an order with 4-digit OTP generation', async () => {
    const { order } = await setupDeliveryEnvironment();
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1003',
      name: 'Suresh Kumar',
      phone: '9666655555',
      vehicleNo: 'UP32 ZZ 1111',
      applicationStatus: 'APPROVED',
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

  it('progresses order through ARRIVED_AT_PICKUP, PICKED_UP and DELIVERED with OTP verification and automatic settlement', async () => {
    const { order, customer, custWallet, vendorWallet } = await setupDeliveryEnvironment();
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1004',
      name: 'Vikas Singh',
      phone: '9555544444',
      vehicleNo: 'UP32 ZZ 2222',
      applicationStatus: 'APPROVED',
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

    // 1. Mark ARRIVED_AT_PICKUP
    const arrivedRes = makeRes();
    await updateDeliveryOrderStatus(
      {
        user: { id: rider._id.toString() },
        params: { id: order._id.toString() },
        body: { status: 'ARRIVED_AT_PICKUP' },
      },
      arrivedRes
    );
    expect(arrivedRes.status).toHaveBeenCalledWith(200);
    expect(arrivedRes.json.mock.calls[0][0].data.order.orderStatus).toBe('ARRIVED_AT_PICKUP');

    // 2. Mark PICKED_UP
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

    // 3. Try delivering with wrong OTP -> fails
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

    // 4. Deliver with correct OTP -> success!
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

  it('fetches delivery earnings breakdown and ledger records', async () => {
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1005',
      name: 'Deepak Yadav',
      phone: '9444433333',
      totalEarnings: 150,
      completedDeliveries: 3,
      earningsLedger: [
        { amount: 50, date: new Date(), description: 'Order delivery payout' },
        { amount: 50, date: new Date(), description: 'Order delivery payout' },
        { amount: 50, date: new Date(), description: 'Order delivery payout' },
      ],
      bankDetails: { upiId: 'deepak@upi' },
    });

    const req = { user: { id: rider._id.toString() } };
    const res = makeRes();

    await getDeliveryEarnings(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.totalEarnings).toBe(150);
    expect(body.data.totalCompletedDeliveries).toBe(3);
    expect(body.data.ledger.length).toBe(3);
    expect(body.data.bankDetails.upiId).toBe('deepak@upi');
  });

  it('admin suspends a partner and prevents further order handling', async () => {
    const rider = await DeliveryPartner.create({
      riderId: 'DLV-1006',
      name: 'Bad Rider',
      phone: '9333322222',
      applicationStatus: 'APPROVED',
      isOnline: true,
      status: 'AVAILABLE',
    });

    const suspendReq = {
      user: { id: 'admin1', name: 'Admin User' },
      params: { id: rider._id.toString() },
      body: { reason: 'Customer fraud reported' },
    };
    const suspendRes = makeRes();

    await adminSuspendDeliveryPartner(suspendReq, suspendRes);

    expect(suspendRes.status).toHaveBeenCalledWith(200);
    const updated = await DeliveryPartner.findById(rider._id);
    expect(updated.applicationStatus).toBe('SUSPENDED');
    expect(updated.isSuspended).toBe(true);
    expect(updated.isOnline).toBe(false);
  });
});
