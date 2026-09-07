import Razorpay from 'razorpay';
import crypto from 'crypto';

let instance = null;

// A single shared Razorpay SDK instance instead of `new Razorpay(...)` being
// constructed separately (and identically) in three different controllers.
export const getRazorpayInstance = () => {
  if (!instance) {
    instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return instance;
};

export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  // Constant-time comparison — a plain === leaks timing information about
  // how many leading bytes matched, which is unnecessary risk for a check
  // this cheap to do properly.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// The signature only proves (order_id, payment_id) is a genuine Razorpay
// pair — it says nothing about the amount, since the signature formula never
// includes it. Anything that credits a wallet based on a Razorpay payment
// MUST fetch the payment from Razorpay's own API and use ITS amount/status,
// never a client-supplied `amount` field. Returns the verified amount in
// rupees, or throws if the payment isn't actually captured.
export const fetchVerifiedPaymentAmount = async (paymentId) => {
  const payment = await getRazorpayInstance().payments.fetch(paymentId);
  if (!payment || payment.status !== 'captured') {
    throw new Error(`Payment ${paymentId} is not in a captured state (status: ${payment?.status})`);
  }
  return payment.amount / 100; // paise -> rupees
};
