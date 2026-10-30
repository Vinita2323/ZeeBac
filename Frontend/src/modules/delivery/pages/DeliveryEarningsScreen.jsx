import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';

export default function DeliveryEarningsScreen() {
  const navigate = useNavigate();
  const token = useDeliveryStore((state) => state.token);
  const rider = useDeliveryStore((state) => state.rider);

  const [earningsData, setEarningsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = earningsData?.today || 0;
  const thisWeek = earningsData?.thisWeek || 0;
  const thisMonth = earningsData?.thisMonth || 0;
  const total = earningsData?.totalEarnings || 0;
  const completedCount = earningsData?.totalCompletedDeliveries || 0;
  const ledger = earningsData?.ledger || [];

  return (
    <div className="mesh-gradient min-h-screen flex flex-col font-body-lg pb-24 text-on-surface">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 shadow-xs">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">payments</span>
            <h1 className="font-display font-black text-[17px] text-slate-900">
              Earnings & Payouts
            </h1>
          </div>
          <span className="text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            ₹50 / Delivery
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[480px] w-full mx-auto p-4 space-y-4 text-left">
        {/* Total Earnings Hero Card */}
        <div className="bg-gradient-to-br from-primary via-purple-700 to-indigo-900 text-white rounded-3xl p-6 shadow-xl shadow-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-wider text-purple-200">
              Total Lifetime Earnings
            </span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            </div>
          </div>

          <div>
            <div className="font-display font-black text-[36px] tracking-tight leading-none">
              ₹{total.toLocaleString('en-IN')}
            </div>
            <p className="text-[12px] text-purple-200 mt-1 font-medium">
              Earned from {completedCount} completed order {completedCount === 1 ? 'drop' : 'drops'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/15 text-center">
            <div className="bg-white/10 rounded-2xl py-2 px-1">
              <span className="text-[10px] text-purple-200 block uppercase font-bold">Today</span>
              <strong className="text-[15px] font-black font-mono">₹{today}</strong>
            </div>
            <div className="bg-white/10 rounded-2xl py-2 px-1">
              <span className="text-[10px] text-purple-200 block uppercase font-bold">This Week</span>
              <strong className="text-[15px] font-black font-mono">₹{thisWeek}</strong>
            </div>
            <div className="bg-white/10 rounded-2xl py-2 px-1">
              <span className="text-[10px] text-purple-200 block uppercase font-bold">This Month</span>
              <strong className="text-[15px] font-black font-mono">₹{thisMonth}</strong>
            </div>
          </div>
        </div>

        {/* Bank & Payout Destination */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Payout Destination
            </span>
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              <span>Direct Bank/UPI</span>
            </span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {earningsData?.bankDetails?.upiId
                  ? `UPI: ${earningsData.bankDetails.upiId}`
                  : earningsData?.bankDetails?.accountNumber
                  ? `${earningsData.bankDetails.bankName || 'Bank'} (••••${String(earningsData.bankDetails.accountNumber).slice(-4)})`
                  : 'UPI / Bank not linked'}
              </p>
              <p className="text-[11px] text-slate-500">
                Weekly automated settlement every Monday morning
              </p>
            </div>
          </div>
        </div>

        {/* Delivery Transactions Ledger */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display font-black text-[15px] text-slate-900">
              Recent Delivery Credits
            </h2>
            <span className="text-[11px] font-bold text-slate-500 font-mono">
              {ledger.length} entries
            </span>
          </div>

          {ledger.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-primary flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[24px]">receipt_long</span>
              </div>
              <p className="text-[13px] font-bold text-slate-800">No deliveries yet</p>
              <p className="text-[11.5px] text-slate-500 max-w-[260px] mx-auto">
                Go online from the Deliveries tab to receive pickup requests and start earning ₹50 per order!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ledger.map((item, idx) => (
                <div
                  key={item._id || idx}
                  className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">add</span>
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-slate-900">
                        Delivery Payout {item.orderId ? `(#${String(item.orderId).slice(-6)})` : ''}
                      </p>
                      <p className="text-[10.5px] text-slate-500 font-mono">
                        {item.date ? new Date(item.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : 'Completed'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[14px] font-black text-emerald-600 font-mono">
                      +₹{item.amount || 50}
                    </span>
                    <span className="block text-[9.5px] font-bold text-slate-400 uppercase">
                      Credited
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}

