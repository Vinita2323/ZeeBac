import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI } from '../../../services/api';
import { generateCashbackPassbookPDF, generatePassbookPDF } from '../../../utils/exportUtils';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import useLanguageStore from '../../../store/useLanguageStore';

const formatDateToInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PassbookPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguageStore();

  const balance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};

  // Tab: 'cashback' (Smart Cashback Settlement) | 'wallet' (Points Purchases & Claims)
  const initialTab = searchParams.get('tab') === 'wallet' ? 'wallet' : 'cashback';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Date Filter State
  const [datePreset, setDatePreset] = useState('This Month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);

  // Type Filter State: 'ALL' | 'ISSUED' | 'REDEEMED'
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Data States
  const [isLoading, setIsLoading] = useState(true);
  const [smartSettlement, setSmartSettlement] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [rangeStats, setRangeStats] = useState({
    rangeIssued: 0,
    rangeRedeemed: 0,
    rangeNet: 0,
    totalCount: 0,
  });

  const [walletData, setWalletData] = useState(null);
  const [walletLedger, setWalletLedger] = useState([]);

  // Calculate Dates according to preset
  const applyPreset = useCallback((preset) => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'Today') {
      const todayStr = formatDateToInput(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
      setIsCustomPickerOpen(false);
    } else if (preset === 'Yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = formatDateToInput(yest);
      setStartDate(yestStr);
      setEndDate(yestStr);
      setIsCustomPickerOpen(false);
    } else if (preset === 'Last 7 Days') {
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 6);
      setStartDate(formatDateToInput(past7));
      setEndDate(formatDateToInput(now));
      setIsCustomPickerOpen(false);
    } else if (preset === 'This Month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDateToInput(firstDay));
      setEndDate(formatDateToInput(now));
      setIsCustomPickerOpen(false);
    } else if (preset === 'Last Month') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatDateToInput(firstDayLastMonth));
      setEndDate(formatDateToInput(lastDayLastMonth));
      setIsCustomPickerOpen(false);
    } else if (preset === 'All Time') {
      setStartDate('');
      setEndDate('');
      setIsCustomPickerOpen(false);
    } else if (preset === 'Custom') {
      setIsCustomPickerOpen(true);
    }
  }, []);

  // Initialize with 'This Month' dates
  useEffect(() => {
    applyPreset('This Month');
  }, [applyPreset]);

  // Fetch Smart Cashback Settlements from backend
  const fetchCashbackSettlements = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        page: 1,
        limit: 100,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
        search: searchQuery.trim() || undefined,
      };

      const res = await VendorAPI.getSmartCashbackSettlement(params);
      if (res.success && res.data) {
        setSmartSettlement(res.data);
        setSettlements(res.data.settlements || []);
        if (res.data.rangeStats) {
          setRangeStats(res.data.rangeStats);
        } else {
          // Fallback compute
          let issued = 0;
          let redeemed = 0;
          (res.data.settlements || []).forEach((s) => {
            if (s.type === 'ISSUED') issued += Number(s.amount || 0);
            if (s.type === 'REDEEMED') redeemed += Number(s.amount || 0);
          });
          setRangeStats({
            rangeIssued: issued,
            rangeRedeemed: redeemed,
            rangeNet: issued - redeemed,
            totalCount: res.data.settlements?.length || 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch cashback settlements:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, typeFilter, searchQuery]);

  // Fetch Wallet and General Points Ledger
  const fetchWallet = useCallback(async () => {
    try {
      const res = await VendorAPI.getWallet();
      if (res.success && res.data) {
        setWalletData(res.data);
        if (res.data.wallet) {
          useAuthStore.getState().updateBalance(res.data.wallet.balance ?? 0);
        }
        const formatted = (res.data.ledger || []).map((entry) => ({
          id: entry._id,
          date: new Date(entry.createdAt || entry.timestamp).toLocaleDateString('en-IN'),
          time: new Date(entry.createdAt || entry.timestamp).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          rawDate: new Date(entry.createdAt || entry.timestamp),
          desc: entry.description || entry.category,
          category: entry.category,
          ref: entry.referenceId || entry.adminTransactionId || entry._id?.substring(0, 8),
          type: entry.type === 'credit' ? 'Credit' : 'Debit',
          amount: `${Number(entry.amount || 0).toLocaleString()} Pts`,
          rawAmount: entry.amount,
          balance: `${Number(entry.balanceAfter || 0).toLocaleString()} Pts`,
        }));
        setWalletLedger(formatted);
      }
    } catch (err) {
      console.error('Failed to fetch wallet info:', err);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    if (activeTab === 'cashback') {
      fetchCashbackSettlements();
    }
  }, [activeTab, fetchCashbackSettlements]);

  // Filtered Wallet Ledger for 'wallet' tab
  const filteredWalletLedger = useMemo(() => {
    if (!walletLedger) return [];
    return walletLedger.filter((entry) => {
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        if (entry.rawDate < s) return false;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        if (entry.rawDate > e) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          (entry.desc && entry.desc.toLowerCase().includes(q)) ||
          (entry.ref && entry.ref.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [walletLedger, startDate, endDate, searchQuery]);

  // Dynamic Date Range Label for display and exports
  const dateRangeLabel = useMemo(() => {
    if (datePreset !== 'Custom') return datePreset;
    if (startDate && endDate) {
      if (startDate === endDate) {
        return new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      return `${new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (startDate) return `From ${new Date(startDate).toLocaleDateString('en-IN')}`;
    if (endDate) return `Till ${new Date(endDate).toLocaleDateString('en-IN')}`;
    return 'All Time';
  }, [datePreset, startDate, endDate]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (activeTab === 'cashback') {
      const headers = ['Date', 'Time', 'Type', 'Customer Name', 'Customer Zeebac ID', 'Order / Bill #', 'Bill Amount (Rs)', 'Cashback Rate (%)', 'Points', 'Net Balance After', 'Remaining Capacity After'];
      const rows = settlements.map((s) => [
        new Date(s.createdAt).toLocaleDateString('en-IN'),
        new Date(s.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        s.type === 'ISSUED' ? 'Cashback Issued' : (s.type === 'REDEEMED' ? 'Cashback Redeemed' : s.type),
        `"${(s.customerName || '').replace(/"/g, '""')}"`,
        s.customerZeebacId || '',
        `"${(s.billNumber || s.orderId || '').replace(/"/g, '""')}"`,
        s.eligiblePaidAmount || 0,
        s.cashbackPercentage || 0,
        s.type === 'ISSUED' ? `+${s.amount}` : `-${s.amount}`,
        s.netBalanceAfter || 0,
        s.remainingCapacityAfter || 0,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `ZeeBac_Cashback_${dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = ['Date', 'Time', 'Description', 'Type', 'Points Amount', 'Reference', 'Balance After'];
      const rows = filteredWalletLedger.map((w) => [
        w.date,
        w.time,
        `"${(w.desc || '').replace(/"/g, '""')}"`,
        w.type,
        w.amount,
        `"${(w.ref || '').replace(/"/g, '""')}"`,
        w.balance,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `ZeeBac_Wallet_Passbook_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Export PDF Handler
  const handleExportPDF = () => {
    const storeName = currentUser?.storeName || currentUser?.name || 'Vendor Store';
    if (activeTab === 'cashback') {
      generateCashbackPassbookPDF(settlements, storeName, dateRangeLabel, rangeStats);
    } else {
      generatePassbookPDF(filteredWalletLedger, storeName, dateRangeLabel);
    }
  };

  const totalPoints = walletData?.wallet?.balance ?? balance ?? 0;
  const purchasedPoints = walletData?.purchasedPoints ?? Math.max(0, totalPoints - (walletData?.redeemedPoints || 0));
  const redeemedPoints = walletData?.redeemedPoints ?? 0;

  return (
    <div className="animate-reveal text-left pb-16">
      {/* ─── Top Header ─── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-xs mb-3 sm:mb-4">
        <div className="flex items-center">
          <button
            onClick={() => safeNavigateBack(navigate, '/vendor/wallet')}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <div>
            <h1 className="font-display text-title-md text-primary font-black ml-1">
              Cashback & Passbook
            </h1>
            <p className="text-[10.5px] text-gray-500 ml-1 font-medium">Date-wise Cashback Issuance & Redemption</p>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            title="Download CSV Spreadsheet"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-outline-variant/20 text-slate-700 hover:text-primary rounded-xl font-bold text-[11.5px] active:scale-[0.97] transition-all shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">table_view</span>
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            title="Download PDF Passbook"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-xl font-bold text-[11.5px] active:scale-[0.97] transition-all shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            <span>PDF</span>
          </button>
        </div>
      </header>

      <div className="space-y-4 pt-1">
        {/* ─── Top Points Balance & Settlement Capacity Card ─── */}
        <div className="bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 opacity-90 text-[11px] font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-[16px]">stars</span>
                <span>ZEEBAC POINTS WALLET</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h2 className="text-[32px] font-display font-black leading-none">
                  {Math.floor(totalPoints).toLocaleString('en-IN')}
                </h2>
                <span className="text-sm font-extrabold text-purple-200 uppercase tracking-wider">Points</span>
              </div>
            </div>

            {/* Settlement Status Badge */}
            {smartSettlement && (
              <div className="bg-white/15 backdrop-blur-xs rounded-2xl p-2.5 sm:text-right border border-white/15">
                <p className="text-[10px] uppercase tracking-wider text-purple-200 font-bold">Settlement Status</p>
                <p className="text-[12.5px] font-black text-white mt-0.5">
                  {smartSettlement.settlementStatus === 'MERCHANT_OWES_ZEEBAC'
                    ? `Merchant owes ₹${smartSettlement.netSettlementBalance}`
                    : smartSettlement.settlementStatus === 'ZEEBAC_OWES_MERCHANT'
                    ? `Zeebac owes ₹${Math.abs(smartSettlement.netSettlementBalance)}`
                    : 'Settled · No Dues'}
                </p>
                <p className="text-[9.5px] text-purple-200/80 mt-0.5">
                  Remaining Capacity: {(smartSettlement.remainingCapacity || 0).toLocaleString()} Pts
                </p>
              </div>
            )}
          </div>

          {/* Points Breakdown Pills */}
          <div className="relative z-10 mt-3 pt-3 border-t border-white/15 grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur-xs">
              <span className="text-[9.5px] uppercase tracking-wider text-emerald-300 font-black flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Purchased (Claimable to UPI)
              </span>
              <p className="text-[13px] font-mono font-black text-white mt-0.5">
                {Math.floor(purchasedPoints).toLocaleString('en-IN')} Pts
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur-xs">
              <span className="text-[9.5px] uppercase tracking-wider text-amber-300 font-black flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Customer Redeemed (Non-claimable)
              </span>
              <p className="text-[13px] font-mono font-black text-white mt-0.5">
                {Math.floor(redeemedPoints).toLocaleString('en-IN')} Pts
              </p>
            </div>
          </div>
        </div>

        {/* ─── Main Tab Switcher: Smart Cashback Details vs Points Wallet Activity ─── */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('cashback');
              setSearchParams({ tab: 'cashback' });
            }}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-[12.5px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'cashback'
                ? 'bg-white text-primary shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">swap_horizontal_circle</span>
            <span>Smart Cashback Details</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('wallet');
              setSearchParams({ tab: 'wallet' });
            }}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-[12.5px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'wallet'
                ? 'bg-white text-primary shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">account_balance_wallet</span>
            <span>Points Wallet & UPI Claims</span>
          </button>
        </div>

        {/* ─── DATE-WISE FILTER CONTROL PANEL ─── */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-100 shadow-xs space-y-3.5">
          {/* Header of Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-[17px]">calendar_month</span>
              </div>
              <h3 className="font-bold text-[13.5px] text-gray-900">
                Date Filter: <span className="text-primary font-black">{dateRangeLabel}</span>
              </h3>
            </div>

            {/* Custom Range Toggle */}
            <button
              type="button"
              onClick={() => setIsCustomPickerOpen(!isCustomPickerOpen)}
              className={`text-[12px] font-bold flex items-center gap-1 cursor-pointer transition-colors px-2.5 py-1 rounded-lg ${
                isCustomPickerOpen || datePreset === 'Custom'
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-primary hover:bg-purple-50'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
              <span>{isCustomPickerOpen ? 'Hide Custom Dates' : 'Custom Date Range'}</span>
            </button>
          </div>

          {/* Quick Date Presets Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-hide pb-0.5">
            {['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Last Month', 'All Time'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  datePreset === preset && !isCustomPickerOpen
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset === 'Today' ? t('Today') : (preset === 'This Month' ? t('This Month') : preset)}
              </button>
            ))}
          </div>

          {/* Custom Date Range Picker (From & To Inputs) */}
          {(isCustomPickerOpen || datePreset === 'Custom') && (
            <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-100 grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-reveal">
              <div>
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-purple-900 block mb-1">
                  From Date (Start):
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setDatePreset('Custom');
                      setStartDate(e.target.value);
                    }}
                    className="w-full h-10 px-3 bg-white border border-purple-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-purple-900 block mb-1">
                  To Date (End):
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setDatePreset('Custom');
                      setEndDate(e.target.value);
                    }}
                    className="w-full h-10 px-3 bg-white border border-purple-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Secondary Filters: Type Filter & Search Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            {activeTab === 'cashback' ? (
              <div className="flex items-center gap-1.5 overflow-x-auto scroll-hide">
                {[
                  { id: 'ALL', label: 'All Cashback', icon: 'all_inclusive' },
                  { id: 'ISSUED', label: 'Cashback Issued ↑', icon: 'send_money' },
                  { id: 'REDEEMED', label: 'Cashback Redeemed ↓', icon: 'shopping_bag' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTypeFilter(item.id)}
                    className={`px-2.5 py-1.2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                      typeFilter === item.id
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs font-bold text-slate-600">Points Purchases & UPI Claims Ledger</div>
            )}

            {/* Quick Search */}
            <div className="relative min-w-[200px] sm:w-60">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'cashback' ? 'Search customer, bill, order...' : 'Search ledger ref...'}
                className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── DATE-RANGE SUMMARY CARD ─── */}
        {activeTab === 'cashback' && (
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 rounded-2xl p-4 border border-purple-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-purple-900 pb-1.5 border-b border-purple-200/50">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
                <span>Date Period Summary ({dateRangeLabel})</span>
              </span>
              <span className="bg-purple-200/80 text-purple-950 px-2 py-0.5 rounded-full text-[10.5px]">
                {rangeStats.totalCount} Record{rangeStats.totalCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-white/80 rounded-xl p-2.5 border border-purple-100 shadow-xs">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-purple-700">Cashback Issued</p>
                <p className="text-[17px] font-black font-mono text-purple-950 mt-0.5">
                  +{(rangeStats.rangeIssued || 0).toLocaleString()} Pts
                </p>
                <p className="text-[9.5px] text-purple-600 mt-0.5">Given on shopping</p>
              </div>

              <div className="bg-white/80 rounded-xl p-2.5 border border-purple-100 shadow-xs">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-700">Cashback Redeemed</p>
                <p className="text-[17px] font-black font-mono text-indigo-950 mt-0.5">
                  -{(rangeStats.rangeRedeemed || 0).toLocaleString()} Pts
                </p>
                <p className="text-[9.5px] text-indigo-600 mt-0.5">Used by customers</p>
              </div>

              <div className="bg-white/80 rounded-xl p-2.5 border border-purple-100 shadow-xs">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-700">Period Net Balance</p>
                <p
                  className={`text-[17px] font-black font-mono mt-0.5 ${
                    rangeStats.rangeNet > 0
                      ? 'text-purple-700'
                      : rangeStats.rangeNet < 0
                      ? 'text-emerald-700'
                      : 'text-slate-800'
                  }`}
                >
                  {(rangeStats.rangeNet || 0).toLocaleString()} Pts
                </p>
                <p className="text-[9.5px] text-slate-500 mt-0.5">Issued – Redeemed</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 1: SMART CASHBACK SETTLEMENTS LIST ─── */}
        {activeTab === 'cashback' && (
          <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/70 border-b border-gray-100 flex items-center justify-between text-xs font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-primary">history</span>
                <span>Date-Wise Cashback Ledger</span>
              </span>
              <span className="text-[11px] text-gray-500">
                Showing {settlements.length} of {rangeStats.totalCount} entries
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-gray-500">{t('Loading date-wise cashback records...')}</p>
              </div>
            ) : settlements.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[26px]">calendar_today</span>
                </div>
                <h4 className="font-bold text-[14px] text-gray-800">No Cashback Records for this Date Range</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Aapke store par is date range ({dateRangeLabel}) me koi cashback issuance ya redemption record nahi mila. Try changing the date filter above.
                </p>
                <button
                  type="button"
                  onClick={() => applyPreset('All Time')}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-purple-100 text-purple-800 font-bold text-xs hover:bg-purple-200 transition-colors cursor-pointer"
                >
                  View All Time Records
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {settlements.map((item) => {
                  const isIssued = item.type === 'ISSUED';
                  const dateStr = new Date(item.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });
                  const timeStr = new Date(item.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={item._id}
                      className="p-3.5 sm:p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                    >
                      {/* Left: Icon & Details */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            isIssued
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[22px]">
                            {isIssued ? 'send_money' : 'shopping_bag'}
                          </span>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          {/* Type & Amount */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                isIssued
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {isIssued ? 'Cashback Issued' : 'Cashback Redeemed'}
                            </span>
                            <span className="text-[11px] font-bold text-gray-500">
                              {dateStr} • {timeStr}
                            </span>
                          </div>

                          {/* Customer Name & Zeebac ID */}
                          <p className="text-[13.5px] font-bold text-gray-900 leading-tight">
                            {item.customerName || 'Customer'}
                            {item.customerZeebacId && (
                              <span className="ml-1.5 font-mono text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md font-bold">
                                {item.customerZeebacId}
                              </span>
                            )}
                          </p>

                          {/* Order / Bill & Cashback Info */}
                          <div className="flex items-center gap-2 text-[11.5px] text-gray-500 flex-wrap pt-0.5">
                            {(item.billNumber || item.orderId) && (
                              <span className="font-semibold text-gray-700">
                                Bill/Order: #{item.billNumber || item.orderId}
                              </span>
                            )}
                            {item.eligiblePaidAmount !== undefined && (
                              <span>• Paid Bill: ₹{item.eligiblePaidAmount}</span>
                            )}
                            {item.cashbackPercentage !== undefined && (
                              <span className="text-purple-700 font-bold">• Rate: {item.cashbackPercentage}%</span>
                            )}
                            {item.paymentMethod && (
                              <span className="text-gray-400">• Mode: {item.paymentMethod}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Points Amount & Snapshot */}
                      <div className="sm:text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 flex sm:flex-col justify-between sm:justify-center items-end">
                        <p
                          className={`font-black font-mono text-[16px] leading-tight ${
                            isIssued ? 'text-purple-700' : 'text-indigo-700'
                          }`}
                        >
                          {isIssued ? '+' : '-'}{Number(item.amount).toLocaleString()} Pts
                        </p>
                        {item.remainingCapacityAfter !== undefined && (
                          <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                            Cap Left: {Number(item.remainingCapacityAfter).toLocaleString()} Pts
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: POINTS WALLET & UPI CLAIMS LIST ─── */}
        {activeTab === 'wallet' && (
          <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/70 border-b border-gray-100 flex items-center justify-between text-xs font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-primary">receipt_long</span>
                <span>Points Purchases, UPI Claims & Recharges</span>
              </span>
              <span className="text-[11px] text-gray-500">
                {filteredWalletLedger.length} Entries
              </span>
            </div>

            {filteredWalletLedger.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[26px]">account_balance_wallet</span>
                </div>
                <h4 className="font-bold text-[14px] text-gray-800">No Points Activity in this Period</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Is date range ({dateRangeLabel}) me koi purchased points ya UPI claim entries nahi hain.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredWalletLedger.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 sm:p-4 hover:bg-slate-50/60 transition-colors flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          entry.type === 'Credit'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {entry.type === 'Credit' ? 'add_shopping_cart' : 'payments'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[13.5px] text-gray-900 leading-tight">
                          {entry.desc}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {entry.date} • {entry.time}
                        </p>
                        {entry.ref && (
                          <p className="text-[10px] text-purple-700 font-mono mt-0.5 font-bold">
                            Ref: {entry.ref}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`font-black font-mono text-[15px] ${
                          entry.type === 'Credit' ? 'text-emerald-700' : 'text-purple-700'
                        }`}
                      >
                        {entry.type === 'Credit' ? '+' : '-'}{entry.amount}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                        Bal: {entry.balance}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
