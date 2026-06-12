import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function CreateTransactionScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState(location.state?.vendor || null);

  const mockContacts = [
    {
      id: 1,
      name: "Noir Concept Store",
      cashback: "UP TO 15% CASHBACK",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8"
    },
    {
      id: 2,
      name: "Fresh Foods Organic",
      cashback: "FLAT 8% CASHBACK",
      img: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&h=300&q=80"
    },
    {
      id: 3,
      name: "Alex Rivera",
      cashback: "FLAT 5% CASHBACK",
      img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80"
    }
  ];

  // If no recipient is selected, show Enter Recipient UI
  if (!selectedRecipient) {
    const isRecipientValid = recipientInput.trim().length >= 3;

    const handleRecipientSubmit = (e) => {
      e.preventDefault();
      if (!isRecipientValid) return;
      setSelectedRecipient({
        id: Date.now(),
        name: recipientInput,
        cashback: "FLAT 5% CASHBACK",
        img: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80"
      });
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
          <span className="font-display text-title-md text-primary ml-4">Enter Mobile / ID</span>
        </header>

        {/* Content Form Body */}
        <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-left">
          <div className="space-y-lg flex-grow">
            <div className="space-y-xs text-left">
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase">RECIPIENT MOBILE OR ID</label>
              <div className="h-[56px] relative">
                <input 
                  autoFocus
                  className="w-full h-full px-md bg-[#F3F4F6] rounded-xl border border-transparent outline-none focus:border-[#420093] focus:bg-white text-body-lg placeholder:text-outline transition-all"
                  placeholder="Enter 10-digit number or ID" 
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                />
              </div>
            </div>

            {/* Mock Contacts / Recent list */}
            <div className="space-y-md">
              <h3 className="font-display text-body-sm font-extrabold text-on-surface-variant uppercase tracking-wider">Recent Contacts</h3>
              <div className="grid grid-cols-1 gap-md">
                {mockContacts.map((contact) => (
                  <div 
                    key={contact.id}
                    onClick={() => setSelectedRecipient(contact)}
                    className="glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-all flex items-center p-sm border border-outline-variant/30 gap-md active:scale-[0.98]"
                  >
                    <img 
                      alt={contact.name} 
                      className="w-10 h-10 rounded-full object-cover animate-reveal" 
                      src={contact.img}
                    />
                    <div className="flex-grow text-left">
                      <h4 className="font-title-md text-on-surface font-bold text-body-lg">{contact.name}</h4>
                      <p className="text-caption text-primary font-bold text-[11px]">{contact.cashback}</p>
                    </div>
                    <span className="material-symbols-outlined text-primary text-[20px]">chevron_right</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleRecipientSubmit} className="w-full pt-lg">
            <button 
              type="submit"
              disabled={!isRecipientValid}
              className={`w-full h-14 rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg transition-transform duration-100 ${
                isRecipientValid
                  ? 'btn-primary-gradient text-white active:scale-95 cursor-pointer'
                  : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
              }`}
            >
              Continue
            </button>
          </form>
        </main>
      </div>
    );
  }

  // Extract numeric cashback percentage
  const percentMatch = selectedRecipient.cashback.match(/(\d+)%/);
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
          vendorName: selectedRecipient.name,
          vendorImg: selectedRecipient.img,
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
          onClick={() => setSelectedRecipient(null)}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Pay Bill</span>
      </header>

      {/* Content Form Body */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-5 flex flex-col justify-between text-center">
        
        <div className="space-y-6">
          {/* Vendor Header Card */}
          <div className="glass-card rounded-2xl p-md flex items-center gap-md border border-outline-variant/30 text-left shadow-sm">
            <img 
              alt={selectedRecipient.name} 
              className="w-12 h-12 rounded-xl object-cover" 
              src={selectedRecipient.img}
            />
            <div>
              <p className="font-caption text-[10px] text-on-surface-variant leading-none uppercase">Paying Partner</p>
              <h2 className="font-title-md text-on-surface font-extrabold pt-1">{selectedRecipient.name}</h2>
              <p className="text-[11px] text-primary font-bold">{cashbackPercent}% Rewards Rate active</p>
            </div>
          </div>

          {/* Input amount calculator */}
          <div className="flex flex-col items-center justify-center py-4 space-y-3">
            <p className="font-title-md text-on-surface-variant font-bold text-body-sm tracking-wide">Enter Transaction Bill Amount</p>
            <div className="relative w-full flex items-center justify-center gap-3">
              <span className="font-display text-[28px] text-[#420093]/70 font-black">₹</span>
              <input 
                autoFocus
                className="w-48 h-12 bg-white border border-outline-variant/60 rounded-xl focus:border-[#420093] focus:ring-2 focus:ring-[#420093]/15 focus:outline-none text-center font-display text-[26px] text-primary font-black placeholder:opacity-25 transition-all shadow-sm"
                placeholder="0.00"
                type="text"
                value={amount}
                onChange={handleInputChange}
              />
            </div>

            {/* Cashback calculator statement */}
            {parsedAmount > 0 && (
              <div className="bg-secondary/5 border border-secondary/20 rounded-2xl py-sm px-lg flex items-center justify-between gap-xl shadow-inner animate-reveal">
                <span className="font-caption text-body-sm text-on-surface-variant text-[13px]">Estimated Cashback</span>
                <span className="font-title-md font-extrabold text-secondary">+ ₹{computedCashback}</span>
              </div>
            )}
          </div>
        </div>

        {/* Proceed Button */}
        <form onSubmit={handlePay} className="w-full pt-4">
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
