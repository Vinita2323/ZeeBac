import React, { useState } from 'react';

export default function RechargeComingSoonModal({ isOpen, onClose }) {
  const [notified, setNotified] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in text-left">
      <div 
        className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-outline-variant/20 relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#16082f] via-[#3b0764] to-[#6000da] text-white p-5 relative overflow-hidden">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>

          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            Coming Soon
          </div>

          <h3 className="text-[18px] font-black tracking-tight leading-snug">
            Mobile Recharge
          </h3>
          <p className="text-[11.5px] text-purple-200 mt-1 leading-relaxed">
            Recharge your prepaid mobile number directly using your Zeebac cashback wallet balance!
          </p>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/80">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              </div>
              <div>
                <p className="text-[11.5px] font-bold text-slate-800 leading-tight">Pay via Cashback</p>
                <p className="text-[10px] text-slate-500">100% wallet balance usable</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/80">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">cell_tower</span>
              </div>
              <div>
                <p className="text-[11.5px] font-bold text-slate-800 leading-tight">All Major Operators</p>
                <p className="text-[10px] text-slate-500">Jio, Airtel, Vi & BSNL top-ups</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/80">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">bolt</span>
              </div>
              <div>
                <p className="text-[11.5px] font-bold text-slate-800 leading-tight">Instant Disbursal</p>
                <p className="text-[10px] text-slate-500">Instant plan activation & confirmation</p>
              </div>
            </div>
          </div>

          {notified ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
              <p className="text-[12px] font-bold text-emerald-800 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                You're on the Early Access List!
              </p>
              <p className="text-[10px] text-emerald-600">We'll notify you as soon as Mobile Recharge is live.</p>
            </div>
          ) : (
            <button
              onClick={() => setNotified(true)}
              className="w-full py-2.5 bg-primary hover:bg-primary/95 text-white rounded-xl font-bold text-[12px] shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">notifications</span>
              Notify Me on Launch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
