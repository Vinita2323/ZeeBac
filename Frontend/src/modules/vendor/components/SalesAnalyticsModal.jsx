import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';

export default function SalesAnalyticsModal({ isOpen, onClose, initialData, initialPeriod = 'today', storeName = 'Vendor Store' }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(initialPeriod); // 'today' | 'weekly' | 'monthly' | 'yearly'
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // 'ALL' | 'CASH' | 'DIGITAL'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  // Period labels
  const periods = [
    { key: 'today', label: "Today", subLabel: 'आज' },
    { key: 'weekly', label: "Weekly", subLabel: '7 दिन' },
    { key: 'monthly', label: "Monthly", subLabel: 'इस महीने' },
    { key: 'yearly', label: "Yearly", subLabel: '1 साल' },
  ];

  // Fetch sales analytics whenever modal opens or period changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const res = await VendorAPI.getSalesAnalytics(period);
        if (isMounted && res?.success && res.data) {
          setAnalyticsData(res.data);
        }
      } catch (err) {
        console.warn('Failed to fetch detailed sales analytics, using fallback from dashboardData:', err);
        // Fallback to initial dashboard breakdown if available
        if (initialData?.salesBreakdown?.[period]) {
          const breakdown = initialData.salesBreakdown[period];
          setAnalyticsData({
            period,
            summary: breakdown,
            transactions: []
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAnalytics();
    return () => { isMounted = false; };
  }, [isOpen, period, initialData]);

  if (!isOpen) return null;

  // Active summary
  const summary = analyticsData?.summary || initialData?.salesBreakdown?.[period] || {
    total: 0,
    cash: 0,
    digital: 0,
    transactions: 0,
    cashbackGiven: 0,
    cashPercentage: 0,
    digitalPercentage: 0
  };

  const totalAmount = summary.total || 0;
  const cashAmount = summary.cash || 0;
  const digitalAmount = summary.digital || 0;
  const txnsCount = summary.transactions || 0;
  const cashbackGiven = summary.cashbackGiven || 0;

  const cashPct = totalAmount > 0 ? Math.round((cashAmount / totalAmount) * 100) : 0;
  const digitalPct = totalAmount > 0 ? 100 - cashPct : 0;

  // Filter transactions
  const rawTxns = analyticsData?.transactions || [];
  const filteredTxns = rawTxns.filter((txn) => {
    if (paymentFilter === 'CASH' && !txn.isCash) return false;
    if (paymentFilter === 'DIGITAL' && txn.isCash) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (txn.customer || '').toLowerCase().includes(q);
      const matchPhone = (txn.phone || '').toLowerCase().includes(q);
      const matchId = (txn.id || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchId;
    }
    return true;
  });

  const cashTxnCount = rawTxns.filter(t => t.isCash).length;
  const digitalTxnCount = rawTxns.filter(t => !t.isCash).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-surface text-on-surface rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant/15 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-slideUp sm:animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container/30 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[22px]">point_of_sale</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-display font-black text-lg text-on-surface leading-tight">Sales & Collections</h2>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant font-medium">
                {storeName} • {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all active:scale-90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-left">
          
          {/* Period Filter Tabs */}
          <div className="bg-surface-container/60 p-1 rounded-2xl grid grid-cols-4 gap-1 border border-outline-variant/10">
            {periods.map((p) => {
              const isActive = period === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary text-white font-extrabold shadow-sm active:scale-95'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-semibold'
                  }`}
                >
                  <p className="text-xs leading-none">{p.label}</p>
                  <p className={`text-[9px] mt-0.5 leading-none ${isActive ? 'text-white/80' : 'text-on-surface-variant/70'}`}>
                    {p.subLabel}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Hero: Total Period Sales */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#0f766e] text-white p-4 sm:p-5 shadow-md">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative z-10 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">storefront</span>
                  Total {periods.find(p => p.key === period)?.label || 'Today'} Sales
                </span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-xs">
                  {txnsCount} {txnsCount === 1 ? 'Order' : 'Orders'}
                </span>
              </div>

              <div className="my-1.5">
                <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </h1>
              </div>

              <div className="flex items-center gap-3 pt-2 mt-1 border-t border-white/15 text-[11px] text-emerald-100/90 font-medium">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-amber-300">savings</span>
                  Cashback: <strong className="text-white font-bold">₹{cashbackGiven.toLocaleString('en-IN')}</strong>
                </span>
                <span>•</span>
                <span className="text-emerald-100/80">Approved Gross Sales</span>
              </div>
            </div>
          </div>

          {/* Cash vs Digital Breakdown Cards ("cash me itna amount aya digital itna aaya") */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            
            {/* Cash Collection Card */}
            <div className="rounded-2xl p-3.5 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-500/25 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/20">
                  {cashPct}% Share
                </span>
              </div>
              <p className="text-[11px] font-bold text-on-surface-variant">Cash Collection</p>
              <p className="text-[9.5px] text-emerald-700 font-semibold mb-1">कैश में आया</p>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-800 leading-tight">
                ₹{cashAmount.toLocaleString('en-IN')}
              </h3>
              <p className="text-[10px] text-on-surface-variant/80 mt-1">
                {cashTxnCount} Cash {cashTxnCount === 1 ? 'sale' : 'sales'}
              </p>
            </div>

            {/* Digital Collection Card */}
            <div className="rounded-2xl p-3.5 bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-purple-500/10 border border-purple-500/25 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 border border-purple-500/20">
                  {digitalPct}% Share
                </span>
              </div>
              <p className="text-[11px] font-bold text-on-surface-variant">Digital / UPI</p>
              <p className="text-[9.5px] text-purple-700 font-semibold mb-1">डिजिटल में आया</p>
              <h3 className="text-xl sm:text-2xl font-black text-purple-800 leading-tight">
                ₹{digitalAmount.toLocaleString('en-IN')}
              </h3>
              <p className="text-[10px] text-on-surface-variant/80 mt-1">
                {digitalTxnCount} Digital {digitalTxnCount === 1 ? 'sale' : 'sales'}
              </p>
            </div>
          </div>

          {/* Visual Percentage Bar */}
          {totalAmount > 0 && (
            <div className="p-3 bg-surface-container/40 rounded-xl border border-outline-variant/10">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                <span className="text-emerald-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Cash: {cashPct}% (₹{cashAmount.toLocaleString('en-IN')})
                </span>
                <span className="text-purple-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Digital: {digitalPct}% (₹{digitalAmount.toLocaleString('en-IN')})
                </span>
              </div>
              <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden flex p-0.5 shadow-inner">
                <div 
                  className="bg-emerald-500 h-full rounded-l-full transition-all duration-500" 
                  style={{ width: `${cashPct}%` }}
                />
                <div 
                  className="bg-purple-600 h-full rounded-r-full transition-all duration-500" 
                  style={{ width: `${digitalPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Transaction Section Header */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Orders Breakdown ({rawTxns.length})
              </h4>
              
              {/* Payment Filter Toggle */}
              <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded-lg text-[10px]">
                <button
                  onClick={() => setPaymentFilter('ALL')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    paymentFilter === 'ALL' ? 'bg-white text-on-surface shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setPaymentFilter('CASH')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    paymentFilter === 'CASH' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:text-emerald-800'
                  }`}
                >
                  Cash ({cashTxnCount})
                </button>
                <button
                  onClick={() => setPaymentFilter('DIGITAL')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    paymentFilter === 'DIGITAL' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-700 hover:text-purple-800'
                  }`}
                >
                  Digital ({digitalTxnCount})
                </button>
              </div>
            </div>

            {/* Quick Search */}
            {rawTxns.length > 3 && (
              <div className="relative mb-2.5">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search customer, phone, or txn..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-container rounded-xl border border-outline-variant/15 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {/* Orders List */}
            {loading ? (
              <div className="py-8 text-center text-on-surface-variant">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs">Loading sales report...</p>
              </div>
            ) : filteredTxns.length === 0 ? (
              <div className="py-8 text-center bg-surface-container/20 rounded-2xl border border-outline-variant/10">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mx-auto mb-2">
                  <span className="material-symbols-outlined text-[24px]">receipt_long</span>
                </div>
                <p className="text-xs font-bold text-on-surface">No sales found</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  No orders recorded for {periods.find(p => p.key === period)?.label.toLowerCase()} under this filter.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTxns.map((txn, idx) => (
                  <div
                    key={txn.id || txn._id || idx}
                    className="p-3 bg-white rounded-xl border border-outline-variant/10 shadow-[0_1px_4px_rgba(0,0,0,0.02)] flex items-center justify-between gap-3 hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        txn.isCash ? 'bg-emerald-500/15 text-emerald-700' : 'bg-purple-500/15 text-purple-700'
                      }`}>
                        <span className="material-symbols-outlined text-[18px]">
                          {txn.isCash ? 'payments' : 'smartphone'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-on-surface truncate">
                          {txn.customer}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                            txn.isCash 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {txn.isCash ? 'Cash' : 'UPI / Digital'}
                          </span>
                          <span className="text-[10px] text-on-surface-variant">
                            {new Date(txn.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-on-surface">
                        ₹{Number(txn.amount || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] font-semibold text-orange-600">
                        ₹{Number(txn.cashbackAmount || 0).toLocaleString('en-IN')} CB
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-outline-variant/10 bg-surface-container/30 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onClose();
              navigate('/vendor/transactions');
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            All Store Transactions
          </button>

          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/95 transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
