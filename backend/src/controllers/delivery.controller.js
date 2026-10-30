import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import DeliveryPartner from '../models/DeliveryPartner.js';
import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
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

const createRiderToken = (rider) => {
  return jwt.sign(
    {
      id: rider._id,
      _id: rider._id,
      riderId: rider.riderId,
      phone: rider.phone,
      name: rider.name,
      role: 'delivery_partner',
    },
    process.env.JWT_ACCESS_SECRET || 'zeebac_jwt_secret_key_default',
    { expiresIn: '30d' }
  );
};

// ─────────────────────────────────────────────────────────────
// 1. DELIVERY PARTNER ONBOARDING & REGISTRATION
// ─────────────────────────────────────────────────────────────
export const deliveryRegister = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      dateOfBirth,
      gender,
      address,
      vehicleType = 'Bike',
      vehicleNo,
      vehicleModel,
      documents,
      bankDetails,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    if (!phone || !/^\d{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);

    const existingRider = await DeliveryPartner.findOne({ phone: cleanPhone });
    if (existingRider) {
      return res.status(400).json({
        success: false,
        message: 'A delivery partner application with this mobile number already exists. Please log in.',
        existingStatus: existingRider.applicationStatus,
      });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const riderId = `DLV-${cleanPhone.slice(-4)}${randomSuffix}`;

    const newRider = await DeliveryPartner.create({
      riderId,
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim()?.toLowerCase(),
      dateOfBirth,
      gender: gender || '',
      address: {
        currentAddress: address?.currentAddress || '',
        city: address?.city || 'Lucknow',
        state: address?.state || 'Uttar Pradesh',
        pincode: address?.pincode || '',
        permanentAddress: address?.permanentAddress || address?.currentAddress || '',
      },
      vehicleType,
      vehicleNo: vehicleNo?.trim()?.toUpperCase() || 'UP32 AB 1234',
      vehicleModel: vehicleModel?.trim() || '',
      documents: {
        aadhaarNo: documents?.aadhaarNo || '',
        aadhaarDoc: documents?.aadhaarDoc || '',
        panNo: documents?.panNo || '',
        panDoc: documents?.panDoc || '',
        drivingLicenceNo: documents?.drivingLicenceNo || '',
        drivingLicenceDoc: documents?.drivingLicenceDoc || '',
        vehicleRcDoc: documents?.vehicleRcDoc || '',
        insuranceDoc: documents?.insuranceDoc || '',
      },
      bankDetails: {
        accountHolderName: bankDetails?.accountHolderName || name.trim(),
        bankName: bankDetails?.bankName || '',
        accountNumber: bankDetails?.accountNumber || '',
        ifscCode: bankDetails?.ifscCode || '',
        upiId: bankDetails?.upiId || '',
      },
      applicationStatus: 'PENDING_REVIEW',
      isOnline: false,
      status: 'OFFLINE',
    });

    const token = createRiderToken(newRider);
    logger.info(`[DeliveryPartner] Application submitted: ${newRider.riderId} (${newRider.name})`);

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! It is now pending admin review.',
      data: {
        token,
        rider: newRider,
      },
    });
  } catch (error) {
    logger.error(`[deliveryRegister] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error during registration' });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. DELIVERY PARTNER LOGIN
// ─────────────────────────────────────────────────────────────
export const deliveryLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\d{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const rider = await DeliveryPartner.findOne({ phone: cleanPhone });

    if (!rider) {
      return res.status(404).json({
        success: false,
        isRegistered: false,
        message: 'No delivery partner account found with this phone. Please register to become a partner.',
      });
    }

    const token = createRiderToken(rider);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: {
        token,
        rider,
        applicationStatus: rider.applicationStatus,
      },
    });
  } catch (error) {
    logger.error(`[deliveryLogin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error during rider login' });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. GET APPLICATION STATUS & PROFILE
// ─────────────────────────────────────────────────────────────
export const getDeliveryStatus = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).lean();
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        riderId: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        applicationStatus: rider.applicationStatus,
        rejectionReason: rider.rejectionReason,
        rejectedAt: rider.rejectedAt,
        suspendedAt: rider.suspendedAt,
        suspensionReason: rider.suspensionReason,
        documents: rider.documents,
        documentVerification: rider.documentVerification,
        address: rider.address,
        vehicle: {
          type: rider.vehicleType,
          no: rider.vehicleNo,
          model: rider.vehicleModel,
        },
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryStatus] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching status' });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. RESUBMIT APPLICATION AFTER REJECTION
// ─────────────────────────────────────────────────────────────
export const resubmitApplication = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const {
      name,
      address,
      vehicleType,
      vehicleNo,
      vehicleModel,
      documents,
      bankDetails,
    } = req.body;

    if (name) rider.name = name.trim();
    if (address) rider.address = { ...rider.address, ...address };
    if (vehicleType) rider.vehicleType = vehicleType;
    if (vehicleNo) rider.vehicleNo = vehicleNo.trim().toUpperCase();
    if (vehicleModel) rider.vehicleModel = vehicleModel.trim();
    if (documents) rider.documents = { ...rider.documents, ...documents };
    if (bankDetails) rider.bankDetails = { ...rider.bankDetails, ...bankDetails };

    rider.applicationStatus = 'RESUBMITTED';
    rider.rejectionReason = null;
    await rider.save();

    logger.info(`[DeliveryPartner] Application resubmitted: ${rider.riderId}`);

    return res.status(200).json({
      success: true,
      message: 'Application resubmitted successfully! Admin will review your updated details.',
      data: rider,
    });
  } catch (error) {
    logger.error(`[resubmitApplication] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error resubmitting application' });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. GET DELIVERY PARTNER PROFILE
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// 6. UPDATE PROFILE & VEHICLE DETAILS
// ─────────────────────────────────────────────────────────────
export const updateDeliveryProfile = async (req, res) => {
  try {
    const { name, vehicleType, vehicleNo, vehicleModel, bankDetails } = req.body;

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (name) rider.name = name.trim();
    if (vehicleType) rider.vehicleType = vehicleType;
    if (vehicleNo) rider.vehicleNo = vehicleNo.trim().toUpperCase();
    if (vehicleModel) rider.vehicleModel = vehicleModel.trim();
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

// ─────────────────────────────────────────────────────────────
// 7. TOGGLE ONLINE / OFFLINE AVAILABILITY
// ─────────────────────────────────────────────────────────────
export const toggleAvailability = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    // Security Gate: Only approved riders can go online
    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: `Your account is currently in "${rider.applicationStatus}" status. Only approved delivery partners can go online.`,
      });
    }

    const nextOnline = isOnline !== undefined ? Boolean(isOnline) : !rider.isOnline;

    // Safety rule: Cannot go offline silently if an active order is in progress
    if (!nextOnline && rider.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'You have an active delivery order in progress! Complete it before going offline.',
      });
    }

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

// ─────────────────────────────────────────────────────────────
// 8. UPDATE REAL-TIME GPS LOCATION
// ─────────────────────────────────────────────────────────────
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

    // If rider has an active order, broadcast location to customer room
    if (rider.activeOrderId) {
      safeSocketEmit(`order:${rider.activeOrderId}`, 'delivery:location_update', {
        riderId: rider.riderId,
        latitude: rider.currentLocation.latitude,
        longitude: rider.currentLocation.longitude,
      });
    }

    return res.status(200).json({ success: true, data: rider.currentLocation });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 9. GET AVAILABLE ORDERS FEED & ACTIVE ORDER
// ─────────────────────────────────────────────────────────────
export const getDeliveryOrders = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    let activeOrder = null;
    if (rider.activeOrderId) {
      activeOrder = await Order.findById(rider.activeOrderId)
        .populate('vendorId', 'storeName phone address location storeLogo city')
        .lean();

      if (activeOrder && ['DELIVERED', 'CANCELLED', 'FAILED_DELIVERY'].includes(activeOrder.orderStatus)) {
        rider.activeOrderId = null;
        rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
        await rider.save();
        activeOrder = null;
      }
    }

    // Available orders ready for assignment in the area
    let availableOrders = [];
    if (rider.isOnline && !rider.activeOrderId && rider.applicationStatus === 'APPROVED') {
      availableOrders = await Order.find({
        fulfillmentType: 'delivery',
        $or: [
          { orderStatus: 'CONFIRMED', 'riderDetails.name': { $in: [null, ''] } },
          { orderStatus: 'PREPARING', 'riderDetails.name': { $in: [null, ''] } },
        ],
      })
        .populate('vendorId', 'storeName phone address location storeLogo city')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    }

    return res.status(200).json({
      success: true,
      data: {
        activeOrder,
        availableOrders,
        isOnline: rider.isOnline,
        status: rider.status,
        applicationStatus: rider.applicationStatus,
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryOrders] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery orders' });
  }
};

// ─────────────────────────────────────────────────────────────
// 10. ATOMICALLY ACCEPT ORDER ASSIGNMENT
// ─────────────────────────────────────────────────────────────
export const acceptDeliveryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'Your account must be approved to accept orders' });
    }

    if (rider.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active delivery in progress. Complete it first!',
      });
    }

    // Atomic race-condition protection: find order only if riderDetails is empty
    const order = await Order.findOne({
      _id: id,
      fulfillmentType: 'delivery',
      orderStatus: { $in: ['CONFIRMED', 'PREPARING', 'PLACED'] },
      $or: [
        { 'riderDetails.name': { $in: [null, ''] } },
        { 'riderDetails.phone': { $in: [null, ''] } },
      ],
    });

    if (!order) {
      return res.status(409).json({
        success: false,
        message: 'This order was just accepted by another partner or is no longer available.',
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

    // Broadcast notifications to store and customer
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

// ─────────────────────────────────────────────────────────────
// 11. REJECT ORDER REQUEST
// ─────────────────────────────────────────────────────────────
export const rejectDeliveryOrder = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Order request dismissed. Looking for other orders in your area.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 12. UPDATE ORDER STEPPER STATUS (ARRIVED, PICKED UP, DELIVERED)
// ─────────────────────────────────────────────────────────────
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

    // ── STEP A: ARRIVED AT PICKUP STORE ──
    if (status === 'ARRIVED_AT_PICKUP') {
      order.orderStatus = 'ARRIVED_AT_PICKUP';
      await order.save();

      safeSocketEmit(`order:${order.orderId}`, 'order:status_update', {
        orderId: order.orderId,
        orderStatus: 'ARRIVED_AT_PICKUP',
      });
      safeSocketEmit(`vendor:${order.vendorId}`, 'order:status_update', {
        orderId: order.orderId,
        orderStatus: 'ARRIVED_AT_PICKUP',
      });

      return res.status(200).json({
        success: true,
        message: 'Marked arrived at store. Collect the order package.',
        data: { order },
      });
    }

    // ── STEP B: PICKED UP (OUT FOR DELIVERY) ──
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
        message: 'Order picked up! Now on the way to customer.',
        data: { order },
      });
    }

    // ── STEP C: ARRIVED AT CUSTOMER LOCATION ──
    if (status === 'ARRIVED_AT_CUSTOMER') {
      order.orderStatus = 'ARRIVED_AT_CUSTOMER';
      await order.save();

      safeSocketEmit(`order:${order.orderId}`, 'order:status_update', {
        orderId: order.orderId,
        orderStatus: 'ARRIVED_AT_CUSTOMER',
      });

      return res.status(200).json({
        success: true,
        message: 'Arrived at customer location. Request the 4-digit Delivery OTP.',
        data: { order },
      });
    }

    // ── STEP D: DELIVERED (SECURED VIA 4-DIGIT OTP) ──
    if (status === 'DELIVERED') {
      if (!deliveryOtp || String(deliveryOtp).trim() !== String(order.riderDetails?.deliveryOtp).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid 4-digit Delivery OTP. Please ask the customer for the correct OTP displayed on their order screen.',
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

      // Update Rider earnings & ledger
      const deliveryPayout = 50; // Standard ₹50 delivery payout
      rider.completedDeliveries = (rider.completedDeliveries || 0) + 1;
      rider.totalEarnings = Math.round(((rider.totalEarnings || 0) + deliveryPayout) * 100) / 100;
      rider.activeOrderId = null;
      rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';

      if (!rider.earningsLedger) rider.earningsLedger = [];
      rider.earningsLedger.unshift({
        orderId: order.orderId,
        amount: deliveryPayout,
        type: 'DELIVERY_PAYOUT',
        description: `Delivery payout for Order #${order.orderId} (${order.storeName})`,
        date: new Date(),
      });

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

    return res.status(400).json({ success: false, message: `Unsupported status transition: ${status}` });
  } catch (error) {
    logger.error(`[updateDeliveryOrderStatus] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error updating order' });
  }
};

// ─────────────────────────────────────────────────────────────
// 13. GET DELIVERY HISTORY
// ─────────────────────────────────────────────────────────────
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
      storeName: o.vendorId?.storeName || o.storeName || 'Partner Store',
      storeAddress: o.vendorId?.address?.street || o.vendorId?.address || 'Store Location',
      customerName: o.customerName || 'Customer',
      customerAddress: o.deliveryAddress || 'Delivery Address',
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

// ─────────────────────────────────────────────────────────────
// 14. GET EARNINGS BREAKDOWN & LEDGER
// ─────────────────────────────────────────────────────────────
export const getDeliveryEarnings = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).lean();
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const ledger = rider.earningsLedger || [];
    const todayEarnings = ledger
      .filter((e) => new Date(e.date) >= startOfToday)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const weekEarnings = ledger
      .filter((e) => new Date(e.date) >= startOfWeek)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const monthEarnings = ledger
      .filter((e) => new Date(e.date) >= startOfMonth)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        today: Math.round(todayEarnings * 100) / 100,
        thisWeek: Math.round(weekEarnings * 100) / 100,
        thisMonth: Math.round(monthEarnings * 100) / 100,
        todayEarnings: Math.round(todayEarnings * 100) / 100,
        weekEarnings: Math.round(weekEarnings * 100) / 100,
        monthEarnings: Math.round(monthEarnings * 100) / 100,
        totalEarnings: rider.totalEarnings || 0,
        completedDeliveries: rider.completedDeliveries || 0,
        totalCompletedDeliveries: rider.completedDeliveries || 0,
        perDeliveryRate: 50,
        ledger: ledger.slice(0, 30),
        bankDetails: rider.bankDetails || {},
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryEarnings] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching earnings' });
  }
};

// ─────────────────────────────────────────────────────────────
// 15. ADMIN: GET DELIVERY PARTNERS STATS
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryStats = async (req, res) => {
  try {
    const [
      total,
      pending,
      underReview,
      approved,
      rejected,
      suspended,
      online,
    ] = await Promise.all([
      DeliveryPartner.countDocuments(),
      DeliveryPartner.countDocuments({ applicationStatus: 'PENDING_REVIEW' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'UNDER_REVIEW' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'APPROVED' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'REJECTED' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'SUSPENDED' }),
      DeliveryPartner.countDocuments({ isOnline: true, applicationStatus: 'APPROVED' }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        underReview,
        approved,
        rejected,
        suspended,
        online,
        offline: Math.max(0, approved - online),
      },
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryStats] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery stats' });
  }
};

// ─────────────────────────────────────────────────────────────
// 16. ADMIN: GET ALL DELIVERY PARTNERS (WITH FILTER & SEARCH)
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryPartners = async (req, res) => {
  try {
    const { status, search, vehicleType, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.applicationStatus = status.toUpperCase();
    }
    if (vehicleType && vehicleType !== 'all') {
      query.vehicleType = vehicleType;
    }
    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { riderId: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [partners, total] = await Promise.all([
      DeliveryPartner.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      DeliveryPartner.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        partners,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryPartners] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching partners' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17. ADMIN: GET DELIVERY PARTNER DETAILS & DOCUMENTS
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryPartnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id).lean();
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const recentOrders = await Order.find({ 'riderDetails.phone': partner.phone })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        partner,
        recentOrders,
      },
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryPartnerById] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching partner details' });
  }
};

// ─────────────────────────────────────────────────────────────
// 18. ADMIN: APPROVE DELIVERY PARTNER
// ─────────────────────────────────────────────────────────────
export const adminApproveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'APPROVED';
    partner.approvedAt = new Date();
    partner.rejectionReason = null;
    partner.documentVerification = {
      aadhaarVerified: true,
      panVerified: true,
      drivingLicenceVerified: true,
      vehicleRcVerified: true,
    };

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'APPROVE_PARTNER',
      reason: req.body.reason || 'All documents verified and approved',
      timestamp: new Date(),
    });

    await partner.save();

    safeSocketEmit(`rider:${partner.riderId}`, 'partner:approved', {
      riderId: partner.riderId,
      status: 'APPROVED',
    });

    logger.info(`[Admin] Delivery partner approved: ${partner.riderId}`);

    return res.status(200).json({
      success: true,
      message: `Delivery Partner ${partner.name} (${partner.riderId}) approved successfully!`,
      data: partner,
    });
  } catch (error) {
    logger.error(`[adminApproveDeliveryPartner] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error approving partner' });
  }
};

