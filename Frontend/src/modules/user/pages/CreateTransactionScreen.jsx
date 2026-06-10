import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function CreateTransactionScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultVendor = {
    id: 1,
    name: "Noir Concept Store",
    cashback: "UP TO 15% CASHBACK",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8"
  };

  const vendor = location.state?.vendor || defaultVendor;

  // Extract numeric cashback percentage (defaults to 10%)
  const percentMatch = vendor.cashback.match(/(\d+)%/);
  const cashbackPercent = percentMatch ? parseInt(percentMatch[1]) : 10;
  
  const parsedAmount = parseFloat(amount) || 0;
  const computedCashback = (parsedAmount * (cashbackPercent / 100)).toFixed(2);

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (/^\d*\.?\d{0,2}$/.test(val) || val === '') {
      setAmount(val);
    }
  };

  const handlePay = (e) => {
    e.preventDefault();
    if (parsedAmount <= 0) return;
    setIsSubmitting(true);
    
    setTimeout(() => {
      setIsSubmitting(false);
      navigate('/transaction-success', {
        state: {
          vendorName: vendor.name,
          vendorImg: vendor.img,
          amount: parsedAmount.toFixed(2),
          cashback: computedCashback
        }
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9ff] text-on-surface font-body-lg">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Pay Bill</span>
      </header>

      {/* Content Form Body */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-center">
        
        {/* Vendor Header Card */}
        <div className="glass-card rounded-2xl p-md flex items-center gap-md border border-outline-variant/30 text-left shadow-sm">
          <img 
            alt={vendor.name} 
            className="w-12 h-12 rounded-xl object-cover" 
            src={vendor.img}
          />
          <div>
            <p className="font-caption text-[10px] text-on-surface-variant leading-none uppercase">Paying Partner</p>
            <h2 className="font-title-md text-on-surface font-extrabold pt-1">{vendor.name}</h2>
            <p className="text-[11px] text-primary font-bold">{cashbackPercent}% Rewards Rate active</p>
          </div>
        </div>

        {/* Input amount calculator */}
        <div className="flex-grow flex flex-col items-center justify-center py-xl space-y-md">
          <p className="font-title-md text-on-surface-variant font-bold text-body-lg">Enter Transaction Bill Amount</p>
          <div className="relative w-full flex items-center justify-center gap-xs">
            <span className="font-display text-[32px] text-primary/50 font-black">$</span>
            <input 
              autoFocus
              className="w-56 bg-transparent border-none focus:ring-0 text-center font-display text-[44px] text-primary font-black placeholder:opacity-20 p-0"
              placeholder="0.00"
              type="text"
              value={amount}
              onChange={handleInputChange}
            />
          </div>
          <div className="h-[2px] w-24 bg-primary/10 mx-auto"></div>

          {/* Cashback calculator statement */}
          {parsedAmount > 0 && (
            <div className="bg-secondary/5 border border-secondary/20 rounded-2xl py-sm px-lg flex items-center justify-between gap-xl shadow-inner animate-reveal">
              <span className="font-caption text-body-sm text-on-surface-variant text-[13px]">Estimated Cashback</span>
              <span className="font-title-md font-extrabold text-secondary">+ ${computedCashback}</span>
            </div>
          )}
        </div>

        {/* Proceed Button */}
        <form onSubmit={handlePay} className="w-full">
          <button 
            type="submit"
            disabled={parsedAmount <= 0 || isSubmitting}
            className={`w-full h-14 rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg transition-transform duration-100 ${
              parsedAmount > 0 && !isSubmitting
                ? 'btn-primary-gradient text-white active:scale-95 cursor-pointer'
                : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
            }`}
          >
            {isSubmitting ? (
              <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                <span className="material-symbols-outlined">payments</span>
                Proceed to Pay
              </>
            )}
          </button>
        </form>

      </main>
    </div>
  );
}
