import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Wallet from '../models/Wallet.js';
import Order from '../models/Order.js';
import {
  createOrder,
  verifyOrderUpiPayment,
  assignRider,
  updateOrderStatus,
  createVendorCashbackReserveUpiIntent,
  claimVendorCashbackReserveUpi,
} from './order.controller.js';

vi.mock('../services/notification.service.js', () => ({ sendNotification: vi.fn().mockResolvedValue(true) }));
vi.mock('../socket/socket.js', () => ({
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

const setupStoreAndCustomer = async () => {
  const vendor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Test Merchant',
    storeName: 'ZeeBac Supermarket',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    cashbackRate: 5,
    bankDetails: {
      upiId: 'supermarket@upi',
      isVerified: true,
    },
  });

  const vendorWallet = await Wallet.create({
    ownerId: vendor._id,
    ownerType: 'Vendor',
    ownerZeebacId: vendor.zeebacId,
    balance: 5000, // Prepaid Cashback Reserve Pool
    totalEarned: 5000,
  });

  const customer = await User.create({
    zeebacId: `ZBC-${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Rahul Sharma',
    phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Active',
  });

  const customerWallet = await Wallet.create({
    ownerId: customer._id,
    ownerType: 'User',
    ownerZeebacId: customer.zeebacId,
    balance: 200, // 200 Zeebac Points (₹200)
    totalEarned: 200,
  });

  // Product 1: 10% cashback
  const productA = await Product.create({
    vendorId: vendor._id,
    name: 'Premium Coffee 500g',
    price: 400,
    cashbackPercentage: 10,
    branding: { isBranded: true, brandName: 'Nescafe', cashbackPercentage: 10 },
  });

  // Product 2: 5% cashback
  const productB = await Product.create({
    vendorId: vendor._id,
    name: 'Organic Honey 250g',
    price: 200,
    cashbackPercentage: 5,
    branding: { isBranded: false, cashbackPercentage: 5 },
  });

  return { vendor, vendorWallet, customer, customerWallet, productA, productB };
};

describe('Order System & Product-Level Cashback Model', () => {
  it('creates order with per-product cashback calculation and Direct UPI Intent', async () => {
    const { vendor, customer, productA, productB } = await setupStoreAndCustomer();

    const req = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliveryAddress: 'Flat 101, Gomti Nagar, Lucknow',
        items: [
          { productId: productA._id, quantity: 2 }, // 2 * 400 = 800 @ 10% = 80 pts
          { productId: productB._id, quantity: 1 }, // 1 * 200 = 200 @ 5% = 10 pts
        ],
      },
    };
    const res = makeRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const data = res.json.mock.calls[0][0].data;

    expect(data.order.totalAmount).toBe(1000); // 800 + 200
    expect(data.order.totalCashbackPoints).toBe(90); // 80 + 10 points
    expect(data.order.packagingCharge).toBe(10);
    expect(data.order.deliveryCharge).toBe(0);
    expect(data.order.finalPayableAmount).toBe(1010);
    expect(data.order.items[0].cashbackPercentage).toBe(10);
    expect(data.order.items[0].cashbackPoints).toBe(80);
    expect(data.order.items[1].cashbackPercentage).toBe(5);
    expect(data.order.items[1].cashbackPoints).toBe(10);

    // Verify Direct UPI Intent URL
    expect(data.upiDetails.upiUri).toContain('upi://pay?');
    expect(data.upiDetails.payeeVpa).toBe('supermarket@upi');
    expect(data.upiDetails.amount).toBe(1010);
  });

  it('allows redeeming Zeebac Points at checkout (1 Point = ₹1 purchase discount)', async () => {
    const { vendor, customer, customerWallet, productA } = await setupStoreAndCustomer();

    const req = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [{ productId: productA._id, quantity: 1 }], // ₹400
        redeemPoints: 150, // Redeem 150 Zeebac Points
      },
    };
    const res = makeRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const data = res.json.mock.calls[0][0].data;

    expect(data.order.totalAmount).toBe(400);
    expect(data.order.packagingCharge).toBe(10);
    expect(data.order.deliveryCharge).toBe(30);
    expect(data.order.pointsRedeemed).toBe(150);
    expect(data.order.finalPayableAmount).toBe(290); // (₹400 + 30 + 10) - 150 = ₹290 payable via UPI
    expect(data.upiDetails.amount).toBe(290);

    // Verify customer wallet was debited by 150 points
    const updatedCustomerWallet = await Wallet.findById(customerWallet._id);
    expect(updatedCustomerWallet.balance).toBe(50); // 200 - 150 = 50
  });

  it('confirms UPI payment using 12-digit UTR', async () => {
    const { vendor, customer, productA } = await setupStoreAndCustomer();

    const createReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [{ productId: productA._id, quantity: 1 }],
      },
    };
    const createRes = makeRes();
    await createOrder(createReq, createRes);
    const order = createRes.json.mock.calls[0][0].data.order;

    // Customer submits 12-digit UTR
    const verifyReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      params: { orderId: order.orderId },
      body: { utr: '123456789012' },
    };
    const verifyRes = makeRes();
    await verifyOrderUpiPayment(verifyReq, verifyRes);

    expect(verifyRes.status).toHaveBeenCalledWith(200);
    const updatedOrder = await Order.findOne({ orderId: order.orderId });
    expect(updatedOrder.paymentStatus).toBe('PAID');
    expect(['PLACED', 'CONFIRMED']).toContain(updatedOrder.orderStatus);
    expect(updatedOrder.upiDetails.utr).toBe('123456789012');
  });

  it('creates order with Cash on Delivery (CASH) and Online (ONLINE) payment methods', async () => {
    const { vendor, customer, productA } = await setupStoreAndCustomer();

    // 1. Cash on Delivery (CASH)
    const codReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        paymentMethod: 'CASH',
        items: [{ productId: productA._id, quantity: 1 }],
      },
    };
    const codRes = makeRes();
    await createOrder(codReq, codRes);
    expect(codRes.status).toHaveBeenCalledWith(201);
    const codOrder = codRes.json.mock.calls[0][0].data.order;
    expect(codOrder.paymentMethod).toBe('CASH');
    expect(codOrder.paymentStatus).toBe('PENDING');

    // 2. Online Payment (ONLINE)
    const onlineReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        paymentMethod: 'ONLINE',
        items: [{ productId: productA._id, quantity: 1 }],
      },
    };
    const onlineRes = makeRes();
    await createOrder(onlineReq, onlineRes);
    expect(onlineRes.status).toHaveBeenCalledWith(201);
    const onlineOrder = onlineRes.json.mock.calls[0][0].data.order;
    expect(onlineOrder.paymentMethod).toBe('ONLINE');
    expect(onlineOrder.paymentStatus).toBe('PENDING');
  });

  it('assigns rider and moves order status', async () => {
    const { vendor, customer, productA } = await setupStoreAndCustomer();

    const createReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [{ productId: productA._id, quantity: 1 }],
      },
    };
    const createRes = makeRes();
    await createOrder(createReq, createRes);
    const order = createRes.json.mock.calls[0][0].data.order;

    const assignReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: {
        name: 'Amit Kumar',
        phone: '9876543210',
        vehicleNo: 'UP32 AB 1234',
      },
    };
    const assignRes = makeRes();
    await assignRider(assignReq, assignRes);

    expect(assignRes.status).toHaveBeenCalledWith(200);
    const updatedOrder = await Order.findOne({ orderId: order.orderId });
    expect(updatedOrder.orderStatus).toBe('RIDER_ASSIGNED');
    expect(updatedOrder.riderDetails.name).toBe('Amit Kumar');
    expect(updatedOrder.riderDetails.phone).toBe('9876543210');
  });

  it('delivers order: credits customer Zeebac Points & debits merchant prepaid pool', async () => {
    const { vendor, vendorWallet, customer, customerWallet, productA } = await setupStoreAndCustomer();

    // Create order: ₹400 @ 10% = 40 points
    const createReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [{ productId: productA._id, quantity: 1 }],
      },
    };
    const createRes = makeRes();
    await createOrder(createReq, createRes);
    const order = createRes.json.mock.calls[0][0].data.order;

    // Delivery completion
    const deliverReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'DELIVERED' },
    };
    const deliverRes = makeRes();
    await updateOrderStatus(deliverReq, deliverRes);

    expect(deliverRes.status).toHaveBeenCalledWith(200);

    // 1. Order status is DELIVERED and cashbackSettled is true
    const updatedOrder = await Order.findOne({ orderId: order.orderId });
    expect(updatedOrder.orderStatus).toBe('DELIVERED');
    expect(updatedOrder.cashbackSettled).toBe(true);

    // 2. Customer points credited (200 initial + 40 earned = 240)
    const updatedCustomerWallet = await Wallet.findById(customerWallet._id);
    expect(updatedCustomerWallet.balance).toBe(240);

    // 3. Merchant advance cashback pool debited (5000 initial - 40 = 4960)
    const updatedVendorWallet = await Wallet.findById(vendorWallet._id);
    expect(updatedVendorWallet.balance).toBe(4960);
  });

  it('allows merchant to recharge their Prepaid Cashback Reserve Pool via UPI', async () => {
    const { vendor, vendorWallet } = await setupStoreAndCustomer();

    // Generate UPI intent for ₹2,000 pool recharge
    const intentReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: { amount: 2000 },
    };
    const intentRes = makeRes();
    await createVendorCashbackReserveUpiIntent(intentReq, intentRes);

    expect(intentRes.status).toHaveBeenCalledWith(200);
    const intentData = intentRes.json.mock.calls[0][0].data;
    expect(intentData.upiUri).toContain('upi://pay?');
    expect(intentData.amount).toBe(2000);

    // Claim via 12-digit UTR
    const claimReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: { utr: '987654321098', amount: 2000 },
    };
    const claimRes = makeRes();
    await claimVendorCashbackReserveUpi(claimReq, claimRes);

    expect(claimRes.status).toHaveBeenCalledWith(200);
    const updatedVendorWallet = await Wallet.findById(vendorWallet._id);
    expect(updatedVendorWallet.balance).toBe(7000); // 5000 + 2000 = 7000
  });

  it('safely creates order with demo products (string IDs) and address object without CastError', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    const req = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliveryAddress: {
          fullAddress: 'Flat 402, Royal Residency',
          landmark: 'Near Tedhi Pulia',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pincode: '226021',
        },
        paymentMethod: 'UPI_INTENT',
        items: [
          {
            _id: 'demo_prod_salt',
            name: 'Tata Salt 1 kg',
            price: 28,
            quantity: 2,
            cashbackPercentage: 5,
          },
        ],
      },
    };
    const res = makeRes();
    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const data = res.json.mock.calls[0][0].data;
    expect(data.order.orderId).toBeDefined();
    expect(data.order.deliveryAddress).toBe('Flat 402, Royal Residency, Near Tedhi Pulia, Lucknow, Uttar Pradesh, 226021');
    expect(data.order.items[0].name).toBe('Tata Salt 1 kg');
  });
  it('allows merchant to update order status to READY_FOR_PICKUP without error', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    const createReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliveryAddress: 'Test Address Lucknow',
        paymentMethod: 'CASH',
        items: [{ name: 'Bread', price: 40, quantity: 1, cashbackPercentage: 10 }],
      },
    };
    const createRes = makeRes();
    await createOrder(createReq, createRes);
    const order = createRes.json.mock.calls[0][0].data.order;

    // Step 1: Vendor accepts order -> PREPARING
    const prepReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'PREPARING' },
    };
    const prepRes = makeRes();
    await updateOrderStatus(prepReq, prepRes);
    expect(prepRes.status).toHaveBeenCalledWith(200);

    // Step 2: Vendor marks order as READY_FOR_PICKUP
    const pickupReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'READY_FOR_PICKUP' },
    };
    const pickupRes = makeRes();
    await updateOrderStatus(pickupReq, pickupRes);
    expect(pickupRes.status).toHaveBeenCalledWith(200);
    const updated = pickupRes.json.mock.calls[0][0].data.order;
    expect(updated.orderStatus).toBe('READY_FOR_PICKUP');
  });

  it('blocks merchant from rejecting or cancelling an order once it has been accepted', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    const createReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliveryAddress: 'Test Address',
        paymentMethod: 'CASH',
        items: [{ name: 'Milk', price: 30, quantity: 1, cashbackPercentage: 5 }],
      },
    };
    const createRes = makeRes();
    await createOrder(createReq, createRes);
    const order = createRes.json.mock.calls[0][0].data.order;

    // Vendor accepts order -> PREPARING
    const prepReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'PREPARING' },
    };
    const prepRes = makeRes();
    await updateOrderStatus(prepReq, prepRes);
    expect(prepRes.status).toHaveBeenCalledWith(200);

    // Vendor attempts to cancel/reject the accepted order -> MUST BE REJECTED
    const cancelReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'CANCELLED', cancellationReason: 'Changed mind' },
    };
    const cancelRes = makeRes();
    await updateOrderStatus(cancelReq, cancelRes);
    expect(cancelRes.status).toHaveBeenCalledWith(400);
    expect(cancelRes.json.mock.calls[0][0].message).toContain('cannot be rejected');
  });

  it('supports scheduled delivery orders and preserves slot and date accurately', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    const schedReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliverySchedule: {
          deliveryType: 'SCHEDULED',
          scheduledDate: 'Tomorrow',
          scheduledSlot: 'Tomorrow Morning (09:00 AM - 10:00 AM)',
        },
        deliveryAddress: 'Indore MG Road',
        paymentMethod: 'CASH',
        items: [{ name: 'Rice 5kg', price: 350, quantity: 1, cashbackPercentage: 5 }],
      },
    };
    const schedRes = makeRes();
    await createOrder(schedReq, schedRes);
    expect(schedRes.status).toHaveBeenCalledWith(201);
    const order = schedRes.json.mock.calls[0][0].data.order;
    expect(order.deliverySchedule.deliveryType).toBe('SCHEDULED');
    expect(order.deliverySchedule.scheduledDate).toBe('Tomorrow');
    expect(order.deliverySchedule.scheduledSlot).toBe('Tomorrow Morning (09:00 AM - 10:00 AM)');
  });
  it('supports custom calendar date and custom time in scheduled delivery orders', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    const schedReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliverySchedule: {
          deliveryType: 'SCHEDULED',
          scheduledDate: 'Thu, 26 Nov 2026',
          scheduledSlot: '04:30 PM (Custom Time)',
        },
        deliveryAddress: 'Hazratganj, Lucknow',
        paymentMethod: 'CASH',
        items: [{ name: 'Atta 10kg', price: 420, quantity: 1, cashbackPercentage: 5 }],
      },
    };
    const schedRes = makeRes();
    await createOrder(schedReq, schedRes);
    expect(schedRes.status).toHaveBeenCalledWith(201);
    const order = schedRes.json.mock.calls[0][0].data.order;
    expect(order.deliverySchedule.deliveryType).toBe('SCHEDULED');
    expect(order.deliverySchedule.scheduledDate).toBe('Thu, 26 Nov 2026');
    expect(order.deliverySchedule.scheduledSlot).toBe('04:30 PM (Custom Time)');
  });

  it('executes end-to-end Instant Counter Pickup flow without requiring rider and blocks rejection once accepted', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    // 1. Create Instant Counter Pickup Order
    const req1 = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'pickup',
        paymentMethod: 'CASH',
        items: [{ name: 'Samosa (4 pcs)', price: 80, quantity: 2, cashbackPercentage: 10 }],
      },
    };
    const res1 = makeRes();
    await createOrder(req1, res1);
    expect(res1.status).toHaveBeenCalledWith(201);
    const order = res1.json.mock.calls[0][0].data.order;
    expect(order.fulfillmentType).toBe('pickup');
    expect(order.orderStatus).toBe('PLACED');
    expect(order.totalCashbackPoints).toBe(16);

    // 2. Merchant accepts order -> PREPARING
    const req2 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'PREPARING' },
    };
    const res2 = makeRes();
    await updateOrderStatus(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(res2.json.mock.calls[0][0].data.order.orderStatus).toBe('PREPARING');

    // 3. Merchant tries to reject/cancel -> MUST BE BLOCKED WITH 400
    const req3 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'CANCELLED', cancellationReason: 'Store closing' },
    };
    const res3 = makeRes();
    await updateOrderStatus(req3, res3);
    expect(res3.status).toHaveBeenCalledWith(400);
    expect(res3.json.mock.calls[0][0].message).toContain('cannot be rejected');

    // 4. Merchant packs and marks READY_FOR_PICKUP -> MUST SUCCEED (no invalid status!)
    const req4 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'READY_FOR_PICKUP' },
    };
    const res4 = makeRes();
    await updateOrderStatus(req4, res4);
    expect(res4.status).toHaveBeenCalledWith(200);
    expect(res4.json.mock.calls[0][0].data.order.orderStatus).toBe('READY_FOR_PICKUP');

    // 5a. Handover without the customer's pickup code is refused
    const req5a = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'DELIVERED' },
    };
    const res5a = makeRes();
    await updateOrderStatus(req5a, res5a);
    expect(res5a.status).toHaveBeenCalledWith(400);

    // 5. Customer shows the pickup code from their app -> Merchant enters it and hands over (DELIVERED) -> Points settled
    expect(order.riderDetails?.deliveryOtp).toMatch(/^\d{4}$/);
    const req5 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'DELIVERED', deliveryOtp: order.riderDetails.deliveryOtp },
    };
    const res5 = makeRes();
    await updateOrderStatus(req5, res5);
    expect(res5.status).toHaveBeenCalledWith(200);
    const deliveredOrder = res5.json.mock.calls[0][0].data.order;
    expect(deliveredOrder.orderStatus).toBe('DELIVERED');
    expect(deliveredOrder.paymentStatus).toBe('PAID');
    expect(deliveredOrder.cashbackSettled).toBe(true);
  });

  it('executes end-to-end Scheduled Delivery flow: custom date & time -> accept -> ready -> rider assign -> deliver', async () => {
    const { vendor, customer } = await setupStoreAndCustomer();

    // 1. Create Scheduled Delivery Order with custom date and time
    const schedDate = 'Fri, 20 Nov 2026';
    const schedSlot = '06:30 PM (Custom Time)';
    const req1 = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        deliverySchedule: {
          deliveryType: 'SCHEDULED',
          scheduledDate: schedDate,
          scheduledSlot: schedSlot,
        },
        deliveryAddress: 'Indira Nagar, Lucknow',
        paymentMethod: 'CASH',
        items: [{ name: 'Gulab Jamun (1kg)', price: 300, quantity: 1, cashbackPercentage: 5 }],
      },
    };
    const res1 = makeRes();
    await createOrder(req1, res1);
    expect(res1.status).toHaveBeenCalledWith(201);
    const order = res1.json.mock.calls[0][0].data.order;
    expect(order.deliverySchedule.deliveryType).toBe('SCHEDULED');
    expect(order.deliverySchedule.scheduledDate).toBe(schedDate);
    expect(order.deliverySchedule.scheduledSlot).toBe(schedSlot);

    // 2. Merchant accepts order -> PREPARING
    const req2 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'PREPARING' },
    };
    const res2 = makeRes();
    await updateOrderStatus(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(200);

    // 3. Merchant marks READY_FOR_PICKUP
    const req3 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: { status: 'READY_FOR_PICKUP' },
    };
    const res3 = makeRes();
    await updateOrderStatus(req3, res3);
    expect(res3.status).toHaveBeenCalledWith(200);
    expect(res3.json.mock.calls[0][0].data.order.orderStatus).toBe('READY_FOR_PICKUP');

    // 4. Assign Rider
    const req4 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: {
        name: 'Ravi Verma',
        phone: '9123456789',
        vehicleNo: 'UP32 AB 1234',
      },
    };
    const res4 = makeRes();
    await assignRider(req4, res4);
    expect(res4.status).toHaveBeenCalledWith(200);

    // 5. Rider marks DELIVERED with OTP
    const assignedOrder = res4.json.mock.calls[0][0].data.order;
    const req5 = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: order.orderId },
      body: {
        status: 'DELIVERED',
        deliveryOtp: assignedOrder.riderDetails.deliveryOtp,
      },
    };
    const res5 = makeRes();
    await updateOrderStatus(req5, res5);
    expect(res5.status).toHaveBeenCalledWith(200);
    const finalOrder = res5.json.mock.calls[0][0].data.order;
    expect(finalOrder.orderStatus).toBe('DELIVERED');
    expect(finalOrder.cashbackSettled).toBe(true);
  });
});
