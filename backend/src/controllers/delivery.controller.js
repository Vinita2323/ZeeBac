import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import DeliveryPartner from '../models/DeliveryPartner.js';
import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { creditWallet, debitWallet } from '../utils/wallet.util.js';
import logger from '../utils/logger.js';
import { getIO } from '../socket/index.js';

const safeSocketEmit = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    logger.warn(`[Delivery Socket] Could not emit ${event}: ${err.message}`);
  }
};

/**
 * 1. Delivery Partner Login / Onboarding (Phone + PIN / OTP)
 * @route POST /api/delivery/login
 */
export const deliveryLogin = async (req, res) => {
  try {
    const { phone, name, vehicleType = 'Bike', vehicleNo } = req.body;

    if (!phone || !/^\d{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);

    let rider = await DeliveryPartner.findOne({ phone: cleanPhone });

    if (!rider) {
      // Auto-onboard new delivery partner
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const riderId = `DLV-${cleanPhone.slice(-4)}${randomSuffix}`;

      rider = await DeliveryPartner.create({
        riderId,
        name: name?.trim() || `Rider ${cleanPhone.slice(-4)}`,
        phone: cleanPhone,
        vehicleType,
        vehicleNo: vehicleNo?.trim()?.toUpperCase() || 'UP32 AB 1234',
        isOnline: true,
        status: 'AVAILABLE',
      });
      logger.info(`[DeliveryPartner] New rider onboarded: ${rider.riderId} (${rider.name})`);
    }

    const token = jwt.sign(
      {
        id: rider._id,
        _id: rider._id,
        riderId: rider.riderId,
        phone: rider.phone,
        name: rider.name,
        role: 'delivery_partner',
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Delivery partner logged in successfully',
      data: {
        token,
        rider,
      },
    });
  } catch (error) {
    logger.error(`[deliveryLogin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error during rider login' });
  }
};

/**
 * 2. Get Delivery Partner Profile
 * @route GET /api/delivery/profile
 */
export const getDeliveryProfile = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).lean();
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    return res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    logger.error(`[getDeliveryProfile] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching rider profile' });
  }
};

/**
 * 3. Update Delivery Partner Profile & Vehicle Details
 * @route PATCH /api/delivery/profile
 */
export const updateDeliveryProfile = async (req, res) => {
  try {
    const { name, vehicleType, vehicleNo, bankDetails } = req.body;

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (name) rider.name = name.trim();
    if (vehicleType) rider.vehicleType = vehicleType;
    if (vehicleNo) rider.vehicleNo = vehicleNo.trim().toUpperCase();
    if (bankDetails) rider.bankDetails = { ...rider.bankDetails, ...bankDetails };

    await rider.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: rider,
    });
  } catch (error) {
    logger.error(`[updateDeliveryProfile] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};

/**
 * 4. Toggle Online / Offline Availability
 * @route PATCH /api/delivery/availability
 */
export const toggleAvailability = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const nextOnline = isOnline !== undefined ? Boolean(isOnline) : !rider.isOnline;
    rider.isOnline = nextOnline;
    rider.status = nextOnline ? (rider.activeOrderId ? 'BUSY' : 'AVAILABLE') : 'OFFLINE';
    await rider.save();

    return res.status(200).json({
      success: true,
      message: `You are now ${nextOnline ? 'ONLINE and ready for orders' : 'OFFLINE'}`,
      data: {
        isOnline: rider.isOnline,
        status: rider.status,
      },
    });
  } catch (error) {
    logger.error(`[toggleAvailability] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating availability' });
  }
};

/**
 * 5. Update Real-time Location
 * @route PATCH /api/delivery/location
 */
export const updateDeliveryLocation = async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    rider.currentLocation = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: address || rider.currentLocation?.address,
      updatedAt: new Date(),
    };
    await rider.save();

    return res.status(200).json({ success: true, data: rider.currentLocation });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 6. Get Available Orders Feed & Active Order
 * @route GET /api/delivery/orders
 */
