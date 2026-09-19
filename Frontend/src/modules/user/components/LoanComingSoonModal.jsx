import React, { useState } from 'react';

export default function LoanComingSoonModal({ isOpen, onClose }) {
  const [joined, setJoined] = useState(false);
  const [phone, setPhone] = useState('');

  if (!isOpen) return null;

  const handleJoin = (e) => {
    e.preventDefault();
    setJoined(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-left">
      <div 
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-purple-100 relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Banner with vibrant gradient */}
        <div className="bg-gradient-to-br from-[#16082f] via-[#3b0764] to-[#7c3aed] text-white p-6 relative overflow-hidden">
          {/* Background glowing shapes */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-pink-500/20 rounded-full blur-xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-[11px] font-black uppercase tracking-wider mb-3">
            <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
            Coming Soon
          </div>

          <h2 className="text-[22px] font-black tracking-tight leading-snug">
            Zeebac Instant Personal Loan
          </h2>
          <p className="text-purple-200 text-xs mt-1 font-medium">
            Fast, paperless & collateral-free credit line directly into your bank account.
          </p>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-purple-200 uppercase font-bold tracking-wider">Credit Limit Up To</p>
              <p className="text-[24px] font-black text-amber-300 leading-none mt-0.5">₹5,00,000</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-purple-200 uppercase font-bold tracking-wider">Interest Starts At</p>
              <p className="text-[18px] font-extrabold text-white leading-none mt-0.5">0.99% <span className="text-[11px] font-normal text-purple-200">/mo</span></p>
            </div>
          </div>
        </div>

        {/* Loan Key Highlights */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">bolt</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">5 Min Disbursal</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Direct to linked bank</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">description</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">100% Paperless</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Only Aadhaar & PAN</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">Zero Collateral</p>
                <p className="text-[10px] text-gray-500 mt-0.5">No security needed</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">calendar_month</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">Flexible EMIs</p>
                <p className="text-[10px] text-gray-500 mt-0.5">3 to 36 months</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3 flex items-center gap-2.5 text-xs text-slate-600">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0">account_balance</span>
            <p className="text-[11px] leading-tight">
              In partnership with leading RBI-registered NBFCs and scheduled commercial banks.
            </p>
          </div>

          {/* Waitlist Form or Success state */}
          {joined ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1.5 animate-fade-in">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">check_circle</span>
              </div>
              <p className="text-sm font-bold text-emerald-900">You're on the Priority Waitlist! 🎉</p>
              <p className="text-xs text-emerald-700">
                You will be among the first users to be notified and granted early loan access when it goes live.
              </p>
              <button
                onClick={onClose}
                className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Okay, Got it!
              </button>
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-2.5 pt-1">
              <p className="text-xs font-bold text-gray-700">Get early access & pre-approved loan offers:</p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="Enter your mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold text-xs hover:opacity-95 active:scale-95 transition-all shadow-md shadow-purple-500/20 whitespace-nowrap cursor-pointer"
                >
                  Notify Me
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center">
                No spam ever. You will only receive official launch alerts.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
