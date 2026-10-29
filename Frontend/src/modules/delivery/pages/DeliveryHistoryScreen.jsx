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
    <div className="mesh-gradient min-h-screen flex flex-col font-body-lg pb-24 text-on-surface">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 shadow-xs">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">history</span>
            <h1 className="font-display font-black text-[17px] text-slate-900">
              Delivery History & Earnings
            </h1>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[480px] w-full mx-auto p-4 space-y-4 text-left">
        {/* Earnings Hero Card */}
        <div className="bg-gradient-to-br from-[#16082f] via-[#2d0554] to-[#6000da] rounded-3xl p-5 text-white shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-purple-200">
              Total Delivery Earnings
            </span>
            <span className="material-symbols-outlined text-amber-300 text-[22px]">payments</span>
          </div>

          <div className="flex items-baseline gap-2">
            <h2 className="text-[36px] font-display font-black leading-none">
              ₹{stats.totalEarnings.toFixed(2)}
            </h2>
            <span className="text-purple-200 text-xs font-semibold">Earned</span>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-purple-100">
            <span>Completed Deliveries:</span>
            <strong className="text-white font-mono text-[14px]">{stats.totalDeliveries} orders</strong>
          </div>
        </div>

        {/* Deliveries List */}
        <div className="space-y-3">
          <h3 className="font-display font-black text-[14px] text-slate-800">
            Past Deliveries ({history.length})
          </h3>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm space-y-2">
              <span className="material-symbols-outlined text-slate-300 text-[40px]">inventory_2</span>
              <p className="font-bold text-[13.5px] text-slate-800">No completed deliveries yet</p>
              <p className="text-[12px] text-slate-500">Your completed deliveries and payouts will appear here.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item._id}
                className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    </div>
                    <div>
                      <p className="font-bold text-[13px] text-slate-900">Order #{item.orderId}</p>
                      <p className="text-[10.5px] text-slate-400 font-mono">
                        {new Date(item.deliveredAt).toLocaleDateString()} at{' '}
                        {new Date(item.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-black text-[12px]">
                    +₹{item.earnedAmount || 50}
                  </span>
                </div>

                <div className="text-[11.5px] text-slate-600 bg-slate-50 rounded-xl p-2.5 space-y-1">
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
