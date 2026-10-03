import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import useUIStore from '../../../store/useUIStore';
import { playNotificationChime, speakVoice } from '../../../utils/voiceUtils';

export default function PayVendorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const vendor = location.state?.vendor;
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const isSubmittingRef = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [rewardConfig, setRewardConfig] = useState(null);
  const updateBalance = useAuthStore((state) => state.updateBalance);
  const walletBalance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser);

  useEffect(() => {
    let isMounted = true;
    UserAPI.getRewardsData()
      .then((res) => {
        if (isMounted && res?.success && res.data?.config) {
          setRewardConfig(res.data.config);
        }
      })
      .catch((err) => console.warn('Could not load reward config:', err));
    return () => { isMounted = false; };
  }, []);

  if (!vendor) {
    return (
      <div className="min-h-screen mesh-gradient flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">error</span>
          <p className="text-on-surface-variant font-bold">No vendor selected</p>
          <button onClick={() => navigate('/home')} className="text-primary font-bold hover:underline cursor-pointer">Go Home</button>
        </div>
      </div>
    );
  }

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };


  const cashbackRate = vendor.cashbackRate || 10;
  const purchaseAmount = parseFloat(amount) || 0;
  const cashbackAmount = Math.round(purchaseAmount * (cashbackRate / 100) * 100) / 100;

  const customerFeePercent = rewardConfig?.customerWalletPayCommissionPercent !== undefined ? rewardConfig.customerWalletPayCommissionPercent : 2;
  const customerFixedFee = rewardConfig?.customerWalletPayFixedFee !== undefined ? rewardConfig.customerWalletPayFixedFee : 0;
  const walletFee = paymentMethod === 'Wallet' && purchaseAmount > 0 
    ? Math.round(((purchaseAmount * customerFeePercent) / 100 + customerFixedFee) * 100) / 100 
    : 0;
  const totalWalletDebit = Math.round((purchaseAmount + walletFee) * 100) / 100;

  const isCashOverLimit = paymentMethod === 'Cash' && purchaseAmount > 1000;
  const isWalletInsufficient = paymentMethod === 'Wallet' && totalWalletDebit > walletBalance;
  const isValid = purchaseAmount >= 1 && !isCashOverLimit && !isWalletInsufficient;

  const getCurrentLocation = () =>
    new Promise((resolve) => {
      let cachedCoords = { latitude: null, longitude: null };
      try {
        const stored = localStorage.getItem('zeebac_location');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
            cachedCoords = { latitude: parsed.latitude, longitude: parsed.longitude };
          }
        }
      } catch (_) {}

      if (!cachedCoords.latitude) {
        const profileCoords = currentUser?.location?.coordinates;
        if (Array.isArray(profileCoords) && profileCoords.length === 2 && (profileCoords[0] !== 0 || profileCoords[1] !== 0)) {
          cachedCoords = { latitude: profileCoords[1], longitude: profileCoords[0] };
        }
      }

      if (!navigator.geolocation) {
        return resolve(cachedCoords);
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          try {
            localStorage.setItem('zeebac_location', JSON.stringify(coords));
          } catch (_) {}
          resolve(coords);
        },
        () => {
          resolve(cachedCoords);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
      );
    });

  const handleConfirm = async () => {
    if (!isValid || processing || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setProcessing(true);
    
    // --- CASH FLOW (Direct API with Zero-Fraud Verification Code) ---
    if (paymentMethod === 'Cash') {
      try {
        const coords = await getCurrentLocation();
        const res = await UserAPI.createTransaction({
          vendorZeebacId: vendor.zeebacId,
          amount: parseFloat(amount),
          paymentMethod,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (res.success) {
          playNotificationChime('incoming');
          speakVoice('Cashback request sent. Ask merchant for OTP code at billing counter.');
          handlePendingApproval(res.data);
        }
      } catch (err) {
        alert(err.response?.data?.message || 'Request failed.');
        isSubmittingRef.current = false;
        setProcessing(false);
      }
      return;
    }

    // --- WALLET FLOW (Direct API) ---
    if (paymentMethod === 'Wallet') {
      try {
        const res = await UserAPI.processWalletPayment({
          vendorZeebacId: vendor.zeebacId, amount: parseFloat(amount)
        });
        if (res.success) handleSuccess(res.data);
      } catch (err) {
        alert(err.response?.data?.message || 'Wallet transaction failed.');
        isSubmittingRef.current = false;
        setProcessing(false);
      }
      return;
    }

    // --- RAZORPAY FLOW (UPI, Credit/Debit Card) ---
    try {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        alert("Razorpay SDK failed to load. Are you online?");
        isSubmittingRef.current = false;
        setProcessing(false);
        return;
      }

      const orderRes = await UserAPI.createRazorpayOrder(parseFloat(amount), vendor.zeebacId);
      if (!orderRes.success) throw new Error(orderRes.message || "Could not create Razorpay order");
      
      const rzpKey = orderRes.data.key || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!rzpKey) throw new Error("Razorpay API Key ID is missing. Check your configuration.");

      const options = {
        key: rzpKey,
        amount: orderRes.data.amount,
        currency: "INR",
        name: vendor.storeName || vendor.name || "Zeebac Vendor",
        description: `Payment to ${vendor.storeName || vendor.name || "Vendor"}`,
        order_id: orderRes.data.id,
        handler: async function (response) {
          try {
            const verifyRes = await UserAPI.verifyRazorpayAndCreateTransaction({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              vendorZeebacId: vendor.zeebacId,
              amount: parseFloat(amount),
              paymentMethod
            });
            if (verifyRes.success) handleSuccess(verifyRes.data);
          } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || "Payment verification failed");
            isSubmittingRef.current = false;
            setProcessing(false);
          }
        },
        prefill: { 
          name: currentUser?.name || "Customer", 
          contact: currentUser?.phone ? String(currentUser.phone).replace(/\D/g, '').slice(-10) : "",
          email: currentUser?.email || "",
          method: paymentMethod?.toLowerCase() === 'upi' ? 'upi' : undefined
        },
        theme: { color: "#7c3aed" }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        console.warn("Razorpay Payment Failed/Cancelled:", response.error);
        alert(`Payment failed: ${response.error?.description || "Cancelled by user"}`);
        isSubmittingRef.current = false;
        setProcessing(false);
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      const serverMsg = err.response?.data?.message || err.message || "Error initializing payment gateway";
      alert(serverMsg);
      isSubmittingRef.current = false;
      setProcessing(false);
    }
  };

  const handleSuccess = (data) => {
    const { cashbackEarned, newWalletBalance, newBalance, vendorName, transaction, billAmount, convenienceFee, totalPaid } = data || {};
    updateBalance(newBalance ?? newWalletBalance);
    navigate('/transaction-success', {
      state: {
        vendorName: vendorName || data?.vendor?.name || vendor.storeName,
        amount: parseFloat(amount),
        billAmount: billAmount || parseFloat(amount),
        convenienceFee: convenienceFee !== undefined ? convenienceFee : walletFee,
        totalPaid: totalPaid || (paymentMethod === 'Wallet' ? totalWalletDebit : parseFloat(amount)),
        cashback: cashbackEarned,
        transactionId: transaction?.transactionId,
      }
    });
  };

  const handlePendingApproval = (data) => {
    useUIStore.getState().showSnackbar(
      `Sent to ${data.vendorName} for approval. You'll be notified once they confirm.`,
      'success'
    );
    navigate(`/request/${data.requestId}`);
  };

  return (
    <div className="min-h-screen mesh-gradient text-on-surface flex flex-col font-body-lg">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button onClick={() => safeNavigateBack(navigate, '/home')} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 transition-all cursor-pointer">
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-2">Pay Vendor</span>
          </div>
        </div>
      </header>

      <main className="flex-1 app-container px-5 py-6 flex flex-col text-left">

        {/* Vendor Info Card */}
        <div className="bg-white rounded-2xl border border-outline-variant/15 p-5 shadow-sm mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0 overflow-hidden relative">
              {vendor.storeLogo || vendor.profilePic ? (
                <img 
                  src={(vendor.storeLogo || vendor.profilePic).startsWith('http') || (vendor.storeLogo || vendor.profilePic).startsWith('data:') 
                    ? (vendor.storeLogo || vendor.profilePic) 
                    : `${import.meta.env.VITE_API_URL}${vendor.storeLogo || vendor.profilePic}`}
                  alt={vendor.storeName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-black text-on-surface truncate">{vendor.storeName || vendor.name}</h2>
              <p className="text-[12px] text-on-surface-variant">{vendor.category}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded">
                  {vendor.zeebacId?.replace(/-/g, '')}
                </span>
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{cashbackRate}% cashback</span>
              </div>
            </div>
          </div>
        </div>

        {/* Amount Entry */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <div className="text-center space-y-1">
            <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Enter Purchase Amount</p>
            <p className="text-[11px] text-on-surface-variant/70">How much did you spend at this store?</p>
          </div>

          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-[32px] font-black text-on-surface-variant/40">₹</span>
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-[48px] font-black text-on-surface text-center bg-transparent outline-none w-48 placeholder:text-outline-variant/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Quick Amount Pills */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[100, 250, 500, 1000, 2000].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(String(val))}
                className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all active:scale-95 cursor-pointer ${
                  amount === String(val)
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-white border border-outline-variant/20 text-on-surface hover:border-primary/30'
                }`}
              >
                ₹{val.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Cashback Preview */}
          {isValid && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 w-full max-w-[320px] animate-reveal">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>savings</span>
                  <span className="text-[13px] font-bold text-green-800">{paymentMethod === 'Cash' ? "You'll earn (once code verified)" : "You'll earn"}</span>
                </div>
                <span className="text-[20px] font-black text-green-600">₹{cashbackAmount.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-green-600/70 mt-1 text-right">
                {cashbackRate}% of ₹{purchaseAmount.toLocaleString()}
                {paymentMethod === 'Cash' && ' — verify vendor 3-digit code for instant approval'}
              </p>
            </div>
          )}

          {/* Wallet Payment Fee Breakdown Card */}
          {paymentMethod === 'Wallet' && purchaseAmount > 0 && (
            <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-3.5 w-full max-w-[320px] text-left animate-reveal shadow-xs space-y-1.5">
              <div className="flex justify-between text-[12px] text-on-surface-variant font-medium">
                <span>Store Bill:</span>
                <span className="font-bold text-on-surface">₹{purchaseAmount.toFixed(2)}</span>
              </div>
              {walletFee > 0 && (
                <div className="flex justify-between text-[12px] text-purple-700 font-medium">
                  <span>Convenience Fee ({customerFeePercent}%{customerFixedFee > 0 ? ` + ₹${customerFixedFee}` : ''}):</span>
                  <span className="font-bold">+₹{walletFee.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-purple-200/60 pt-1.5 flex justify-between text-[13px] font-bold text-on-surface">
                <span>Total Wallet Deduction:</span>
                <span className="text-purple-700 font-black">₹{totalWalletDebit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-on-surface-variant/70 pt-0.5">
                <span>Your Wallet Balance:</span>
                <span className={walletBalance >= totalWalletDebit ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                  ₹{walletBalance.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Cash > 1000 Warning Banner */}
          {isCashOverLimit && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 w-full max-w-[340px] text-left animate-reveal shadow-sm">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-600 text-[24px] flex-shrink-0 mt-0.5">verified_user</span>
                <div>
                  <h4 className="font-bold text-[14px] text-amber-950 leading-tight">Cash Request Limit: ₹1,000</h4>
                  <p className="text-[11px] text-amber-900/80 mt-1 leading-normal font-medium">
                    Self cash requests are capped at ₹1,000. For bills above ₹1,000, <strong>ask the shopkeeper to generate a one-time bill barcode from their vendor app</strong> to get instant withdrawable cashback!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="flex gap-2 flex-wrap justify-center mt-2">
            {['Wallet', 'Cash', 'UPI', 'Credit Card', 'Debit Card'].map((method) => {
              const isDisabled = method === 'Wallet' && totalWalletDebit > walletBalance;
              return (
                <button
                  key={method}
                  disabled={isDisabled}
                  onClick={() => setPaymentMethod(method)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    paymentMethod === method
                      ? 'bg-primary text-white shadow-sm'
                      : isDisabled
                      ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                      : 'bg-white border border-outline-variant/20 text-on-surface-variant'
                  }`}
                >
                  {method === 'Wallet' ? `Wallet (₹${walletBalance.toFixed(2)})` : method}
                </button>
              );
            })}
            <button
              onClick={() => useUIStore.getState().showSnackbar('Pay Later is coming soon!', 'info')}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700 flex items-center gap-1 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[13px]">schedule</span>
              Pay later
              <span className="text-[8.5px] font-black bg-amber-200/70 text-amber-800 px-1 py-[1px] rounded-full tracking-wide">SOON</span>
            </button>
          </div>
        </div>

        {/* Confirm Button */}
        {paymentMethod === 'Wallet' && isWalletInsufficient && (
          <p className="text-red-500 text-center text-[12px] mt-4 mb-[-10px] font-bold">
            Insufficient Wallet Balance (Required: ₹{totalWalletDebit.toFixed(2)}, Available: ₹{walletBalance.toFixed(2)})
          </p>
        )}
        <button
          onClick={handleConfirm}
          disabled={!isValid || processing}
          className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-6 ${
            isValid && !processing
              ? 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98]'
              : 'bg-outline-variant/40 text-on-surface/30 cursor-not-allowed'
          }`}
        >
          {processing ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : paymentMethod === 'Cash' ? (
            <>
              <span className="material-symbols-outlined text-[20px]">send</span>
              Send for Vendor Approval
            </>
          ) : paymentMethod === 'Wallet' ? (
            <>
              <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
              Pay ₹{totalWalletDebit > 0 ? totalWalletDebit.toFixed(2) : purchaseAmount.toFixed(2)} via Wallet
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              Confirm & Earn Cashback
            </>
          )}
        </button>
      </main>
    </div>
  );
}
