import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function VendorSubscriptionPage() {
  const navigate = useNavigate();
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [subStatus, setSubStatus] = useState(null);
  const [billingCycle, setBillingCycle] = useState('Monthly'); // 'Monthly' or 'Yearly'
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Payment Modal State
  const [paymentModalPlan, setPaymentModalPlan] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStepMessage, setPaymentStepMessage] = useState('');
  const [modalError, setModalError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [plansRes, statusRes] = await Promise.all([
        VendorAPI.getSubscriptionPlans(),
        VendorAPI.getSubscriptionStatus(),
      ]);

      if (plansRes.success) {
        setPlans(plansRes.data);
      }
      if (statusRes.success) {
        setSubStatus(statusRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription details:', error);
      setErrorMessage(error.response?.data?.message || 'Failed to load subscription details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPaymentModal = (plan) => {
    setPaymentModalPlan(plan);
    setModalError('');
    setPaymentStepMessage('');
  };

  const closePaymentModal = () => {
    if (isProcessingPayment) return;
    setPaymentModalPlan(null);
    setModalError('');
    setPaymentStepMessage('');
  };

  // ─── 1. Pay via Razorpay ───
  const handlePayViaRazorpay = async () => {
    if (!paymentModalPlan || isProcessingPayment) return;
    setIsProcessingPayment(true);
    setModalError('');
    setPaymentStepMessage('Creating Razorpay order...');

    let createdOrderId = null;

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay SDK. Please check your internet connection.');
      }

      const orderRes = await VendorAPI.createSubscriptionRazorpayOrder({
        planType: paymentModalPlan.planType,
      });

      if (!orderRes.success || !orderRes.data?.orderId) {
        throw new Error(orderRes.message || 'Failed to create subscription order.');
      }

      const { orderId, amount, key, planType } = orderRes.data;
      createdOrderId = orderId;

      setPaymentStepMessage('Opening Razorpay checkout...');

      const options = {
        key: key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: 'ZeeBac',
        description: `${planType} Plan Subscription`,
        order_id: orderId,
        handler: async function (response) {
          setPaymentStepMessage('Verifying payment signature with server...');
          try {
            const verifyRes = await VendorAPI.verifySubscriptionRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planType,
            });

            if (verifyRes.success) {
              setSuccessMessage(`🎉 Subscription Activated! Your ${planType} plan is now active.`);
              updateProfile({ subscription: verifyRes.data });
              closePaymentModal();
              await loadData();
            } else {
              setModalError(verifyRes.message || 'Payment verification failed.');
            }
          } catch (err) {
            console.error('Razorpay verification error:', err);
            setModalError(err.response?.data?.message || 'Payment verification failed. Please contact support.');
          } finally {
            setIsProcessingPayment(false);
          }
        },
        modal: {
          ondismiss: async function () {
            setIsProcessingPayment(false);
            setPaymentStepMessage('');
            if (createdOrderId) {
              await VendorAPI.cancelSubscriptionRazorpayOrder({
                razorpay_order_id: createdOrderId,
                reason: 'Checkout modal dismissed by user',
              }).catch(() => {});
            }
          },
        },
        prefill: {
          name: currentUser.storeName || currentUser.ownerName || 'Vendor',
          contact: currentUser.phone || '',
          email: currentUser.email || '',
        },
        theme: {
          color: '#7E3AF2',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async function (response) {
        setIsProcessingPayment(false);
        setModalError(response.error?.description || 'Razorpay payment failed or was declined.');
        if (createdOrderId) {
          await VendorAPI.cancelSubscriptionRazorpayOrder({
            razorpay_order_id: createdOrderId,
            reason: response.error?.description || 'Payment failed',
          }).catch(() => {});
        }
      });

      rzp.open();
    } catch (err) {
      console.error('Razorpay payment error:', err);
      setModalError(err.response?.data?.message || err.message || 'Payment initiation failed.');
      setIsProcessingPayment(false);
      setPaymentStepMessage('');
    }
  };

  // ─── 2. Pay From Vendor Wallet ───
  const handlePayFromWallet = async () => {
    if (!paymentModalPlan || isProcessingPayment) return;
    setIsProcessingPayment(true);
    setModalError('');
    setPaymentStepMessage('Validating balance and deducting from wallet...');

    try {
      const res = await VendorAPI.paySubscriptionFromWallet({
        planType: paymentModalPlan.planType,
      });

      if (res.success) {
        setSuccessMessage(`🎉 Success! Your ${paymentModalPlan.planType} plan was purchased from your wallet.`);
        updateProfile({ subscription: res.data?.subscription });
        closePaymentModal();
        await loadData();
      } else {
        setModalError(res.message || 'Failed to pay from wallet.');
      }
    } catch (err) {
      console.error('Wallet payment error:', err);
      const msg = err.response?.data?.message || 'Wallet payment failed. Please check your balance.';
      setModalError(msg);
    } finally {
      setIsProcessingPayment(false);
      setPaymentStepMessage('');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-body-sm text-gray-500 font-medium">Loading subscription plans...</p>
      </div>
    );
  }

  const isBrand = subStatus?.shopType === 'Chain & Brand';
  const effectiveStatus = subStatus?.effectiveStatus || 'NONE';
  const inGrace = Boolean(subStatus?.inGracePeriod);
  const hoursLeft = subStatus?.hoursRemainingInGrace || 0;
  const isSubActive = Boolean(subStatus?.isSubActive);
  const isStoreVisible = Boolean(subStatus?.isStoreVisible);
  const walletBalance = subStatus?.walletBalance ?? 0;

  const monthlyPlan = plans.find((p) => p.planType === 'Monthly') || {
    planType: 'Monthly',
    price: isBrand ? 999 : 499,
    durationDays: 30,
    features: [
      'Store listed on Customer Map & Search',
      'Offer Cashbacks to ZeeBac users',
      'QR Code & In-Store Payments',
      'Real-Time Analytics & Reports',
      'Standard Vendor Support',
    ],
  };

  const yearlyPlan = plans.find((p) => p.planType === 'Yearly') || {
    planType: 'Yearly',
    price: isBrand ? 9999 : 4999,
    durationDays: 365,
    features: [
      'All Monthly Plan Features',
      '2 Months Free (Save ~17%)',
      'Priority Placement in Search',
      'Dedicated Account Manager',
      'Promotional Banners on ZeeBac',
    ],
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-reveal text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-[26px] font-black text-gray-900 tracking-tight">
              Store Subscription
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
              {isBrand ? 'Chain & Brand' : 'Independent Store'}
            </span>
          </div>
          <p className="text-[13.5px] text-gray-500 mt-1">
            Choose a plan to keep your store active, visible on map/search listings, and eligible for customer cashbacks.
          </p>
        </div>

        <button
          onClick={() => navigate('/vendor')}
          className="self-start md:self-auto px-4 py-2 rounded-xl border border-gray-200 text-gray-700 font-bold text-[13px] hover:bg-gray-50 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Dashboard
        </button>
      </div>

      {/* Notifications / Feedback */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 animate-reveal">
          <span className="material-symbols-outlined text-emerald-600 text-[24px]">verified</span>
          <div className="flex-1 text-[13.5px] font-semibold">{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-center gap-3 animate-reveal">
          <span className="material-symbols-outlined text-red-600 text-[24px]">error</span>
          <div className="flex-1 text-[13.5px] font-semibold">{errorMessage}</div>
        </div>
      )}

      {/* Current Status Banner */}
      <div className="bg-white rounded-3xl p-6 border border-outline-variant/15 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              Current Subscription Status
            </p>
            <div className="flex items-center gap-2 mt-1">
              {isSubActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active · {subStatus?.planType} Plan
                </span>
              ) : inGrace ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Expired · 24-Hour Grace Period Active ({hoursLeft}h left)
                </span>
              ) : effectiveStatus === 'EXPIRED' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-red-100 text-red-800 border border-red-200">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Subscription Expired · Store Hidden
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  No Active Subscription · Store Hidden
                </span>
              )}

              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${isStoreVisible ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {isStoreVisible ? 'Visible on Map & Search' : 'Hidden from Discovery'}
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              Cashback Wallet Balance
            </p>
            <p className={`text-[18px] font-black mt-0.5 ${walletBalance <= 0 ? 'text-red-600' : 'text-purple-700'}`}>
              ₹{walletBalance.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Status explanation messages */}
        {isSubActive && subStatus?.expiresAt && (
          <p className="text-[13px] text-gray-600">
            ✅ Your subscription is valid until <strong className="text-gray-900">{new Date(subStatus.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Customers can find your store on search and maps.
          </p>
        )}

        {inGrace && (
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-[13px] text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-amber-700">warning</span>
              24-Hour Renewal Grace Period Active ({hoursLeft} hours remaining)
            </p>
            <p className="text-[12.5px] text-amber-800">
              Your subscription has expired. Your store is temporarily still visible on map/search, but <strong>cashback is blocked</strong> until renewed. If not renewed within 24 hours, your store will be hidden.
            </p>
          </div>
        )}

        {!isSubActive && !inGrace && (
          <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-[13px] text-rose-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-rose-700">visibility_off</span>
              Store is Currently Inactive / Hidden
            </p>
            <p className="text-[12.5px] text-rose-800">
              Your store does not appear in customer searches or map listings. Choose a payment method below to activate your store instantly.
            </p>
          </div>
        )}

        {walletBalance <= 0 && (
          <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200/80 text-[12.5px] text-amber-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-700 text-[18px]">account_balance_wallet</span>
              <span><strong>Notice:</strong> Cashback wallet balance is ₹0. Cashback requests are paused until you recharge.</span>
            </div>
            <button
              onClick={() => navigate('/vendor/wallet')}
              className="px-3 py-1 bg-white text-amber-800 font-bold rounded-lg border border-amber-300 text-[11px] hover:bg-amber-100 shrink-0 cursor-pointer"
            >
              Recharge Wallet
            </button>
          </div>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid md:grid-cols-2 gap-6 pt-2">
        {/* Monthly Plan */}
        <div className={`bg-white rounded-3xl p-6 border-2 transition-all flex flex-col justify-between shadow-sm relative ${billingCycle === 'Monthly' ? 'border-primary/50 ring-2 ring-primary/10' : 'border-gray-200/80 hover:border-gray-300'}`}>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold tracking-wider uppercase bg-gray-100 text-gray-700">
                  Flexible Option
                </span>
                <h3 className="text-[20px] font-black text-gray-900 mt-2">Monthly Plan</h3>
                <p className="text-[12.5px] text-gray-500">Pay month-to-month with complete flexibility.</p>
              </div>
              <div className="text-right">
                <span className="text-[28px] font-black text-gray-900">₹{monthlyPlan.price}</span>
                <span className="text-[12px] text-gray-400 font-bold block">/ 30 Days</span>
              </div>
            </div>

            <hr className="border-gray-100" />

            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Plan Highlights</p>
              {monthlyPlan.features.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-[13px] text-gray-700">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={() => openPaymentModal(monthlyPlan)}
              className="w-full py-3 rounded-2xl bg-gray-900 text-white font-bold text-[14px] hover:bg-black active:scale-[0.98] transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">payment</span>
              <span>
                {isSubActive && subStatus?.planType === 'Monthly'
                  ? `Renew Monthly Plan (₹${monthlyPlan.price})`
                  : `Choose Monthly Plan (₹${monthlyPlan.price})`}
              </span>
            </button>
          </div>
        </div>

        {/* Yearly Plan */}
        <div className={`bg-gradient-to-b from-purple-50/50 to-white rounded-3xl p-6 border-2 transition-all flex flex-col justify-between shadow-sm relative ${billingCycle === 'Yearly' ? 'border-primary ring-2 ring-primary/20' : 'border-purple-200 hover:border-purple-300'}`}>
          <div className="absolute -top-3 right-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10.5px] font-black tracking-wider uppercase px-3 py-0.5 rounded-full shadow-md">
            Best Value · Save 17%
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold tracking-wider uppercase bg-purple-100 text-purple-700">
                  Full Year Growth
                </span>
                <h3 className="text-[20px] font-black text-gray-900 mt-2">Yearly Plan</h3>
                <p className="text-[12.5px] text-gray-500">Uninterrupted listing with priority discovery boost.</p>
              </div>
              <div className="text-right">
                <span className="text-[28px] font-black text-purple-700">₹{yearlyPlan.price}</span>
                <span className="text-[12px] text-purple-500 font-bold block">/ 365 Days</span>
              </div>
            </div>

            <hr className="border-purple-100" />

            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Plan Highlights</p>
              {yearlyPlan.features.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-[13px] text-gray-700">
                  <span className="material-symbols-outlined text-purple-600 text-[18px]">check_circle</span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={() => openPaymentModal(yearlyPlan)}
              className="w-full py-3 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">stars</span>
              <span>
                {isSubActive && subStatus?.planType === 'Yearly'
                  ? `Renew Yearly Plan (₹${yearlyPlan.price})`
                  : `Choose Yearly Plan (₹${yearlyPlan.price})`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── PAYMENT SELECTION MODAL ─── */}
      {paymentModalPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-reveal border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-br from-[#16082f] via-[#2a0845] to-[#6000da] text-white relative">
              <button
                onClick={closePaymentModal}
                disabled={isProcessingPayment}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>

              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[20px] text-purple-300">verified</span>
                <span className="text-[12px] font-bold tracking-wider uppercase text-purple-200">
                  Select Payment Method
                </span>
              </div>
              <h3 className="text-[22px] font-black tracking-tight text-white">
                {paymentModalPlan.planType} Plan
              </h3>
              <p className="text-[13px] text-purple-200/80 mt-1">
                Amount payable: <strong className="text-white text-[16px]">₹{paymentModalPlan.price.toLocaleString('en-IN')}</strong> for {paymentModalPlan.durationDays || (paymentModalPlan.planType === 'Monthly' ? 30 : 365)} days
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-left">
              {modalError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[12.5px] font-semibold flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-red-500 shrink-0">error</span>
                  <span>{modalError}</span>
                </div>
              )}

              {paymentStepMessage && (
                <div className="p-3 bg-purple-50 border border-purple-200 text-purple-800 rounded-xl text-[12.5px] flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{paymentStepMessage}</span>
                </div>
              )}

              {/* Option 1: Pay via Razorpay */}
              <div className="border border-gray-200 rounded-2xl p-4 hover:border-purple-300 transition-colors space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">credit_card</span>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-gray-900">Pay via Razorpay</h4>
                      <p className="text-[11.5px] text-gray-500">UPI, Cards, NetBanking & Wallets</p>
                    </div>
                  </div>
                  <span className="text-[15px] font-black text-gray-900">₹{paymentModalPlan.price.toLocaleString('en-IN')}</span>
                </div>

                <button
                  type="button"
                  onClick={handlePayViaRazorpay}
                  disabled={isProcessingPayment}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-[0.98] text-white text-[13px] font-bold transition-all shadow-md shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">lock</span>
                  <span>Pay ₹{paymentModalPlan.price.toLocaleString('en-IN')} via Razorpay</span>
                </button>
              </div>

              {/* Option 2: Pay From Vendor Wallet */}
              <div className="border border-gray-200 rounded-2xl p-4 hover:border-purple-300 transition-colors space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-gray-900">Pay from Wallet</h4>
                      <p className="text-[11.5px] text-gray-500">Instant activation using in-app balance</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-gray-400 font-bold block uppercase tracking-wider">Balance</span>
                    <span className="text-[14px] font-black text-gray-800">₹{walletBalance.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Balance calculation preview */}
                <div className="p-3 bg-gray-50 rounded-xl space-y-1.5 border border-gray-100 text-[12px]">
                  <div className="flex justify-between text-gray-600">
                    <span>Current Wallet Balance:</span>
                    <span className="font-semibold text-gray-800">₹{walletBalance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Subscription Price:</span>
                    <span className="font-semibold text-gray-800">- ₹{paymentModalPlan.price.toLocaleString('en-IN')}</span>
                  </div>
                  <hr className="border-gray-200" />
                  <div className="flex justify-between font-bold">
                    <span>Remaining Balance After Payment:</span>
                    <span className={walletBalance >= paymentModalPlan.price ? 'text-emerald-700' : 'text-red-600'}>
                      ₹{(walletBalance - paymentModalPlan.price).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Wallet Action Button or Insufficient Alert */}
                {walletBalance >= paymentModalPlan.price ? (
                  <button
                    type="button"
                    onClick={handlePayFromWallet}
                    disabled={isProcessingPayment}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white text-[13px] font-bold transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[17px]">account_balance_wallet</span>
                    <span>Pay ₹{paymentModalPlan.price.toLocaleString('en-IN')} from Wallet</span>
                  </button>
                ) : (
                  <div className="space-y-2 pt-1">
                    <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-[12px] font-medium flex items-center gap-2">
                      <span className="material-symbols-outlined text-[17px] text-amber-600 shrink-0">info</span>
                      <span>Insufficient wallet balance. Please recharge your wallet or pay using Razorpay.</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate('/vendor/wallet')}
                      className="w-full py-2 px-3 rounded-xl border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 text-[12px] font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      <span>Recharge Wallet</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11.5px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-emerald-600">verified_user</span>
                256-bit Encrypted & Verified
              </span>
              <button
                onClick={closePaymentModal}
                disabled={isProcessingPayment}
                className="text-gray-600 hover:text-gray-900 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
