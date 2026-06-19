import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function VendorLogTransactionScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const customer = location.state?.customer;
  const [amount, setAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('zeebac_current_user') || '{}');
  const cashbackRate = currentUser.cashbackRate || 10;
  const purchaseAmount = parseFloat(amount) || 0;
  const cashbackAmount = Math.round(purchaseAmount * (cashbackRate / 100) * 100) / 100;
  const isValid = purchaseAmount >= 1;

  if (!customer) {
    return (
      <div className="animate-reveal text-left">
        <div className="text-center py-20 space-y-4">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">error</span>
          <p className="text-on-surface-variant font-bold">No customer selected</p>
          <button onClick={() => navigate('/vendor/scan-customer')} className="text-secondary font-bold hover:underline cursor-pointer">Find Customer</button>
        </div>
      </div>
    );
  }

  const handleConfirm = () => {
    if (!isValid || processing) return;
    setProcessing(true);

    const txn = {
      id: `TXN-${Date.now()}`,
      type: 'qr_cashback',
      initiatedBy: 'vendor',
      customerPhone: customer.phone,
      customerName: customer.name,
      customerId: customer.zeebacId || 'ZBC-0000',
      vendorPhone: currentUser.phone,
      vendorName: currentUser.storeName || 'Store',
      vendorId: currentUser.zeebacId || 'ZBV-0000',
      vendorCategory: currentUser.category,
      purchaseAmount: purchaseAmount,
      cashbackRate: cashbackRate,
      cashbackAmount: cashbackAmount,
      timestamp: new Date().toISOString(),
    };

    // Save transaction
    const txns = JSON.parse(localStorage.getItem('zeebac_transactions') || '[]');
    txns.unshift(txn);
    localStorage.setItem('zeebac_transactions', JSON.stringify(txns));

    // Credit customer's wallet
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
      <div className="animate-reveal text-left">
        <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
          <div className="animate-reveal space-y-6">
            <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-green-600 text-[56px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <h1 className="text-[24px] font-black text-on-surface tracking-tight">Transaction Logged!</h1>
            <p className="text-on-surface-variant text-[14px]">
              ₹{purchaseAmount.toLocaleString()} purchase from <strong>{customer.name}</strong>
            </p>
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 w-full">
              <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Cashback Credited to Customer</p>
              <p className="text-[32px] font-black text-green-600 leading-none">₹{cashbackAmount.toFixed(2)}</p>
              <p className="text-[11px] text-green-600/70 mt-1">{cashbackRate}% cashback on ₹{purchaseAmount.toLocaleString()}</p>
            </div>
            <div className="flex gap-3 w-full mt-4">
              <button
                onClick={() => navigate('/vendor')}
                className="flex-1 h-[52px] rounded-xl border-2 border-outline-variant/20 text-on-surface font-title-md hover:bg-surface-container active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">home</span>
                Home
              </button>
              <button
                onClick={() => navigate('/vendor/scan-customer')}
                className="flex-1 h-[52px] rounded-xl bg-secondary text-white font-title-md shadow-lg hover:bg-secondary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                Scan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-reveal text-left w-full block">

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Log Transaction</span>
      </header>

      <div className="space-y-6 w-full">

        {/* Customer Card */}
        <div className="bg-white rounded-2xl border border-outline-variant/15 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Customer</p>
              <h2 className="text-[16px] font-black text-on-surface truncate">{customer.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{customer.zeebacId}</span>
                <span className="text-[10px] text-on-surface-variant">+91 {customer.phone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Amount Entry */}
        <div className="flex flex-col items-center py-6 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Purchase Amount</p>
            <p className="text-[11px] text-on-surface-variant/70">Enter the customer's bill amount</p>
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
            {[100, 250, 500, 1000, 2000, 5000].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(String(val))}
                className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all active:scale-95 cursor-pointer ${
                  amount === String(val)
                    ? 'bg-secondary text-white shadow-md'
                    : 'bg-white border border-outline-variant/20 text-on-surface hover:border-secondary/30'
                }`}
              >
                ₹{val.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Cashback Preview */}
          {isValid && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 w-full max-w-[360px] animate-reveal">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>savings</span>
                  <span className="text-[13px] font-bold text-green-800">Customer earns</span>
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
          className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
            isValid && !processing
              ? 'bg-secondary text-white hover:bg-secondary/90 active:scale-[0.98]'
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
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              Log & Credit Cashback
            </>
          )}
        </button>
      </div>
    </div>
  );
}
