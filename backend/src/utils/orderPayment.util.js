import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import { getRazorpayInstance } from './razorpay.util.js';
import { emitNewDeliveryOrderToOnlineRiders } from './riderPresence.util.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket/socket.js';
import { r2 } from './orderPricing.util.js';
import logger from './logger.js';

// ── Centralized online collection: cart orders are paid into the ADMIN Razorpay account ──

export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

const stripPickupCode = (order) => {
  const obj = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  if (obj.fulfillmentType === 'pickup' && obj.riderDetails) {
    obj.riderDetails = { ...obj.riderDetails };
    delete obj.riderDetails.deliveryOtp;
  }
  return obj;
};

export const createRazorpayCheckoutOrder = ({ orderId, amount, vendorId, customerId }) =>
  getRazorpayInstance().orders.create({
    amount: toPaise(amount),
    currency: 'INR',
    receipt: orderId,
    notes: {
      type: 'customer_order',
      orderId,
      vendorId: String(vendorId),
      customerId: String(customerId),
    },
  });

// Tell the store (and riders for delivery) about an order that is now paid.
export const announcePaidOrder = async (order) => {
  try {
    const io = getIO();
    const vendorPayload = {
      order: stripPickupCode(order),
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
    io.to(`vendor_${order.vendorId}`).emit('order:new', vendorPayload);
    io.to(`vendor:${order.vendorId}`).emit('order:new', vendorPayload);
    io.to(`user_${order.customerId}`).emit('order:paid', { orderId: order.orderId, paymentStatus: 'PAID', order: stripPickupCode(order) });
    if (order.fulfillmentType === 'delivery') {
      const vendorDoc = await Vendor.findById(order.vendorId).select('storeName phone address location storeLogo city').lean();
      emitNewDeliveryOrderToOnlineRiders({
        order: { ...(order.toObject ? order.toObject() : order), vendor: vendorDoc || { storeName: order.storeName } },
        orderId: order.orderId,
        storeName: order.storeName,
        payout: order.deliveryPayout || 40,
        distanceKm: order.deliveryDistanceKm || 2.0,
        message: `New delivery order #${order.orderId} from ${order.storeName}!`,
      });
    }
  } catch (err) {
    logger.warn(`[OrderPayment] socket announce skipped: ${err.message}`);
  }
  sendNotification({
    recipientId: order.vendorId,
    recipientType: 'vendor',
    type: 'credit',
    title: 'New Paid Order Received! 🔔',
    message: `Order #${order.orderId} paid online (₹${order.finalPayableAmount}). Please accept and prepare.`,
    referenceId: order._id,
    referenceType: 'Order',
  }).catch(() => {});
};

/**
 * Apply a captured Razorpay payment to its order. Safe to call any number of
 * times from the client-verify path AND the webhook: only the first call wins
 * (conditional update on razorpay.status != CAPTURED).
 *
 * `payment` must be a Razorpay payment entity fetched from Razorpay / delivered
 * by a signature-verified webhook, never client-supplied data.
 * Returns { order, applied, duplicate, reason }.
 */
export const applyCapturedOrderPayment = async ({ payment, via }) => {
  if (!payment || payment.status !== 'captured') {
    return { applied: false, reason: `payment not captured (status: ${payment?.status})` };
  }
  const order = await Order.findOne({ 'razorpay.orderId': payment.order_id });
  if (!order) return { applied: false, reason: 'no order for this razorpay order id' };

  if (order.razorpay?.status === 'CAPTURED') {
    if (order.razorpay.paymentId === payment.id) return { order, applied: false, duplicate: true, reason: 'already applied' };
    // A second, different payment for the same order: refund it automatically.
    await refundDuplicatePayment(order, payment);
    return { order, applied: false, duplicate: true, reason: 'second payment for an already-paid order was refunded' };
  }

  const expected = toPaise(order.finalPayableAmount);
  if (payment.amount !== expected || (payment.currency && payment.currency !== 'INR')) {
    logger.error(`[OrderPayment] Amount mismatch for ${order.orderId}: expected ${expected} paise, got ${payment.amount} ${payment.currency}`);
    await Order.updateOne(
      { _id: order._id, 'razorpay.status': { $ne: 'CAPTURED' } },
      { $set: { 'razorpay.failureReason': `Amount mismatch: paid ${payment.amount / 100}, expected ${expected / 100}` } }
    );
    return { order, applied: false, reason: 'amount mismatch' };
  }

  const fee = r2((payment.fee || 0) / 100);
  const tax = r2((payment.tax || 0) / 100);
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'razorpay.status': { $ne: 'CAPTURED' }, orderStatus: { $ne: 'CANCELLED' } },
    {
      $set: {
        'razorpay.paymentId': payment.id,
        'razorpay.status': 'CAPTURED',
        'razorpay.method': payment.method,
        'razorpay.amountPaid': r2(payment.amount / 100),
        'razorpay.fee': fee,
        'razorpay.tax': tax,
        'razorpay.capturedAt': new Date((payment.created_at || Date.now() / 1000) * 1000),
        'razorpay.capturedVia': via,
        paymentStatus: 'PAID',
        'financials.gatewayFee': fee,
      },
    },
    { new: true }
  );

  if (!updated) {
    const fresh = await Order.findById(order._id);
    if (fresh?.orderStatus === 'CANCELLED') {
      // Customer paid after the order was cancelled → refund in full.
      await refundDuplicatePayment(fresh, payment, 'Payment received for a cancelled order');
      return { order: fresh, applied: false, reason: 'order cancelled; payment refunded' };
    }
    return { order: fresh, applied: false, duplicate: true, reason: 'already applied' };
  }

  logger.info(`[OrderPayment] ${updated.orderId} captured via ${via}: ₹${payment.amount / 100} (fee ₹${fee}, GST ₹${tax})`);
  await announcePaidOrder(updated);
  return { order: updated, applied: true };
};

