import React, { useState } from 'react';

export default function VendorPayLaterModal({ isOpen, onClose }) {
  const [storePan, setStorePan] = useState('');
  const [storeName, setStoreName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const activeStreakDays = 0;

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!storePan.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in text-left">
      <div 
        className="bg-white rounded-3xl max-w-sm sm:max-w-md w-full max-h-[90dvh] overflow-y-auto shadow-2xl border border-outline-variant/20 relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Dark Indigo Header */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white p-5 relative overflow-hidden">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>

          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            Coming Soon • Vendor Credit
          </div>

          <h3 className="text-[19px] sm:text-[20px] font-black tracking-tight leading-snug">
            Vendor Shop & Pay Later
          </h3>

          {/* Subdued Feature Callout */}
          <div className="mt-2 p-2.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15">
            <p className="text-[12px] font-extrabold text-amber-300 leading-snug">
              Maintain 30 days transactions & get credit limit upto ₹25,000
            </p>
            <p className="text-[10.5px] text-indigo-200/90 mt-0.5 leading-relaxed">
              30 din regular transactions aur cashback distribution par business PAN & CIBIL score ke according credit limit unlock hogi.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between text-[11px]">
            <div>
              <p className="text-[9.5px] text-indigo-200 uppercase font-bold tracking-wider">Credit Limit</p>
              <p className="text-[16px] font-black text-amber-300 leading-tight">Upto ₹25,000</p>
            </div>
            <div className="text-right">
              <p className="text-[9.5px] text-indigo-200 uppercase font-bold tracking-wider">Collateral</p>
              <p className="text-[14px] font-bold text-emerald-400 leading-tight">0% (Collateral-Free)</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* 30-Day Activity Progress */}
          <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-indigo-600">storefront</span>
                30-Day Store Streak
              </span>
              <span className="font-black text-indigo-700">{activeStreakDays}/30 Days</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(5, (activeStreakDays / 30) * 100)}%` }} 
              />
            </div>
            <p className="text-[9.5px] text-slate-500 mt-1">
              Store par regular customer payments log karein ya cashback issue karein.
            </p>
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-2 gap-2 text-left">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-indigo-600 mb-0.5">
                <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                <span className="text-[11px] font-bold text-slate-900">Inventory Stock</span>
              </div>
              <p className="text-[9.5px] text-slate-500 leading-tight">Purchase stock on credit</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-emerald-600 mb-0.5">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span className="text-[11px] font-bold text-slate-900">PAN & CIBIL</span>
              </div>
              <p className="text-[9.5px] text-slate-500 leading-tight">Instant paperless approval</p>
            </div>
          </div>

          {/* Form or Submitted State */}
          {submitted ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
              <span className="material-symbols-outlined text-[24px] text-emerald-600">check_circle</span>
              <h4 className="text-[13px] font-bold text-emerald-900">Store Registered for Early Access!</h4>
              <p className="text-[10.5px] text-emerald-700 leading-relaxed">
                Aapki details receive ho gayi hain. Feature live hote hi aur 30-day streak par aapki ₹25,000 credit limit unlock ho jayegi.
              </p>
              <button
                onClick={onClose}
                className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5 pt-1">
              <div>
                <label className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Store / Business Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sharma General Store"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Proprietor / Business PAN Card
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  placeholder="e.g. ABCDE1234F"
                  value={storePan}
                  onChange={(e) => setStorePan(e.target.value.toUpperCase())}
                  className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] font-bold tracking-wider text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all uppercase"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-900 hover:bg-indigo-950 text-white font-bold text-[12px] rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">notifications</span>
                <span>Pre-Apply & Notify Me</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
