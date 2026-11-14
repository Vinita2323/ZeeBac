import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryBottomNav from '../components/DeliveryBottomNav';

export default function DeliveryHistoryScreen() {
  const navigate = useNavigate();
  const token = useDeliveryStore((state) => state.token);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ totalDeliveries: 0, totalEarnings: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate('/delivery/login');
      return;
    }
    const loadHistory = async () => {
      try {
        const res = await DeliveryAPI.getHistory();
        if (res.success) {
          setHistory(res.data.history || []);
          setStats({
            totalDeliveries: res.data.totalDeliveries || 0,
            totalEarnings: res.data.totalEarnings || 0,
          });
        }
      } catch (err) {
        console.error('Failed to load delivery history', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadHistory();
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center justify-between shadow-2xs">
        <button
          onClick={() => navigate('/delivery/dashboard')}
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-800 transition-all active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>
        <h2 className="font-display font-black text-sm text-slate-900">Trips & Payout History</h2>
        <div className="w-9" />
      </header>

      {/* Main Container */}
      <main className="max-w-[480px] mx-auto p-4 space-y-4 text-left">
        {/* Earnings Summary Card */}
        <div className="bg-black text-white rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-300">
              Lifetime Trips Earnings
            </span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-amber-300">moped</span>
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight leading-none">
              ₹{stats.totalEarnings.toFixed(2)}
            </h2>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
            <span>Completed Drops:</span>
            <strong className="text-white font-mono text-sm">{stats.totalDeliveries} Orders</strong>
          </div>
        </div>

        {/* Deliveries List */}
        <div className="space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900 px-1">
            Trip History ({history.length})
          </h3>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-2xs space-y-2">
              <span className="material-symbols-outlined text-slate-300 text-[40px]">inventory_2</span>
              <p className="font-bold text-sm text-slate-800">No completed trips yet</p>
              <p className="text-xs text-slate-400">
                Turn your status Online from the Feed to start accepting customer deliveries.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item._id}
                className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900">Order #{item.orderId}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(item.deliveredAt).toLocaleDateString()} •{' '}
                        {new Date(item.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-black text-xs">
                    +₹{item.earnedAmount || 50}
                  </span>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5 space-y-1">
                  <p className="truncate">
                    <strong className="text-slate-800">Store:</strong> {item.storeName}
                  </p>
                  <p className="truncate">
                    <strong className="text-slate-800">Customer:</strong> {item.customerName} ({item.customerAddress})
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <DeliveryBottomNav />
    </div>
  );
}
