import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';
import useLanguageStore from '../../../store/useLanguageStore';

export default function BnplScreen() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const { t } = useLanguageStore();

  const [panNumber, setPanNumber] = useState('');
  const [fullName, setFullName] = useState(currentUser?.name || '');
  const [submitted, setSubmitted] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const activeStreakDays = 0; // 0 / 30 days

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!panNumber.trim()) return;
    setIsChecking(true);
    setTimeout(() => {
      setIsChecking(false);
      setSubmitted(true);
    }, 1500);
  };

  const faqs = [
    {
      q: 'What is Zeebac BNPL (Shop & Pay Later)?',
      a: 'Zeebac BNPL lets you make purchases at partner merchants without paying immediately. Enjoy 0% interest for up to 30 days.'
    },
    {
      q: 'How do I unlock the ₹10,000 credit limit?',
      a: 'Maintain a 30-day regular purchase or cashback streak, and submit your PAN for a paperless credit score evaluation.'
    },
    {
      q: 'Are there any hidden charges or processing fees?',
      a: 'Zero joining fees, zero annual charges, and 0% interest if repayments are completed within the 30-day cycle.'
    }
  ];

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md px-4 py-3 border-b border-outline-variant/15 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-on-surface-variant cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h1 className="font-display font-black text-[18px] text-on-surface leading-tight">
              {t('BNPL')} • {t('Shop & Pay Later')}
            </h1>
            <p className="text-[11px] text-on-surface-variant font-medium">
              {t('0% Interest for 30 Days')}
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[10px] font-black uppercase tracking-wider">
          {t('Coming Soon')}
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 app-container px-4 py-4 space-y-4 text-left">
        {/* Virtual BNPL Card */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#16082f] via-[#2d0554] to-[#6000da] text-white shadow-xl">
          {/* Background Decorative Rings */}
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-black tracking-wider uppercase font-display">ZEEBAC</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-purple-950 text-[10px] font-black tracking-widest uppercase">
                BNPL
              </span>
            </div>
            <span className="material-symbols-outlined text-white/80 text-[26px]">contactless</span>
          </div>

          <div className="my-5 relative z-10 flex items-center gap-3">
            <div className="w-9 h-7 rounded-md bg-amber-300/80 border border-amber-200/50 flex items-center justify-center">
              <div className="w-5 h-4 border border-amber-900/40 rounded-xs" />
            </div>
            <span className="font-mono text-[14px] text-white/90 tracking-widest">•••• •••• •••• 2026</span>
          </div>

          <div className="flex items-end justify-between relative z-10 pt-2 border-t border-white/10 text-left">
            <div>
              <p className="text-[9.5px] text-purple-200 uppercase font-bold tracking-wider">Max Credit Limit</p>
              <p className="text-[20px] font-black text-amber-300 leading-tight">₹10,000</p>
            </div>
            <div className="text-right">
              <p className="text-[9.5px] text-purple-200 uppercase font-bold tracking-wider">Interest Period</p>
              <p className="text-[13px] font-bold text-amber-300 leading-tight">0% for 30 Days</p>
            </div>
          </div>
        </div>

        {/* 30-Day Activity Streak */}
        <div className="bg-white rounded-2xl p-4 border border-outline-variant/20 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">verified</span>
              {t('30-Day Activity Streak')}
            </span>
            <span className="font-black text-primary">{activeStreakDays}/30 Days</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (activeStreakDays / 30) * 100)}%` }}
            />
          </div>
          <p className="text-[10.5px] text-slate-500 leading-relaxed">
            {t('Daily payments ya cashback earn karke 30 din ka streak poora karein aur instant credit unlock karein.')}
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-white p-3 rounded-2xl border border-outline-variant/15 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-primary flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[20px]">badge</span>
            </div>
            <p className="font-bold text-[12px] text-on-surface">PAN & CIBIL</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">100% Paperless verification</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-outline-variant/15 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-primary flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[20px]">percent</span>
            </div>
            <p className="font-bold text-[12px] text-on-surface">0% Interest</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Zero charges for 30 days</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-outline-variant/15 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[20px]">storefront</span>
            </div>
            <p className="font-bold text-[12px] text-on-surface">All Partner Stores</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Scan & Pay anywhere</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-outline-variant/15 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-primary flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[20px]">redeem</span>
            </div>
            <p className="font-bold text-[12px] text-on-surface">Cashback Earned</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Up to 3%+ on every BNPL order</p>
          </div>
        </div>

        {/* Eligibility Check / Application */}
        <div className="bg-white rounded-2xl p-4 border border-outline-variant/20 shadow-xs">
          <h2 className="font-display font-black text-[14px] text-on-surface mb-1">
            {t('Check Your Pre-Approved Limit')}
          </h2>
          <p className="text-[11px] text-on-surface-variant mb-3">
            {t('Enter your details to join the early priority list for Zeebac BNPL')}
          </p>

          {submitted ? (
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-center space-y-1.5">
              <span className="material-symbols-outlined text-primary text-[32px]">check_circle</span>
              <p className="font-bold text-[13px]">{t('Application Received!')}</p>
              <p className="text-[11px] text-purple-700">
                {t('Aap early access list mein jud chuke hain. Jaise hi BNPL launch hoga aapko notify kiya jayega.')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  {t('Full Name (as per PAN)')}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Himanshu Sharma"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-800 focus:bg-white focus:border-primary outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  {t('PAN Card Number')}
                </label>
                <input
                  type="text"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-mono font-bold tracking-wider text-slate-800 focus:bg-white focus:border-primary outline-none uppercase"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isChecking || !panNumber.trim()}
                className="w-full py-3 bg-primary hover:bg-primary/95 text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isChecking ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    {t('Check Eligibility & Join Early Access')}
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* FAQs */}
        <div className="bg-white rounded-2xl p-4 border border-outline-variant/20 shadow-xs space-y-2">
          <h2 className="font-display font-black text-[14px] text-on-surface mb-2">
            {t('Frequently Asked Questions')}
          </h2>
          {faqs.map((faq, idx) => (
            <div key={idx} className="border-b border-slate-100 last:border-0 pb-2">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between text-left py-1.5 cursor-pointer text-[12px] font-bold text-slate-800"
              >
                <span>{faq.q}</span>
                <span className="material-symbols-outlined text-[18px] text-slate-400">
                  {openFaq === idx ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {openFaq === idx && (
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed pl-1">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}
