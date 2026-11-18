import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import { createOrder, submitOrderFeedback } from './order.controller.js';
import { updateDeliveryOrderStatus } from './delivery.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeRes = () => {
  let resData = null;
  return {
    status: (code) => ({
      json: (data) => {
        resData = { code, ...data };
        return resData;
      },
    }),
    get data() {
      return resData;
    },
  };
};

describe('Order Tip and Feedback System', () => {
  it('supports rider tip at order creation, passes tip to rider earnings on delivery, and accepts vendor & rider feedback', async () => {
    // 1. Create Customer
    const customer = await User.create({
      name: 'Rohan Sharma',
      phone: '9876543210',
      status: 'Active',
      zeebacId: 'ZBC-12345',
    });

    // 2. Create Vendor
    const vendor = await Vendor.create({
      storeName: 'Royal Sweets & Cafe',
      ownerName: 'Vikas Gupta',
      phone: '9123456780',
      email: 'royal@cafe.com',
      password: 'password123',
      category: 'Dining & Cafe',
      zeebacId: 'ZBV-8899',
      address: 'Hazratganj, Lucknow',
      status: 'Verified',
      cashbackRate: 5,
      deliverySettings: {
        deliveryCharge: 30,
        packagingCharge: 10,
        freeDeliveryAbove: 500,
      },
    });

    // 3. Create Product
    const product = await Product.create({
      vendorId: vendor._id,
      name: 'Gulab Jamun (2 pcs)',
      price: 60,
      cashbackPercentage: 5,
      isActive: true,
    });

    // 4. Create Delivery Partner
    const rider = await DeliveryPartner.create({
      riderId: 'RDR-101',
      name: 'Ravi Verma',
      phone: '9888877777',
      applicationStatus: 'APPROVED',
      isOnline: true,
      status: 'AVAILABLE',
      rating: 5.0,
      completedDeliveries: 0,
      totalEarnings: 0,
    });

    // 5. Test createOrder with Tip (e.g. ₹20 rider tip)
    const createReq = {
      user: { id: customer._id.toString() },
      body: {
        vendorZeebacId: vendor.zeebacId,
        fulfillmentType: 'delivery',
        paymentMethod: 'CASH',
        tipAmount: 20,
        items: [
          {
            productId: product._id.toString(),
            name: product.name,
            price: 60,
            quantity: 2, // 120
            cashbackPercentage: 5,
          },
        ],
      },
    };
    const createRes = makeRes();
    await createOrder(createReq, createRes);

    expect(createRes.data.success).toBe(true);
    const orderData = createRes.data.data.order;
    expect(orderData.tipAmount).toBe(20);
    // itemTotal = 120, delivery = 30, packaging = 10, tip = 20 => finalPayable = 180
    expect(orderData.itemTotal).toBe(120);
    expect(orderData.finalPayableAmount).toBe(180);

    // 6. Assign rider and test delivery with rider tip payout
    const order = await Order.findOne({ orderId: orderData.orderId });
    order.orderStatus = 'OUT_FOR_DELIVERY';
    order.riderDetails = {
      name: rider.name,
      phone: rider.phone,
      vehicleNo: 'UP32 AB 1234',
      deliveryOtp: '1234',
    };
    await order.save();

    rider.activeOrderId = order._id;
    await rider.save();

    const deliverReq = {
      user: { id: rider._id.toString() },
      params: { id: order._id.toString() },
      body: { status: 'DELIVERED', deliveryOtp: '1234' },
    };
    const deliverRes = makeRes();
    await updateDeliveryOrderStatus(deliverReq, deliverRes);

    expect(deliverRes.data.success).toBe(true);

    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.completedDeliveries).toBe(1);
    // Base delivery payout (e.g. 50) + Tip (20) = 70
    expect(updatedRider.totalEarnings).toBe(order.deliveryPayout + 20);
    expect(updatedRider.earningsLedger[0].amount).toBe(order.deliveryPayout + 20);
    expect(updatedRider.earningsLedger[0].description).toContain('incl. ₹20 customer tip');

    // 7. Customer submits feedback for both Vendor and Rider
    const feedbackReq = {
      user: { id: customer._id.toString() },
      params: { orderId: order.orderId },
      body: {
        target: 'both',
        vendorRating: 5,
        vendorComment: 'Delicious sweets and fast service!',
        vendorTags: ['Great Food', 'Proper Packaging'],
        riderRating: 5,
        riderComment: 'Very polite rider, delivered right on time.',
        riderTags: ['On Time', 'Polite Behavior'],
      },
    };
    const feedbackRes = makeRes();
    await submitOrderFeedback(feedbackReq, feedbackRes);

    expect(feedbackRes.data.success).toBe(true);
    const feedbackOrder = feedbackRes.data.data;
    expect(feedbackOrder.vendorFeedback.rating).toBe(5);
    expect(feedbackOrder.vendorFeedback.comment).toBe('Delicious sweets and fast service!');
    expect(feedbackOrder.riderFeedback.rating).toBe(5);
    expect(feedbackOrder.riderFeedback.comment).toBe('Very polite rider, delivered right on time.');

    // 8. Verify Vendor rating & Review collection were updated
    const savedReview = await Review.findOne({ vendorId: vendor._id, customerId: customer._id });
    expect(savedReview).toBeTruthy();
    expect(savedReview.rating).toBe(5);
    expect(savedReview.text).toBe('Delicious sweets and fast service!');

    const updatedVendor = await Vendor.findById(vendor._id);
    expect(updatedVendor.stats.avgRating).toBe(5);
    expect(updatedVendor.stats.totalReviews).toBe(1);
    expect(updatedVendor.rating).toBe(5);

    // 9. Verify Delivery Partner rating was updated
    const finalRider = await DeliveryPartner.findById(rider._id);
    expect(finalRider.rating).toBe(5);
  });
});
