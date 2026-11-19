import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { toggleStoreStatus } from './vendor.controller.js';
import { updateOrderStatus, rateRiderByVendor } from './order.controller.js';
import Vendor from '../models/Vendor.js';
import Order from '../models/Order.js';
import DeliveryPartner from '../models/DeliveryPartner.js';

describe('Vendor Order Management & Delivery Flow Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb()),
    });
  });

  it('Vendor can toggle store online / offline status', async () => {
    const mockVendor = {
      _id: new mongoose.Types.ObjectId(),
      storeName: 'Test Burger Cafe',
      isStoreOpen: true,
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Vendor, 'findById').mockResolvedValue(mockVendor);

    const req = {
      user: { id: mockVendor._id.toString(), role: 'vendor' },
      body: { isStoreOpen: false },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await toggleStoreStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ isStoreOpen: false }),
      })
    );
    expect(mockVendor.isStoreOpen).toBe(false);
    expect(mockVendor.save).toHaveBeenCalled();
  });

  it('Vendor accepts order and specifies kitchen prep time (PREPARING)', async () => {
    const vendorId = new mongoose.Types.ObjectId();
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId: 'ORD-987654',
      vendorId: vendorId,
      customerId: new mongoose.Types.ObjectId(),
      orderStatus: 'PLACED',
      fulfillmentType: 'delivery',
      estimatedPrepTime: 15,
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Order, 'findOne').mockResolvedValue(mockOrder);

    const req = {
      user: { id: vendorId.toString(), role: 'vendor' },
      params: { orderId: 'ORD-987654' },
      body: { status: 'PREPARING', prepTimeMinutes: 25 },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockOrder.orderStatus).toBe('PREPARING');
    expect(mockOrder.estimatedPrepTime).toBe(25);
    expect(mockOrder.prepTimeSelectedAt).toBeInstanceOf(Date);
    expect(mockOrder.save).toHaveBeenCalled();
  });

  it('Vendor marks order READY_FOR_PICKUP for delivery riders', async () => {
    const vendorId = new mongoose.Types.ObjectId();
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId: 'ORD-987654',
      vendorId: vendorId,
      customerId: new mongoose.Types.ObjectId(),
      orderStatus: 'PREPARING',
      fulfillmentType: 'delivery',
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Order, 'findOne').mockResolvedValue(mockOrder);

    const req = {
      user: { id: vendorId.toString(), role: 'vendor' },
      params: { orderId: 'ORD-987654' },
      body: { status: 'READY_FOR_PICKUP' },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockOrder.orderStatus).toBe('READY_FOR_PICKUP');
    expect(mockOrder.save).toHaveBeenCalled();
  });

  it('Vendor rates delivery rider upon pickup and rider profile aggregates rating', async () => {
    const vendorId = new mongoose.Types.ObjectId();
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId: 'ORD-987654',
      vendorId: vendorId,
      storeName: 'Test Burger Cafe',
      orderStatus: 'OUT_FOR_DELIVERY',
      riderDetails: {
        riderId: 'ZBD-0099',
        name: 'Rahul Rider',
        phone: '9876543210',
      },
      save: vi.fn().mockResolvedValue(true),
    };

    const mockRider = {
      _id: new mongoose.Types.ObjectId(),
      riderId: 'ZBD-0099',
      phone: '9876543210',
      rating: 5.0,
      ratingsCount: 0,
      vendorRatings: [],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Order, 'findOne').mockResolvedValue(mockOrder);
    vi.spyOn(DeliveryPartner, 'findOne').mockResolvedValue(mockRider);
    vi.spyOn(Order, 'find').mockReturnValue({
      select: vi.fn().mockResolvedValue([]),
    });

    const req = {
      user: { id: vendorId.toString(), role: 'vendor' },
      params: { orderId: 'ORD-987654' },
      body: {
        rating: 5,
        comment: 'Very fast pickup and had proper thermal bag.',
        tags: ['Fast Pickup', 'Brought Thermal Bag'],
      },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await rateRiderByVendor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockOrder.riderFeedbackFromVendor).toBeDefined();
    expect(mockOrder.riderFeedbackFromVendor.rating).toBe(5);
    expect(mockOrder.riderFeedbackFromVendor.comment).toContain('thermal bag');

    expect(mockRider.vendorRatings.length).toBe(1);
    expect(mockRider.vendorRatings[0].tags).toContain('Fast Pickup');
    expect(mockRider.rating).toBe(5.0);
    expect(mockRider.ratingsCount).toBe(1);
    expect(mockRider.save).toHaveBeenCalled();
  });
});
