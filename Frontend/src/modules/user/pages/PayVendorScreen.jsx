import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';

export default function PayVendorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const vendor = location.state?.vendor;
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const updateBalance = useAuthStore((state) => state.updateBalance);

  if (!vendor) {
    return (
      <div className="min-h-screen bg-[#f9f9ff] flex items-center justify-center p-6">
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
  const isValid = purchaseAmount >= 1;

  const handleConfirm = async () => {
    if (!isValid || processing) return;
    setProcessing(true);
    
    // --- CASH FLOW (Direct API) ---
    if (paymentMethod === 'Cash') {
      try {
        const res = await UserAPI.createTransaction({
          vendorZeebacId: vendor.zeebacId, amount: parseFloat(amount), paymentMethod
        });
        if (res.success) handleSuccess(res.data);
      } catch (err) {
        alert(err.response?.data?.message || 'Transaction failed.');
        setProcessing(false);
      }
      return;
    }

    // --- RAZORPAY FLOW (UPI, Credit/Debit Card) ---
    try {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        alert("Razorpay SDK failed to load. Are you online?");
        setProcessing(false);
        return;
      }

      const orderRes = await UserAPI.createRazorpayOrder(parseFloat(amount));
      if (!orderRes.success) throw new Error("Could not create Razorpay order");
      
      const options = {
        key: orderRes.data.key,
        amount: orderRes.data.amount,
        currency: "INR",
        name: vendor.storeName,
        description: `Payment to ${vendor.storeName}`,
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
            alert("Payment verification failed");
            setProcessing(false);
          }
        },
        prefill: { name: "Customer", contact: "9999999999" }, // Ideally fetch from customer profile
        theme: { color: "#6200ea" }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function () {
        alert("Payment failed or cancelled");
        setProcessing(false);
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      alert("Error initializing payment gateway");
      setProcessing(false);
    }
  };

  const handleSuccess = (data) => {
    const { cashbackEarned, newWalletBalance, vendorName, transaction } = data;
    updateBalance(newWalletBalance);
    navigate('/transaction-success', {
      state: {
        vendorName, 
        amount: parseFloat(amount), 
        cashback: cashbackEarned, 
        transactionId: transaction.transactionId,
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-on-surface flex flex-col font-body-lg">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 flex items-center border-b border-outline-variant/10 shadow-sm">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 transition-all cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-2">Pay Vendor</span>
      </header>

      <main className="flex-1 max-w-[440px] mx-auto w-full px-5 py-6 flex flex-col text-left">

        {/* Vendor Info Card */}
        <div className="bg-white rounded-2xl border border-outline-variant/15 p-5 shadow-sm mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-black text-on-surface truncate">{vendor.storeName || vendor.name}</h2>
              <p className="text-[12px] text-on-surface-variant">{vendor.category}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded">{vendor.zeebacId}</span>
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
                  <span className="text-[13px] font-bold text-green-800">You'll earn</span>
                </div>
                <span className="text-[20px] font-black text-green-600">₹{cashbackAmount.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-green-600/70 mt-1 text-right">{cashbackRate}% of ₹{purchaseAmount.toLocaleString()}</p>
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="flex gap-2 flex-wrap justify-center mt-2">
            {['Cash', 'UPI', 'Credit Card', 'Debit Card'].map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  paymentMethod === method
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white border border-outline-variant/20 text-on-surface-variant'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* Confirm Button */}
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
