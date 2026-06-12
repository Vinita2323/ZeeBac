import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';

export default function WalletScreen() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(1200.00);

  // Available rewards count up animation
  useEffect(() => {
    let start = 1200.00;
    const end = 1284.50;
    const duration = 1200;
    const stepTime = 30;
    const steps = duration / stepTime;
    const increment = (end - start) / steps;
    
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      start += increment;
      if (currentStep >= steps) {
        clearInterval(timer);
        setBalance(end);
      } else {
        setBalance(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, []);

  const activities = [
    {
      id: 1,
      name: "Noir Concept Store",
      time: "Today, 2:45 PM",
      amount: "+₹37.50",
      status: "Credited",
      icon: "shopping_bag"
    },
    {
      id: 2,
      name: "Fresh Foods Organic",
      time: "Yesterday, 11:20 AM",
      amount: "+₹7.70",
      status: "Credited",
      icon: "shopping_basket"
    },
    {
      id: 3,
      name: "Bank Cashout Deposit",
      time: "Oct 22, 2023",
      amount: "-₹50.00",
      status: "Debited",
      icon: "account_balance"
    }
  ];

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm justify-between">
        <div className="flex items-center gap-xs">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Rewards Wallet</span>
        </div>
      </header>

      {/* Main body content */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
        {/* Available rewards banner card */}
        <div className="bg-white border border-outline-variant/30 rounded-[2rem] p-lg shadow-md text-center space-y-md relative overflow-hidden">
          <div className="space-y-sm">
            <p className="font-caption text-[11px] text-on-surface-variant uppercase tracking-widest leading-none">Total Cashback Reward</p>
            <h2 className="text-[44px] font-display font-black text-primary leading-none">₹{balance.toFixed(2)}</h2>
          </div>

          {/* Quick buttons */}
          <div className="grid grid-cols-3 gap-sm pt-sm border-t border-outline-variant/10">
            <button 
              onClick={() => navigate('/passbook')}
              className="flex flex-col items-center gap-xs cursor-pointer hover:opacity-85 active:scale-95"
            >
              <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant">Passbook</span>
            </button>
            <button 
              onClick={() => alert('Transfer to bank placeholder')}
              className="flex flex-col items-center gap-xs cursor-pointer hover:opacity-85 active:scale-95"
            >
              <div className="w-11 h-11 bg-secondary/10 rounded-full flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">account_balance</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant">Cashout</span>
            </button>
            <button 
              onClick={() => alert('Perks placeholder')}
              className="flex flex-col items-center gap-xs cursor-pointer hover:opacity-85 active:scale-95"
            >
              <div className="w-11 h-11 bg-green-500/10 rounded-full flex items-center justify-center text-green-600">
                <span className="material-symbols-outlined text-[20px]">stars</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant">Perks</span>
            </button>
          </div>
        </div>

        {/* Cashback Requests History Link Banner */}
        <div 
          onClick={() => navigate('/request-history')}
          className="bg-white border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">history_edu</span>
            </div>
            <div className="text-left">
              <p className="font-title-md text-on-surface font-extrabold text-body-sm leading-none">Cashback Requests</p>
              <p className="font-caption text-[11px] text-on-surface-variant mt-1.5">View status of submitted bills & receipts</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline text-body-lg">chevron_right</span>
        </div>

        {/* Recent rewards transaction list */}
        <div className="space-y-md">
          <h3 className="font-display text-title-md text-on-surface font-extrabold">Recent Wallet Activity</h3>
          
          <div className="grid grid-cols-1 gap-md">
            {activities.map((act) => (
              <div 
                key={act.id}
                className="glass-card rounded-2xl p-sm border border-outline-variant/30 flex items-center gap-md"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  act.status === 'Credited' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                }`}>
                  <span className="material-symbols-outlined">{act.icon}</span>
                </div>
                <div className="flex-grow text-left space-y-0.5">
                  <h4 className="font-title-md text-on-surface font-bold text-body-lg">{act.name}</h4>
                  <p className="text-caption text-on-surface-variant text-[12px]">{act.time}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display font-black text-body-lg ${
                    act.status === 'Credited' ? 'text-green-600' : 'text-red-600'
                  }`}>{act.amount}</p>
                  <span className="text-[10px] uppercase font-semibold text-outline tracking-wider">{act.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}
