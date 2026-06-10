import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function TransactionSuccessScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [particles, setParticles] = useState([]);

  const defaultDetails = {
    vendorName: "Noir Concept Store",
    vendorImg: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8",
    amount: "249.99",
    cashback: "37.50"
  };

  const details = location.state || defaultDetails;

  // Generate random confetti simulation on load
  useEffect(() => {
    const list = [];
    const colors = ['#643be0', '#7a2dfe', '#cbbeff', '#382c5a', '#6000da', '#ffba08', '#20bf6b'];
    for (let i = 0; i < 40; i++) {
      list.push({
        id: i,
        left: `${Math.random() * 100}vw`,
        delay: `${Math.random() * 0.8}s`,
        duration: `${Math.random() * 2 + 1}s`,
        size: `${Math.random() * 10 + 4}px`,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    setParticles(list);
  }, []);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const transactionId = `ZB-${Math.floor(100000 + Math.random() * 900000)}-TX`;

  const handleHome = () => {
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-on-surface overflow-hidden relative font-body-lg flex flex-col items-center justify-center p-container-margin select-none">
      
      {/* Confetti Simulator Layer */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-[confetti-fall_3s_infinite_linear]"
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              top: '-10px'
            }}
          />
        ))}
      </div>

      {/* Verification Card */}
      <main className="w-full max-w-[440px] bg-white/60 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl p-lg space-y-lg text-center relative z-10 animate-reveal">
        
        {/* Checkmark icon */}
        <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg text-white">
          <span className="material-symbols-outlined text-[48px]" style={{ fontVariationSettings: "'wght' 600" }}>done</span>
        </div>

        {/* Success title */}
        <div className="space-y-xs">
          <h1 className="text-headline-lg font-black tracking-tight text-on-surface">Payment Successful</h1>
          <p className="text-body-sm text-on-surface-variant">Your transaction has been processed securely.</p>
        </div>

        {/* Payment and Cashback stats */}
        <div className="bg-surface-container-low rounded-2xl p-md border border-outline-variant/20 grid grid-cols-2 gap-md text-left">
          <div>
            <p className="text-caption text-on-surface-variant uppercase text-[10px] tracking-wider leading-none">Paid Amount</p>
            <p className="font-display text-headline-lg text-on-surface font-black pt-1">${details.amount}</p>
          </div>
          <div>
            <p className="text-caption text-secondary uppercase text-[10px] tracking-wider leading-none">Cashback Earned</p>
            <p className="font-display text-headline-lg text-secondary font-black pt-1">+${details.cashback}</p>
          </div>
        </div>

        {/* Detail sheet statement */}
        <div className="space-y-sm text-left border-t border-outline-variant/10 pt-md text-body-sm text-on-surface-variant">
          <div className="flex justify-between">
            <span>Paid To</span>
            <span className="font-bold text-on-surface">{details.vendorName}</span>
          </div>
          <div className="flex justify-between">
            <span>Transaction ID</span>
            <span className="font-label-mono font-bold text-[12px]">{transactionId}</span>
          </div>
          <div className="flex justify-between">
            <span>Date & Time</span>
            <span className="font-bold text-on-surface">{dateStr} • {timeStr}</span>
          </div>
        </div>

        {/* Home Redirect */}
        <button 
          onClick={handleHome}
          className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform duration-100 cursor-pointer"
        >
          <span className="material-symbols-outlined">dashboard</span>
          Back to Dashboard
        </button>
      </main>

      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
