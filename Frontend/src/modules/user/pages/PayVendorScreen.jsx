import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function PayVendorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const vendor = location.state?.vendor;
  const [amount, setAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);

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

  const cashbackRate = vendor.cashbackRate || 10;
  const purchaseAmount = parseFloat(amount) || 0;
  const cashbackAmount = Math.round(purchaseAmount * (cashbackRate / 100) * 100) / 100;
  const isValid = purchaseAmount >= 1;

  const handleConfirm = () => {
    if (!isValid || processing) return;
    setProcessing(true);

    const currentUser = JSON.parse(localStorage.getItem('zeebac_current_user') || '{}');

    // Create transaction
    const txn = {
      id: `TXN-${Date.now()}`,
      type: 'qr_cashback',
      initiatedBy: 'customer',
      customerPhone: currentUser.phone,
      customerName: currentUser.name,
      customerId: currentUser.zeebacId || 'ZBC-0000',
      vendorPhone: vendor.phone,
      vendorName: vendor.storeName || vendor.name,
      vendorId: vendor.zeebacId || 'ZBV-0000',
      vendorCategory: vendor.category,
      purchaseAmount: purchaseAmount,
      cashbackRate: cashbackRate,
      cashbackAmount: cashbackAmount,
      timestamp: new Date().toISOString(),
    };

    // Save transaction
    const txns = JSON.parse(localStorage.getItem('zeebac_transactions') || '[]');
    txns.unshift(txn);
    localStorage.setItem('zeebac_transactions', JSON.stringify(txns));

    // Update wallet balance
    const currentBalance = parseFloat(localStorage.getItem('zeebac_wallet_balance') || '1284.50');
    localStorage.setItem('zeebac_wallet_balance', String(currentBalance + cashbackAmount));

    setTimeout(() => {
      setConfirmed(true);
      setProcessing(false);
    }, 1200);
  };

  // Success State
  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#f9f9ff] flex flex-col items-center justify-center p-6 text-center font-body-lg">
        <div className="animate-reveal space-y-6 max-w-[360px]">
          <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-green-600 text-[56px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h1 className="text-[28px] font-black text-on-surface tracking-tight">Cashback Earned!</h1>
          <p className="text-on-surface-variant text-[14px]">
            You spent ₹{purchaseAmount.toLocaleString()} at <strong>{vendor.storeName || vendor.name}</strong> and earned:
          </p>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
            <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Cashback Credited</p>
            <p className="text-[36px] font-black text-green-600 leading-none">₹{cashbackAmount.toFixed(2)}</p>
            <p className="text-[11px] text-green-600/70 mt-1">at {cashbackRate}% cashback rate</p>
          </div>
          <button
            onClick={() => navigate('/home')}
            className="w-full h-[52px] rounded-xl bg-primary text-white font-title-md shadow-lg hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">home</span>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

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