export const getDeliveryOrders = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    // 1. Check if rider has an active in-progress order
    let activeOrder = null;
    if (rider.activeOrderId) {
      activeOrder = await Order.findById(rider.activeOrderId)
        .populate('vendorId', 'storeName phone address location storeLogo city')
        .lean();

      // If active order was somehow already completed or cancelled, release rider
      if (activeOrder && ['DELIVERED', 'CANCELLED'].includes(activeOrder.orderStatus)) {
        rider.activeOrderId = null;
        rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
        await rider.save();
        activeOrder = null;
      }
    }

    // 2. Fetch available orders ready for pickup in the area
    // Fulfillment type = 'delivery' and orderStatus = 'PREPARING' (or assigned to this rider)
    const availableOrders = await Order.find({
      fulfillmentType: 'delivery',
      $or: [
        { orderStatus: 'PREPARING', 'riderDetails.name': { $in: [null, ''] } },
        { orderStatus: 'RIDER_ASSIGNED', 'riderDetails.phone': rider.phone },
        { orderStatus: 'OUT_FOR_DELIVERY', 'riderDetails.phone': rider.phone },
      ],
    })
      .populate('vendorId', 'storeName phone address location storeLogo city')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        activeOrder,
        availableOrders,
        isOnline: rider.isOnline,
        status: rider.status,
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryOrders] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery orders' });
  }
};

/**
 * 7. Accept Order
 * @route POST /api/delivery/orders/:id/accept
 */
export const acceptDeliveryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (rider.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active delivery in progress. Complete it first!',
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.orderStatus !== 'PREPARING' && order.orderStatus !== 'PLACED') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be accepted in its current status: ${order.orderStatus}`,
      });
    }

    // Generate 4-digit Delivery OTP
    const deliveryOtp = String(Math.floor(1000 + Math.random() * 9000));

    order.orderStatus = 'RIDER_ASSIGNED';
    order.riderDetails = {
      name: rider.name,
      phone: rider.phone,
      vehicleNo: rider.vehicleNo,
      deliveryOtp,
      assignedAt: new Date(),
    };
    await order.save();

    rider.activeOrderId = order._id;
    rider.status = 'BUSY';
    await rider.save();

    // Notify vendor and customer
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:rider_assigned', {
      orderId: order.orderId,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleNo: rider.vehicleNo,
      deliveryOtp,
    });

    safeSocketEmit(`order:${order.orderId}`, 'order:rider_assigned', {
      orderId: order.orderId,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleNo: rider.vehicleNo,
      deliveryOtp,
    });

    logger.info(`[Delivery] Order ${order.orderId} accepted by rider ${rider.name} (${rider.phone})`);

    const populatedOrder = await Order.findById(order._id)
      .populate('vendorId', 'storeName phone address location storeLogo city')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Order accepted successfully! Please proceed to pickup store.',
      data: { order: populatedOrder },
    });
  } catch (error) {
    logger.error(`[acceptDeliveryOrder] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error accepting order' });
  }
};

/**
 * 8. Update Delivery Stepper Status (PICKED_UP or DELIVERED)
 * @route PATCH /api/delivery/orders/:id/status
 */
