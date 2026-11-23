import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from './dbSetup.js';

// Models
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Wallet from '../models/Wallet.js';
import PosBill from '../models/PosBill.js';
import Transaction from '../models/Transaction.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';

// Controllers
import {
  customerLogin,
  sendOtp,
} from '../controllers/auth.controller.js';
import {
  getVendorCategories,
  addVendorCategory,
  createProduct,
  getProducts,
  getDashboardStats,
  getVendorTransactions,
} from '../controllers/vendor.controller.js';
import {
  createOrder,
  updateOrderStatus,
  getVendorOrders,
} from '../controllers/order.controller.js';
import {
  checkDeliveryPhone,
  deliveryRegister,
  deliveryLogin,
  adminApproveDeliveryPartner,
  toggleAvailability,
  getDeliveryOrders,
  acceptDeliveryOrder,
  rejectDeliveryOrder,
  updateDeliveryOrderStatus,
  getDeliveryHistory,
  getDeliveryEarnings,
} from '../controllers/delivery.controller.js';
import {
  createPosBill,
} from '../controllers/pos.controller.js';

vi.mock('../services/notification.service.js', () => ({
  sendNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock('../socket/index.js', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  }),
}));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
};

describe('Real-User End-to-End Complete Flow (Customer, Vendor, Delivery, Admin)', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('executes full end-to-end journey: Vendor setup -> Product listing -> Customer order -> Rider pickup & OTP delivery -> Settlement -> POS Counter claim', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1: VENDOR ONBOARDING & STORE ACTIVATION
    // ═════════════════════════════════════════════════════════════════════════
    const vendor = await Vendor.create({
      zeebacId: 'ZBV-9901',
      ownerName: 'Harish Confectioner',
      storeName: 'Royal Sweets & Dairy',
      phone: '9811223344',
      email: 'royal@zeebac.com',
      password: 'password123',
      category: 'Restaurant & Sweets',
      businessType: 'Retailer',
      cashbackRate: 5, // 5% Cashback
      status: 'Verified',
      subscription: {
        status: 'ACTIVE',
        planId: 'plan_quarterly',
        planType: '3 Months',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      address: {
        street: 'Shop 14, Hazratganj Market',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pincode: '226001',
      },
    });

    // Seed Vendor Cashback Reserve Wallet
    const vendorWallet = await Wallet.create({
      ownerId: vendor._id,
      ownerType: 'Vendor',
      ownerZeebacId: vendor.zeebacId,
      balance: 5000,
      totalEarned: 5000,
    });

    // 1A. Verify New Vendor Dashboard starts with CLEAN ZERO STATS (No fake 24500 or 735 or 12)
    const dashReq = { user: { id: vendor._id.toString(), role: 'vendor' } };
    const dashRes = mockRes();
    await getDashboardStats(dashReq, dashRes);
    expect(dashRes.statusCode).toBe(200);
    expect(dashRes.body.success).toBe(true);
    expect(dashRes.body.data.storeName).toBe('Royal Sweets & Dairy');
    expect(dashRes.body.data.totalRevenue).toBe(0);
    expect(dashRes.body.data.totalCustomers).toBe(0);
    expect(dashRes.body.data.totalTransactions).toBe(0);
    expect(dashRes.body.data.todaySales.total).toBe(0);
    expect(dashRes.body.data.todaySales.cashbackGiven).toBe(0);

    // 1B. Vendor adds custom category: "Sweets & Desserts"
    const addCatReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: { category: 'Sweets & Desserts' },
    };
    const addCatRes = mockRes();
    await addVendorCategory(addCatReq, addCatRes);
    expect([200, 201]).toContain(addCatRes.statusCode);
    expect(addCatRes.body.data).toContain('Sweets & Desserts');

    // 1C. Vendor creates a product in this category
    const createProdReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: {
        name: 'Kaju Katli Special 500g',
        mrp: 800,
        price: 700,
        stock: 50,
        category: 'Sweets & Desserts',
        cashbackPercentage: 5,
        unit: 'Box',
        description: 'Pure cashew diamond sweets made with desi ghee.',
      },
    };
    const createProdRes = mockRes();
    await createProduct(createProdReq, createProdRes);
    expect(createProdRes.statusCode).toBe(201);
    expect(createProdRes.body.success).toBe(true);
    const createdProduct = createProdRes.body.data;
    expect(createdProduct.name).toBe('Kaju Katli Special 500g');
    expect(createdProduct.category).toBe('Sweets & Desserts');
    expect(createdProduct.price).toBe(700);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2: CUSTOMER LOGIN & ORDER PLACEMENT
    // ═════════════════════════════════════════════════════════════════════════
    const customerPhone = '9988776655';
    // Customer instant auto-login via verified OTP
    const custLoginReq = { body: { phone: customerPhone, otp: '1234' } };
    const custLoginRes = mockRes();
    await customerLogin(custLoginReq, custLoginRes);
    expect(custLoginRes.statusCode).toBe(200);
    expect(custLoginRes.body.success).toBe(true);
    const customer = await User.findOne({ phone: customerPhone });
    expect(customer).toBeDefined();
    customer.status = 'Active';
    await customer.save();

    // Customer places delivery order for 2 boxes of Kaju Katli (₹1,400)
    const placeOrderReq = {
      user: { id: customer._id.toString(), role: 'customer' },
      body: {
        vendorZeebacId: vendor.zeebacId,
        items: [
          {
            productId: createdProduct._id.toString(),
            quantity: 2,
          },
        ],
        fulfillmentType: 'delivery',
        paymentMethod: 'CASH',
        deliveryAddress: 'Flat 101, Gomti Nagar, Lucknow',
        customerDetails: {
          name: customer.name || 'Test Customer',
          phone: customerPhone,
          deliveryAddress: 'Flat 101, Gomti Nagar, Lucknow',
        },
      },
    };
    const placeOrderRes = mockRes();
    await createOrder(placeOrderReq, placeOrderRes);
    expect(placeOrderRes.statusCode).toBe(201);
    expect(placeOrderRes.body.success).toBe(true);
    const orderData = placeOrderRes.body.data.order;
    expect(orderData.totalAmount).toBe(1400);
    // 5% cashback on ₹1400 = 70 Zeebac Points
    expect(orderData.totalCashbackPoints).toBe(70);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 3: VENDOR PREPARES ORDER
    // ═════════════════════════════════════════════════════════════════════════
    const prepOrderReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      params: { orderId: orderData.orderId, id: orderData._id.toString() },
      body: { status: 'PREPARING' },
    };
    const prepOrderRes = mockRes();
    await updateOrderStatus(prepOrderReq, prepOrderRes);
    expect(prepOrderRes.statusCode).toBe(200);
    expect(prepOrderRes.body.data.order.orderStatus).toBe('PREPARING');

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 4: DELIVERY PARTNER LIFECYCLE
    // ═════════════════════════════════════════════════════════════════════════
    // 4A. Rider registers
    const riderPhone = '9765432100';
    const riderRegReq = {
      body: {
        name: 'Amit Kumar Rider',
        phone: riderPhone,
        vehicleType: 'Bike',
        vehicleNo: 'UP32 EK 5555',
        documents: { aadhaarNo: '123456789012', drivingLicenceNo: 'DLUP329988' },
        bankDetails: { upiId: 'amit@paytm', accountHolderName: 'Amit Kumar' },
      },
    };
    const riderRegRes = mockRes();
    await deliveryRegister(riderRegReq, riderRegRes);
    expect(riderRegRes.statusCode).toBe(201);
    const rider = await DeliveryPartner.findOne({ phone: riderPhone });

    // 4B. Admin approves Rider
    const adminApproveReq = {
      user: { id: 'admin1', role: 'admin' },
      params: { id: rider._id.toString() },
    };
    const adminApproveRes = mockRes();
    await adminApproveDeliveryPartner(adminApproveReq, adminApproveRes);
    expect(adminApproveRes.statusCode).toBe(200);

    // 4C. Rider goes ONLINE
    const onlineReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      body: { isOnline: true },
    };
    const onlineRes = mockRes();
    await toggleAvailability(onlineReq, onlineRes);
    expect(onlineRes.statusCode).toBe(200);
    expect(onlineRes.body.data.isOnline).toBe(true);

    // 4D. Rider sees available orders and accepts
    const getOrdersReq = { user: { id: rider._id.toString(), role: 'delivery_partner' } };
    const getOrdersRes = mockRes();
    await getDeliveryOrders(getOrdersReq, getOrdersRes);
    expect(getOrdersRes.statusCode).toBe(200);
    expect(getOrdersRes.body.data.availableOrders.length).toBeGreaterThan(0);

    const acceptReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderData._id.toString() },
    };
    const acceptRes = mockRes();
    await acceptDeliveryOrder(acceptReq, acceptRes);
    expect(acceptRes.statusCode).toBe(200);
    const acceptedOrder = acceptRes.body.data.order;
    expect(acceptedOrder.orderStatus).toBe('RIDER_ASSIGNED');
    // Secret 4-digit OTP generated for the customer
    const generatedDeliveryOtp = acceptedOrder.riderDetails.deliveryOtp;
    expect(generatedDeliveryOtp).toBeDefined();
    expect(generatedDeliveryOtp.length).toBe(4);

    // 4E. Rider arrives at Store
    const arrivedReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderData._id.toString() },
      body: { status: 'ARRIVED_AT_PICKUP' },
    };
    const arrivedRes = mockRes();
    await updateDeliveryOrderStatus(arrivedReq, arrivedRes);
    expect(arrivedRes.statusCode).toBe(200);

    // 4F. Rider picks up order with proof image
    const pickupReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderData._id.toString() },
      body: {
        status: 'OUT_FOR_DELIVERY',
        pickupProofImage: 'https://images.unsplash.com/photo-parcel-test.jpg',
      },
    };
    const pickupRes = mockRes();
    await updateDeliveryOrderStatus(pickupReq, pickupRes);
    expect(pickupRes.statusCode).toBe(200);
    expect(pickupRes.body.data.order.orderStatus).toBe('OUT_FOR_DELIVERY');

    // 4G. Rider arrives at customer door
    const arrivedCustReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderData._id.toString() },
      body: { status: 'ARRIVED_AT_CUSTOMER' },
    };
    const arrivedCustRes = mockRes();
    await updateDeliveryOrderStatus(arrivedCustReq, arrivedCustRes);
    expect(arrivedCustRes.statusCode).toBe(200);

    // 4H. EDGE CASE: Rider enters WRONG OTP -> must fail with 400
    const wrongOtpReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderData._id.toString() },
      body: { status: 'DELIVERED', deliveryOtp: '0000' },
    };
    const wrongOtpRes = mockRes();
    await updateDeliveryOrderStatus(wrongOtpReq, wrongOtpRes);
    expect(wrongOtpRes.statusCode).toBe(400);
    expect(wrongOtpRes.body.success).toBe(false);

    // 4I. Rider enters CORRECT 4-digit customer delivery OTP -> SUCCESSFUL DROP
    const deliverReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderData._id.toString() },
      body: { status: 'DELIVERED', deliveryOtp: generatedDeliveryOtp },
    };
    const deliverRes = mockRes();
    await updateDeliveryOrderStatus(deliverReq, deliverRes);
    expect(deliverRes.statusCode).toBe(200);
    expect(deliverRes.body.success).toBe(true);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 5: POST-DELIVERY WALLET & SETTLEMENT VERIFICATION
    // ═════════════════════════════════════════════════════════════════════════
    // 5A. Customer received +70 Zeebac Points in wallet
    const custWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(custWallet).toBeDefined();
    expect(custWallet.balance).toBe(70);

    // 5B. Vendor Reserve Pool debited 70 points: 5000 - 70 = 4930
    const updatedVendWallet = await Wallet.findOne({ ownerId: vendor._id });
    expect(updatedVendWallet.balance).toBe(4930);

    // 5C. Rider received delivery payout in pocket
    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.completedDeliveries).toBe(1);
    expect(updatedRider.totalEarnings).toBeGreaterThanOrEqual(30); // At least base fare
    expect(updatedRider.status).toBe('AVAILABLE');
    expect(updatedRider.activeOrderId).toBeNull();

    // 5D. Rider Trip History contains the completed delivery
    const historyReq = { user: { id: rider._id.toString(), role: 'delivery_partner' } };
    const historyRes = mockRes();
    await getDeliveryHistory(historyReq, historyRes);
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.data.totalDeliveries).toBe(1);
    expect(historyRes.body.data.history.length).toBe(1);
    expect(historyRes.body.data.history[0].orderId).toBe(orderData.orderId);
    expect(historyRes.body.data.history[0].storeName).toBe('Royal Sweets & Dairy');

    // 5E. Rider Earnings breakdown contains today/week cycle records
    const earningsReq = { user: { id: rider._id.toString(), role: 'delivery_partner' } };
    const earningsRes = mockRes();
    await getDeliveryEarnings(earningsReq, earningsRes);
    expect(earningsRes.statusCode).toBe(200);
    expect(earningsRes.body.data.completedDeliveries).toBe(1);
    // COD orders log a COD_CASH_COLLECTED entry alongside the DELIVERY_PAYOUT entry
    const payoutEntries = earningsRes.body.data.ledger.filter((e) => e.type === 'DELIVERY_PAYOUT');
    expect(payoutEntries.length).toBe(1);
    expect(payoutEntries[0].orderId).toBe(orderData.orderId);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 6: IN-STORE COUNTER SHOPPING & CASHBACK POS
    // ═════════════════════════════════════════════════════════════════════════
    // Customer makes ₹500 counter purchase at Royal Sweets & Dairy
    const posReq = {
      body: {
        vendorZeebacId: vendor.zeebacId,
        amount: 500,
        customerPhone: customerPhone,
      },
    };
    const posRes = mockRes();
    await createPosBill(posReq, posRes);
    expect(posRes.statusCode).toBe(201);
    expect(posRes.body.success).toBe(true);
    // 5% on 500 = 25 points
    expect(posRes.body.data.cashbackEarned).toBe(25);
    expect(posRes.body.data.newWalletBalance).toBe(95);

    // Customer wallet balance updated: 70 + 25 = 95 points
    const finalCustWallet = await Wallet.findOne({ ownerId: customer._id });
    expect(finalCustWallet.balance).toBe(95);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 7: EDGE CASES & SAFETY VERIFICATION
    // ═════════════════════════════════════════════════════════════════════════
    // Edge Case 1: Unregistered delivery mobile phone check
    const checkPhoneReq = { query: { phone: '9000000001' } };
    const checkPhoneRes = mockRes();
    await checkDeliveryPhone(checkPhoneReq, checkPhoneRes);
    expect(checkPhoneRes.body.exists).toBe(false);

    // Edge Case 2: Rider rejects order with reason
    // Create new order to test rejection
    const orderToReject = await Order.create({
      orderId: `ZBC-REJ-${Date.now()}`,
      customerId: customer._id,
      customerName: customer.name || 'Rahul Sharma',
      customerPhone: customer.phone || customerPhone,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      storeName: vendor.storeName,
      items: [{ productId: createdProduct._id, name: 'Kaju Katli', price: 700, quantity: 1 }],
      totalAmount: 700,
      finalPayableAmount: 700,
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      fulfillmentType: 'delivery',
    });

    const rejectReq = {
      user: { id: rider._id.toString(), role: 'delivery_partner' },
      params: { id: orderToReject._id.toString() },
      body: { reason: 'Heavy traffic on route' },
    };
    const rejectRes = mockRes();
    await rejectDeliveryOrder(rejectReq, rejectRes);
    expect(rejectRes.statusCode).toBe(200);
    const rejectedOrderInDb = await Order.findById(orderToReject._id);
    expect(rejectedOrderInDb.riderRejections.length).toBe(1);
    expect(rejectedOrderInDb.riderRejections[0].reason).toBe('Heavy traffic on route');

    // Edge Case 3: Empty category name validation
    const emptyCatReq = {
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: { category: '   ' },
    };
    const emptyCatRes = mockRes();
    await addVendorCategory(emptyCatReq, emptyCatRes);
    expect(emptyCatRes.statusCode).toBe(400);
    expect(emptyCatRes.body.success).toBe(false);
  });
});
