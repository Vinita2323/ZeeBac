import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import RewardConfig from '../models/RewardConfig.js';
import { creditWallet, debitWallet, InsufficientBalanceError } from '../utils/wallet.util.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket/socket.js';
import logger from '../utils/logger.js';

// ─── 1. Create Order (Shopping with Product-Level Cashback & Direct UPI Intent) ───
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      vendorZeebacId,
      items,
      fulfillmentType = 'delivery',
      deliveryAddress,
      orderNotes,
      paymentMethod = 'UPI_INTENT',
      redeemPoints = 0,
    } = req.body;

    if (!vendorZeebacId) {
      return res.status(400).json({ success: false, message: 'Vendor Zeebac ID is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required in the cart' });
    }

    const customer = await User.findById(req.user.id);
    if (!customer || customer.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Active customer account required' });
    }

    const cleanZeebacId = (vendorZeebacId || '').trim();
    const vendorQuery = {
      $or: [
        { zeebacId: cleanZeebacId.toUpperCase() },
        { zeebacId: cleanZeebacId },
        ...(mongoose.Types.ObjectId.isValid(cleanZeebacId) ? [{ _id: cleanZeebacId }] : []),
      ],
    };

    let vendor = await Vendor.findOne(vendorQuery);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // ── Build line items with individual product cashback percentages ──
    let totalGrossAmount = 0;
    let totalCashbackPoints = 0;
    const processedItems = [];

    // Only query database for IDs that are valid MongoDB ObjectIds (prevents Cast to ObjectId error)
    const validProductObjectIds = items
      .map((i) => (i.productId || i._id || i.id || '').toString().trim())
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

    const dbProducts = validProductObjectIds.length > 0
      ? await Product.find({ _id: { $in: validProductObjectIds } })
      : [];
    const productMap = new Map();
    dbProducts.forEach((p) => productMap.set(p._id.toString(), p));

    for (const item of items) {
      const rawId = (item.productId || item._id || item.id || '').toString().trim();
      const dbProd = mongoose.Types.ObjectId.isValid(rawId) ? productMap.get(rawId) : null;

      const price = Number(dbProd ? dbProd.price : item.price) || 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      
      // Decided cashback percentage for THIS product (per-product / company model)
      const cashbackRate = Number(
        dbProd?.cashbackPercentage !== undefined
          ? dbProd.cashbackPercentage
          : (dbProd?.branding?.cashbackPercentage !== undefined
              ? dbProd.branding.cashbackPercentage
              : (item.cashbackPercentage !== undefined ? item.cashbackPercentage : (vendor.cashbackRate || 0)))
      );
      const boundedRate = Math.max(0, Math.min(100, cashbackRate));

      // Calculate cashback points earned on this product line (1 Point = ₹1)
      const lineTotal = price * quantity;
      const lineCashbackPoints = Math.round((lineTotal * (boundedRate / 100)) * 100) / 100;

      totalGrossAmount += lineTotal;
      totalCashbackPoints += lineCashbackPoints;

      processedItems.push({
        productId: dbProd?._id || (mongoose.Types.ObjectId.isValid(rawId) ? new mongoose.Types.ObjectId(rawId) : undefined),
        name: dbProd?.name || item.name || 'Store Product',
        price,
        quantity,
        cashbackPercentage: boundedRate,
        cashbackPoints: lineCashbackPoints,
        image: dbProd?.image || item.image || null,
        category: dbProd?.category || item.category || 'General',
        brandName: dbProd?.branding?.brandName || item.brandName || null,
      });
    }

    totalGrossAmount = Math.round(totalGrossAmount * 100) / 100;
    totalCashbackPoints = Math.round(totalCashbackPoints * 100) / 100;

    // ── Calculate Item Subtotal, Delivery Fee, Packaging Fee & Admin Tax ──
    const itemTotal = totalGrossAmount;

    let deliveryCharge = 0;
    let packagingCharge = 0;
    if (fulfillmentType === 'delivery') {
      const freeAbove = Number(vendor.deliverySettings?.freeDeliveryAbove) || 499;
      if (itemTotal >= freeAbove) {
        deliveryCharge = 0;
      } else {
        deliveryCharge = Number(vendor.deliverySettings?.deliveryCharge ?? 30);
      }
      packagingCharge = Number(vendor.deliverySettings?.packagingCharge ?? 10);
    }

    // Statutory GST Tax decided by Admin from RewardConfig
    const rewardConfig = await RewardConfig.findOne();
    const taxPercentage = rewardConfig?.enableOrderTax !== false ? (Number(rewardConfig?.orderGstTaxPercent) ?? 5) : 0;
    const taxAmount = Math.round((itemTotal * (taxPercentage / 100)) * 100) / 100;

    // Total gross bill amount (itemTotal + deliveryCharge + packagingCharge + taxAmount)
    const totalBillAmount = Math.round((itemTotal + deliveryCharge + packagingCharge + taxAmount) * 100) / 100;

    // ── Handle Customer Zeebac Points Redemption (1 Point = ₹1) ──
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: { $in: ['User', 'user', 'Customer', 'customer'] } });
    const availablePoints = customerWallet ? Math.max(0, customerWallet.balance || 0) : 0;

    let pointsToRedeem = Math.max(0, Number(redeemPoints) || 0);
    if (pointsToRedeem > availablePoints) {
      pointsToRedeem = availablePoints;
    }
    if (pointsToRedeem > totalBillAmount) {
      pointsToRedeem = totalBillAmount;
    }
    pointsToRedeem = Math.round(pointsToRedeem * 100) / 100;

    const finalPayableAmount = Math.max(0, Math.round((totalBillAmount - pointsToRedeem) * 100) / 100);

    // ── Format delivery address safely as a string (prevents Mongoose CastError on object) ──
    let resolvedDeliveryAddress = 'Customer Address';
    if (typeof deliveryAddress === 'string' && deliveryAddress.trim()) {
      resolvedDeliveryAddress = deliveryAddress.trim();
    } else if (typeof deliveryAddress === 'object' && deliveryAddress !== null) {
      const parts = [
        deliveryAddress.fullAddress || deliveryAddress.street,
        deliveryAddress.landmark,
        deliveryAddress.city,
        deliveryAddress.state,
        deliveryAddress.pincode,
      ].filter(Boolean);
      resolvedDeliveryAddress = parts.join(', ') || 'Customer Address';
    } else if (customer.location?.address) {
      resolvedDeliveryAddress = typeof customer.location.address === 'string'
        ? customer.location.address
        : ([
            customer.location.address.fullAddress || customer.location.address.street,
            customer.location.address.landmark,
            customer.location.address.city,
            customer.location.address.state,
            customer.location.address.pincode,
          ].filter(Boolean).join(', ') || 'Customer Address');
    }

    // ── Generate Order ID & Delivery OTP ──
    const orderId = `ZBC-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // ── Direct UPI Intent Setup ──
    const payeeVpa = vendor.bankDetails?.upiId || process.env.MERCHANT_UPI_ID || process.env.ADMIN_UPI_ID || 'zeebac@upi';
    const payeeName = vendor.storeName || 'ZeeBac Store';
    const txnRef = orderId;
    const upiNote = `ZeeBac Order ${orderId}`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(finalPayableAmount.toFixed(2))}&cu=INR&tr=${encodeURIComponent(txnRef)}&tn=${encodeURIComponent(upiNote)}`;

    let resolvedPaymentMethod = paymentMethod;
    let initialPaymentStatus = 'PENDING';
    let initialOrderStatus = 'PLACED';

    if (finalPayableAmount === 0 && pointsToRedeem > 0) {
      resolvedPaymentMethod = 'ZEEBAC_POINTS';
      initialPaymentStatus = 'PAID';
    } else if (paymentMethod === 'CASH') {
      resolvedPaymentMethod = 'CASH';
      initialPaymentStatus = 'PENDING';
    }

    let createdOrder;
    const executeOrderCreation = async (activeSession) => {
      // If customer redeemed Zeebac points, debit atomically
      if (pointsToRedeem > 0) {
        await debitWallet({
          session: activeSession,
          ownerId: customer._id,
          ownerType: 'User',
          amount: pointsToRedeem,
          category: 'purchase',
          description: `Used ${pointsToRedeem} Zeebac Points for Order ${orderId}`,
        });
      }

      const newOrder = new Order({
        orderId,
        customerId: customer._id,
        customerName: customer.name || customer.phone || 'ZeeBac Customer',
        customerPhone: customer.phone || '9999999999',
        vendorId: vendor._id,
        vendorZeebacId: vendor.zeebacId || cleanZeebacId || 'ZBV-1001',
        storeName: vendor.storeName || 'ZeeBac Partner Store',
        items: processedItems,
        totalAmount: totalGrossAmount,
        pointsRedeemed: pointsToRedeem,
        finalPayableAmount,
        totalCashbackPoints,
        fulfillmentType,
        deliveryAddress: resolvedDeliveryAddress,
        orderNotes: typeof orderNotes === 'string' ? orderNotes : '',
        paymentMethod: resolvedPaymentMethod,
        paymentStatus: initialPaymentStatus,
        upiDetails: {
          payeeVpa,
          payeeName,
          txnRef,
          upiUri,
        },
        orderStatus: initialOrderStatus,
        riderDetails: {
          deliveryOtp,
        },
        cashbackSettled: false,
      });

      if (activeSession) {
        await newOrder.save({ session: activeSession });
      } else {
        await newOrder.save();
      }
      createdOrder = newOrder;
    };

    try {
      await session.withTransaction(async () => {
        await executeOrderCreation(session);
      });
    } catch (txErr) {
      if (txErr instanceof InsufficientBalanceError) {
        throw txErr;
      }
      // If transactions are unsupported (e.g. standalone Mongo deployment), fall back gracefully
      if (txErr.message && (txErr.message.includes('Transaction numbers are only allowed') || txErr.message.includes('replica set'))) {
        logger.warn(`[Order] MongoDB host does not support transactions, running non-transactional fallback: ${txErr.message}`);
        await executeOrderCreation(null);
      } else {
        throw txErr;
      }
    }

    // ── Real-time Socket Event to Vendor ──
    try {
      getIO().to(`vendor_${vendor._id}`).emit('order:new', {
        order: createdOrder,
        message: `New order #${orderId} received!`,
      });
    } catch (ioErr) {
      logger.warn(`createOrder socket emit skipped: ${ioErr.message}`);
    }

    // Send push notification to vendor
    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'system',
      title: 'New Store Order Received!',
      message: `Order #${orderId} of ₹${totalGrossAmount} placed by ${customer.name}.`,
      referenceId: createdOrder._id,
      referenceType: 'Order',
    }).catch(() => {});

    logger.info(`[Order] Created: ${orderId} | Customer: ${customer.zeebacId} | Payable: ₹${finalPayableAmount} | Points Earned: ${totalCashbackPoints}`);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        order: createdOrder,
        upiDetails: {
          upiUri,
          payeeVpa,
          payeeName,
          amount: finalPayableAmount,
          txnRef,
          note: upiNote,
        },
        pointsSummary: {
          pointsRedeemed: pointsToRedeem,
          totalCashbackPoints,
          availablePointsAfter: Math.max(0, availablePoints - pointsToRedeem),
        },
      },
    });
  } catch (error) {
    logger.error(`createOrder error: ${error.message}`);
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Insufficient Zeebac Points balance' });
    }
    res.status(500).json({ success: false, message: error.message || 'Server Error creating order', error: error.message });
  } finally {
    session.endSession();
  }
};