// ─────────────────────────────────────────────────────────────
// 19. ADMIN: REJECT DELIVERY PARTNER APPLICATION
// ─────────────────────────────────────────────────────────────
export const adminRejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Please provide a clear rejection reason' });
    }

    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'REJECTED';
    partner.rejectionReason = reason.trim();
    partner.rejectedAt = new Date();
    partner.isOnline = false;
    partner.status = 'OFFLINE';

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'REJECT_APPLICATION',
      reason: reason.trim(),
      timestamp: new Date(),
    });

    await partner.save();

    safeSocketEmit(`rider:${partner.riderId}`, 'partner:rejected', {
      riderId: partner.riderId,
      reason: partner.rejectionReason,
    });

    logger.info(`[Admin] Delivery partner rejected: ${partner.riderId} - ${reason}`);

    return res.status(200).json({
      success: true,
      message: `Application rejected with reason: "${reason}"`,
      data: partner,
    });
  } catch (error) {
    logger.error(`[adminRejectDeliveryPartner] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error rejecting partner' });
  }
};

// ─────────────────────────────────────────────────────────────
// 20. ADMIN: MARK APPLICATION UNDER REVIEW
// ─────────────────────────────────────────────────────────────
export const adminMarkUnderReview = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'UNDER_REVIEW';
    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'MARK_UNDER_REVIEW',
      reason: req.body.reason || 'Verification in progress',
      timestamp: new Date(),
    });

    await partner.save();

    return res.status(200).json({
      success: true,
      message: 'Application marked under review',
      data: partner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 21. ADMIN: SUSPEND / REACTIVATE DELIVERY PARTNER
// ─────────────────────────────────────────────────────────────
export const adminSuspendDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'SUSPENDED';
    partner.isSuspended = true;
    partner.suspensionReason = reason || 'Account suspended by administrator';
    partner.suspendedAt = new Date();
    partner.isOnline = false;
    partner.status = 'OFFLINE';

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'SUSPEND_PARTNER',
      reason: partner.suspensionReason,
      timestamp: new Date(),
    });

    await partner.save();

    return res.status(200).json({
      success: true,
      message: `Partner ${partner.name} has been suspended`,
      data: partner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminReactivateDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'APPROVED';
    partner.isSuspended = false;
    partner.suspensionReason = null;
    partner.suspendedAt = null;

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'REACTIVATE_PARTNER',
      reason: req.body.reason || 'Account reactivated after review',
      timestamp: new Date(),
    });

    await partner.save();

    return res.status(200).json({
      success: true,
      message: `Partner ${partner.name} has been reactivated`,
      data: partner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 22. ADMIN: LIVE DELIVERY OPERATIONS (ACTIVE ORDERS & UNASSIGNED)
// ─────────────────────────────────────────────────────────────
export const adminGetLiveDeliveryOperations = async (req, res) => {
  try {
    const [activeDeliveries, unassignedOrders, onlineRiders] = await Promise.all([
      Order.find({
        fulfillmentType: 'delivery',
        orderStatus: { $in: ['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'] },
      })
        .populate('vendorId', 'storeName phone address location')
        .sort({ updatedAt: -1 })
        .lean(),
      Order.find({
        fulfillmentType: 'delivery',
        orderStatus: { $in: ['PLACED', 'CONFIRMED', 'PREPARING'] },
        $or: [{ 'riderDetails.name': { $in: [null, ''] } }, { 'riderDetails.phone': { $in: [null, ''] } }],
      })
        .populate('vendorId', 'storeName phone address location')
        .sort({ createdAt: -1 })
        .lean(),
      DeliveryPartner.find({
        isOnline: true,
        applicationStatus: 'APPROVED',
      })
        .select('name phone riderId vehicleType vehicleNo status currentLocation')
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        activeDeliveries,
        unassignedOrders,
        onlineRiders,
        totalActive: activeDeliveries.length,
        totalUnassigned: unassignedOrders.length,
        totalOnlineRiders: onlineRiders.length,
      },
    });
  } catch (error) {
    logger.error(`[adminGetLiveDeliveryOperations] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching operations' });
  }
};

