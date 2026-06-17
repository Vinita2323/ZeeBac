import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LogPurchasePage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Mock detection
  const detectedCustomer = phone.length >= 10 ? 'Rahul Sharma' : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (detectedCustomer && amount) {
      setShowConfirmation(true);
    }
  };

  const handleApprove = () => {
    // Mock Data Update
    const newTx = { 
      id: `TRX-99${Math.floor(Math.random() * 90) + 10}`, 
      customer: detectedCustomer, 
      amount: `₹${amount}`, 
      time: 'Just now', 
      status: 'Approved' 
    };
    
    const existing = JSON.parse(localStorage.getItem('vendor_transactions') || '[]');
    localStorage.setItem('vendor_transactions', JSON.stringify([newTx, ...existing]));
    
    const currentBalance = parseFloat(localStorage.getItem('vendor_balance') || '24500');
    // Assuming 10% cashback for mock
    const cashbackAmount = parseFloat(amount) * 0.1;
    localStorage.setItem('vendor_balance', (currentBalance - cashbackAmount).toString());

    navigate('/vendor/transactions');
  };

  return (
    <div className="animate-reveal text-left w-full block">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Log Purchase</span>
      </header>

      {!showConfirmation ? (
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center justify-start space-y-6 pt-4">
          <div className="text-center w-[320px] max-w-full px-4 space-y-2 mb-4">
            <h2 className="font-display text-[24px] font-black text-on-surface">Record Sale</h2>
            <p className="text-on-surface-variant text-[14px]">Enter the customer's phone number and the bill amount to log their purchase.</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] w-[320px] max-w-full mx-4 space-y-5 text-left">
            {/* Phone Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Customer Mobile Number</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-on-surface-variant">+91</span>
                <input 
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all text-[16px] font-bold text-on-surface placeholder-on-surface-variant/40"
                  maxLength={10}
                />
              </div>
              {detectedCustomer && (
                <p className="text-[12px] text-green-600 font-bold pl-1 pt-1 animate-reveal flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Found: {detectedCustomer}
                </p>
              )}
            </div>

            {/* Bill Amount Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Record Purchase Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-black text-primary">₹</span>
                <input 
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all text-[20px] font-black text-primary placeholder-primary/30"
                />
              </div>
            </div>
          </div>

          <div className="w-[320px] max-w-full px-4 pt-2">
            <button 
              type="submit"
              disabled={!detectedCustomer || !amount}
              className={`w-full py-3.5 rounded-xl font-bold text-[14px] active:scale-[0.98] transition-transform shadow-md ${
                detectedCustomer && amount 
                  ? 'bg-primary text-white shadow-primary/20' 
                  : 'bg-surface-container-high text-on-surface-variant/50 shadow-none'
              }`}
            >
              Continue
            </button>
          </div>
        </form>
      ) : (
        /* Confirmation Flow */
        <div className="w-full flex flex-col items-center justify-center space-y-6 pt-8 animate-reveal">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <span className="material-symbols-outlined text-[40px]" style={{fontVariationSettings: "'FILL' 1"}}>receipt_long</span>
          </div>
          
          <div className="text-center w-[320px] max-w-full px-4 space-y-1">
            <h2 className="font-display text-[22px] font-black text-on-surface">Review Details</h2>
            <p className="text-on-surface-variant text-[14px]">Sending cashback request to <span className="font-bold text-on-surface">{detectedCustomer}</span></p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] w-[320px] max-w-full mx-4 space-y-4 text-left">
            
            <div className="flex justify-between items-end border-b border-outline-variant/10 pb-4">
              <div>
                <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Purchase Amount</p>
                <p className="text-[24px] font-black text-on-surface leading-none mt-1">₹{amount}</p>
              </div>
            </div>

            {/* Cashback Grant Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/5 bg-surface-container-low/50">
              <div>
                <p className="font-bold text-[13px] text-on-surface">Grant Cashback</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">10% from your wallet</p>
              </div>
              <div className="w-10 h-6 bg-primary rounded-full p-0.5 cursor-pointer transition-colors shadow-sm relative shadow-primary/20">
                <div className="w-5 h-5 bg-white rounded-full shadow-sm transform translate-x-4 transition-transform" />
              </div>
            </div>
            
            <div className="flex justify-between items-center text-red-500 bg-red-50 p-3 rounded-xl border border-red-100/50">
              <span className="text-[11px] font-bold uppercase tracking-wider">Wallet Deduction</span>
              <span className="text-[13px] font-black">-₹{(parseFloat(amount) * 0.1).toFixed(2)}</span>
            </div>
          </div>

          <div className="w-[320px] max-w-full px-4 pt-2 space-y-3">
            <button 
              onClick={handleApprove}
              className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-[14px] active:scale-[0.98] transition-transform shadow-md shadow-primary/20"
            >
              Send Cashback Request
            </button>
            <button 
              onClick={() => setShowConfirmation(false)}
              className="w-full py-3.5 bg-surface-container-low text-on-surface rounded-xl font-bold text-[14px] active:scale-[0.98] transition-transform border border-outline-variant/10"
            >
              Back to Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