// ─── 2. Verify Direct UPI Payment (by Customer with 12-digit UTR or Instant Confirm) ───
export const verifyOrderUpiPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { utr } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify ownership
    if (order.customerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(200).json({
        success: true,
        message: 'Order payment is already confirmed',
        data: { order },
      });
    }

    const cleanUtr = (utr || '').toString().trim();
    if (cleanUtr) {
      // Check if UTR already used
      const existingTx = await WalletTransaction.findOne({ 'gateway.utr': cleanUtr });
      const existingOrder = await Order.findOne({ 'upiDetails.utr': cleanUtr, _id: { $ne: order._id } });
      if (existingTx || existingOrder) {
        return res.status(409).json({ success: false, message: 'This UPI Reference ID / UTR has already been claimed' });
      }
      order.upiDetails.utr = cleanUtr;
    }

    order.paymentStatus = 'PAID';
    order.upiDetails.paidAt = new Date();
    if (order.orderStatus === 'PLACED') {
      order.orderStatus = 'CONFIRMED';
    }
    await order.save();

    // Notify vendor
    try {
      getIO().to(`vendor_${order.vendorId}`).emit('order:paid', {
        orderId: order.orderId,
        paymentStatus: 'PAID',
        utr: cleanUtr,
      });
      getIO().to(`user_${order.customerId}`).emit('order:paid', {
        orderId: order.orderId,
        paymentStatus: 'PAID',
      });
    } catch (ioErr) {}

    sendNotification({
      recipientId: order.vendorId,
      recipientType: 'vendor',
      type: 'credit',
      title: 'UPI Payment Confirmed!',
      message: `Payment of ₹${order.finalPayableAmount} received for Order #${order.orderId}.`,
      referenceId: order._id,
      referenceType: 'Order',
    }).catch(() => {});

    logger.info(`[Order] Payment confirmed: ${order.orderId} via UPI`);

    res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully! Merchant is preparing your order.',
      data: { order },
    });
  } catch (error) {
    logger.error(`verifyOrderUpiPayment error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── 3. Assign Rider to Order (Vendor Action) ───
export const assignRider = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { name, phone, vehicleNo } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Rider Name and Phone are required' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const order = await Order.findOne({ orderId, vendorId: vendor._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.riderDetails = {
      name: name.trim(),
      phone: phone.trim(),
      vehicleNo: (vehicleNo || '').trim(),
      deliveryOtp: order.riderDetails?.deliveryOtp || Math.floor(1000 + Math.random() * 9000).toString(),
      assignedAt: new Date(),
    };
    order.orderStatus = 'RIDER_ASSIGNED';
    await order.save();

    // Real-time alerts
    try {
      getIO().to(`user_${order.customerId}`).emit('order:rider_assigned', {
        orderId: order.orderId,
        rider: order.riderDetails,
        orderStatus: order.orderStatus,
      });
    } catch (_) {}

    sendNotification({
      recipientId: order.customerId,
      recipientType: 'customer',
      type: 'system',
      title: 'Rider Assigned! 🛵',
      message: `${name} has been assigned for your order #${order.orderId}.`,
      referenceId: order._id,
      referenceType: 'Order',
    }).catch(() => {});

    logger.info(`[Order] Rider assigned: ${order.orderId} -> Rider: ${name}`);

    res.status(200).json({
      success: true,
      message: 'Rider assigned successfully',
      data: { order },
    });
  } catch (error) {
    logger.error(`assignRider error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── 4. Update Order Status (Vendor / Rider / Admin) ───
// When status becomes 'DELIVERED':
// Automatic payout of decided product cashback points to Customer
// AND automatic debit of that exact cashback points from Merchant Prepaid Pool!
export const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { orderId } = req.params;
    const { status, deliveryOtp } = req.body;

    const validStatuses = ['PLACED', 'CONFIRMED', 'PREPARING', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Ensure authorized vendor or admin
    if (req.user.role === 'vendor' && order.vendorId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (order.orderStatus === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Order is already marked as DELIVERED' });
    }

    // ── Delivery Verification & Automatic Cashback Points Settlement ──
    if (status === 'DELIVERED') {
      // Verify OTP if provided and present
      if (order.riderDetails?.deliveryOtp && deliveryOtp) {
        if (order.riderDetails.deliveryOtp !== deliveryOtp.trim()) {
          return res.status(400).json({ success: false, message: 'Invalid Delivery OTP' });
        }
      }

      const customer = await User.findById(order.customerId);
      const vendor = await Vendor.findById(order.vendorId);

      await session.withTransaction(async () => {
        // 1. Mark order delivered
        order.orderStatus = 'DELIVERED';
        order.paymentStatus = 'PAID'; // Delivered means payment completed
        if (!order.riderDetails) order.riderDetails = {};
        order.riderDetails.deliveredAt = new Date();

        // 2. Settle Cashback Points if not already settled
        if (!order.cashbackSettled && order.totalCashbackPoints > 0) {
          // A) Credit Customer with Zeebac Points (1 Point = 1 INR)
          await creditWallet({
            session,
            ownerId: customer._id,
            ownerType: 'User',
            ownerZeebacId: customer.zeebacId,
            amount: order.totalCashbackPoints,
            category: 'cashback',
            description: `Earned ${order.totalCashbackPoints} Zeebac Points on Order ${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
          });

          // B) Debit Merchant's Prepaid Cashback Reserve Pool (Zeebac Advance Account)
          await debitWallet({
            session,
            ownerId: vendor._id,
            ownerType: 'Vendor',
            amount: order.totalCashbackPoints,
            category: 'cashback_payout',
            description: `Cashback points deducted for Order ${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
            allowNegativeBalance: true, // Guarantees customer always receives promised cashback even if vendor pool dips
          });

          order.cashbackSettled = true;
          order.settledAt = new Date();
        }

        await order.save({ session });
      });

      // Real-time notification & Socket Chimes
      try {
        getIO().to(`user_${order.customerId}`).emit('order:delivered', {
          orderId: order.orderId,
          orderStatus: 'DELIVERED',
          cashbackEarned: order.totalCashbackPoints,
          message: `Order #${order.orderId} delivered! ₹${order.totalCashbackPoints} Zeebac Points credited.`,
        });
        getIO().to(`user_${order.customerId}`).emit('cashback:credited', {
          points: order.totalCashbackPoints,
        });
        getIO().to(`vendor_${order.vendorId}`).emit('order:delivered', {
          orderId: order.orderId,
          orderStatus: 'DELIVERED',
        });
      } catch (_) {}

      // Push notification to Customer
      sendNotification({
        recipientId: order.customerId,
        recipientType: 'customer',
        fcmTokens: customer?.fcmTokens || [],
        type: 'credit',
        title: 'Order Delivered! 🎉',
        message: `Your order #${order.orderId} was delivered. You earned ${order.totalCashbackPoints} Zeebac Points!`,
        referenceId: order._id,
        referenceType: 'Order',
      }).catch(() => {});

      // Push notification to Vendor
      sendNotification({
        recipientId: order.vendorId,
        recipientType: 'vendor',
        fcmTokens: vendor?.fcmTokens || [],
        type: 'system',
        title: 'Order Delivered Successfully',
        message: `Order #${order.orderId} completed. ${order.totalCashbackPoints} points deducted from your cashback reserve.`,
        referenceId: order._id,
        referenceType: 'Order',
      }).catch(() => {});

      logger.info(`[Order] Delivered: ${order.orderId} | Points Settled: ${order.totalCashbackPoints}`);

      return res.status(200).json({
        success: true,
        message: `Order delivered successfully! ${order.totalCashbackPoints} Zeebac Points credited to customer.`,
        data: { order },
      });
    }

    // ── Handle Order Cancellation ──
    if (status === 'CANCELLED') {
      await session.withTransaction(async () => {
        order.orderStatus = 'CANCELLED';

        // Refund redeemed Zeebac points if any
        if (order.pointsRedeemed > 0) {
          const customer = await User.findById(order.customerId);
          await creditWallet({
            session,
            ownerId: customer._id,
            ownerType: 'User',
            ownerZeebacId: customer.zeebacId,
            amount: order.pointsRedeemed,
            category: 'refund',
            description: `Refund of ${order.pointsRedeemed} Zeebac Points for cancelled Order ${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
          });
        }

        await order.save({ session });
      });

      try {
        getIO().to(`user_${order.customerId}`).emit('order:cancelled', { orderId: order.orderId });
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order },
      });
    }

    // ── Regular Status Update (CONFIRMED, PREPARING, OUT_FOR_DELIVERY) ──
    order.orderStatus = status;
    await order.save();

    try {
      getIO().to(`user_${order.customerId}`).emit('order:status_update', {
        orderId: order.orderId,
        orderStatus: status,
      });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: { order },
    });
  } catch (error) {
    logger.error(`updateOrderStatus error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  } finally {
    session.endSession();
  }
};

// ─── 5. Get Customer's Orders ───
export const getMyCustomerOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { customerId: req.user.id };
    if (status) query.orderStatus = status;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`getMyCustomerOrders error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── 6. Get Single Order Details ───
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { orderId: id }] } : { orderId: id };

    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Authorization check
    const isOwner = order.customerId.toString() === req.user.id;
    const isVendor = order.vendorId.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isVendor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    logger.error(`getOrderById error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── 7. Get Vendor's Incoming Store Orders ───
export const getVendorOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { vendorId: req.user.id };
    if (status) query.orderStatus = status;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`getVendorOrders error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── 8. Merchant Prepaid Cashback Reserve Top-Up (Direct UPI Intent) ───
export const createVendorCashbackReserveUpiIntent = async (req, res) => {
  try {
    const { amount } = req.body;
    const depositAmount = Number(amount);
    if (!depositAmount || depositAmount < 1) {
      return res.status(400).json({ success: false, message: 'Invalid deposit amount. Minimum is ₹1.' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const refId = `RES-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
    const payeeVpa = process.env.ADMIN_UPI_ID || process.env.MERCHANT_UPI_ID || 'zeebac@upi';
    const payeeName = 'ZeeBac Cashback Reserve';
    const note = `Cashback Reserve Deposit ${vendor.zeebacId}`;

    const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(depositAmount.toFixed(2))}&cu=INR&tr=${encodeURIComponent(refId)}&tn=${encodeURIComponent(note)}`;

    res.status(200).json({
      success: true,
      data: {
        upiUri,
        payeeVpa,
        payeeName,
        amount: depositAmount,
        refId,
        vendorZeebacId: vendor.zeebacId,
      },
    });
  } catch (error) {
    logger.error(`createVendorCashbackReserveUpiIntent error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── 9. Claim Merchant Cashback Reserve Deposit via 12-digit UTR ───
export const claimVendorCashbackReserveUpi = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { utr, amount } = req.body;
    const cleanUtr = (utr || '').toString().trim();
    if (!/^\d{12}$/.test(cleanUtr)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI Reference ID / UTR. Must be exactly 12 digits.' });
    }

    const depositAmount = Number(amount);
    if (!depositAmount || depositAmount < 1) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    // Check UTR duplicate
    const existingTx = await WalletTransaction.findOne({ 'gateway.utr': cleanUtr });
    if (existingTx) {
      return res.status(409).json({ success: false, message: 'This UPI Reference ID has already been credited to a wallet.' });
    }

    let updatedWallet;
    await session.withTransaction(async () => {
      updatedWallet = await creditWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        ownerZeebacId: vendor.zeebacId,
        amount: depositAmount,
        category: 'reserve_topup',
        description: `Prepaid Cashback Reserve Top-up via UPI Intent (UTR: ${cleanUtr})`,
        gateway: {
          gatewayName: 'None',
          utr: cleanUtr,
        },
      });
    });

    logger.info(`[Cashback Reserve] Vendor ${vendor.zeebacId} topped up ₹${depositAmount} via UTR ${cleanUtr}`);

    res.status(200).json({
      success: true,
      message: `₹${depositAmount} added to your Prepaid Cashback Reserve Pool successfully!`,
      data: { balance: updatedWallet.balance },
    });
  } catch (error) {
    logger.error(`claimVendorCashbackReserveUpi error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  } finally {
    session.endSession();
  }
};
