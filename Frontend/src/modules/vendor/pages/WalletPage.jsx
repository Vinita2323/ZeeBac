import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function WalletPage() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(24500);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const localBalance = localStorage.getItem('vendor_balance');
    if (localBalance) {
      setBalance(parseFloat(localBalance));
    }
    
    const timer = setTimeout(() => setIsLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);



  const activities = [
    { id: 1, title: 'Settlement to Bank', type: 'cashout', amount: '-₹15,000.00', status: 'Completed', date: 'Oct 23, 2023' },
    { id: 2, title: 'Daily Earnings Credit', type: 'credit', amount: '+₹4,250.00', status: 'Credited', date: 'Oct 23, 2023' },
    { id: 3, title: 'Cashback Deductions', type: 'debit', amount: '-₹340.00', status: 'Debited', date: 'Oct 23, 2023' },
    { id: 4, title: 'Daily Earnings Credit', type: 'credit', amount: '+₹3,800.00', status: 'Credited', date: 'Oct 22, 2023' },
  ];

  if (isLoading) {
    return <SkeletonLoader type="dashboard" />;
  }

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-[#f8f9fc]/90 backdrop-blur-md -mx-4 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <span className="font-display text-[18px] text-on-surface font-black tracking-tight">Wallet</span>
        </div>
      </header>

      <div className="space-y-6 pt-2 pb-6">

      {/* Constrain width on desktop so the card doesn't become massive */}
      <div className="md:max-w-[400px] space-y-6">
        {/* Balance Card — physical card style */}
        <div className="relative overflow-hidden rounded-[20px] p-6 text-white shadow-lg bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] aspect-[1.7/1] flex flex-col justify-between">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-xl -mb-10 -ml-10 pointer-events-none" />
          
          {/* Card Header */}
          <div className="relative z-10 flex justify-between items-start">
            <div className="flex items-center gap-1.5 opacity-80">
              <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
              <span className="text-[11px] font-bold tracking-widest uppercase">Cashback Wallet</span>
            </div>
            <span className="material-symbols-outlined opacity-50">contactless</span>
          </div>

          {/* Balance Amount */}
          <div className="relative z-10">
            <h2 className="text-[34px] font-display font-black leading-none tracking-tight">
              ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>

          {/* Card Footer */}
          <div className="relative z-10 flex justify-between items-end opacity-70">
            <div className="text-[10px] tracking-widest font-mono">**** **** **** 9921</div>
            <div className="text-[10px] font-bold uppercase tracking-wider">Noir Concept</div>
          </div>
        </div>

        {/* Quick Actions (Extracted from card) */}
        <div className="flex gap-3">
          <button 
            onClick={() => alert('Add Funds Flow')}
            className="flex-1 py-3.5 bg-primary text-white rounded-xl font-bold active:scale-[0.97] transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 text-[13px]"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add Funds
          </button>
          <button 
            onClick={() => navigate('/vendor/passbook')}
            className="flex-1 py-3.5 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm flex items-center justify-center gap-2 text-[13px]"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            Ledger
          </button>
        </div>
      </div>

      {/* Stats Row - Compact */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">Earnings</span>
            <div className="w-6 h-6 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
            </div>
          </div>
          <p className="text-[18px] font-black text-on-surface leading-none tracking-tight">₹1,42,500</p>
          <p className="text-[10px] font-medium text-on-surface-variant mt-1">This Month</p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">Cashback</span>
            <div className="w-6 h-6 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[14px]">redeem</span>
            </div>
          </div>
          <p className="text-[18px] font-black text-on-surface leading-none tracking-tight">₹11,400</p>
          <p className="text-[10px] font-medium text-on-surface-variant mt-1">This Month</p>
        </div>
      </div>

      {/* Wallet Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[16px] font-extrabold text-on-surface">Recent Activity</h3>
          <button onClick={() => navigate('/vendor/passbook')} className="text-[12px] text-primary font-bold">See All</button>
        </div>

        <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
          {activities.map((act, index) => (
            <div key={act.id} className={`p-3 flex items-center justify-between active:bg-surface-container-low/50 transition-colors ${
              index !== activities.length - 1 ? 'border-b border-outline-variant/5' : ''
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  act.type === 'credit' ? 'bg-green-50' :
                  act.type === 'cashout' ? 'bg-primary/5' :
                  'bg-red-50'
                }`}>
                  <span className={`material-symbols-outlined text-[20px] ${
                    act.type === 'credit' ? 'text-green-600' :
                    act.type === 'cashout' ? 'text-primary' : 'text-red-600'
                  }`}>
                    {act.type === 'credit' ? 'arrow_downward' :
                     act.type === 'cashout' ? 'account_balance' : 'arrow_upward'}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-[13px] text-on-surface">{act.title}</p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">{act.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-black text-[14px] ${act.type === 'credit' ? 'text-green-600' : 'text-on-surface'}`}>{act.amount}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-outline mt-0.5">{act.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>

    </div>
  );
}
