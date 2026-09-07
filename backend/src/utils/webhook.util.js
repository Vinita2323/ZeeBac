import crypto from 'crypto';

/**
 * Constant-time verification of Razorpay webhook HMAC SHA-256 signatures.
 * @param {string|Buffer} rawBody - Raw unparsed HTTP request body
 * @param {string} signature - Value of 'x-razorpay-signature' header
 * @param {string} secret - RAZORPAY_WEBHOOK_SECRET
 * @returns {boolean} True if signature matches, false otherwise
 */
export const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
