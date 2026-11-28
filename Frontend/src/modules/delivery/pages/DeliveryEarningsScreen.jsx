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
  const weekDeliveries = earningsData?.weekDeliveries || 0;
  const cashInHand = earningsData?.cashInHand || 0;
  const cashLimit = earningsData?.maxCashLimit || 1500;
  const cashUsedPct = Math.min(100, Math.round((cashInHand / cashLimit) * 100));
  const pendingWithdrawals = earningsData?.pendingWithdrawals || 0;
  const pendingCashDeposits = earningsData?.pendingCashDeposits || 0;

  // Date Range string e.g. "9 Nov - 15 Nov"
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday (same as backend)
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
        toast.success(res.message || `Withdrawal request of ₹${amt} submitted for admin approval.`);
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

        {/* ─── 1. MY EARNINGS (rider's own money) ─── */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700 mb-2 px-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
            My Earnings
          </p>

          <div className="bg-white rounded-3xl border border-emerald-100 shadow-2xs overflow-hidden">
            {/* This week */}
            <div className="p-5 text-center bg-emerald-50/50 border-b border-emerald-100">
              <p className="text-xs font-bold text-slate-600">Earned this week · {weekRangeStr}</p>
              <div className="my-1.5">
                <span className="text-4xl sm:text-5xl font-display font-black text-emerald-700 tracking-tight">
                  ₹{thisWeek.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Delivery fees + tips from {weekDeliveries} {weekDeliveries === 1 ? 'delivery' : 'deliveries'} · Today ₹{today.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              {/* Wallet balance */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">Wallet balance</span>
                  <p className="text-[10px] text-slate-400 font-medium">Your money, available to withdraw</p>
                </div>
                <span className="text-xl font-black text-slate-950">₹{total.toLocaleString('en-IN')}</span>
              </div>

              {pendingWithdrawals > 0 && (
                <div className="flex items-center justify-between text-[11px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="text-amber-800 font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    Withdrawal awaiting admin payment
                  </span>
                  <span className="font-black text-amber-800">₹{pendingWithdrawals.toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* Customer tips */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-emerald-600">volunteer_activism</span>
                  <span className="text-xs font-bold text-slate-700">Customer tips received (all time)</span>
                </div>
                <span className="text-xs font-black text-emerald-700">₹{(earningsData?.customerTipsBalance || 0).toLocaleString('en-IN')}</span>
              </div>

              <button
                onClick={() => {
                  if (cashInHand > 0) {
                    toast.error(`Withdrawal locked! Pehle ₹${cashInHand.toLocaleString('en-IN')} Cash-in-Hand deposit karein.`);
                    setDepositAmount(String(cashInHand));
                    setShowDepositModal(true);
                  } else {
                    setShowWithdrawModal(true);
                  }
                }}
                className={`w-full py-2.5 px-4 rounded-xl font-display font-black text-xs transition-all active:scale-98 cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 ${
                  cashInHand > 0
                    ? 'bg-slate-200 text-slate-500 hover:bg-slate-300 border border-slate-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{cashInHand > 0 ? 'lock' : 'account_balance'}</span>
                <span>{cashInHand > 0 ? 'Withdraw Locked' : 'Withdraw Earnings'}</span>
              </button>
              {cashInHand > 0 && (
                <p className="text-[10px] text-slate-500 text-center -mt-1">
                  Unlocks after you deposit your Cash in Hand below
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── 2. CASH IN HAND (company money held by rider) ─── */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 mb-2 px-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">payments</span>
            Cash in Hand · Not your earnings
          </p>

          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-amber-200 shadow-2xs space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-sm font-bold text-slate-800">COD cash to deposit</span>
                <p className="text-[10px] text-slate-500 font-medium leading-snug mt-0.5">
                  Cash collected from customers on COD orders. This belongs to Zeebac and must be deposited.
                </p>
              </div>
              <span className={`text-xl font-black shrink-0 ${cashInHand > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                ₹{cashInHand.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Limit bar */}
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cashUsedPct >= 100 ? 'bg-rose-500' : cashUsedPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${cashUsedPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                <span>Can still collect ₹{(earningsData?.availableCashLimit ?? 0).toLocaleString('en-IN')}</span>
                <span>Limit ₹{cashLimit.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {pendingCashDeposits > 0 && (
              <div className="flex items-center justify-between text-[11px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <span className="text-amber-800 font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  UPI deposit awaiting admin verification
                </span>
                <span className="font-black text-amber-800">₹{pendingCashDeposits.toLocaleString('en-IN')}</span>
              </div>
            )}

            <button
              onClick={() => {
                setDepositAmount(String(cashInHand || ''));
                setShowDepositModal(true);
              }}
              disabled={cashInHand <= 0}
              className="w-full py-2.5 px-4 rounded-xl border border-amber-600 bg-amber-500 hover:bg-amber-600 text-white font-display font-black text-xs transition-all active:scale-98 cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>{cashInHand > 0 ? `Deposit ₹${cashInHand.toLocaleString('en-IN')} Cash` : 'No cash to deposit'}</span>
            </button>
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
                  <p className="text-[10px] text-slate-400 font-medium">Surge and night bonuses are added per delivery</p>
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
                onClick={() => {
                  setDepositMethod('EARNINGS_DEDUCTION');
                  const cap = Math.min((earningsData?.cashInHand || 0), total);
                  if (Number(depositAmount) > cap) setDepositAmount(cap > 0 ? String(cap) : '');
                }}
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
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Max you can settle from pocket:</span>
                  <span className="font-mono font-black text-slate-900 text-sm">₹{Math.min((earningsData?.cashInHand || 0), total).toLocaleString('en-IN')}</span>
                </div>
                {total <= 0 ? (
                  <p className="text-[11px] text-rose-700 font-semibold leading-snug">
                    Pocket balance ₹0 hai. Cash deposit karne ke liye Online UPI use karein.
                  </p>
                ) : total < (earningsData?.cashInHand || 0) ? (
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Pocket se max ₹{total.toLocaleString('en-IN')} settle hoga. Baaki ₹{Math.round(((earningsData?.cashInHand || 0) - total) * 100) / 100} ke liye{' '}
                    <button type="button" onClick={() => setDepositMethod('UPI')} className="font-black text-emerald-700 underline cursor-pointer">
                      Online UPI
                    </button>{' '}
                    use karein.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Aapke pocket balance me se cash amount turant deduct ho jayegi aur Cash in Hand clear ho jayega.
                  </p>
                )}
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
                    onClick={() => setDepositAmount(String((depositMethod === 'EARNINGS_DEDUCTION' ? Math.min((earningsData?.cashInHand || 0), total) : (earningsData?.cashInHand || 0))))}
                    className="text-purple-700 font-black hover:underline cursor-pointer"
                  >
                    {depositMethod === 'EARNINGS_DEDUCTION' ? 'Use full pocket' : 'Settle All'} (₹{(depositMethod === 'EARNINGS_DEDUCTION' ? Math.min((earningsData?.cashInHand || 0), total) : (earningsData?.cashInHand || 0))})
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="1"
                    max={(depositMethod === 'EARNINGS_DEDUCTION' ? Math.min((earningsData?.cashInHand || 0), total) : (earningsData?.cashInHand || 0))}
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
                {[...new Set([500, 1000, (depositMethod === 'EARNINGS_DEDUCTION' ? Math.min((earningsData?.cashInHand || 0), total) : (earningsData?.cashInHand || 0))])].filter((amt) => amt > 0 && amt <= (depositMethod === 'EARNINGS_DEDUCTION' ? Math.min((earningsData?.cashInHand || 0), total) : (earningsData?.cashInHand || 0))).map((amt, idx) => (
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
                disabled={isDepositing || (depositMethod === 'EARNINGS_DEDUCTION' ? Math.min((earningsData?.cashInHand || 0), total) : (earningsData?.cashInHand || 0)) <= 0}
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
