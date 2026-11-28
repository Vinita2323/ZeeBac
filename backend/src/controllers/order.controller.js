import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import RewardConfig from '../models/RewardConfig.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';
import { emitNewDeliveryOrderToOnlineRiders } from '../utils/riderPresence.util.js';
import Review from '../models/Review.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import { calculateDeliveryPayout, estimateDistanceKm } from '../utils/deliveryPayout.util.js';
import { creditWallet, debitWallet, InsufficientBalanceError } from '../utils/wallet.util.js';
import {
  getVendorRedemptionCapacity,
  recordCashbackIssuance,
  recordCashbackRedemption,
} from '../utils/cashbackSettlement.util.js';
import { isManufacturerOrWholesaler } from '../utils/vendorApplication.util.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket/socket.js';
import logger from '../utils/logger.js';
import { computeOrderCharges } from '../utils/orderPricing.util.js';
import { creditSellerForDeliveredOrder, reverseOrderCredit } from '../utils/sellerSettlement.util.js';
import { recordCompletedOrderUsage } from '../utils/orderUsage.util.js';
import { cancelOrder, CancellationError } from '../utils/orderCancellation.util.js';
import { deductOrderStock } from '../utils/orderStock.util.js';
import { runInTransaction } from '../utils/sellerSettlement.util.js';
import { computeLateCancellationPenalty, getMinRedeemablePoints, redemptionBlockedReason, LATE_CANCEL_STAGES } from '../utils/pointsPolicy.util.js';
import { createRazorpayCheckoutOrder, applyCapturedOrderPayment, initiateOrderRefund } from '../utils/orderPayment.util.js';
import { getRazorpayInstance, verifyRazorpaySignature } from '../utils/razorpay.util.js';

const safeSocketEmit = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      if (room) io.to(room).emit(event, data);
      else io.emit(event, data);
    }
  } catch (_) {}
};

