import mongoose from 'mongoose';
import { verifyWebhookSignature } from '../utils/webhook.util.js';
import { debitWallet, creditWallet, assertGatewayPaymentNotProcessed, DuplicatePaymentError, InsufficientBalanceError } from '../utils/wallet.util.js';
import { calculateCashback } from '../utils/cashback.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import Transaction from '../models/Transaction.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notification.service.js';

/**
 * Handle incoming Razorpay Webhooks.
 * Validates HMAC SHA-256 signature against RAZORPAY_WEBHOOK_SECRET.
 * Process payment.captured (async recovery / idempotency) and payment.failed events.
 */
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    // 1. Verify HMAC Signature
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      logger.warn('[Razorpay Webhook] Rejected payload due to invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body || {};
    logger.info(`[Razorpay Webhook] Received event: ${event}`);

    // 2. Handle payment.captured
    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload?.payment?.entity || payload?.order?.entity;
      if (!payment) {
        return res.status(400).json({ success: false, message: 'Missing payment entity in payload' });
      }

      const paymentId = payment.id || payment.payment_id;
      const orderId = payment.order_id || payment.id;
      const verifiedAmount = (payment.amount || 0) / 100; // paise to rupees

      const notes = payment.notes || {};
      const vendorZeebacId = notes.vendorZeebacId;
      const customerId = notes.customerId;
      const paymentMethod = notes.paymentMethod || 'Online (Razorpay Webhook)';

      if (!paymentId) {
        return res.status(400).json({ success: false, message: 'Missing payment ID' });
      }

      // Check if this payment is for vendor wallet top-up vs customer purchase
      const isVendorRecharge = notes.type === 'vendor_recharge' || notes.purpose === 'vendor_wallet_recharge';

      const session = await mongoose.startSession();
      try {
        let result = null;
        await session.withTransaction(async () => {
          // Idempotency check: Throws DuplicatePaymentError if already processed by client or previous webhook
          await assertGatewayPaymentNotProcessed(session, paymentId);

          if (isVendorRecharge && notes.vendorId) {
            const vendor = await Vendor.findById(notes.vendorId).session(session);
            if (!vendor) throw new Error(`Vendor ${notes.vendorId} not found`);

            const creditedWallet = await creditWallet({
              session,
              ownerId: vendor._id,
              ownerType: 'Vendor',
              ownerZeebacId: vendor.zeebacId,
              amount: verifiedAmount,
              category: 'cashin',
              description: `Vendor wallet recharge via Razorpay (Webhook ${paymentId})`,
              gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId, gatewayPaymentId: paymentId },
            });

            result = { type: 'vendor_recharge', walletBalance: creditedWallet.balance };
          } else if (vendorZeebacId && customerId) {
            // Customer online purchase
            const vendor = await Vendor.findOne({ status: 'Verified', zeebacId: vendorZeebacId }).session(session);
            const customer = await User.findById(customerId).session(session);

            if (!vendor || !customer) {
              throw new Error(`Invalid vendor (${vendorZeebacId}) or customer (${customerId}) for payment`);
            }

            const cashbackAmount = calculateCashback(verifiedAmount, vendor.cashbackRate);

            // Deduct cashback from vendor wallet
            await debitWallet({
              session,
              ownerId: vendor._id,
              ownerType: 'Vendor',
              amount: cashbackAmount,
              category: 'cashback',
              description: `Cashback paid to customer ${customer.name} (Webhook ${paymentId})`,
              gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId },
            });

            // Credit customer wallet with cashback
            await creditWallet({
              session,
              ownerId: customer._id,
              ownerType: 'User',
              ownerZeebacId: customer.zeebacId,
              amount: cashbackAmount,
              category: 'cashback',
              description: `Cashback earned at ${vendor.storeName} (Webhook ${paymentId})`,
              gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId, gatewayPaymentId: paymentId },
            });

              const validPaymentMethods = ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Wallet', 'Other'];
              const safePaymentMethod = validPaymentMethods.includes(paymentMethod) ? paymentMethod : 'Other';

              // Create Transaction record
              const [txn] = await Transaction.create([{
                transactionId: `TX-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`,
                customerId: customer._id,
                customerZeebacId: customer.zeebacId,
                customerPhone: customer.phone,
                customerName: customer.name,
                vendorId: vendor._id,
                vendorZeebacId: vendor.zeebacId,
                vendorName: vendor.storeName,
                vendorCategory: vendor.category,
                amount: verifiedAmount,
                cashbackPercent: vendor.cashbackRate,
                cashbackAmount,
                type: 'qr_cashback',
                initiatedBy: 'customer',
                source: 'customer_request',
                status: 'Approved',
                paymentMethod: safePaymentMethod,
                gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId, gatewayPaymentId: paymentId },
              }], { session });

            // Trigger referral reward
            await claimFirstPurchaseReferralBonus({ session, customer });

            result = { type: 'customer_purchase', transactionId: txn.transactionId, cashbackAmount };
          } else {
            logger.info(`[Razorpay Webhook] Payment ${paymentId} captured without actionable notes metadata`);
            result = { type: 'unassigned_payment', paymentId };
          }
        });

        logger.info(`[Razorpay Webhook] Successfully processed payment ${paymentId}`);
        return res.status(200).json({ success: true, message: 'Webhook payment processed successfully', data: result });
      } catch (err) {
        if (err instanceof DuplicatePaymentError) {
          logger.info(`[Razorpay Webhook] Idempotent skip for payment ${paymentId}: ${err.message}`);
          return res.status(200).json({ success: true, message: 'Payment already processed', status: 'already_processed' });
        }
        if (err instanceof InsufficientBalanceError) {
          logger.error(`[Razorpay Webhook] Insufficient vendor balance for payment ${paymentId}: ${err.message}`);
          return res.status(400).json({ success: false, message: err.message });
        }
        throw err;
      } finally {
        session.endSession();
      }
    }

    // 3. Handle payment.failed
    if (event === 'payment.failed') {
      const payment = payload?.payment?.entity;
      logger.warn(`[Razorpay Webhook] Payment failed: ID ${payment?.id}, Reason: ${payment?.error_description}`);
      return res.status(200).json({ success: true, message: 'Payment failure logged' });
    }

    // Unhandled event types return 200 to acknowledge receipt
    return res.status(200).json({ success: true, message: `Event ${event} received` });
  } catch (error) {
    logger.error(`[Razorpay Webhook] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server Error processing webhook', error: error.message });
  }
};