const refundDuplicatePayment = async (order, payment, reason = 'Duplicate payment for an already-paid order') => {
  if ((order.refunds || []).some((r) => r.reason && r.reason.includes(payment.id))) return;
  try {
    const refund = await getRazorpayInstance().payments.refund(payment.id, {
      amount: payment.amount,
      notes: { reason, orderId: order.orderId },
    });
    await Order.updateOne(
      { _id: order._id },
      { $push: { refunds: { refundId: refund.id, amount: r2(payment.amount / 100), status: 'PENDING', reason: `${reason} (payment ${payment.id})`, sellerReversal: 0 } } }
    );
    logger.warn(`[OrderPayment] Refunded payment ${payment.id} on ${order.orderId}: ${reason}`);
  } catch (err) {
    logger.error(`[OrderPayment] Could not refund payment ${payment.id} on ${order.orderId}: ${err.message}`);
  }
};

/** Start a Razorpay refund for an order's captured payment. Returns the refund record pushed to the order. */
export const initiateOrderRefund = async ({ order, amount, reason, sellerReversal = 0, actorId }) => {
  if (order.razorpay?.status !== 'CAPTURED' || !order.razorpay.paymentId) {
    throw Object.assign(new Error('This order has no captured online payment to refund'), { code: 'NOT_REFUNDABLE', status: 400 });
  }
  const paid = Number(order.razorpay.amountPaid || order.finalPayableAmount || 0);
  const refundable = r2(paid - Number(order.refundedAmount || 0) - (order.refunds || []).filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0));
  const amt = r2(amount ?? refundable);
  if (!(amt > 0) || amt > refundable) {
    throw Object.assign(new Error(`Refund amount must be between ₹0.01 and ₹${refundable}`), { code: 'INVALID_REFUND_AMOUNT', status: 400 });
  }
  const refund = await getRazorpayInstance().payments.refund(order.razorpay.paymentId, {
    amount: toPaise(amt),
    notes: { reason: reason || 'Order refund', orderId: order.orderId },
  });
  const record = {
    refundId: refund.id,
    amount: amt,
    status: refund.status === 'processed' ? 'PROCESSED' : 'PENDING',
    reason,
    sellerReversal: r2(sellerReversal),
    initiatedBy: actorId,
    createdAt: new Date(),
    processedAt: refund.status === 'processed' ? new Date() : undefined,
  };
  order.refunds.push(record);
  if (record.status === 'PROCESSED') order.refundedAmount = r2(Number(order.refundedAmount || 0) + amt);
  if (record.status === 'PROCESSED' && order.refundedAmount >= paid) order.paymentStatus = 'REFUNDED';
  return record;
};

/** Webhook: refund.processed / refund.failed. Idempotent. */
export const applyRefundEvent = async ({ refund, event }) => {
  const order = await Order.findOne({ 'razorpay.paymentId': refund.payment_id });
  if (!order) return { applied: false, reason: 'no order for this payment' };
  let rec = order.refunds.find((r) => r.refundId === refund.id);
  if (!rec) {
    // Refund created outside the app (e.g. Razorpay dashboard): record it.
    order.refunds.push({ refundId: refund.id, amount: r2(refund.amount / 100), status: 'PENDING', reason: 'Refund created on Razorpay dashboard', sellerReversal: 0 });
    rec = order.refunds[order.refunds.length - 1];
  }
  const target = event === 'refund.processed' ? 'PROCESSED' : 'FAILED';
  if (rec.status === target) return { order, applied: false, duplicate: true };
  if (rec.status === 'PROCESSED') return { order, applied: false, reason: 'refund already processed' };
  rec.status = target;
  if (target === 'PROCESSED') {
    rec.processedAt = new Date();
    order.refundedAmount = r2(Number(order.refundedAmount || 0) + rec.amount);
    if (order.refundedAmount >= Number(order.razorpay?.amountPaid || order.finalPayableAmount)) order.paymentStatus = 'REFUNDED';
  }
  await order.save();
  return { order, applied: true };
};
