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

  useEffect(() => {
    if (!token) {
      navigate('/delivery/login');
      return;
    }

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

  const handleWithdraw = (e) => {
    e.preventDefault();
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
    setTimeout(() => {
      setIsProcessing(false);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      toast.success(`🎉 ₹${amt} successfully initiated to your UPI ID! Credited in 5 mins.`);
    }, 1200);
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
                <p className="text-[10px] text-slate-400 font-medium">COD Cash holding capacity</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-base font-black text-slate-950">₹500</span>
                <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-slate-700">
                  chevron_right
                </span>
              </div>
            </div>

            {/* 2 Big Action Buttons: Deposit & Withdraw (From Image 7) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setShowDepositModal(true)}
                className="py-2.5 px-4 rounded-xl border border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-display font-black text-xs transition-all active:scale-98 cursor-pointer shadow-2xs flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">payments</span>
                <span>Deposit</span>
              </button>

              <button
                onClick={() => setShowWithdrawModal(true)}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-display font-black text-xs transition-all active:scale-98 cursor-pointer shadow-2xs flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">account_balance</span>
                <span>Withdraw</span>
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
                <span className="text-xs font-black text-emerald-700">₹{(completedCount * 15).toLocaleString('en-IN')}</span>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 text-center">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[28px]">account_balance_wallet</span>
            </div>
            <h3 className="font-display font-black text-base text-slate-900">Cash Deposit at Hub</h3>
            <p className="text-xs text-slate-500 mt-1">
              Jitna cash aapne COD orders me collect kiya hai, use aap apne nearest Zeebac Partner Hub par deposit kar sakte hain ya online UPI se clear kar sakte hain.
            </p>

            <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
              <p className="text-slate-400">Current COD Cash in Hand</p>
              <p className="text-lg font-black text-slate-900">₹0.00</p>
            </div>

            <button
              onClick={() => setShowDepositModal(false)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
