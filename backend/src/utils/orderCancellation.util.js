/**
 * Single cancellation path used by admin, store, customer and rider ("customer refused / returned").
 * In one transaction:
 *   1. late-cancellation points penalty (COD + Out for Delivery only, see pointsPolicy.util.js)
 *   2. refund of points the customer redeemed on this order
 *   3. status change + rider released
 * Then (outside the transaction) a Razorpay refund for captured online payments.
 */
import Order from '../models/Order.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import { creditWallet } from './wallet.util.js';
import { applyLateCancellationPenalty } from './pointsPolicy.util.js';
import { restoreOrderStock } from './orderStock.util.js';
import { runInTransaction } from './sellerSettlement.util.js';
import { initiateOrderRefund } from './orderPayment.util.js';
import logger from './logger.js';
import { notifyRider } from './riderNotify.util.js';

export class CancellationError extends Error {
  constructor(message, code = 'CANCEL_NOT_ALLOWED', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TERMINAL = ['DELIVERED', 'CANCELLED', 'FAILED_DELIVERY'];

/**
 * @param {object} p
 * @param {import('mongoose').Document} p.order
 * @param {'CUSTOMER'|'VENDOR'|'ADMIN'|'SYSTEM'} p.cancelledBy
 * @param {string} p.reason
 * @param {boolean} p.chargeCustomer  apply the late-cancel points penalty (customer-initiated cancel/return)
 * @param {'CANCELLED'|'FAILED_DELIVERY'} [p.finalStatus]
 * @param {string} [p.actor]  label stored on the penalty (CUSTOMER / RIDER / ADMIN)
 * @param {string} [p.actorId]
 * @param {boolean} [p.refundOnline=true]  false → an online payment is forfeited (rider return after Out for Delivery)
 */
export const cancelOrder = async ({ order, cancelledBy, reason, chargeCustomer, finalStatus = 'CANCELLED', actor, actorId, refundOnline = true }) => {
  if (TERMINAL.includes(order.orderStatus)) {
    throw new CancellationError(`Order is already ${order.orderStatus.replaceAll('_', ' ').toLowerCase()}`, 'ALREADY_CLOSED');
  }

  const vendor = await Vendor.findById(order.vendorId).select('category subCategory storeName');
  let penalty = { applied: false, amount: 0 };
  let pointsRefunded = 0;

  await runInTransaction(async (session) => {
    // Re-read inside the transaction so two concurrent cancels can't both pass.
    const fresh = await Order.findById(order._id).session(session || null);
    if (!fresh || TERMINAL.includes(fresh.orderStatus)) {
      throw new CancellationError('Order was already closed', 'ALREADY_CLOSED');
    }

    if (chargeCustomer) {
      penalty = await applyLateCancellationPenalty({ order: fresh, vendor, session, actor: actor || cancelledBy });
    }

    if (fresh.pointsRedeemed > 0) {
      const customer = await User.findById(fresh.customerId).select('zeebacId').session(session || null);
      await creditWallet({
        session,
        ownerId: fresh.customerId,
        ownerType: 'User',
        ownerZeebacId: customer?.zeebacId,
        amount: fresh.pointsRedeemed,
        category: 'refund',
        description: `Refund of ${fresh.pointsRedeemed} Zeebac Points for cancelled Order ${fresh.orderId}`,
        referenceId: fresh._id,
        referenceType: 'Order',
      });
      pointsRefunded = fresh.pointsRedeemed;
    }

    const isOnlinePaid = fresh.razorpay?.status === 'CAPTURED' && fresh.paymentStatus === 'PAID';
    if (isOnlinePaid && !refundOnline) {
      // Client rule: online-paid order the customer did not take → full amount forfeited, no refund.
      fresh.paymentForfeited = {
        forfeited: true,
        amount: Number(fresh.razorpay.amountPaid || fresh.finalPayableAmount || 0),
        reason: String(reason || '').trim(),
        at: new Date(),
      };
    }

    // Put back any stock taken when the store accepted the order.
    await restoreOrderStock(fresh, { session, reason: finalStatus === 'FAILED_DELIVERY' ? 'Returned by rider' : 'Order cancelled' });

    fresh.orderStatus = finalStatus;
    fresh.cancellationReason = String(reason || '').trim();
    fresh.cancelledBy = cancelledBy;
    fresh.cancelledAt = new Date();
    await fresh.save(session ? { session } : {});

    // Release the rider (if any) so they can take the next order.
    const riderPhone = fresh.riderDetails?.phone;
    if (riderPhone) {
      const rider = await DeliveryPartner.findOne({ phone: riderPhone, activeOrderId: fresh._id })
        .select('isOnline')
        .session(session || null);
      if (rider) {
        if (finalStatus === 'CANCELLED') {
          notifyRider({ riderId: rider._id, type: 'rider_order', title: `Order #${fresh.orderId} cancelled`, message: `${fresh.cancellationReason || 'The order was cancelled'}. You are free to take the next order.`, referenceId: fresh._id, referenceType: 'Order' });
        }
        await DeliveryPartner.updateOne(
          { _id: rider._id, activeOrderId: fresh._id },
          { $set: { activeOrderId: null, status: rider.isOnline ? 'AVAILABLE' : 'OFFLINE' } },
          session ? { session } : {}
        );
      }
    }

    // Copy the committed state onto the caller's document.
    order.set(fresh.toObject());
  });

  // Online-paid order → refund the customer in full, unless the payment was forfeited.
  if (refundOnline && order.razorpay?.status === 'CAPTURED' && order.paymentStatus === 'PAID') {
    try {
      await initiateOrderRefund({ order, reason: `Order cancelled: ${order.cancellationReason}`, actorId });
      await order.save();
    } catch (err) {
      logger.error(`[Cancel] Auto-refund failed for order ${order.orderId}: ${err.message}`);
    }
  }

  return { order, penalty, pointsRefunded };
};
