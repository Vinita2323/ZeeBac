import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function WalletPage() {
  const navigate = useNavigate();
  const balance = useAuthStore((state) => state.walletBalance);



  const activities = [
    { id: 1, title: 'Settlement to Bank', type: 'cashout', amount: '-₹15,000.00', status: 'Completed', date: 'Oct 23, 2023' },
    { id: 2, title: 'Daily Earnings Credit', type: 'credit', amount: '+₹4,250.00', status: 'Credited', date: 'Oct 23, 2023' },
    { id: 3, title: 'Cashback Deductions', type: 'debit', amount: '-₹340.00', status: 'Debited', date: 'Oct 23, 2023' },
    { id: 4, title: 'Daily Earnings Credit', type: 'credit', amount: '+₹3,800.00', status: 'Credited', date: 'Oct 22, 2023' },
  ];

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Wallet</span>
      </header>

      <div className="space-y-6 pt-2 pb-6">

      {/* Constrain width on desktop so the card doesn't become massive */}
      <div className="md:max-w-[400px] space-y-4">
        {/* Balance Card — physical card style */}
        <div className="relative overflow-hidden rounded-2xl p-4.5 text-white shadow-md bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] aspect-[2.1/1] flex flex-col justify-between">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-xl -mb-10 -ml-10 pointer-events-none" />
          
          {/* Card Header */}
          <div className="relative z-10 flex justify-between items-start">
            <div className="flex items-center gap-1 opacity-80">
              <span className="material-symbols-outlined text-[14px]">account_balance_wallet</span>
              <span className="text-[10px] font-bold tracking-wider uppercase">Cashback Wallet</span>
            </div>
            <span className="material-symbols-outlined text-[18px] opacity-50">contactless</span>
          </div>

          {/* Balance Amount */}
          <div className="relative z-10 my-1">
            <h2 className="text-[28px] font-display font-black leading-none tracking-tight">
              ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>

          {/* Card Footer */}
          <div className="relative z-10 flex justify-between items-end opacity-70">
            <div className="text-[9px] tracking-widest font-mono">**** **** 9921</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Noir Concept</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <button 
            onClick={() => alert('Add Funds Flow')}
            className="flex-1 py-2 bg-primary text-white rounded-xl font-bold active:scale-[0.97] transition-all shadow-md shadow-primary/20 flex flex-col items-center justify-center gap-0.5 text-[10.5px]"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add Funds
          </button>
          
          <button 
            onClick={() => alert('Withdraw Flow')}
            className="flex-1 py-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm flex flex-col items-center justify-center gap-0.5 text-[10.5px]"
          >
            <span className="material-symbols-outlined text-[18px]">account_balance</span>
            Withdraw
          </button>

          <button 
            onClick={() => navigate('/vendor/passbook')}
            className="flex-1 py-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm flex flex-col items-center justify-center gap-0.5 text-[10.5px]"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            Ledger
          </button>
        </div>
      </div>

      {/* Stats Row - Compact */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-on-surface-variant font-bold text-[9px] uppercase tracking-wider">Earnings</span>
            <div className="w-5.5 h-5.5 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[12px]">trending_up</span>
            </div>
          </div>
          <p className="text-[16px] font-black text-on-surface leading-none tracking-tight">₹1,42,500</p>
          <p className="text-[9px] font-medium text-on-surface-variant mt-1">This Month</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-on-surface-variant font-bold text-[9px] uppercase tracking-wider">Cashback</span>
            <div className="w-5.5 h-5.5 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[12px]">redeem</span>
            </div>
          </div>
          <p className="text-[16px] font-black text-on-surface leading-none tracking-tight">₹11,400</p>
          <p className="text-[9px] font-medium text-on-surface-variant mt-1">This Month</p>
        </div>
      </div>

      {/* Wallet Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[18px] font-extrabold text-on-surface">Recent Activity</h3>
          <button onClick={() => navigate('/vendor/passbook')} className="text-[14px] text-primary font-medium hover:underline cursor-pointer">See All</button>
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