// ─────────────────────────────────────────────────────────────
// 23. ADMIN: MANUAL ORDER ASSIGN / REASSIGN
// ─────────────────────────────────────────────────────────────
export const adminAssignDeliveryOrder = async (req, res) => {
  try {
    const { orderId, riderId } = req.body;

    const [order, rider] = await Promise.all([
      Order.findById(orderId),
      DeliveryPartner.findById(riderId),
    ]);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!rider) return res.status(404).json({ success: false, message: 'Delivery partner not found' });

    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Selected rider is not approved' });
    }

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

    logger.info(`[Admin] Order ${order.orderId} manually assigned to ${rider.name}`);

    return res.status(200).json({
      success: true,
      message: `Order assigned to ${rider.name} successfully!`,
      data: order,
    });
  } catch (error) {
    logger.error(`[adminAssignDeliveryOrder] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error assigning order' });
  }
};

// ─────────────────────────────────────────────────────────────
// 24. ADMIN: CANCEL DELIVERY ASSIGNMENT
// ─────────────────────────────────────────────────────────────
export const adminCancelDeliveryAssignment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.riderDetails?.phone) {
      const rider = await DeliveryPartner.findOne({ phone: order.riderDetails.phone });
      if (rider && String(rider.activeOrderId) === String(order._id)) {
        rider.activeOrderId = null;
        rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
        await rider.save();
      }
    }

    order.riderDetails = null;
    order.orderStatus = 'PREPARING';
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Delivery assignment cancelled. Order returned to unassigned queue.',
      data: order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
