import React, { useState } from 'react';

export default function ShopAndPayLaterModal({ isOpen, onClose }) {
  const [panNumber, setPanNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const activeStreakDays = 0; // 0 / 30 days

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!panNumber.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in text-left">
      <div 
        className="bg-white rounded-3xl max-w-sm sm:max-w-md w-full max-h-[90dvh] overflow-y-auto shadow-2xl border border-outline-variant/20 relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Gradient Header */}
        <div className="bg-gradient-to-br from-[#16082f] via-[#2d0554] to-[#4c00b0] text-white p-5 relative overflow-hidden">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>

          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-2">
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            Coming Soon • BNPL
          </div>

          <h3 className="text-[19px] sm:text-[20px] font-black tracking-tight leading-snug">
            Shop & Pay Later
          </h3>

          {/* Subdued Feature Callout */}
          <div className="mt-2 p-2.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15">
            <p className="text-[12px] font-extrabold text-amber-300 leading-snug">
              Earn 30 days cashback and get credit limit upto ₹10,000
            </p>
            <p className="text-[10.5px] text-purple-100/90 mt-0.5 leading-relaxed">
              30 din regular payments ya cashback gain karne par aapke PAN Card & CIBIL score ke according instant credit limit unlock hogi.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between text-[11px]">
            <div>
              <p className="text-[9.5px] text-purple-200 uppercase font-bold tracking-wider">Credit Limit</p>
              <p className="text-[16px] font-black text-amber-300 leading-tight">Upto ₹10,000</p>
            </div>
            <div className="text-right">
              <p className="text-[9.5px] text-purple-200 uppercase font-bold tracking-wider">Interest Period</p>
              <p className="text-[14px] font-bold text-emerald-300 leading-tight">0% for 30 Days</p>
            </div>
          </div>
        </div>

        {/* Subtle Body */}
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* 30-Day Activity Progress */}
          <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-primary">verified</span>
                30-Day Activity Streak
              </span>
              <span className="font-black text-primary">{activeStreakDays}/30 Days</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(5, (activeStreakDays / 30) * 100)}%` }} 
              />
            </div>
            <p className="text-[9.5px] text-slate-500 mt-1">
              Daily payments ya cashback earn karke 30 din ka streak poora karein.
            </p>
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-2 gap-2 text-left">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-primary mb-0.5">
                <span className="material-symbols-outlined text-[16px]">badge</span>
                <span className="text-[11px] font-bold text-slate-900">PAN & CIBIL</span>
              </div>
              <p className="text-[9.5px] text-slate-500 leading-tight">Paperless score verification</p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-emerald-600 mb-0.5">
                <span className="material-symbols-outlined text-[16px]">percent</span>
                <span className="text-[11px] font-bold text-slate-900">0% Interest</span>
              </div>
              <p className="text-[9.5px] text-slate-500 leading-tight">Zero charges within 30 days</p>
            </div>
          </div>

          {/* Form / Submitted Confirmation */}
          {submitted ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
              <span className="material-symbols-outlined text-[24px] text-emerald-600">check_circle</span>
              <h4 className="text-[13px] font-bold text-emerald-900">Registered for Early Access!</h4>
              <p className="text-[10.5px] text-emerald-700 leading-relaxed">
                Aapki details note kar li gayi hain. Feature live hote hi aur 30-day streak par aapki ₹10,000 credit limit activate ho jayegi.
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
                  Full Name (As per PAN)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] font-medium text-slate-800 outline-none focus:border-primary focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  PAN Card Number (For CIBIL Assessment)
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  placeholder="e.g. ABCDE1234F"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] font-bold tracking-wider text-slate-800 outline-none focus:border-primary focus:bg-white transition-all uppercase"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-primary hover:bg-primary/95 text-white font-bold text-[12px] rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
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
