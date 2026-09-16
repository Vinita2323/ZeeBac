import mongoose from 'mongoose';
import { verifyWebhookSignature } from '../utils/webhook.util.js';
import { debitWallet, creditWallet, assertGatewayPaymentNotProcessed, DuplicatePaymentError, InsufficientBalanceError } from '../utils/wallet.util.js';
import { calculateCashback } from '../utils/cashback.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import { getVendorSubscriptionState } from '../utils/subscription.util.js';
import { extractCustomerPhoneFromUpi } from '../utils/phone.util.js';
import Transaction from '../models/Transaction.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket/socket.js';

/**
 * Handle incoming Razorpay Webhooks.
 * Validates HMAC SHA-256 signature against RAZORPAY_WEBHOOK_SECRET.
 * Process payment.captured (async recovery / idempotency) and payment.failed events.
 * 
 * Supports:
 * 1. Vendor wallet recharge (notes.type === 'vendor_recharge')
 * 2. In-app Customer online purchase (notes.vendorZeebacId && notes.customerId)
 * 3. Direct counter QR UPI scans (PhonePe, Paytm, Google Pay, BHIM):
 *    - Extracts customer phone from payment.contact or payment.vpa
 *    - If customer registered: auto-credits cashback to Zeebac wallet & sends notification
 *    - If customer not registered: logs payment for vendor with ₹0 cashback without debiting vendor
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
      const paymentMethod = notes.paymentMethod || 'UPI';
      const utr = payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || payment.acquirer_data?.bank_transaction_id || notes.utr || null;

      if (!paymentId) {
        return res.status(400).json({ success: false, message: 'Missing payment ID' });
      }

      // Check if this payment is for vendor wallet top-up vs customer purchase
      const isVendorRecharge = notes.type === 'vendor_recharge' || notes.purpose === 'vendor_wallet_recharge';

      const session = await mongoose.startSession();
      let notificationsToSend = [];
      let socketEventsToEmit = [];
      let result = null;

      try {
        await session.withTransaction(async () => {
          // Idempotency check: Throws DuplicatePaymentError if already processed by client or previous webhook
          await assertGatewayPaymentNotProcessed(session, paymentId);

          if (isVendorRecharge && notes.vendorId) {
            // Vendor wallet recharge
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
          } else {
            // Customer Purchase (In-App or Counter QR Scan via PhonePe / Paytm / GPay)
            const targetZeebacId = notes.vendorZeebacId || notes.tr || (payment.description && payment.description.match(/ZBV-[A-Z0-9_-]+/i)?.[0]);

            let vendor = null;
            if (targetZeebacId) {
              vendor = await Vendor.findOne({ status: 'Verified', zeebacId: targetZeebacId.toUpperCase() }).session(session);
            }
            if (!vendor && notes.vendorId && mongoose.Types.ObjectId.isValid(notes.vendorId)) {
              vendor = await Vendor.findOne({ status: 'Verified', _id: notes.vendorId }).session(session);
            }
            if (!vendor && payment.vpa) {
              vendor = await Vendor.findOne({ status: 'Verified', 'bankDetails.upiId': payment.vpa.toLowerCase() }).session(session);
            }

            if (!vendor) {
              logger.info(`[Razorpay Webhook] Payment ${paymentId} captured without matching verified vendor`);
              result = { type: 'unassigned_payment', paymentId };
              return;
            }

            // Customer Identification:
            // 1. Direct customerId in notes (in-app flow)
            // 2. Extracted phone from payment.contact or payment.vpa (PhonePe, Paytm, GPay)
            let customer = null;
            const extractedPhone = extractCustomerPhoneFromUpi(payment);

            if (notes.customerId && mongoose.Types.ObjectId.isValid(notes.customerId)) {
              customer = await User.findById(notes.customerId).session(session);
            } else if (extractedPhone) {
              customer = await User.findOne({ phone: extractedPhone, role: 'customer' }).session(session);
            }

            const validPaymentMethods = ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Wallet', 'Other', 'Cash (POS Bill Scan)'];
            const safePaymentMethod = validPaymentMethods.includes(paymentMethod) ? paymentMethod : 'UPI';
            const transactionId = `TX-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

            if (customer) {
              // -------------------------------------------------------------
              // CASE 1: Customer IS REGISTERED in ZeeBac -> Automatic Cashback
              // -------------------------------------------------------------
              const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' }).session(session);
              const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
              const subState = getVendorSubscriptionState(vendor, vendorBalance);
              const cashbackRate = vendor.cashbackRate || 0;
              const cashbackAmount = calculateCashback(verifiedAmount, cashbackRate);

              const canGiveCashback = !subState.cashbackBlocked && vendorBalance >= cashbackAmount && cashbackAmount > 0;

              if (canGiveCashback) {
                // Deduct cashback from vendor wallet
                await debitWallet({
                  session,
                  ownerId: vendor._id,
                  ownerType: 'Vendor',
                  amount: cashbackAmount,
                  category: 'cashback',
                  description: `Cashback paid to customer ${customer.name || customer.phone} (Webhook ${paymentId})`,
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

                // Create Approved Transaction
                const [txn] = await Transaction.create([{
                  transactionId,
                  customerId: customer._id,
                  customerZeebacId: customer.zeebacId,
                  customerPhone: customer.phone,
                  customerName: customer.name,
                  vendorId: vendor._id,
                  vendorZeebacId: vendor.zeebacId,
                  vendorName: vendor.storeName,
                  vendorCategory: vendor.category,
                  amount: verifiedAmount,
                  cashbackPercent: cashbackRate,
                  cashbackAmount,
                  type: 'qr_cashback',
                  initiatedBy: 'customer',
                  source: 'upi_qr_scan',
                  status: 'Approved',
                  paymentMethod: safePaymentMethod,
                  gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId, gatewayPaymentId: paymentId, utr },
                }], { session });

                // Trigger referral first purchase bonus
                await claimFirstPurchaseReferralBonus({ session, customer });

                // Queue Customer Notification
                notificationsToSend.push({
                  recipientId: customer._id,
                  recipientType: 'customer',
                  fcmTokens: customer.fcmTokens || [],
                  type: 'credit',
                  title: 'Cashback Received! 💸',
                  message: `Aapko ${vendor.storeName} se ₹${cashbackAmount} cashback mila!`,
                  icon: 'account_balance_wallet',
                  referenceId: txn._id,
                  referenceType: 'transaction',
                });

                // Queue Vendor Notification
                notificationsToSend.push({
                  recipientId: vendor._id,
                  recipientType: 'vendor',
                  fcmTokens: vendor.fcmTokens || [],
                  type: 'credit',
                  title: 'Payment Received',
                  message: `₹${verifiedAmount} payment received via UPI from ${customer.name || customer.phone}. ₹${cashbackAmount} cashback given.`,
                  icon: 'payments',
                  referenceId: txn._id,
                  referenceType: 'transaction',
                });

                // Queue Real-time Socket Event
                socketEventsToEmit.push({
                  room: `user_${customer._id}`,
                  event: 'wallet_updated',
                  data: {
                    balanceCredit: cashbackAmount,
                    message: `Aapko ${vendor.storeName} se ₹${cashbackAmount} cashback mila!`,
                    transactionId,
                  },
                });

                result = {
                  type: 'customer_purchase',
                  registered: true,
                  transactionId,
                  cashbackAmount,
                  customerPhone: customer.phone,
                };
              } else {
                // Customer registered, but cashback blocked (vendor wallet 0 or subscription expired)
                logger.warn(`[Razorpay Webhook] Cashback blocked for payment ${paymentId}: ${subState.cashbackBlockedReason || 'insufficient balance'}`);

                const [txn] = await Transaction.create([{
                  transactionId,
                  customerId: customer._id,
                  customerZeebacId: customer.zeebacId,
                  customerPhone: customer.phone,
                  customerName: customer.name,
                  vendorId: vendor._id,
                  vendorZeebacId: vendor.zeebacId,
                  vendorName: vendor.storeName,
                  vendorCategory: vendor.category,
                  amount: verifiedAmount,
                  cashbackPercent: 0,
                  cashbackAmount: 0,
                  type: 'qr_cashback',
                  initiatedBy: 'customer',
                  source: 'upi_qr_scan',
                  status: 'Approved',
                  flagReason: subState.cashbackBlockedReason || 'Cashback blocked due to vendor subscription or balance',
                  paymentMethod: safePaymentMethod,
                  gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId, gatewayPaymentId: paymentId, utr },
                }], { session });

                notificationsToSend.push({
                  recipientId: vendor._id,
                  recipientType: 'vendor',
                  fcmTokens: vendor.fcmTokens || [],
                  type: 'system',
                  title: 'Cashback Blocked',
                  message: `₹${verifiedAmount} payment received from ${customer.phone}, but cashback was blocked: ${subState.cashbackBlockedReason || 'Insufficient balance'}. Please recharge your wallet.`,
                  icon: 'warning',
                  referenceId: txn._id,
                  referenceType: 'transaction',
                });

                result = {
                  type: 'customer_purchase',
                  registered: true,
                  transactionId,
                  cashbackAmount: 0,
                  reason: subState.cashbackBlockedReason,
                };
              }
            } else {
              // -------------------------------------------------------------
              // CASE 2: Customer NOT REGISTERED in ZeeBac
              // Payment goes to vendor, but NO cashback credited or debited
              // -------------------------------------------------------------
              logger.info(`[Razorpay Webhook] Payment from unregistered customer (${extractedPhone || 'unknown'}) to vendor ${vendor.zeebacId}`);

              const guestPhone = extractedPhone || 'Guest';
              const guestName = extractedPhone ? `Guest (${extractedPhone})` : 'Guest Customer (Unregistered)';

              const [txn] = await Transaction.create([{
                transactionId,
                customerId: null,
                customerZeebacId: null,
                customerPhone: guestPhone,
                customerName: guestName,
                vendorId: vendor._id,
                vendorZeebacId: vendor.zeebacId,
                vendorName: vendor.storeName,
                vendorCategory: vendor.category,
                amount: verifiedAmount,
                cashbackPercent: 0,
                cashbackAmount: 0,
                type: 'qr_cashback',
                initiatedBy: 'customer',
                source: 'upi_qr_scan',
                status: 'Approved',
                paymentMethod: safePaymentMethod,
                gateway: { gatewayName: 'Razorpay', gatewayOrderId: orderId, gatewayPaymentId: paymentId, utr },
              }], { session });

              // Notify vendor of payment from unregistered customer
              notificationsToSend.push({
                recipientId: vendor._id,
                recipientType: 'vendor',
                fcmTokens: vendor.fcmTokens || [],
                type: 'credit',
                title: 'Payment Received (Unregistered Customer)',
                message: `₹${verifiedAmount} payment received via UPI from unregistered customer (${guestPhone}). No cashback debited.`,
                icon: 'payments',
                referenceId: txn._id,
                referenceType: 'transaction',
              });

              result = {
                type: 'customer_purchase',
                registered: false,
                transactionId,
                cashbackAmount: 0,
                customerPhone: guestPhone,
              };
            }
          }
        });

        // 3. Post-Transaction Notification & Socket Broadcasts
        for (const notif of notificationsToSend) {
          try {
            await sendNotification(notif);
          } catch (err) {
            logger.error(`[Razorpay Webhook] Notification failed: ${err.message}`);
          }
        }

        try {
          const io = getIO();
          for (const ev of socketEventsToEmit) {
            io.to(ev.room).emit(ev.event, ev.data);
          }
        } catch {
          // Socket.io might not be initialized in certain environments (e.g. testing)
        }

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

    // 4. Handle payment.failed
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
