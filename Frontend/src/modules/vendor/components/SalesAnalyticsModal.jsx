import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { VendorAPI, AdminAPI } from '../../../services/api';
import useLanguageStore from '../../../store/useLanguageStore';

export default function SalesAnalyticsModal({
  isOpen,
  onClose,
  initialData,
  initialPeriod = 'today',
  storeName = 'Vendor Store',
  isAdmin = false
}) {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getStartOfMonthStr = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  };

  const [period, setPeriod] = useState(initialPeriod); // 'today' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  const [startDate, setStartDate] = useState(getStartOfMonthStr);
  const [endDate, setEndDate] = useState(getTodayStr);

  const [paymentFilter, setPaymentFilter] = useState('ALL'); // 'ALL' | 'CASH' | 'DIGITAL'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  const periods = [
    { key: 'today', label: isAdmin ? 'Today' : (t('Today') || 'Today') },
    { key: 'weekly', label: isAdmin ? 'Weekly' : (t('Weekly') || 'Weekly') },
    { key: 'monthly', label: isAdmin ? 'Monthly' : (t('Monthly') || 'Monthly') },
    { key: 'yearly', label: isAdmin ? 'Yearly' : (t('Yearly') || 'Yearly') },
    { key: 'custom', label: isAdmin ? 'Date Range' : (t('Date Range') || 'Date Range') },
  ];

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isOpen]);

  // Fetch sales analytics whenever modal opens or period / date range changes
  useEffect(() => {
    if (!isOpen) return;
    if (period === 'custom' && (!startDate || !endDate)) return;

    let isMounted = true;
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const res = isAdmin
          ? await AdminAPI.getSalesAnalytics(period, startDate, endDate)
          : await VendorAPI.getSalesAnalytics(period, startDate, endDate);

        if (isMounted && res?.success && res.data) {
          setAnalyticsData(res.data);
        }
      } catch (err) {
        console.warn('Failed to fetch detailed sales analytics, using fallback:', err);
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
  }, [isOpen, period, startDate, endDate, initialData, isAdmin]);

  if (!isOpen) return null;

  // Active summary figures
  const summary = analyticsData?.summary || initialData?.salesBreakdown?.[period] || {
    total: 0,
    cash: 0,
    digital: 0,
    transactions: 0,
    cashbackGiven: 0,
    cashPercentage: 0,
    digitalPercentage: 0
  };

  const totalAmount = Number(summary.total || 0);
  const cashAmount = Number(summary.cash || 0);
  const digitalAmount = Number(summary.digital || 0);
  const txnsCount = Number(summary.transactions || 0);
  const cashbackGiven = Number(summary.cashbackGiven || 0);

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
      const matchVendor = (txn.vendor || '').toLowerCase().includes(q);
      const matchPhone = (txn.phone || '').toLowerCase().includes(q);
      const matchId = (txn.id || '').toLowerCase().includes(q);
      return matchName || matchVendor || matchPhone || matchId;
    }
    return true;
  });

  const cashTxnCount = rawTxns.filter((t) => t.isCash).length;
  const digitalTxnCount = rawTxns.filter((t) => !t.isCash).length;
  const currentPeriodLabel = period === 'custom'
    ? (startDate && endDate
        ? `${new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
        : (isAdmin ? 'Date Range' : (t('Date Range') || 'Date Range')))
    : periods.find((p) => p.key === period)?.label || 'Today';

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Header (Clean & Minimal) */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                  {isAdmin ? 'Platform Sales & Collections' : (t('Platform Sales & Collections') || 'Sales & Collections')}
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {isAdmin ? 'Live' : (t('Live') || 'Live')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {storeName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Scrollable Body (Internal scroll only, cannot scroll background) */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3"
          style={{ overscrollBehavior: 'contain' }}
        >

          {/* Clean Segmented Filter Tabs */}
          <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1 overflow-x-auto no-scrollbar">
            {periods.map((p) => {
              const isActive = period === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`flex-1 py-1.5 px-2 text-[11px] sm:text-xs rounded-lg text-center font-medium whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Date Range Selector Box (Animated when Custom is active) */}
          {period === 'custom' && (
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 animate-fadeIn space-y-2.5 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <span className="material-symbols-outlined text-purple-600 text-[17px]">date_range</span>
                  <span>{isAdmin ? 'Search by Date Range' : (t('Search by Date Range') || 'Search by Date Range')}</span>
                </div>
                {startDate && endDate && (
                  <span className="text-[10.5px] font-bold text-purple-700 bg-purple-50 border border-purple-200/60 px-2 py-0.5 rounded-full font-mono">
                    {new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    {isAdmin ? 'From Date' : (t('From Date') || 'From Date')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || getTodayStr()}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 transition-all cursor-pointer shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    {isAdmin ? 'To Date' : (t('To Date') || 'To Date')}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={getTodayStr()}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 transition-all cursor-pointer shadow-xs"
                  />
                </div>
              </div>

              {/* Quick Date Presets */}
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  {isAdmin ? 'Presets:' : (t('Presets:') || 'Presets:')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayStr();
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border transition-all shrink-0 cursor-pointer ${
                    startDate === getTodayStr() && endDate === getTodayStr()
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {isAdmin ? 'Today' : (t('Today') || 'Today')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    const y = d.toISOString().split('T')[0];
                    setStartDate(y);
                    setEndDate(y);
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors shrink-0 cursor-pointer"
                >
                  {isAdmin ? 'Yesterday' : (t('Yesterday') || 'Yesterday')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 6);
                    setStartDate(d.toISOString().split('T')[0]);
                    setEndDate(getTodayStr());
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors shrink-0 cursor-pointer"
                >
                  {isAdmin ? 'Last 7 Days' : (t('Last 7 Days') || 'Last 7 Days')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 29);
                    setStartDate(d.toISOString().split('T')[0]);
                    setEndDate(getTodayStr());
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors shrink-0 cursor-pointer"
                >
                  {isAdmin ? 'Last 30 Days' : (t('Last 30 Days') || 'Last 30 Days')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(getStartOfMonthStr());
                    setEndDate(getTodayStr());
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors shrink-0 cursor-pointer"
                >
                  {isAdmin ? 'This Month' : (t('This Month') || 'This Month')}
                </button>
              </div>
            </div>
          )}

          {/* Simple Clean Hero Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {isAdmin ? 'Total Sales' : t('Total Sales')} • {currentPeriodLabel}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                {txnsCount} {isAdmin ? 'Orders' : t('Orders')}
              </span>
            </div>

            <div className="my-1">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
                ₹{totalAmount.toLocaleString('en-IN')}
              </h2>
            </div>

            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-200/60 text-[11px] text-slate-600 font-medium">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-amber-600">savings</span>
                Cashback: <strong className="text-slate-800 font-semibold">₹{cashbackGiven.toLocaleString('en-IN')}</strong>
              </span>
            </div>
          </div>

          {/* Cash vs Digital Breakdown Cards */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 text-left">
            
            {/* Cash Card */}
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="material-symbols-outlined text-[18px] text-emerald-700">payments</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100/90 text-emerald-800">
                  {cashPct}%
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-600">{isAdmin ? 'Cash transaction' : (t('Cash transaction') || 'Cash transaction')}</p>
              <h4 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                ₹{cashAmount.toLocaleString('en-IN')}
              </h4>
              <p className="text-[10.5px] text-slate-500 mt-1">
                {cashTxnCount} {isAdmin ? 'Orders' : (t('Orders') || 'Orders')}
              </p>
            </div>

            {/* Digital Card */}
            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="material-symbols-outlined text-[18px] text-indigo-700">smartphone</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100/90 text-indigo-800">
                  {digitalPct}%
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-600">{isAdmin ? 'Digital transaction' : (t('Digital transaction') || 'Digital transaction')}</p>
              <h4 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                ₹{digitalAmount.toLocaleString('en-IN')}
              </h4>
              <p className="text-[10.5px] text-slate-500 mt-1">
                {digitalTxnCount} {isAdmin ? 'Orders' : (t('Orders') || 'Orders')}
              </p>
            </div>
          </div>

          {/* Split Ratio Bar */}
          {totalAmount > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-xl p-3 text-left">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1.5">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {isAdmin ? 'Cash transaction' : (t('Cash transaction') || 'Cash transaction')}: {cashPct}% (₹{cashAmount.toLocaleString('en-IN')})
                </span>
                <span className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  {isAdmin ? 'Digital transaction' : (t('Digital transaction') || 'Digital transaction')}: {digitalPct}% (₹{digitalAmount.toLocaleString('en-IN')})
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${cashPct}%` }}
                />
                <div
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${digitalPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Orders Section */}
          <div className="pt-1 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                {isAdmin ? 'Orders Breakdown' : (t('Orders Breakdown') || 'Orders Breakdown')} ({rawTxns.length})
              </span>

              {/* Payment Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10.5px]">
                <button
                  onClick={() => setPaymentFilter('ALL')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                    paymentFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAdmin ? 'All' : (t('All') || 'All')}
                </button>
                <button
                  onClick={() => setPaymentFilter('CASH')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                    paymentFilter === 'CASH'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:text-emerald-800'
                  }`}
                >
                  {isAdmin ? 'Cash transaction' : (t('Cash transaction') || 'Cash transaction')} ({cashTxnCount})
                </button>
                <button
                  onClick={() => setPaymentFilter('DIGITAL')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                    paymentFilter === 'DIGITAL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-indigo-700 hover:text-indigo-800'
                  }`}
                >
                  {isAdmin ? 'Digital transaction' : (t('Digital transaction') || 'Digital transaction')} ({digitalTxnCount})
                </button>
              </div>
            </div>

            {/* Quick Search */}
            {rawTxns.length > 3 && (
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search customer, store, or bill..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                />
              </div>
            )}

            {/* Transactions List */}
            {loading ? (
              <div className="py-6 text-center text-slate-400">
                <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-1.5"></div>
                <p className="text-xs">Loading...</p>
              </div>
            ) : filteredTxns.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 border border-slate-200/70 rounded-xl">
                <span className="material-symbols-outlined text-[24px] text-slate-400 mb-1">receipt_long</span>
                <p className="text-xs font-semibold text-slate-700">{isAdmin ? 'No sales found' : (t('No sales found') || 'No sales found')}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">No transactions recorded for this period.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredTxns.map((txn, idx) => (
                  <div
                    key={txn.id || txn._id || idx}
                    className="p-2.5 bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        txn.isCash ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {txn.isCash ? 'payments' : 'smartphone'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {txn.customer} {isAdmin && txn.vendor && <span className="text-slate-500 font-normal">({txn.vendor})</span>}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                          <span className={`font-semibold px-1.5 py-0.2 rounded ${
                            txn.isCash ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {txn.isCash ? (isAdmin ? 'Cash transaction' : (t('Cash transaction') || 'Cash transaction')) : (isAdmin ? 'Digital transaction' : (t('Digital transaction') || 'Digital transaction'))}
                          </span>
                          <span className="text-slate-400">
                            {new Date(txn.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-slate-900">
                        ₹{Number(txn.amount || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] font-medium text-amber-700">
                        ₹{Number(txn.cashbackAmount || 0).toLocaleString('en-IN')} CB
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer (Clean & Sticky) */}
        <div className="px-4 py-2.5 sm:px-5 border-t border-slate-100 flex items-center justify-between gap-2.5 bg-slate-50/50 shrink-0">
          <button
            onClick={() => {
              onClose();
              navigate(isAdmin ? '/admin/transactions' : '/vendor/transactions');
            }}
            className="flex-1 py-2 px-3 rounded-lg text-slate-700 hover:bg-slate-200/70 border border-slate-200 bg-white font-medium text-xs transition-colors cursor-pointer text-center"
          >
            {isAdmin ? 'All Platform Transactions' : (t('All Store Transactions') || 'All Store Transactions')}
          </button>

          <button
            onClick={onClose}
            className="py-2 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            {isAdmin ? 'Done' : (t('Done') || 'Done')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
