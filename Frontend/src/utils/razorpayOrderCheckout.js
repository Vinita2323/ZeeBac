import { OrderAPI } from '../services/api';

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Dynamically loads Razorpay's checkout script once.
 */
export const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

/**
 * Opens Razorpay checkout for an order and verifies payment on completion.
 * Webhook remains the source of truth; client verification confirms immediately.
 */
export async function openOrderRazorpayCheckout(rzp, { onVerified, onPending, onLoadFailed, onPaymentFailed } = {}) {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    if (onLoadFailed) onLoadFailed();
    else alert('Could not load the payment page. Please check your internet and tap "Complete Payment".');
    return false;
  }

  const instance = new window.Razorpay({
    key: rzp.keyId,
    order_id: rzp.razorpayOrderId,
    amount: rzp.amount,
    currency: rzp.currency || 'INR',
    name: rzp.name || 'ZeeBac',
    description: rzp.description,
    prefill: rzp.prefill,
    theme: { color: '#6d28d9' },
    handler: async (response) => {
      try {
        const res = await OrderAPI.verifyRazorpayPayment(rzp.orderId, response);
        if (res.success && onVerified) {
          onVerified(res.data.order);
        }
      } catch (err) {
        console.warn('Payment verification pending', err);
        if (onPending) onPending(err);
      }
    },
  });

  instance.on('payment.failed', (resp) => {
    const msg = resp?.error?.description || 'Payment failed. You can try again with "Complete Payment".';
    if (onPaymentFailed) onPaymentFailed(msg, resp);
    else alert(msg);
  });

  instance.open();
  return true;
}
