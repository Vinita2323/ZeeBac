import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';

export default function ApplyLoanScreen() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const [joined, setJoined] = useState(false);
  const [phone, setPhone] = useState(currentUser?.phone || '');

  const handleJoin = (e) => {
    e.preventDefault();
    setJoined(true);
  };

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32 text-left">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-1">Apply for Loan</span>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
            Coming Soon
          </span>
        </div>
      </header>

      <main className="flex-grow app-container px-container-margin py-lg space-y-5">
        {/* Hero Card */}
        <div className="bg-gradient-to-br from-[#16082f] via-[#3b0764] to-[#7c3aed] text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-pink-500/20 rounded-full blur-xl pointer-events-none" />

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-[11px] font-black uppercase tracking-wider mb-3">
            <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
            Launching Soon
          </div>

          <h1 className="text-[24px] font-black tracking-tight leading-snug">
            Zeebac Instant Personal Loan
          </h1>
          <p className="text-purple-200 text-xs mt-1.5 leading-relaxed font-medium">
            Collateral-free credit line with instant bank transfer, customized for active Zeebac shoppers.
          </p>

          <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-purple-200 uppercase font-bold tracking-wider">Loan Amount Up To</p>
              <p className="text-[26px] font-black text-amber-300 leading-none mt-1">₹5,00,000</p>
            </div>
            <div>
              <p className="text-[10px] text-purple-200 uppercase font-bold tracking-wider">Interest Starts At</p>
              <p className="text-[20px] font-extrabold text-white leading-none mt-1">0.99% <span className="text-xs font-normal text-purple-200">/mo</span></p>
            </div>
          </div>
        </div>

        {/* Key Features Grid */}
        <div className="space-y-2">
          <h3 className="font-display text-[15px] font-bold text-gray-900">Why choose Zeebac Loans?</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-purple-100 shadow-xs space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">bolt</span>
              </div>
              <h4 className="text-[13px] font-bold text-gray-900 leading-tight">5 Min Disbursal</h4>
              <p className="text-[11px] text-gray-500 leading-snug">Instant sanction directly to your linked bank account.</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-indigo-100 shadow-xs space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">description</span>
              </div>
              <h4 className="text-[13px] font-bold text-gray-900 leading-tight">100% Paperless</h4>
              <p className="text-[11px] text-gray-500 leading-snug">Zero paperwork, instant verification via Aadhaar & PAN.</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-100 shadow-xs space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">verified_user</span>
              </div>
              <h4 className="text-[13px] font-bold text-gray-900 leading-tight">Zero Collateral</h4>
              <p className="text-[11px] text-gray-500 leading-snug">No assets or guarantor required. 100% unsecured.</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-amber-100 shadow-xs space-y-1.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">calendar_month</span>
              </div>
              <h4 className="text-[13px] font-bold text-gray-900 leading-tight">Flexible Tenures</h4>
              <p className="text-[11px] text-gray-500 leading-snug">Choose repayment tenures ranging from 3 to 36 months.</p>
            </div>
          </div>
        </div>

        {/* Regulatory Partner info */}
        <div className="rounded-2xl bg-white border border-gray-200/70 p-3.5 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">account_balance</span>
          </div>
          <div>
            <p className="text-[12px] font-bold text-gray-900 leading-tight">Regulated Lending Partners</p>
            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
              Loans will be facilitated in partnership with RBI-registered Banks and NBFCs.
            </p>
          </div>
        </div>

        {/* Priority Waitlist Card */}
        <div className="rounded-3xl bg-white border border-purple-100 p-5 shadow-sm space-y-3">
          {joined ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">check_circle</span>
              </div>
              <h3 className="text-[15px] font-black text-emerald-950">You're on the Priority Waitlist! 🎉</h3>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Thank you for showing interest. You will receive priority access and exclusive lower interest rates once Zeebac Instant Loans are unlocked.
              </p>
              <button
                onClick={() => navigate('/home')}
                className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Return to Home
              </button>
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-3">
              <div>
                <h4 className="text-[14px] font-bold text-gray-900">Be First to Get Loan Access</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Register your mobile number to get early VIP notification when loan applications open.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  type="tel"
                  placeholder="Enter your 10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold text-xs hover:opacity-95 active:scale-98 transition-all shadow-md shadow-purple-500/20 cursor-pointer"
                >
                  Join VIP Waitlist
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center">
                Zero spam. You will only receive genuine launch & offer alerts.
              </p>
            </form>
          )}
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