export const updateDeliveryOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, deliveryOtp } = req.body;

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (String(order.riderDetails?.phone) !== String(rider.phone)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this order' });
    }

    // ── STEP 1: PICKED UP (STORE -> OUT FOR DELIVERY) ──
    if (status === 'PICKED_UP' || status === 'OUT_FOR_DELIVERY') {
      order.orderStatus = 'OUT_FOR_DELIVERY';
      await order.save();

      safeSocketEmit(`order:${order.orderId}`, 'order:out_for_delivery', {
        orderId: order.orderId,
        orderStatus: 'OUT_FOR_DELIVERY',
      });

      safeSocketEmit(`vendor:${order.vendorId}`, 'order:out_for_delivery', {
        orderId: order.orderId,
        orderStatus: 'OUT_FOR_DELIVERY',
      });

      return res.status(200).json({
        success: true,
        message: 'Order marked as Picked Up. Now on the way to customer!',
        data: { order },
      });
    }

    // ── STEP 2: DELIVERED (CUSTOMER RECEIVES ORDER WITH OTP) ──
    if (status === 'DELIVERED') {
      if (!deliveryOtp || String(deliveryOtp).trim() !== String(order.riderDetails?.deliveryOtp).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid 4-digit Delivery OTP. Please ask the customer for the correct OTP.',
        });
      }

      order.orderStatus = 'DELIVERED';
      order.riderDetails.deliveredAt = new Date();

      // ── ATOMIC SETTLEMENT: Credit Customer Zeebac Points & Debit Vendor Reserve Pool ──
      if (!order.cashbackSettled && order.totalCashbackPoints > 0) {
        const customer = await User.findById(order.customerId);
        const vendor = await Vendor.findById(order.vendorId);

        if (customer) {
          await creditWallet({
            ownerId: customer._id,
            ownerType: 'User',
            ownerZeebacId: customer.zeebacId,
            amount: order.totalCashbackPoints,
            category: 'cashback',
            description: `🪙 +${order.totalCashbackPoints} Zeebac Points earned on Order #${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
          });

          safeSocketEmit(`user:${customer._id}`, 'cashback:credited', {
            amount: order.totalCashbackPoints,
            orderId: order.orderId,
          });
        }

        if (vendor) {
          await debitWallet({
            ownerId: vendor._id,
            ownerType: 'Vendor',
            amount: order.totalCashbackPoints,
            category: 'cashback_payout',
            description: `🪙 ${order.totalCashbackPoints} Zeebac Points deducted from reserve pool for Order #${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
            allowNegativeBalance: true,
          });
        }

        order.cashbackSettled = true;
      }

      await order.save();

      // Update Rider earnings & availability
      const deliveryPayout = 50; // Standard ₹50 delivery partner compensation
      rider.completedDeliveries = (rider.completedDeliveries || 0) + 1;
      rider.totalEarnings = Math.round(((rider.totalEarnings || 0) + deliveryPayout) * 100) / 100;
      rider.activeOrderId = null;
      rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
      await rider.save();

      safeSocketEmit(`order:${order.orderId}`, 'order:delivered', {
        orderId: order.orderId,
        orderStatus: 'DELIVERED',
        totalCashbackPoints: order.totalCashbackPoints,
      });

      safeSocketEmit(`vendor:${order.vendorId}`, 'order:delivered', {
        orderId: order.orderId,
        orderStatus: 'DELIVERED',
      });

      logger.info(`[Delivery] Order ${order.orderId} DELIVERED successfully by ${rider.name}. Payout ₹${deliveryPayout} added.`);

      return res.status(200).json({
        success: true,
        message: 'Order delivered successfully! Delivery fee credited to your earnings.',
        data: {
          order,
          earnedAmount: deliveryPayout,
          totalEarnings: rider.totalEarnings,
        },
      });
    }

    return res.status(400).json({ success: false, message: `Unsupported status: ${status}` });
  } catch (error) {
    logger.error(`[updateDeliveryOrderStatus] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error updating order' });
  }
};

/**
 * 9. Get Delivery History & Earnings
 * @route GET /api/delivery/history
 */
export const getDeliveryHistory = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find({
        'riderDetails.phone': rider.phone,
        orderStatus: 'DELIVERED',
      })
        .populate('vendorId', 'storeName address phone city')
        .sort({ 'riderDetails.deliveredAt': -1, updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Order.countDocuments({
        'riderDetails.phone': rider.phone,
        orderStatus: 'DELIVERED',
      }),
    ]);

    const formattedHistory = orders.map((o) => ({
      _id: o._id,
      orderId: o.orderId,
      deliveredAt: o.riderDetails?.deliveredAt || o.updatedAt,
      earnedAmount: 50,
      storeName: o.vendorId?.storeName || 'Partner Store',
      storeAddress: o.vendorId?.address?.street || o.vendorId?.address || 'Store Location',
      customerName: o.customerDetails?.name || 'Customer',
      customerAddress: o.customerDetails?.deliveryAddress || 'Delivery Address',
      totalAmount: o.finalPayableAmount,
      totalItems: o.items?.length || 1,
    }));

    return res.status(200).json({
      success: true,
      data: {
        history: formattedHistory,
        totalDeliveries: total,
        totalEarnings: rider.totalEarnings || total * 50,
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryHistory] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery history' });
  }
};
