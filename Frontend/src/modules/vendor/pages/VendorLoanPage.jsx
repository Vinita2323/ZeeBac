import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function VendorLoanPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const [registered, setRegistered] = useState(false);
  const [storeName, setStoreName] = useState(currentUser?.storeName || '');
  const [loanAmount, setLoanAmount] = useState('₹2,00,000 - ₹5,00,000');
  const [purpose, setPurpose] = useState('Stock / Inventory Purchase');

  const handleSubmit = (e) => {
    e.preventDefault();
    setRegistered(true);
  };

  return (
    <div className="space-y-6 pt-2 pb-10 text-left">
      {/* Top Section */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[20px] sm:text-[22px] font-black text-on-surface leading-tight">
              Merchant Business Loans
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
              Coming Soon
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            Collateral-free working capital tailored for Zeebac merchant store expansion.
          </p>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-[11px] font-black uppercase tracking-wider mb-3">
          <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
          Merchant Capital • Coming Soon
        </div>

        <h2 className="text-[20px] sm:text-[24px] font-black tracking-tight leading-snug">
          Working Capital up to ₹25,00,000
        </h2>
        <p className="text-indigo-200 text-xs mt-1.5 max-w-xl leading-relaxed">
          Unlock instant store credit lines based on your daily Zeebac QR collections. Zero property collateral and flexible micro-daily auto deductions from sales.
        </p>

        <div className="mt-6 pt-4 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Maximum Limit</p>
            <p className="text-[22px] font-black text-amber-400 leading-none mt-1">₹25 Lakhs</p>
          </div>
          <div>
            <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Collateral</p>
            <p className="text-[20px] font-extrabold text-emerald-400 leading-none mt-1">Zero Security</p>
          </div>
          <div>
            <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Repayment Mode</p>
            <p className="text-[18px] font-extrabold text-white leading-none mt-1">Daily / Weekly EDD</p>
          </div>
          <div>
            <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">KYC Speed</p>
            <p className="text-[18px] font-extrabold text-white leading-none mt-1">100% Digital</p>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-outline-variant/20 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">inventory_2</span>
          </div>
          <h3 className="font-bold text-sm text-gray-900 leading-tight">Stock & Inventory</h3>
          <p className="text-xs text-gray-500 leading-snug">
            Buy wholesale goods and seasonal stock without draining your cash flow.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-outline-variant/20 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">currency_rupee</span>
          </div>
          <h3 className="font-bold text-sm text-gray-900 leading-tight">Sales-Based Micro EMIs</h3>
          <p className="text-xs text-gray-500 leading-snug">
            Repay automatically in tiny slices from everyday store QR collections.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-outline-variant/20 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">qr_code_scanner</span>
          </div>
          <h3 className="font-bold text-sm text-gray-900 leading-tight">QR Turnover Score</h3>
          <p className="text-xs text-gray-500 leading-snug">
            The more customer sales you accept on Zeebac, the higher your pre-approved limit.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-outline-variant/20 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">verified_user</span>
          </div>
          <h3 className="font-bold text-sm text-gray-900 leading-tight">Licensed NBFCs</h3>
          <p className="text-xs text-gray-500 leading-snug">
            Direct disbursals from RBI-registered MSME lending partners to your current account.
          </p>
        </div>
      </div>

      {/* Pre-Application Form Card */}
      <div className="max-w-xl mx-auto rounded-3xl bg-white border border-outline-variant/20 p-4 sm:p-6 shadow-sm">
        {registered ? (
          <div className="py-6 text-center space-y-3 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px]">check_circle</span>
            </div>
            <h3 className="text-lg font-bold text-emerald-950">Store Pre-Registered! 🎉</h3>
            <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
              Your merchant account has been queued for VIP priority review. Our lending desk will reach out with pre-approved credit limits when merchant loans launch.
            </p>
            <button
              onClick={() => navigate('/vendor')}
              className="mt-4 px-6 py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Pre-Register for Early Merchant Credit</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Tell us your store requirements to get highest priority when loans are activated.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Business / Store Name
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-xs focus:outline-none focus:border-indigo-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Required Loan Amount
                </label>
                <select
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-700 focus:outline-none focus:border-indigo-600 bg-white"
                >
                  <option>₹50,000 - ₹1,00,000 (Small Inventory)</option>
                  <option>₹1,00,000 - ₹3,00,000 (Working Capital)</option>
                  <option>₹3,00,000 - ₹10,00,000 (Store Renovation & Expansion)</option>
                  <option>Above ₹10,00,000 (Multi-Store Capital)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Primary Purpose
                </label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-700 focus:outline-none focus:border-indigo-600 bg-white"
                >
                  <option>Stock / Inventory Purchase</option>
                  <option>Store Renovation & Interior</option>
                  <option>Equipment & Machinery</option>
                  <option>Working Capital & Cashflow</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-800 text-white font-bold text-xs hover:opacity-95 active:scale-98 transition-all shadow-md shadow-indigo-950/20 cursor-pointer mt-2"
              >
                Join Merchant VIP Waitlist
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              No credit score check or charges required for pre-registration.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
