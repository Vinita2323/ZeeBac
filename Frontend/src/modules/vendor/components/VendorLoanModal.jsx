import React, { useState } from 'react';

export default function VendorLoanModal({ isOpen, onClose }) {
  const [registered, setRegistered] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [monthlyTurnover, setMonthlyTurnover] = useState('₹1,00,000 - ₹5,00,000');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setRegistered(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-left">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90dvh] overflow-y-auto shadow-2xl border border-purple-100 relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Banner */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white p-4 sm:p-6 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-[11px] font-black uppercase tracking-wider mb-3">
            <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
            Merchant Capital • Coming Soon
          </div>

          <h2 className="text-[20px] sm:text-[22px] font-black tracking-tight leading-snug">
            Zeebac Merchant Business Loan
          </h2>
          <p className="text-indigo-200 text-xs mt-1 font-medium">
            Collateral-free working capital loan up to ₹25 Lakhs to expand your store & purchase inventory.
          </p>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Credit Line Limit</p>
              <p className="text-[20px] sm:text-[24px] font-black text-amber-400 leading-none mt-0.5">Up to ₹25 Lakhs</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Collateral Needed</p>
              <p className="text-[15px] sm:text-[17px] font-extrabold text-emerald-400 leading-none mt-0.5">0% (Zero Security)</p>
            </div>
          </div>
        </div>

        {/* Features Content */}
        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
            <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">storefront</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">Shop Growth</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Inventory & renovation</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">percent</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">Daily Auto Micro-EMIs</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Auto-deducted from sales</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">QR Based Pre-Approval</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Limit grows with sales</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
              <div>
                <p className="text-[12px] font-bold text-gray-900 leading-tight">RBI-Regulated NBFCs</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Direct bank transfer</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 flex items-center gap-2.5 text-xs text-slate-600">
            <span className="material-symbols-outlined text-indigo-600 text-[22px] shrink-0">handshake</span>
            <p className="text-[11px] leading-tight">
              We are in final stage onboarding with certified MSME lending partners to disburse working capital directly to verified Zeebac merchants.
            </p>
          </div>

          {registered ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1.5 animate-fade-in">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">check_circle</span>
              </div>
              <p className="text-sm font-bold text-emerald-900">Pre-Registration Confirmed! 🎉</p>
              <p className="text-xs text-emerald-700">
                Your store has been added to our VIP merchant queue for early loan limit sanctioning upon rollout.
              </p>
              <button
                onClick={onClose}
                className="mt-3 w-full py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5 pt-1">
              <p className="text-xs font-bold text-gray-700">Pre-apply for priority business loan access:</p>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  placeholder="Enter Store / Business Name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs focus:outline-none focus:border-indigo-600"
                  required
                />
                <select
                  value={monthlyTurnover}
                  onChange={(e) => setMonthlyTurnover(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-700 focus:outline-none focus:border-indigo-600 bg-white"
                >
                  <option>Expected Loan: ₹50,000 - ₹2,00,000</option>
                  <option>Expected Loan: ₹2,00,000 - ₹5,00,000</option>
                  <option>Expected Loan: ₹5,00,000 - ₹10,00,000</option>
                  <option>Expected Loan: Above ₹10,00,000</option>
                </select>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-800 text-white font-bold text-xs hover:opacity-95 active:scale-98 transition-all shadow-md shadow-indigo-950/20 cursor-pointer"
                >
                  Pre-Register for Business Loan
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
