import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryTopBar from '../components/DeliveryTopBar';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';

export default function DeliveryEarningsScreen() {
  const navigate = useNavigate();
  const token = useDeliveryStore((state) => state.token);
  const rider = useDeliveryStore((state) => state.rider);

  const [earningsData, setEarningsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('EARNINGS_DEDUCTION'); // 'EARNINGS_DEDUCTION' | 'UPI'
  const [depositUtr, setDepositUtr] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);

  const loadEarnings = async () => {
    try {
      const res = await DeliveryAPI.getEarnings();
      if (res.success && res.data) {
        setEarningsData(res.data);
      }
    } catch (err) {
      console.error('Failed to load rider earnings', err);
      toast.error('Could not load earnings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/delivery/login');
      return;
    }
    loadEarnings();
  }, [token, navigate]);

  const today = earningsData?.today || 0;
  const thisWeek = earningsData?.thisWeek || 0;
  const total = earningsData?.totalEarnings || 0;
  const completedCount = earningsData?.totalCompletedDeliveries || 0;

  // Date Range string e.g. "9 Nov - 15 Nov"
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekRangeStr = `${startOfWeek.getDate()} ${startOfWeek.toLocaleString('default', { month: 'short' })} - ${endOfWeek.getDate()} ${endOfWeek.toLocaleString('default', { month: 'short' })}`;

  const handleWithdraw = async (e) => {
    e.preventDefault();

    // Check if Cash-in-Hand is pending
    const currentCash = earningsData?.cashInHand || 0;
    if (currentCash > 0) {
      toast.error(`Withdrawal locked! Pehle aapko ₹${currentCash.toLocaleString('en-IN')} Cash-in-Hand deposit/settle karna hoga.`);
      setShowWithdrawModal(false);
      setDepositAmount(String(currentCash));
      setShowDepositModal(true);
      return;
    }

    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (amt > total) {
      toast.error('Insufficient pocket balance');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await DeliveryAPI.withdraw({ amount: amt });
      if (res.success) {
        toast.success(res.message || `₹${amt} successfully initiated to your UPI ID!`);
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        loadEarnings();
      } else {
        toast.error(res.message || 'Withdrawal failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Withdrawal request failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDepositCash = async (e) => {
    e.preventDefault();
    const currentCash = earningsData?.cashInHand || 0;
    const amt = parseFloat(depositAmount) || currentCash;
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid deposit amount');
      return;
    }
    if (amt > currentCash) {
      toast.error(`Deposit amount cannot exceed Cash in Hand (₹${currentCash})`);
      return;
    }
    if (depositMethod === 'EARNINGS_DEDUCTION' && amt > total) {
      toast.error(`Insufficient pocket balance (₹${total}) to deduct ₹${amt}. Please select UPI.`);
      return;
    }
    if (depositMethod === 'UPI' && !depositUtr.trim()) {
      toast.error('Please enter the UPI Reference ID / UTR Number');
      return;
    }

    setIsDepositing(true);
    try {
      const res = await DeliveryAPI.depositCash({
        amount: amt,
        paymentMethod: depositMethod,
        referenceId: depositMethod === 'UPI' ? depositUtr.trim() : undefined,
        notes: depositMethod === 'EARNINGS_DEDUCTION'
          ? 'Settled via Pocket balance deduction'
          : `Online UPI transfer (Ref: ${depositUtr.trim()})`,
      });
      if (res.success) {
        toast.success(res.message || '🎉 Cash deposit settled successfully!');
        setShowDepositModal(false);
        setDepositAmount('');
        setDepositUtr('');
        loadEarnings();
      } else {
        toast.error(res.message || 'Deposit failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to settle cash');
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      {/* Top Header */}
      <DeliveryTopBar />

      <main className="max-w-[480px] mx-auto p-4 space-y-4">
        {/* Hub / Store Selector (From Image 7) */}
        <div className="flex items-center justify-between bg-white rounded-2xl px-3.5 py-2.5 border border-slate-100 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs shadow-2xs">
              <span className="material-symbols-outlined text-[18px]">electric_moped</span>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pocket for</p>
              <h4 className="font-display font-black text-xs text-slate-900">Zeebac Partner Hub</h4>
            </div>
          </div>
          <span className="material-symbols-outlined text-slate-400 text-[18px]">keyboard_arrow_down</span>
        </div>

        {/* ─── CASH IN HAND LIMIT ALERT ─── */}
        {earningsData?.isCashLimitReached && (
          <div className="bg-rose-50 border-2 border-rose-400 rounded-3xl p-4 text-rose-950 shadow-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <span className="material-symbols-outlined text-[24px]">lock_clock</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white">
                    LIMIT REACHED • WITHDRAWAL LOCKED
                  </span>
                </div>
                <h4 className="font-display font-black text-sm text-rose-900 mt-1">
                  Cash in Hand: ₹{(earningsData?.cashInHand || 0).toLocaleString('en-IN')} (Limit: ₹{(earningsData?.maxCashLimit || 1500).toLocaleString('en-IN')})
                </h4>
                <p className="text-xs text-rose-800 font-medium mt-0.5 leading-snug">
                  COD floating cash limit paar ho chuka hai. Naye orders pause hain aur earning withdrawal tab tak locked rahega jab tak aap cash deposit nahi kar dete.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDepositAmount(String(earningsData?.cashInHand || ''));
                    setShowDepositModal(true);
                  }}
                  className="mt-2.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">payments</span>
                  <span>Deposit ₹{earningsData?.cashInHand} Now</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Earnings Card (From Image 7) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-2xs text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer">
            <span>Earnings: {weekRangeStr}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </div>

          <div className="my-2">
            <span className="text-4xl sm:text-5xl font-display font-black text-slate-950 tracking-tight">
              ₹{(thisWeek || total).toLocaleString('en-IN')}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-medium">
            From {completedCount} delivered {completedCount === 1 ? 'order' : 'orders'} this cycle
          </p>
        </div>

        {/* ─── POCKET SECTION (From Image 7) ─── */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">
            POCKET
          </p>

          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-2xs space-y-4">
            {/* Pocket balance line */}
            <div className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm font-bold text-slate-800">Pocket balance</span>
              <div className="flex items-center gap-1">
                <span className="text-base font-black text-slate-950">₹{total.toLocaleString('en-IN')}</span>
                <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">
                  chevron_right
                </span>
              </div>
            </div>

            {/* Dotted border separator */}
            <div className="border-t border-dashed border-slate-200" />

            {/* Available cash limit line */}
            <div className="flex items-center justify-between cursor-pointer group">
              <div>
                <span className="text-sm font-bold text-slate-800">Available cash limit</span>
                <p className="text-[10px] text-slate-400 font-medium">
                  {earningsData?.cashInHand ? `₹${(earningsData.cashInHand).toLocaleString('en-IN')} cash in hand` : 'COD Cash holding capacity'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-base font-black text-slate-950">₹{(earningsData?.availableCashLimit ?? 2000).toLocaleString('en-IN')}</span>
                <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">
                  chevron_right
                </span>
              </div>
            </div>

            {/* 2 Big Action Buttons: Deposit & Withdraw (From Image 7) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => {
                  setDepositAmount(String(earningsData?.cashInHand || ''));
                  setShowDepositModal(true);
                }}
                className="py-2.5 px-4 rounded-xl border border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-display font-black text-xs transition-all active:scale-98 cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">payments</span>
                <span>Deposit Cash</span>
              </button>

              <button
                onClick={() => {
                  if ((earningsData?.cashInHand || 0) > 0) {
                    toast.error(`Withdrawal locked! Pehle aapko ₹${earningsData.cashInHand} Cash-in-Hand clear/deposit karna hoga.`);
                    setDepositAmount(String(earningsData.cashInHand));
                    setShowDepositModal(true);
                  } else {
                    setShowWithdrawModal(true);
                  }
                }}
                className={`py-2.5 px-4 rounded-xl font-display font-black text-xs transition-all active:scale-98 cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 ${
                  (earningsData?.cashInHand || 0) > 0
                    ? 'bg-slate-200 text-slate-500 hover:bg-slate-300 border border-slate-300'
                    : 'bg-slate-900 hover:bg-black text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {(earningsData?.cashInHand || 0) > 0 ? 'lock' : 'account_balance'}
                </span>
                <span>{(earningsData?.cashInHand || 0) > 0 ? 'Withdraw Locked' : 'Withdraw'}</span>
              </button>
            </div>

            {/* Dotted border separator */}
            <div className="border-t border-dashed border-slate-200" />

            {/* Customer tips balance */}
            <div className="flex items-center justify-between cursor-pointer group">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-emerald-600">
                  volunteer_activism
                </span>
                <span className="text-xs font-bold text-slate-800">Customer tips balance</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-black text-emerald-700">₹{(earningsData?.customerTipsBalance || 0).toLocaleString('en-IN')}</span>
                <span className="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-slate-700">
                  chevron_right
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── MORE SERVICES SECTION (From Image 7) ─── */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">
            MORE SERVICES
          </p>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => navigate('/delivery/history')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">history</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Trip & Payout History</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Per-drop earnings & distance breakdown</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">
                chevron_right
              </span>
            </button>

            <button
              onClick={() => navigate('/delivery/profile')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">account_balance</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Bank Account & UPI Details</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Linked bank details for daily payouts</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">
                chevron_right
              </span>
            </button>

            <button
              onClick={() => navigate('/delivery/gigs')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">military_tech</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Gig Incentives & Surge Bonuses</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Earn extra up to ₹300 per day</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* ─── WITHDRAW MODAL ─── */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">Instant Pocket Withdrawal</h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleWithdraw} className="mt-4 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-3 text-xs border border-slate-100">
                <p className="text-slate-400 font-medium">Available to Withdraw</p>
                <p className="text-xl font-display font-black text-slate-900 mt-0.5">₹{total}</p>
                <p className="text-[10px] text-emerald-700 font-bold mt-1">
                  Destination: {rider?.bankDetails?.upiId || 'Primary UPI ID'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Enter Amount (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-purple-600 font-mono"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                {isProcessing ? 'Processing Payout...' : 'Confirm Instant Withdrawal'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── DEPOSIT MODAL ─── */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 border border-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <span className="material-symbols-outlined text-[20px]">payments</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-slate-900 leading-tight">
                    Deposit Floating Cash
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Settle COD Cash With Admin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Cash in Hand Info Box */}
            <div className={`p-3.5 rounded-2xl border ${
              earningsData?.isCashLimitReached || (earningsData?.cashInHand || 0) >= (earningsData?.maxCashLimit || 1500)
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold">Total Cash with You:</span>
                <span className="font-mono font-black text-lg">₹{(earningsData?.cashInHand || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1 pt-1 border-t border-slate-200/50">
                <span>Max Cash Limit:</span>
                <span className="font-bold">₹{(earningsData?.maxCashLimit || 1500).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setDepositMethod('EARNINGS_DEDUCTION')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  depositMethod === 'EARNINGS_DEDUCTION'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
                <span>From Pocket</span>
              </button>
              <button
                type="button"
                onClick={() => setDepositMethod('UPI')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  depositMethod === 'UPI'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">qr_code_2</span>
                <span>Online UPI</span>
              </button>
            </div>

            {/* Method 1: Pocket Deduction */}
            {depositMethod === 'EARNINGS_DEDUCTION' && (
              <div className="space-y-3 bg-purple-50/60 p-3 rounded-2xl border border-purple-100 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Your Available Pocket:</span>
                  <span className="font-mono font-black text-purple-900 text-sm">
                    ₹{total.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Aapke pocket balance me se cash amount turant deduct ho jayegi aur Cash in Hand clear ho jayega.
                </p>
              </div>
            )}

            {/* Method 2: Online UPI */}
            {depositMethod === 'UPI' && (
              <div className="space-y-3 bg-emerald-50/60 p-3 rounded-2xl border border-emerald-100 text-xs">
                <div>
                  <span className="text-slate-600 font-bold block text-[10px] uppercase">Admin UPI ID:</span>
                  <div className="flex items-center justify-between mt-1 bg-white p-2 rounded-xl border border-emerald-200">
                    <span className="font-mono font-black text-emerald-900 text-xs select-all">
                      zeebac.delivery@upi
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText?.('zeebac.delivery@upi');
                        toast.success('UPI ID copied to clipboard!');
                      }}
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    UPI Transaction UTR / Ref ID:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 331204987612"
                    value={depositUtr}
                    onChange={(e) => setDepositUtr(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-mono font-bold outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleDepositCash} className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <label className="font-bold text-slate-700">Amount to Settle (₹):</label>
                  <button
                    type="button"
                    onClick={() => setDepositAmount(String(earningsData?.cashInHand || 0))}
                    className="text-purple-700 font-black hover:underline cursor-pointer"
                  >
                    Settle All (₹{earningsData?.cashInHand || 0})
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="1"
                    max={earningsData?.cashInHand || 0}
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder={`e.g. ${earningsData?.cashInHand || 0}`}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold font-mono outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2">
                {[500, 1000, earningsData?.cashInHand || 0].filter((amt) => amt > 0 && amt <= (earningsData?.cashInHand || 0)).map((amt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDepositAmount(String(amt))}
                    className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isDepositing || (earningsData?.cashInHand || 0) <= 0}
                className="w-full py-3 rounded-2xl bg-slate-950 hover:bg-black text-white font-display font-black text-xs shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>
                  {isDepositing
                    ? 'Processing Deposit...'
                    : `Settle ₹${depositAmount || (earningsData?.cashInHand || 0)} Cash`}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