// ─── 1. Create Order (Shopping with Product-Level Cashback & Direct UPI Intent) ───
// The pickup code is the customer's proof of collection — never send it to the store.
const hidePickupCodeForVendor = (order) => {
  if (!order) return order;
  const obj = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  if (obj.riderDetails) {
    obj.riderDetails = { ...obj.riderDetails };
    delete obj.riderDetails.deliveryOtp;
  }
  return obj;
};

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      vendorZeebacId,
      items,
      fulfillmentType = 'delivery',
      deliverySchedule,
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

    // Direct customer orders are strictly restricted to retailers (B2C)
    // Manufacturers & Wholesalers exclusively fulfill B2B purchase orders from retail merchants
    if (isManufacturerOrWholesaler(vendor.businessType)) {
      return res.status(400).json({
        success: false,
        message: 'Direct customer orders are not accepted by Manufacturers or Wholesalers. This store only supplies to registered retail merchants.',
      });
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

      // Dark store shelf & bin location from product WMS mapping
      const rack = dbProd?.warehouseLocation?.rack || (dbProd?.category ? `${dbProd.category[0].toUpperCase()}01` : 'A01');
      const shelf = dbProd?.warehouseLocation?.shelf || 'S01';
      const bin = dbProd?.warehouseLocation?.bin || 'B01';
      const binCode = dbProd?.warehouseLocation?.binCode || `${rack}-${shelf}-${bin}`;

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
        binCode,
        warehouseLocation: {
          rack,
          shelf,
          bin,
          binCode,
        },
        barcode: dbProd?.barcode || item.barcode || '',
        batchNumber: dbProd?.batchNumber || item.batchNumber || '',
        expiryDate: dbProd?.expiryDate || item.expiryDate || '',
        picked: false,
        pickedQuantity: 0,
      });
    }

    totalGrossAmount = Math.round(totalGrossAmount * 100) / 100;
    totalCashbackPoints = Math.round(totalCashbackPoints * 100) / 100;

    // ── Calculate Item Subtotal, Delivery Fee, Packaging Fee & Admin Tax ──
    const itemTotal = totalGrossAmount;

    // Centralized pricing: delivery fee, platform fee & GST set by ADMIN (admin's share);
    // packaging set by the SELLER (seller's share). See utils/orderPricing.util.js.
    const rewardConfig = await RewardConfig.findOne();
    const charges = computeOrderCharges({
      itemTotal,
      fulfillmentType,
      vendor,
      rewardConfig,
      tip: Number(req.body.tipAmount) || 0,
    });
    const safeDelivery = charges.deliveryCharge;
    const safePackaging = charges.packagingCharge;
    const safeTax = charges.taxAmount;
    const taxPercentage = charges.taxPercentage;
    const platformFee = charges.platformFee;
    const tipAmount = charges.tipAmount;
    const totalBillAmount = charges.grossTotal;

    // ── Smart Cashback & Settlement Redemption Capacity Check ──
    const vendorCapacity = getVendorRedemptionCapacity(vendor);

    // ── Handle Customer Zeebac Points Redemption (1 Point = ₹1) ──
    const customerWallet = await Wallet.findOne({ ownerId: customer._id, ownerType: { $in: ['User', 'user', 'Customer', 'customer'] } });
    const availablePoints = customerWallet ? Math.max(0, customerWallet.balance || 0) : 0;

    let pointsToRedeem = Math.max(0, Number(redeemPoints) || 0);

    // Minimum balance before any redemption (default 100 points)
    if (pointsToRedeem > 0) {
      const minRedeemable = await getMinRedeemablePoints();
      const blocked = redemptionBlockedReason(customerWallet?.balance || 0, minRedeemable);
      if (blocked) {
        return res.status(400).json({ success: false, code: 'MIN_REDEEM_BALANCE', message: blocked, minRedeemablePoints: minRedeemable });
      }
    }

    // If customer attempted redemption but merchant capacity is exhausted
    if (pointsToRedeem > 0 && vendorCapacity.remainingCapacity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Customer can't redeem points / Reason: Redemption limit reached for this store",
        reason: 'Redemption limit reached',
        remainingCapacity: 0,
        totalCapacity: vendorCapacity.totalCapacity,
      });
    }

    // Cap redemption to vendor remaining capacity, user balance, and total bill
    if (pointsToRedeem > vendorCapacity.remainingCapacity) {
      pointsToRedeem = vendorCapacity.remainingCapacity;
    }
    if (pointsToRedeem > availablePoints) {
      pointsToRedeem = availablePoints;
    }
    if (pointsToRedeem > totalBillAmount) {
      pointsToRedeem = totalBillAmount;
    }
    pointsToRedeem = Math.round(pointsToRedeem * 100) / 100;

    const finalPayableAmount = Math.max(0, Math.round((totalBillAmount - pointsToRedeem) * 100) / 100);

    // ── Calculate Cashback Strictly on Actual Eligible Paid Amount (NEVER on redeemed points!) ──
    const paidRatio = totalBillAmount > 0 ? (finalPayableAmount / totalBillAmount) : 0;
    totalCashbackPoints = Math.round(totalCashbackPoints * paidRatio * 100) / 100;

    // Adjust each item's cashback points pro-rata by actual cash/online paid portion
    processedItems.forEach((it) => {
      it.cashbackPoints = Math.round(it.cashbackPoints * paidRatio * 100) / 100;
    });

    // ── Smart Cashback Issuance Capacity Cap ──
    const effectiveIssuanceCapacity = Math.round(((vendorCapacity.remainingIssuanceCapacity || 0) + pointsToRedeem) * 100) / 100;
    if (totalCashbackPoints > effectiveIssuanceCapacity) {
      totalCashbackPoints = Math.max(0, effectiveIssuanceCapacity);
      processedItems.forEach((it) => {
        it.cashbackPoints = Math.min(it.cashbackPoints, totalCashbackPoints);
      });
    }

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

    // Auto-save delivery address to customer profile if not already saved
    if (fulfillmentType === 'delivery' && resolvedDeliveryAddress && resolvedDeliveryAddress !== 'Customer Address') {
      try {
        if (!customer.savedAddresses) customer.savedAddresses = [];
        const isAlreadySaved = customer.savedAddresses.some((a) => {
          return a.houseNo && resolvedDeliveryAddress.includes(a.houseNo);
        });
        if (!isAlreadySaved) {
          let recName = customer.name || 'Customer';
          let recPhone = customer.phone || '';
          let house = resolvedDeliveryAddress;
          const recipientMatch = resolvedDeliveryAddress.match(/\(([^,]+),\s*(\d+)\)$/);
          if (recipientMatch) {
            recName = recipientMatch[1].trim();
            recPhone = recipientMatch[2].trim();
            house = resolvedDeliveryAddress.replace(/\s*\([^)]+\)$/, '').trim();
          }

          customer.savedAddresses.push({
            label: customer.savedAddresses.length === 0 ? 'Home' : 'Other',
            houseNo: house,
            street: '',
            landmark: '',
            city: customer.location?.city || 'Indore',
            state: customer.location?.state || 'Madhya Pradesh',
            pincode: customer.location?.pincode || '',
            receiverName: recName,
            receiverPhone: recPhone,
            isDefault: customer.savedAddresses.length === 0,
            createdAt: new Date(),
          });
          await customer.save();
        }
      } catch (saveAddrErr) {
        logger.warn(`Could not auto-save address to customer: ${saveAddrErr.message}`);
      }
    }

    // ── Generate Order ID, Delivery OTP & Pickup OTP ──
    const orderId = `ZBC-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // ── Centralized collection ──
    // Every online cart payment goes to the ADMIN Razorpay account (no direct-to-seller UPI).
    // CASH = COD for delivery, or pay-at-store (seller bills in store) for pickup.
    const payeeVpa = '';
    const payeeName = vendor.storeName || 'ZeeBac Store';
    const txnRef = orderId;
    const upiUri = '';

    let resolvedPaymentMethod = 'ONLINE';
    let initialPaymentStatus = 'PENDING';
    let initialOrderStatus = 'PLACED';

    if (finalPayableAmount === 0 && pointsToRedeem > 0) {
      resolvedPaymentMethod = 'ZEEBAC_POINTS';
      initialPaymentStatus = 'PAID';
    } else if (paymentMethod === 'CASH') {
      resolvedPaymentMethod = 'CASH';
    } else if (finalPayableAmount === 0) {
      resolvedPaymentMethod = 'ZEEBAC_POINTS';
      initialPaymentStatus = 'PAID';
    }

    // Create the Razorpay order up-front so a gateway failure aborts before any points are debited.
    let razorpayOrder = null;
    if (resolvedPaymentMethod === 'ONLINE') {
      try {
        razorpayOrder = await createRazorpayCheckoutOrder({
          orderId,
          amount: finalPayableAmount,
          vendorId: vendor._id,
          customerId: customer._id,
        });
      } catch (rzpErr) {
        logger.error(`[createOrder] Razorpay order creation failed for ${orderId}: ${rzpErr.message || rzpErr?.error?.description}`);
        return res.status(502).json({ success: false, code: 'PAYMENT_GATEWAY_ERROR', message: 'Online payment is unavailable right now. Please try again or choose Cash.' });
      }
    }

    let createdOrder;
    const executeOrderCreation = async (activeSession) => {
      // If customer redeemed Zeebac points, debit atomically and record in Merchant Ledger
      if (pointsToRedeem > 0) {
        await debitWallet({
          session: activeSession,
          ownerId: customer._id,
          ownerType: 'User',
          amount: pointsToRedeem,
          category: 'purchase',
          description: `Used ${pointsToRedeem} Zeebac Points for Order ${orderId}`,
        });

        await recordCashbackRedemption({
          vendorId: vendor._id,
          amount: pointsToRedeem,
          customer,
          orderId,
          paymentMethod: 'Points',
          referenceType: 'Order',
          notes: `Customer redeemed ${pointsToRedeem} points on Order ${orderId}`,
          session: activeSession,
        });
      }

      // ── Calculate Dynamic Distance-Based Rider Payout ──
      let orderDistanceKm = 2.0;
      let payoutBreakdown = {
        baseFare: 30,
        baseDistanceIncludedKm: 0,
        distanceKm: 2.0,
        billableDistanceKm: 2.0,
        perKmRate: 10,
        distancePayout: 20,
        surgeBonus: 0,
        minPayout: 30,
        totalPayout: 50,
      };

      try {
        const vendorCoords = vendor.location?.coordinates;
        const customerCoords = customer.location?.coordinates;
        orderDistanceKm = estimateDistanceKm({
          vendorCoords,
          customerCoords,
          fallbackKm: 2.0,
        });

        const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
        payoutBreakdown = calculateDeliveryPayout(orderDistanceKm, payoutConfig);
      } catch (payoutErr) {
        logger.warn(`[createOrder] Error calculating dynamic delivery payout: ${payoutErr.message}`);
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
        itemTotal,
        deliveryCharge: safeDelivery,
        packagingCharge: safePackaging,
        taxAmount: safeTax,
        platformFee,
        taxPercentage,
        tipAmount,
        totalAmount: totalGrossAmount,
        pointsRedeemed: pointsToRedeem,
        finalPayableAmount,
        totalCashbackPoints,
        fulfillmentType,
        deliverySchedule: {
          deliveryType: deliverySchedule?.deliveryType === 'SCHEDULED' ? 'SCHEDULED' : 'INSTANT',
          scheduledDate: deliverySchedule?.scheduledDate || '',
          scheduledSlot: deliverySchedule?.scheduledSlot || '',
        },
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
        pickupOtp,
        riderDetails: {
          deliveryOtp,
          pickupOtp,
        },
        deliveryDistanceKm: payoutBreakdown.distanceKm,
        deliveryPayout: payoutBreakdown.totalPayout,
        deliveryPayoutBreakdown: payoutBreakdown,
        cashbackSettled: false,
        ...(razorpayOrder ? { razorpay: { orderId: razorpayOrder.id, status: 'CREATED' } } : {}),
        financials: {
          commissionPercent: charges.sellerCommissionPercent,
          settlementStatus: fulfillmentType === 'pickup' && resolvedPaymentMethod === 'CASH' ? 'NOT_APPLICABLE' : 'PENDING',
        },
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

    // ── Real-time Socket Event & Push Notification to Vendor ──
    // IMPORTANT: For online/UPI payments, do NOT notify the store until payment is verified and confirmed!
    const isOnlinePaymentPending =
      ['ONLINE', 'RAZORPAY', 'UPI', 'UPI_INTENT'].includes(createdOrder.paymentMethod) &&
      createdOrder.paymentStatus !== 'PAID';

    if (!isOnlinePaymentPending) {
      try {
        const vendorPayload = {
          order: hidePickupCodeForVendor(createdOrder),
          orderId,
          storeName: vendor.storeName,
          totalAmount: totalGrossAmount,
          finalAmount: finalPayableAmount,
          customerName: customer.name || 'Customer',
          customerPhone: customer.phone || '',
          items: processedItems,
          deliveryAddress: resolvedDeliveryAddress,
          fulfillmentType,
          message: `New order #${orderId} received!`,
        };
        getIO().to(`vendor_${vendor._id}`).emit('order:new', vendorPayload);
        getIO().to(`vendor:${vendor._id}`).emit('order:new', vendorPayload);
        if (fulfillmentType === 'delivery') {
          const orderWithVendor = {
            ...(createdOrder.toObject ? createdOrder.toObject() : createdOrder),
            vendor: {
              _id: vendor._id,
              storeName: vendor.storeName,
              phone: vendor.phone,
              address: vendor.address,
              location: vendor.location,
              storeLogo: vendor.storeLogo || vendor.profilePic,
              city: vendor.address?.city || vendor.location?.city || 'Indore',
            },
          };
          emitNewDeliveryOrderToOnlineRiders({
            order: orderWithVendor,
            orderId,
            storeName: vendor.storeName,
            payout: createdOrder.deliveryPayout || 40,
            distanceKm: createdOrder.deliveryDistanceKm || 2.0,
            message: `New delivery order #${orderId} from ${vendor.storeName}!`,
          });
        }
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
    } else {
      logger.info(`[createOrder] Order #${orderId} created with PENDING UPI payment. Store notification held until Razorpay payment is captured.`);
    }

    logger.info(`[Order] Created: ${orderId} | Customer: ${customer.zeebacId} | Payable: ₹${finalPayableAmount} | Points Earned: ${totalCashbackPoints}`);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        order: createdOrder,
        upiDetails: null,
        razorpay: razorpayOrder
          ? {
              keyId: process.env.RAZORPAY_KEY_ID,
              razorpayOrderId: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency || 'INR',
              name: 'ZeeBac',
              description: `Order ${orderId} · ${vendor.storeName || 'ZeeBac Store'}`,
              prefill: { name: customer.name || '', contact: customer.phone || '' },
            }
          : null,
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

    const order = await Order.findOne(
      mongoose.isValidObjectId(orderId)
        ? { $or: [{ _id: orderId }, { orderId }] }
        : { orderId }
    );
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
    // Keep as PLACED so the Store sees the "Accept & Prepare Order" button with soundbox alert!
    if (!order.orderStatus || order.orderStatus === 'PLACED') {
      order.orderStatus = 'PLACED';
    }
    await order.save();

    // ── Emit order:new to Store with full order details and soundbox chime! ──
    try {
      const vendorPayload = {
        order: hidePickupCodeForVendor(order),
        orderId: order.orderId,
        storeName: order.storeName,
        totalAmount: order.totalAmount,
        finalAmount: order.finalPayableAmount,
        customerName: order.customerName || 'Customer',
        customerPhone: order.customerPhone || '',
        items: order.items,
        deliveryAddress: order.deliveryAddress,
        fulfillmentType: order.fulfillmentType,
        message: `New paid order #${order.orderId} received!`,
      };
      getIO().to(`vendor_${order.vendorId}`).emit('order:new', vendorPayload);
      getIO().to(`vendor:${order.vendorId}`).emit('order:new', vendorPayload);
      getIO().to(`vendor_${order.vendorId}`).emit('order:paid', {
        orderId: order.orderId,
        paymentStatus: 'PAID',
        utr: cleanUtr,
      });
      getIO().to(`vendor:${order.vendorId}`).emit('order:paid', {
        orderId: order.orderId,
        paymentStatus: 'PAID',
        utr: cleanUtr,
      });
      getIO().to(`user_${order.customerId}`).emit('order:paid', {
        orderId: order.orderId,
        paymentStatus: 'PAID',
        order,
      });
      if (order.fulfillmentType === 'delivery') {
        const vendorDoc = await Vendor.findById(order.vendorId)
          .select('storeName phone address location storeLogo city')
          .lean();
        const orderWithVendor = {
          ...(order.toObject ? order.toObject() : order),
          vendor: vendorDoc || { storeName: order.storeName },
        };
        emitNewDeliveryOrderToOnlineRiders({
          order: orderWithVendor,
          orderId: order.orderId,
          storeName: order.storeName,
          payout: order.deliveryPayout || 40,
          distanceKm: order.deliveryDistanceKm || 2.0,
          message: `New delivery order #${order.orderId} from ${order.storeName}!`,
        });
      }
    } catch (ioErr) {
      logger.warn(`verifyOrderUpiPayment socket emit skipped: ${ioErr.message}`);
    }

    sendNotification({
      recipientId: order.vendorId,
      recipientType: 'vendor',
      type: 'credit',
      title: 'New Paid Store Order Received! 🔔',
      message: `Payment of ₹${order.finalPayableAmount} verified for Order #${order.orderId}. Please accept and prepare.`,
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
export const assignRider = async (req, res) =>
  // Stores can no longer assign their own delivery boy: every delivery goes through a
  // ZeeBac rider so COD collection and seller settlement stay consistent.
  res.status(410).json({
    success: false,
    code: 'OWN_RIDER_DISABLED',
    message: 'Store-assigned delivery is no longer available. A ZeeBac delivery partner will pick up this order.',
  });

// ── Order status rules for the store (admin may override anything) ──
// Rider-driven stages (assigned → at store → picked up → on the way → at customer → delivered)
// are set only by the rider app. The store moves its own stages forward.
const RIDER_STAGES = ['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER', 'FAILED_DELIVERY'];
const VENDOR_TRANSITIONS = {
  PLACED: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'CANCELLED', 'DELIVERED'],
  CONFIRMED: ['PREPARING', 'READY_FOR_PICKUP', 'DELIVERED'],
  PREPARING: ['READY_FOR_PICKUP', 'DELIVERED'],
  READY_FOR_PICKUP: ['DELIVERED'],
};
// Delivery orders are always completed by a ZeeBac rider (with the customer's code), so the
// COD cash and settlement always flow through admin. Stores cannot self-deliver.

const vendorStatusError = (order, status) => {
  if (RIDER_STAGES.includes(status)) {
    return { code: 'RIDER_ONLY_STATUS', message: 'This status is updated by the delivery partner app.' };
  }
  if (status === 'DELIVERED' && order.fulfillmentType === 'delivery') {
    return {
      code: 'RIDER_OWNS_DELIVERY',
      message: 'Delivery orders are completed by the ZeeBac delivery partner when the customer shares their code. Contact support if there is a problem.',
    };
  }
  if (status === 'CANCELLED' && order.orderStatus !== 'PLACED') {
    return { code: 'ALREADY_ACCEPTED', message: 'Order already accepted and in progress. Accepted orders cannot be rejected.' };
  }
  const allowed = VENDOR_TRANSITIONS[order.orderStatus] || [];
  if (!allowed.includes(status)) {
    return { code: 'INVALID_TRANSITION', message: `Order is ${order.orderStatus.replaceAll('_', ' ').toLowerCase()} and cannot be changed to ${status.replaceAll('_', ' ').toLowerCase()}.` };
  }
  return null;
};

// Tell everyone who follows this order (customer, store, assigned rider, admins, order room).
const broadcastOrderStatus = (order, extra = {}) => {
  const payload = {
    orderId: order.orderId,
    _id: order._id,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    updatedBy: extra.updatedBy,
    ...extra,
  };
  const riderId = order.riderDetails?.riderId?._id || order.riderDetails?.riderId;
  const rooms = [
    `user_${order.customerId}`,
    `vendor_${order.vendorId}`,
    `vendor:${order.vendorId}`,
    `order:${order.orderId}`,
    `order:${order._id}`,
    'admins',
    ...(riderId ? [`rider_${riderId}`, `rider:${riderId}`] : []),
  ];
  for (const room of rooms) safeSocketEmit(room, 'order:status_update', payload);
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

    const validStatuses = [
      'PLACED',
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'ARRIVED_AT_PICKUP',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'ARRIVED_AT_CUSTOMER',
      'DELIVERED',
      'CANCELLED',
      'FAILED_DELIVERY'
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const order = await Order.findOne(
      mongoose.isValidObjectId(orderId)
        ? { $or: [{ _id: orderId }, { orderId }] }
        : { orderId }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Only the store that owns the order, or an admin, may change it here
    // (riders use /delivery routes; customers cannot change status).
    const isAdminActor = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdminActor && req.user.role !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (req.user.role === 'vendor' && order.vendorId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (req.user.role === 'vendor' && order.orderStatus !== status) {
      const err = ['DELIVERED', 'CANCELLED'].includes(order.orderStatus) ? null : vendorStatusError(order, status);
      if (err) return res.status(400).json({ success: false, ...err });
    }

    // Business Rule: Once an order is accepted by the merchant, it CANNOT be rejected or cancelled
    if (status === 'CANCELLED' && req.user.role === 'vendor' && order.orderStatus !== 'PLACED') {
      return res.status(400).json({
        success: false,
        message: 'Order already accepted and in progress. Accepted orders cannot be rejected.'
      });
    }

    if (order.orderStatus === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Order is already marked as DELIVERED' });
    }

    // ── Delivery Verification & Automatic Cashback Points Settlement ──
    if (status === 'DELIVERED') {
      const expectedOtp = order.riderDetails?.deliveryOtp ? String(order.riderDetails.deliveryOtp) : '';
      const givenOtp = typeof deliveryOtp === 'string' || typeof deliveryOtp === 'number' ? String(deliveryOtp).trim() : '';

      // Store pickup: the merchant MUST enter the customer's 4-digit pickup code at handover
      // (admins may override, e.g. for support cases).
      const isPickup = order.fulfillmentType === 'pickup';
      const isAdmin = ['admin', 'super_admin'].includes(req.user?.role);
      if (isPickup && expectedOtp && !isAdmin) {
        if (!givenOtp) {
          return res.status(400).json({
            success: false,
            code: 'PICKUP_OTP_REQUIRED',
            message: 'Enter the 4-digit pickup code shown in the customer\'s app to hand over this order.',
          });
        }
        if (givenOtp !== expectedOtp) {
          return res.status(400).json({ success: false, code: 'PICKUP_OTP_INVALID', message: 'Incorrect pickup code. Please check with the customer.' });
        }
      }

      // Online (admin Razorpay) orders can only be delivered once the payment is captured.
      if (['ONLINE', 'RAZORPAY'].includes(order.paymentMethod) && order.razorpay?.status !== 'CAPTURED' && !isAdmin) {
        return res.status(400).json({ success: false, code: 'ONLINE_PAYMENT_PENDING', message: 'Online payment for this order has not been received yet.' });
      }

      // Store pickup: payment confirmation and handover are SEPARATE actions.
      // The merchant must first confirm payment (UPI / Cash) via the store-bill API.
      if (isPickup && !isAdmin && order.paymentStatus !== 'PAID') {
        return res.status(400).json({
          success: false,
          code: 'PICKUP_PAYMENT_PENDING',
          message: 'Collect and confirm payment (UPI Received / Cash Received) before handing over this order.',
        });
      }

      if (!isPickup && expectedOtp && givenOtp && givenOtp !== expectedOtp) {
        // Delivery orders: verify OTP if provided (unchanged behaviour)
        return res.status(400).json({ success: false, message: 'Invalid Delivery OTP' });
      }

      const customer = await User.findById(order.customerId);
      const vendor = await Vendor.findById(order.vendorId);

      await session.withTransaction(async () => {
        // 0. Accepted straight from PLACED (e.g. pickup handed over at once) → take items out of stock
        await deductOrderStock(order, { session });

        // 1. Mark order delivered
        order.orderStatus = 'DELIVERED';
        // Delivery orders: delivered means payment completed.
        // Pickup orders: payment is confirmed separately by the merchant (store bill).
        if (!isPickup || isAdmin) order.paymentStatus = 'PAID';
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

          // C) Record Cashback Issuance in Smart Settlement Ledger
          if (vendor) {
            await recordCashbackIssuance({
              vendorId: vendor._id,
              amount: order.totalCashbackPoints,
              customer,
              orderId: order.orderId,
              paymentMethod: order.paymentMethod,
              eligiblePaidAmount: order.finalPayableAmount,
              referenceId: order._id,
              referenceType: 'Order',
              session,
            });
          }

          order.cashbackSettled = true;
          order.settledAt = new Date();
        }

        // 3. Centralized settlement: credit seller's share (online → available, COD → on hold)
        await creditSellerForDeliveredOrder(order, { session });

        // 4. Subscription order quota: count this completed order; deduct extra charge if over the free limit
        await recordCompletedOrderUsage(order, { session });

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
      broadcastOrderStatus(order, { updatedBy: req.user.role });

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
        data: { order: hidePickupCodeForVendor(order) },
      });
    }

    // ── Handle Order Cancellation ──
    if (status === 'CANCELLED') {
      const reason = req.body.cancellationReason || req.body.reason || 'Store is unable to accept this order at the moment';
      const cancelledByRole = req.user.role === 'vendor' ? 'VENDOR' : isAdminActor ? 'ADMIN' : 'CUSTOMER';
      // Admin cancelling on the customer's behalf after Out for Delivery can apply the points penalty.
      const chargeCustomer = isAdminActor && (req.body.chargeCustomer === true || req.body.chargeCustomer === 'true');
      try {
        await cancelOrder({ order, cancelledBy: cancelledByRole, reason, chargeCustomer, actor: 'ADMIN', actorId: req.user.id });
      } catch (cancelErr) {
        if (cancelErr instanceof CancellationError) {
          return res.status(cancelErr.status).json({ success: false, code: cancelErr.code, message: cancelErr.message });
        }
        throw cancelErr;
      }

      try {
        const cancelPayload = {
          orderId: order.orderId,
          reason: order.cancellationReason,
          cancelledBy: order.cancelledBy === 'VENDOR' ? 'Store' : 'Admin',
          refundedPoints: order.pointsRedeemed || 0,
          pointsDeducted: order.lateCancellationPenalty?.applied ? order.lateCancellationPenalty.amount : 0,
          message: `Your order #${order.orderId} was cancelled by ${order.cancelledBy === 'VENDOR' ? 'Store' : 'Admin'}: "${order.cancellationReason}"`,
        };
        getIO().to(`user_${order.customerId}`).emit('order:cancelled', cancelPayload);
        getIO().to(`vendor_${order.vendorId}`).emit('order:cancelled', cancelPayload);
        getIO().to(`vendor:${order.vendorId}`).emit('order:cancelled', cancelPayload);
        const cancelRiderId = order.riderDetails?.riderId;
        if (cancelRiderId) {
          getIO().to(`rider_${cancelRiderId}`).emit('order:cancelled', cancelPayload);
          getIO().to(`rider:${cancelRiderId}`).emit('order:cancelled', cancelPayload);
        }
      } catch (_) {}
      broadcastOrderStatus(order, { updatedBy: req.user.role, cancellationReason: order.cancellationReason });

      return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order: hidePickupCodeForVendor(order) },
      });
    }

    // ── Regular Status Update (CONFIRMED, PREPARING, OUT_FOR_DELIVERY) ──
    const isAcceptance = order.orderStatus === 'PLACED' && status !== 'PLACED';
    order.orderStatus = status;
    if (['CONFIRMED', 'PREPARING'].includes(status) && (req.body.prepTimeMinutes || req.body.estimatedPrepTime)) {
      order.estimatedPrepTime = Math.max(5, Math.min(120, Number(req.body.prepTimeMinutes || req.body.estimatedPrepTime) || 15));
      order.prepTimeSelectedAt = new Date();
    }
    if (isAcceptance) {
      // Store accepted the order → take the items out of stock (same transaction as the status change).
      await runInTransaction(async (s) => {
        await deductOrderStock(order, { session: s });
        await order.save(s ? { session: s } : {});
      });
    } else {
      await order.save();
    }

    try {
      getIO().to(`user_${order.customerId}`).emit('order:status_update', {
        orderId: order.orderId,
        orderStatus: status,
        estimatedPrepTime: order.estimatedPrepTime || 15,
        message: status === 'CONFIRMED' || status === 'PREPARING'
          ? `Store has accepted your order #${order.orderId} and started preparing!`
          : `Order status updated to ${status}`,
      });
      getIO().to(`vendor_${order.vendorId}`).emit('order:status_update', {
        orderId: order.orderId,
        orderStatus: status,
      });
      getIO().to(`vendor:${order.vendorId}`).emit('order:status_update', {
        orderId: order.orderId,
        orderStatus: status,
      });
      const statusRiderId = order.riderDetails?.riderId;
      if (statusRiderId) {
        const riderPayload = { orderId: order.orderId, orderStatus: status, message: `Store updated order #${order.orderId} to ${status.replaceAll('_', ' ')}` };
        getIO().to(`rider_${statusRiderId}`).emit('order:status_update', riderPayload);
        getIO().to(`rider:${statusRiderId}`).emit('order:status_update', riderPayload);
      }
      getIO().to('admins').emit('order:status_update', { orderId: order.orderId, orderStatus: status, updatedBy: req.user.role });
      if (['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(status) && order.fulfillmentType === 'delivery') {
        const vendorDoc = await Vendor.findById(order.vendorId)
          .select('storeName phone address location storeLogo city')
          .lean();
        const orderWithVendor = {
          ...(order.toObject ? order.toObject() : order),
          vendor: vendorDoc || { storeName: order.storeName },
        };
        emitNewDeliveryOrderToOnlineRiders({
          order: orderWithVendor,
          orderId: order.orderId,
          storeName: order.storeName,
          payout: order.deliveryPayout || 50,
          distanceKm: order.deliveryDistanceKm || 2.0,
          message: status === 'READY_FOR_PICKUP' 
            ? `Order #${order.orderId} at ${order.storeName} is packed and ready for pickup!`
            : `Delivery request from ${order.storeName}!`,
        });
        if (status === 'READY_FOR_PICKUP') {
          getIO().emit('delivery:ready_for_pickup', {
            order: orderWithVendor,
            orderId: order.orderId,
            storeName: order.storeName,
            payout: order.deliveryPayout || 50,
            distanceKm: order.deliveryDistanceKm || 2.0,
            message: `Order #${order.orderId} is packed and ready for pickup!`,
          });
        }
      }
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: { order: hidePickupCodeForVendor(order) },
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
    
    // Robust query: match customerId OR customerPhone with 10-digit normalization
    const orConditions = [{ customerId: req.user.id }];
    if (req.user._id && String(req.user._id) !== String(req.user.id)) {
      orConditions.push({ customerId: req.user._id });
    }
    if (req.user.phone) {
      const rawPhone = String(req.user.phone).trim();
      const tenDigits = rawPhone.replace(/\D/g, '').slice(-10);
      orConditions.push({ customerPhone: rawPhone });
      if (tenDigits) {
        orConditions.push({ customerPhone: tenDigits });
        orConditions.push({ customerPhone: `+91${tenDigits}` });
      }
    }
    const query = { $or: orConditions };
    if (status) query.orderStatus = status;

    const rawOrders = await Order.find(query)
      .populate('vendorId', 'storeName phone address location storeLogo city zeebacId')
      .populate('riderDetails.riderId', 'name phone vehicleNo currentLocation')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const orders = rawOrders.map((ord) => {
      const obj = ord.toObject ? ord.toObject() : ord;
      if (obj.riderDetails && !obj.riderDetails.deliveryOtp) {
        obj.riderDetails.deliveryOtp = String(obj.orderId || '').replace(/\D/g, '').slice(-4) || '1234';
      }
      return obj;
    });

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

    // Robust authorization check with normalized phone match
    const userPhoneClean = req.user.phone ? String(req.user.phone).replace(/\D/g, '').slice(-10) : '';
    const orderPhoneClean = order.customerPhone ? String(order.customerPhone).replace(/\D/g, '').slice(-10) : '';
    const phoneMatches = Boolean(userPhoneClean && orderPhoneClean && userPhoneClean === orderPhoneClean);

    const isOwner = order.customerId.toString() === req.user.id || phoneMatches;
    const isVendor = order.vendorId.toString() === req.user.id;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isRider = req.user.role === 'delivery_partner' && (order.riderDetails?.riderId?.toString() === req.user.id?.toString());

    if (!isOwner && !isVendor && !isAdmin && !isRider) {
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
    const query = {
      vendorId: req.user.id,
      // Strictly exclude online UPI orders that have not been verified/paid yet
      // Unpaid online (Razorpay) orders stay hidden until the payment is captured
      $or: [
        { paymentStatus: { $in: ['PAID', 'REFUNDED'] } },
        { paymentMethod: { $in: ['CASH', 'ZEEBAC_POINTS'] } },
      ],
    };
    if (status) query.orderStatus = status;

    const rawOrders = await Order.find(query)
      .populate('customerId', 'name phone location')
      .populate('riderDetails.riderId', 'name phone vehicleNo currentLocation')
      .populate('items.productId', 'warehouseLocation barcode batchNumber expiryDate')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    // Ensure every order has a guaranteed pickupOtp and formatted fields with WMS locations
    const orders = rawOrders.map((ord) => {
      const obj = ord.toObject ? ord.toObject() : ord;
      if (obj.riderDetails) {
        obj.riderDetails = { ...obj.riderDetails };
        delete obj.riderDetails.deliveryOtp;
      }
      if (!obj.pickupOtp) {
        obj.pickupOtp = obj.riderDetails?.pickupOtp || String(obj.orderId || '').replace(/\D/g, '').slice(-4) || '1234';
      }
      if (Array.isArray(obj.items)) {
        obj.items = obj.items.map((item) => {
          const prod = item.productId && typeof item.productId === 'object' ? item.productId : null;
          const loc = item.warehouseLocation?.binCode
            ? item.warehouseLocation
            : prod?.warehouseLocation?.binCode
            ? prod.warehouseLocation
            : {
                rack: item.category ? `${item.category[0].toUpperCase()}01` : 'A01',
                shelf: 'S01',
                bin: 'B01',
                binCode: `${item.category ? item.category[0].toUpperCase() : 'A'}01-S01-B01`,
              };
          return {
            ...item,
            binCode: item.binCode || loc.binCode,
            warehouseLocation: loc,
            barcode: item.barcode || prod?.barcode || '',
            batchNumber: item.batchNumber || prod?.batchNumber || '',
            expiryDate: item.expiryDate || prod?.expiryDate || '',
            picked: Boolean(item.picked),
            pickedQuantity: item.pickedQuantity || (item.picked ? item.quantity : 0),
          };
        });
      }
      return obj;
    });

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
        description: `Zeebac Points Purchase via UPI Intent (UTR: ${cleanUtr})`,
        gateway: {
          gatewayName: 'None',
          utr: cleanUtr,
        },
      });

      // Explicitly credit purchased points
      updatedWallet.purchasedPoints = (updatedWallet.purchasedPoints || 0) + depositAmount;
      await updatedWallet.save({ session });
    });

    logger.info(`[Zeebac Points Purchase] Vendor ${vendor.zeebacId} purchased ${depositAmount} points via UTR ${cleanUtr}`);

    res.status(200).json({
      success: true,
      message: `🎉 ${depositAmount} Zeebac Points purchased and added to your wallet successfully!`,
      data: {
        balance: updatedWallet.balance,
        purchasedPoints: updatedWallet.purchasedPoints,
        redeemedPoints: updatedWallet.redeemedPoints || 0,
      },
    });
  } catch (error) {
    logger.error(`claimVendorCashbackReserveUpi error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  } finally {
    session.endSession();
  }
};

// ─── 9. Submit Order Feedback for Vendor and/or Delivery Rider ───
export const submitOrderFeedback = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { target, vendorRating, vendorComment, vendorTags, riderRating, riderComment, riderTags } = req.body;
    const customerId = req.user.id;

    const order = await Order.findOne({
      orderId,
      customerId,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const shouldRateVendor = target === 'vendor' || target === 'both' || vendorRating !== undefined;
    const shouldRateRider = target === 'rider' || target === 'both' || riderRating !== undefined;

    // 1. Process Vendor Rating & Review
    if (shouldRateVendor && vendorRating) {
      const vRating = Number(vendorRating);
      if (isNaN(vRating) || vRating < 1 || vRating > 5) {
        return res.status(400).json({ success: false, message: 'Vendor rating must be between 1 and 5' });
      }

      order.vendorFeedback = {
        rating: vRating,
        comment: (vendorComment || '').trim(),
        tags: Array.isArray(vendorTags) ? vendorTags : [],
        ratedAt: new Date(),
      };

      try {
        const customer = await User.findById(customerId);
        const customerName = customer ? customer.name : order.customerName || 'Customer';

        // Upsert into Review collection
        await Review.findOneAndUpdate(
          { vendorId: order.vendorId, customerId },
          {
            $set: {
              rating: vRating,
              text: (vendorComment || '').trim(),
              customerName,
              isVerified: true,
            },
          },
          { returnDocument: 'after', upsert: true }
        );

        // Recalculate Vendor's average rating and total reviews
        const stats = await Review.aggregate([
          { $match: { vendorId: order.vendorId, isVisible: true } },
          {
            $group: {
              _id: null,
              avgRating: { $avg: '$rating' },
              totalReviews: { $sum: 1 },
            },
          },
        ]);

        if (stats.length > 0) {
          const avg = parseFloat(stats[0].avgRating.toFixed(1));
          await Vendor.findByIdAndUpdate(order.vendorId, {
            $set: {
              'stats.avgRating': avg,
              'stats.totalReviews': stats[0].totalReviews,
              rating: avg,
            },
          });
        }
      } catch (revErr) {
        logger.warn(`[submitOrderFeedback] Review sync error: ${revErr.message}`);
      }
    }

    // 2. Process Rider Rating & Feedback
    if (shouldRateRider && riderRating) {
      const rRating = Number(riderRating);
      if (isNaN(rRating) || rRating < 1 || rRating > 5) {
        return res.status(400).json({ success: false, message: 'Rider rating must be between 1 and 5' });
      }

      order.riderFeedback = {
        rating: rRating,
        comment: (riderComment || '').trim(),
        tags: Array.isArray(riderTags) ? riderTags : [],
        ratedAt: new Date(),
      };

      try {
        const riderPhone = order.riderDetails?.phone;
        if (riderPhone) {
          const rider = await DeliveryPartner.findOne({ phone: riderPhone });
          if (rider) {
            // Aggregate all rated orders for this delivery partner
            const ratedOrders = await Order.find({
              'riderDetails.phone': riderPhone,
              'riderFeedback.rating': { $exists: true, $ne: null },
            }).select('riderFeedback.rating');

            const totalRatings = ratedOrders.length;
            const avgRiderRating = totalRatings > 0
              ? parseFloat((ratedOrders.reduce((acc, curr) => acc + (curr.riderFeedback?.rating || 0), 0) / totalRatings).toFixed(1))
              : rRating;

            rider.rating = avgRiderRating;
            await rider.save();
          }
        }
      } catch (riderErr) {
        logger.warn(`[submitOrderFeedback] Rider rating error: ${riderErr.message}`);
      }
    }

    await order.save();

    // Realtime notification
    try {
      const io = getIO();
      if (io) {
        io.to(`user_${customerId}`).emit('order:feedback_submitted', {
          orderId: order.orderId,
          vendorFeedback: order.vendorFeedback,
          riderFeedback: order.riderFeedback,
        });
        io.to(`vendor_${order.vendorId}`).emit('vendor:new_feedback', {
          orderId: order.orderId,
          vendorFeedback: order.vendorFeedback,
        });
        io.to(`vendor:${order.vendorId}`).emit('vendor:new_feedback', {
          orderId: order.orderId,
          vendorFeedback: order.vendorFeedback,
        });
      }
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully! Thank you for rating.',
      data: order,
    });
  } catch (error) {
    logger.error(`submitOrderFeedback error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};


// ── 7. Vendor Rates Assigned Delivery Rider ──
export const rateRiderByVendor = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, comment, tags } = req.body;

    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5' });
    }

    const order = await Order.findOne(
      mongoose.isValidObjectId(orderId)
        ? { $or: [{ _id: orderId }, { orderId }] }
        : { orderId }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (req.user.role === 'vendor' && order.vendorId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized to rate this order' });
    }

    if (!order.riderDetails?.phone && !order.riderDetails?.riderId) {
      return res.status(400).json({ success: false, message: 'No delivery rider is assigned to this order' });
    }

    // Save vendor feedback on the order
    order.riderFeedbackFromVendor = {
      rating: numericRating,
      comment: typeof comment === 'string' ? comment.trim() : '',
      tags: Array.isArray(tags) ? tags : [],
      ratedAt: new Date(),
    };
    await order.save();

    // Find and update delivery partner
    const rider = await DeliveryPartner.findOne({
      $or: [
        { riderId: order.riderDetails.riderId },
        { phone: order.riderDetails.phone },
      ],
    });

    if (rider) {
      rider.vendorRatings = rider.vendorRatings || [];
      const existingIdx = rider.vendorRatings.findIndex((vr) => vr.orderId === order.orderId);
      const feedbackObj = {
        orderId: order.orderId,
        vendorId: order.vendorId,
        vendorName: order.storeName || 'Partner Store',
        storeName: order.storeName || 'Partner Store',
        rating: numericRating,
        comment: typeof comment === 'string' ? comment.trim() : '',
        tags: Array.isArray(tags) ? tags : [],
        createdAt: new Date(),
      };

      if (existingIdx >= 0) {
        rider.vendorRatings[existingIdx] = feedbackObj;
      } else {
        rider.vendorRatings.push(feedbackObj);
      }

      // Aggregate all ratings (vendor ratings + customer ratings)
      const allScores = rider.vendorRatings.map((v) => v.rating).filter(Boolean);
      const customerOrders = await Order.find({
        $or: [
          { 'riderDetails.phone': rider.phone },
          { 'riderDetails.riderId': rider.riderId },
        ],
        'riderFeedback.rating': { $exists: true, $ne: null },
      }).select('riderFeedback.rating');

      customerOrders.forEach((co) => {
        if (co.riderFeedback?.rating) allScores.push(co.riderFeedback.rating);
      });

      rider.ratingsCount = allScores.length;
      rider.rating = allScores.length > 0
        ? parseFloat((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1))
        : 5.0;

      await rider.save();

      try {
        getIO().emit('rider:rating_received', {
          riderId: rider.riderId,
          rating: rider.rating,
          ratingsCount: rider.ratingsCount,
          newReview: feedbackObj,
        });
      } catch (_) {}
    }

    logger.info(`[RateRider] Order ${order.orderId} rider rated ${numericRating} stars by ${order.storeName}`);

    return res.status(200).json({
      success: true,
      message: 'Rider rating submitted successfully! Thank you.',
      data: {
        riderFeedbackFromVendor: order.riderFeedbackFromVendor,
        riderRating: rider?.rating,
        ratingsCount: rider?.ratingsCount,
      },
    });
  } catch (error) {
    logger.error(`Error in rateRiderByVendor: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error submitting rider rating' });
  }
};

// ─── 14. START ORDER PICKING (Dark Store WMS - Zepto Flow) ───
export const startOrderPicking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { toteNumber } = req.body;
    const vendorId = req.user.id;

    const order = await Order.findOne({
      $or: [{ orderId }, { _id: mongoose.Types.ObjectId.isValid(orderId) ? orderId : null }],
      vendorId,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.packingStatus = 'PICKING_IN_PROGRESS';
    if (!order.pickingStartedAt) {
      order.pickingStartedAt = new Date();
    }
    if (toteNumber) {
      order.toteNumber = String(toteNumber).trim().toUpperCase();
    }

    await order.save();

    const payload = {
      orderId: order.orderId,
      packingStatus: order.packingStatus,
      toteNumber: order.toteNumber,
      pickingStartedAt: order.pickingStartedAt,
      message: `Picking started for order #${order.orderId}`,
    };

    safeSocketEmit(`order:${order.orderId}`, 'order:picking_started', payload);
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:picking_started', payload);
    safeSocketEmit(`vendor_${order.vendorId}`, 'order:picking_started', payload);

    logger.info(`[Dark Store WMS] Picking started for Order #${order.orderId} (Tote: ${order.toteNumber || 'N/A'})`);

    return res.status(200).json({
      success: true,
      message: 'Picking started',
      data: { order },
    });
  } catch (error) {
    logger.error(`Error in startOrderPicking: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error starting pick' });
  }
};

// ─── 15. SCAN / CONFIRM PICK ITEM ───
export const pickOrderItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemId, barcode, quantity, isManualConfirm } = req.body;
    const vendorId = req.user.id;

    const order = await Order.findOne({
      $or: [{ orderId }, { _id: mongoose.Types.ObjectId.isValid(orderId) ? orderId : null }],
      vendorId,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item =
      order.items.id(itemId) ||
      order.items.find((i) => String(i._id) === String(itemId) || String(i.productId) === String(itemId));
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    // Verify barcode if scanned and not manually overridden
    if (!isManualConfirm && barcode) {
      const cleanScanned = String(barcode).trim().toLowerCase();
      const cleanItemBarcode = String(item.barcode || '').trim().toLowerCase();
      if (cleanItemBarcode && cleanScanned !== cleanItemBarcode) {
        return res.status(400).json({
          success: false,
          message: `Barcode Mismatch! Scanned "${barcode}" does not match item barcode "${item.barcode}" for ${item.name}`,
        });
      }
    }

    item.picked = true;
    item.pickedQuantity = Number(quantity) || item.quantity;
    item.pickedAt = new Date();

    // Check if all items in order are now picked
    const allPicked = order.items.every((i) => i.picked);
    if (allPicked) {
      order.packingStatus = 'PICKED';
    }

    await order.save();

    const payload = {
      orderId: order.orderId,
      itemId: item._id,
      itemName: item.name,
      picked: item.picked,
      pickedQuantity: item.pickedQuantity,
      allPicked,
      packingStatus: order.packingStatus,
    };

    safeSocketEmit(`order:${order.orderId}`, 'order:item_picked', payload);
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:item_picked', payload);
    safeSocketEmit(`vendor_${order.vendorId}`, 'order:item_picked', payload);

    logger.info(
      `[Dark Store WMS] Picked item "${item.name}" (Qty: ${item.pickedQuantity}) in Order #${order.orderId}. All picked: ${allPicked}`
    );

    return res.status(200).json({
      success: true,
      message: `Item "${item.name}" picked successfully`,
      data: { order, item, allPicked },
    });
  } catch (error) {
    logger.error(`Error in pickOrderItem: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error picking item' });
  }
};

// ─── 16. FINISH PACKING & STAGE FOR HANDOVER ───
export const finishOrderPacking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { toteNumber } = req.body;
    const vendorId = req.user.id;

    const order = await Order.findOne({
      $or: [{ orderId }, { _id: mongoose.Types.ObjectId.isValid(orderId) ? orderId : null }],
      vendorId,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.packingStatus = 'READY_FOR_PICKUP';
    if (['PLACED', 'CONFIRMED', 'PREPARING'].includes(order.orderStatus)) {
      order.orderStatus = 'READY_FOR_PICKUP';
    }
    if (toteNumber) {
      order.toteNumber = String(toteNumber).trim().toUpperCase();
    }
    order.pickingCompletedAt = new Date();

    if (order.pickingStartedAt) {
      order.pickingDurationSeconds = Math.round(
        (order.pickingCompletedAt.getTime() - order.pickingStartedAt.getTime()) / 1000
      );
    }

    await order.save();

    const payload = {
      orderId: order.orderId,
      orderStatus: order.orderStatus,
      packingStatus: order.packingStatus,
      toteNumber: order.toteNumber,
      pickupOtp: order.pickupOtp || order.riderDetails?.pickupOtp,
      pickingDurationSeconds: order.pickingDurationSeconds,
      message: `Order #${order.orderId} packed in Tote ${order.toteNumber || 'N/A'} and ready for handover!`,
    };

    safeSocketEmit(`order:${order.orderId}`, 'order:ready_for_pickup', payload);
    safeSocketEmit(`order:${order._id}`, 'order:ready_for_pickup', payload);
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:ready_for_pickup', payload);
    safeSocketEmit(`vendor_${order.vendorId}`, 'order:ready_for_pickup', payload);

    if (order.riderDetails?.riderId) {
      safeSocketEmit(`rider:${order.riderDetails.riderId}`, 'order:ready_for_pickup', payload);
      safeSocketEmit(`rider_${order.riderDetails.riderId}`, 'order:ready_for_pickup', payload);
    }

    logger.info(
      `[Dark Store WMS] Order #${order.orderId} PACKED & READY FOR HANDOVER. Duration: ${
        order.pickingDurationSeconds || 0
      }s`
    );

    return res.status(200).json({
      success: true,
      message: 'Order packed and ready for pickup handover!',
      data: { order },
    });
  } catch (error) {
    logger.error(`Error in finishOrderPacking: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error finishing packing' });
  }
};

// ─── Store Pickup: In-Store Billing ("Merchant Billing Karega") ───
// Flow: merchant generates bill → customer pays seller's UPI QR directly (or cash)
// → merchant confirms payment → (separately) merchant enters pickup code → DELIVERED.
const findOrderByAnyId = (orderId) =>
  Order.findOne(mongoose.isValidObjectId(orderId) ? { $or: [{ _id: orderId }, { orderId }] } : { orderId });

const loadVendorPickupOrder = async (req, res) => {
  const order = await findOrderByAnyId(req.params.orderId);
  if (!order) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return null;
  }
  if (order.vendorId.toString() !== req.user.id) {
    res.status(403).json({ success: false, message: 'Unauthorized' });
    return null;
  }
  if (order.fulfillmentType !== 'pickup') {
    res.status(400).json({ success: false, code: 'NOT_PICKUP_ORDER', message: 'In-store billing is only available for store pickup orders.' });
    return null;
  }
  if (['DELIVERED', 'CANCELLED'].includes(order.orderStatus)) {
    res.status(400).json({ success: false, message: `Order is already ${order.orderStatus}` });
    return null;
  }
  return order;
};

const emitStoreBillUpdate = (order) => {
  const payload = { orderId: order.orderId, _id: order._id, storeBill: order.storeBill, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod };
  safeSocketEmit(`user_${order.customerId}`, 'order:store_bill', payload);
  safeSocketEmit(`user:${order.customerId}`, 'order:store_bill', payload);
  safeSocketEmit(`vendor_${order.vendorId}`, 'order:store_bill', payload);
};

export const generateStoreBill = async (req, res) => {
  try {
    const order = await loadVendorPickupOrder(req, res);
    if (!order) return;

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, code: 'ALREADY_PAID', message: 'Payment for this order is already confirmed.' });
    }

    const vendor = await Vendor.findById(order.vendorId).select('storeName upiId bankDetails.upiId');
    const payeeVpa = (vendor?.upiId || vendor?.bankDetails?.upiId || '').trim();
    if (!payeeVpa) {
      return res.status(400).json({
        success: false,
        code: 'SELLER_UPI_MISSING',
        message: 'Add your UPI ID in your store profile to generate a UPI bill. You can still accept cash.',
      });
    }

    const amount = Math.round(Number(order.finalPayableAmount || 0) * 100) / 100;
    const payeeName = vendor.storeName || order.storeName || 'ZeeBac Store';
    const billRef = `${order.orderId}-B${Date.now().toString().slice(-5)}`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR&tr=${encodeURIComponent(billRef)}&tn=${encodeURIComponent(`ZeeBac Bill ${order.orderId}`)}`;

    order.storeBill = {
      status: 'GENERATED',
      billRef,
      amount,
      payeeVpa,
      payeeName,
      upiUri,
      generatedAt: new Date(),
    };
    await order.save();
    emitStoreBillUpdate(order);

    res.status(200).json({ success: true, message: 'Bill generated', data: { order: hidePickupCodeForVendor(order), storeBill: order.storeBill } });
  } catch (error) {
    logger.error(`generateStoreBill error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Marks payment as received. Does NOT change orderStatus — handover (DELIVERED) is a separate action.
export const confirmStoreBillPayment = async (req, res) => {
  try {
    const { method, amountReceived, utr } = req.body;
    const paidVia = String(method || '').toUpperCase();
    if (!['UPI', 'CASH'].includes(paidVia)) {
      return res.status(400).json({ success: false, message: "method must be 'UPI' or 'CASH'" });
    }

    const order = await loadVendorPickupOrder(req, res);
    if (!order) return;

    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, code: 'ALREADY_PAID', message: 'Payment for this order is already confirmed.' });
    }

    const amount = Math.round(Number(order.finalPayableAmount || 0) * 100) / 100;
    if (paidVia === 'UPI' && order.storeBill?.status !== 'GENERATED') {
      return res.status(400).json({ success: false, code: 'BILL_NOT_GENERATED', message: 'Generate the bill before confirming a UPI payment.' });
    }

    let received = amount;
    if (amountReceived !== undefined && amountReceived !== null && amountReceived !== '') {
      received = Math.round(Number(amountReceived) * 100) / 100;
      if (!Number.isFinite(received) || received < amount) {
        return res.status(400).json({ success: false, code: 'AMOUNT_SHORT', message: `Amount received must be at least ₹${amount.toFixed(2)}.` });
      }
    }

    const cleanUtr = typeof utr === 'string' ? utr.trim().slice(0, 40) : '';

    order.storeBill = {
      ...(order.storeBill?.toObject ? order.storeBill.toObject() : order.storeBill || {}),
      status: 'PAID',
      amount: order.storeBill?.amount ?? amount,
      paidVia,
      amountReceived: received,
      utr: cleanUtr || undefined,
      confirmedAt: new Date(),
      confirmedBy: req.user.id,
    };
    order.paymentMethod = paidVia === 'UPI' ? 'UPI_INTENT' : 'CASH';
    order.paymentStatus = 'PAID';
    if (paidVia === 'UPI') {
      if (!order.upiDetails) order.upiDetails = {};
      order.upiDetails.payeeVpa = order.storeBill.payeeVpa;
      order.upiDetails.payeeName = order.storeBill.payeeName;
      order.upiDetails.txnRef = order.storeBill.billRef;
      order.upiDetails.upiUri = order.storeBill.upiUri;
      if (cleanUtr) order.upiDetails.utr = cleanUtr;
      order.upiDetails.paidAt = new Date();
    }
    await order.save();
    emitStoreBillUpdate(order);

    res.status(200).json({
      success: true,
      message: paidVia === 'UPI' ? 'UPI payment confirmed' : 'Cash payment recorded',
      data: { order: hidePickupCodeForVendor(order), storeBill: order.storeBill, change: Math.round((received - amount) * 100) / 100 },
    });
  } catch (error) {
    logger.error(`confirmStoreBillPayment error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Razorpay (admin account) checkout: client-side confirmation ───
// The webhook is the source of truth; this endpoint just lets the app confirm
// immediately. Both paths go through applyCapturedOrderPayment (idempotent).
export const verifyOrderRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id: rzpOrderId, razorpay_payment_id: rzpPaymentId, razorpay_signature: signature } = req.body || {};
    if (!rzpOrderId || !rzpPaymentId || !signature) {
      return res.status(400).json({ success: false, message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }
    const order = await findOrderByAnyId(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.customerId.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Unauthorized' });
    if (order.razorpay?.orderId !== rzpOrderId) {
      return res.status(400).json({ success: false, code: 'ORDER_MISMATCH', message: 'Payment does not belong to this order' });
    }
    if (!verifyRazorpaySignature(rzpOrderId, rzpPaymentId, signature)) {
      return res.status(400).json({ success: false, code: 'INVALID_SIGNATURE', message: 'Payment signature verification failed' });
    }
    if (order.razorpay?.status === 'CAPTURED' && order.razorpay.paymentId === rzpPaymentId) {
      return res.status(200).json({ success: true, message: 'Payment already confirmed', data: { order } });
    }

    // Never trust client amounts: fetch the payment from Razorpay.
    const rzp = getRazorpayInstance();
    let payment = await rzp.payments.fetch(rzpPaymentId);
    if (payment.order_id !== rzpOrderId) {
      return res.status(400).json({ success: false, code: 'ORDER_MISMATCH', message: 'Payment does not belong to this order' });
    }
    if (payment.status === 'authorized') {
      payment = await rzp.payments.capture(rzpPaymentId, payment.amount, payment.currency || 'INR');
      if (payment.fee == null) payment = await rzp.payments.fetch(rzpPaymentId);
    }

    const result = await applyCapturedOrderPayment({ payment, via: 'CLIENT_VERIFY' });
    const fresh = result.order || (await Order.findById(order._id));
    if (!result.applied && !result.duplicate) {
      return res.status(400).json({ success: false, code: 'PAYMENT_NOT_APPLIED', message: `Payment could not be confirmed: ${result.reason}`, data: { order: fresh } });
    }
    return res.status(200).json({ success: true, message: 'Payment confirmed', data: { order: fresh } });
  } catch (error) {
    logger.error(`verifyOrderRazorpayPayment error: ${error.message || error?.error?.description}`);
    res.status(500).json({ success: false, message: 'Could not verify payment. If money was deducted it will be confirmed automatically.' });
  }
};

// GET /orders/:orderId/razorpay/checkout: lets the customer reopen payment for an unpaid
// online order. Reuses the same Razorpay order so one order can only be paid once.
export const getOrderRazorpayCheckout = async (req, res) => {
  try {
    const order = await findOrderByAnyId(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.customerId.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Unauthorized' });
    if (!order.razorpay?.orderId || order.paymentStatus === 'PAID' || order.orderStatus === 'CANCELLED') {
      return res.status(400).json({ success: false, code: 'NOT_PAYABLE', message: 'This order does not need an online payment.' });
    }
    const customer = await User.findById(order.customerId).select('name phone').lean();
    res.json({
      success: true,
      data: {
        keyId: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: order.razorpay.orderId,
        amount: Math.round(Number(order.finalPayableAmount || 0) * 100),
        currency: 'INR',
        name: 'ZeeBac',
        description: `Order ${order.orderId} · ${order.storeName || 'ZeeBac Store'}`,
        prefill: { name: customer?.name || '', contact: customer?.phone || '' },
      },
    });
  } catch (error) {
    logger.error(`getOrderRazorpayCheckout error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


// ─── Customer: cancel an order ───
// GET  /orders/:orderId/cancel-preview → what cancelling now would cost in points
// POST /orders/:orderId/cancel { reason }
// COD delivery orders cancelled after Out for Delivery lose points (delivery charge, or the
// whole order for restaurants). Before Out for Delivery there is no deduction.
const loadCustomerOrder = async (req) => {
  const order = await findOrderByAnyId(req.params.orderId);
  if (!order) return { error: [404, 'Order not found'] };
  if (String(order.customerId) !== String(req.user.id)) return { error: [403, 'Unauthorized'] };
  return { order };
};

export const getCustomerCancelPreview = async (req, res) => {
  try {
    const { order, error } = await loadCustomerOrder(req);
    if (error) return res.status(error[0]).json({ success: false, message: error[1] });
    // Customers may cancel only until the store accepts the order.
    const closed = order.orderStatus !== 'PLACED';
    const vendor = await Vendor.findById(order.vendorId).select('category subCategory');
    const penalty = computeLateCancellationPenalty(order, vendor);
    const wallet = await Wallet.findOne({ ownerId: order.customerId, ownerType: { $in: ['User', 'user', 'Customer', 'customer'] } }).select('balance');
    const balance = Math.round((wallet?.balance || 0) * 100) / 100;
    res.status(200).json({
      success: true,
      data: {
        canCancel: !closed,
        orderStatus: order.orderStatus,
        pointsDeduction: penalty.applies ? penalty.amount : 0,
        basis: penalty.basis,
        reason: penalty.reason,
        pointsRefund: order.pointsRedeemed || 0,
        currentBalance: balance,
        balanceAfter: Math.round((balance + (order.pointsRedeemed || 0) - (penalty.applies ? penalty.amount : 0)) * 100) / 100,
      },
    });
  } catch (error) {
    logger.error(`getCustomerCancelPreview error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const cancelOrderByCustomer = async (req, res) => {
  try {
    const { order, error } = await loadCustomerOrder(req);
    if (error) return res.status(error[0]).json({ success: false, message: error[1] });
    if (order.orderStatus !== 'PLACED') {
      return res.status(400).json({
        success: false,
        code: 'STORE_ALREADY_ACCEPTED',
        message: 'The store has already accepted this order, so it can no longer be cancelled. Please contact support.',
      });
    }
    const reason = String(req.body?.reason || 'Cancelled by customer').trim().slice(0, 300);
    const { penalty, pointsRefunded } = await cancelOrder({
      order,
      cancelledBy: 'CUSTOMER',
      reason,
      chargeCustomer: true,
      actor: 'CUSTOMER',
      actorId: req.user.id,
    });

    const payload = {
      orderId: order.orderId,
      reason: order.cancellationReason,
      cancelledBy: 'Customer',
      refundedPoints: pointsRefunded,
      pointsDeducted: penalty.applied ? penalty.amount : 0,
      message: `Order #${order.orderId} was cancelled by the customer${reason ? `: "${reason}"` : ''}`,
    };
    safeSocketEmit(`vendor_${order.vendorId}`, 'order:cancelled', payload);
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:cancelled', payload);
    const riderId = order.riderDetails?.riderId;
    if (riderId) {
      safeSocketEmit(`rider_${riderId}`, 'order:cancelled', payload);
      safeSocketEmit(`rider:${riderId}`, 'order:cancelled', payload);
    }
    broadcastOrderStatus(order, { updatedBy: 'customer', cancellationReason: order.cancellationReason });

    res.status(200).json({
      success: true,
      message: penalty.applied
        ? `Order cancelled. ${penalty.amount} Zeebac Points were deducted because the order was already out for delivery.`
        : 'Order cancelled successfully',
      data: { order, pointsDeducted: penalty.applied ? penalty.amount : 0, pointsRefunded, balanceAfter: penalty.balanceAfter },
    });
  } catch (error) {
    if (error instanceof CancellationError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    logger.error(`cancelOrderByCustomer error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
