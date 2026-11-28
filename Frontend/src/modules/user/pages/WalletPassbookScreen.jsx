import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { UserAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';
import { generatePassbookPDF, generateReceiptPDF } from '../../../utils/exportUtils';
import useLanguageStore from '../../../store/useLanguageStore';

const formatSafeDateTime = (val, opts = { dateStyle: 'short', timeStyle: 'short' }) => {
  if (!val) return 'Recently';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleString('en-IN', opts);
  } catch {
    return String(val);
  }
};

const formatVendorAddress = (addr) => {
  if (!addr) return 'Verified Merchant Store';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [addr.fullAddress || addr.street, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Verified Merchant Store';
  }
  return String(addr);
};

export default function WalletPassbookScreen({ initialTab }) {
  const navigate = useNavigate();
  const location = useLocation();
  const authBalance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const { t } = useLanguageStore();

  const searchParams = new URLSearchParams(location.search);
  const paramTab = searchParams.get('tab');
  const defaultTab = initialTab || (paramTab === 'bills' || paramTab === 'Store Bills' || paramTab === 'store-bills' ? 'Bills' : 'Transactions');

  const [activeTab, setActiveTab] = useState(defaultTab); // 'Transactions', 'Cashback', or 'Bills'
  
  const [allTransactions, setAllTransactions] = useState([]);
  const [cashbackTransactions, setCashbackTransactions] = useState([]);
  const [storeBills, setStoreBills] = useState([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Search & Filter State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState('All'); // 'All', 'Credited', 'Debited'

  useEffect(() => {
    if (paramTab === 'bills' || paramTab === 'Store Bills') {
      setActiveTab('Bills');
    }
  }, [paramTab]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [walletRes, txnRes, billsRes] = await Promise.all([
          UserAPI.getMyWallet(),
          UserAPI.getMyTransactions(),
          UserAPI.getCustomerBills().catch(() => ({ success: false, data: [] }))
        ]);

        const combined = [];
        const seenIds = new Set();

        // Build a lookup map of store transactions by id, transactionId, and billNumber
        const txMap = new Map();
        if (txnRes.success && Array.isArray(txnRes.data)) {
          txnRes.data.forEach((t) => {
            if (t._id) txMap.set(String(t._id), t);
            if (t.transactionId) txMap.set(String(t.transactionId), t);
            if (t.billNumber) txMap.set(String(t.billNumber), t);
          });
        }

        // 1. Process Wallet Ledger (contains all money movements: cashback, withdrawals, perks, etc.)
        if (walletRes.success && walletRes.data) {
          const ledgerItems = walletRes.data.ledger || [];
          if (walletRes.data.wallet) {
            useAuthStore.getState().updateBalance(walletRes.data.wallet.balance ?? 0);
            setTotalEarned(walletRes.data.wallet.totalEarned ?? 0);
          }

          ledgerItems.forEach((entry) => {
            const desc = (entry.description || '').toLowerCase();
            const isCredit = entry.type === 'credit';
            const amountVal = Math.abs(Number(entry.amount) || 0);

            // Find matching store transaction for receipt/invoice details
            const matchedTx =
              (entry.referenceId && txMap.get(String(entry.referenceId))) ||
              (entry.metadata?.transactionId && txMap.get(String(entry.metadata.transactionId))) ||
              (entry.metadata?.billNumber && txMap.get(String(entry.metadata.billNumber))) ||
              (entry.transactionId && txMap.get(String(entry.transactionId))) ||
              null;

            let category = 'other';
            let tag = isCredit ? 'Credit' : 'Debit';
            let tagIcon = isCredit ? 'arrow_downward' : 'arrow_upward';
            let icon = 'account_balance_wallet';
            let name = entry.description || (isCredit ? 'Cashback Received' : 'Wallet Debit');
            let isCashback = false;

            if (desc.includes('cashback') || entry.metadata?.type === 'cashback' || desc.includes('cash claim')) {
              category = 'cashback';
              isCashback = true;
              tag = 'Cashback Gained';
              tagIcon = 'redeem';
              icon = 'redeem';
              name = matchedTx?.vendorName || entry.vendorName || entry.description || 'Cashback Gained';
            } else if (desc.includes('withdraw') || entry.metadata?.type === 'withdrawal') {
              category = 'withdrawal';
              tag = 'Withdrawal';
              tagIcon = 'account_balance';
              icon = 'account_balance';
              name = entry.description || 'Bank / UPI Withdrawal';
            } else if (desc.includes('referral') || desc.includes('perk') || desc.includes('bonus') || desc.includes('reward')) {
              category = 'perk';
              tag = 'Perk / Reward';
              tagIcon = 'card_giftcard';
              icon = 'card_giftcard';
              name = entry.description || 'Referral Perk / Reward';
            } else {
              category = isCredit ? 'credit' : 'payment';
              tag = isCredit ? 'Credit' : 'Payment';
              tagIcon = isCredit ? 'arrow_downward' : 'shopping_bag';
              icon = isCredit ? 'payments' : 'storefront';
              name = entry.description || 'Wallet Transaction';
            }

            const item = {
              id: entry._id || `ledger-${Math.random()}`,
              name,
              rawAmount: amountVal,
              amount: isCredit ? `+₹${amountVal.toFixed(2)}` : `-₹${amountVal.toFixed(2)}`,
              time: new Date(entry.createdAt || entry.timestamp || Date.now()).toLocaleString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
                month: 'short',
                day: 'numeric'
              }),
              rawDate: new Date(entry.createdAt || entry.timestamp || Date.now()).getTime(),
              type: isCredit ? 'Credited' : 'Debited',
              category,
              isCashback,
              tag,
              tagIcon,
              icon,
              status: entry.status || 'Completed',
              refId: entry.transactionId || entry._id,
              txData: matchedTx || (entry.metadata ? {
                billNumber: entry.metadata.billNumber,
                vendorName: entry.vendorName || entry.metadata.storeName,
                vendorStoreName: entry.vendorName || entry.metadata.storeName,
                vendorZeebacId: entry.metadata.vendorZeebacId,
                amount: entry.metadata.billAmount,
                cashbackAmount: entry.metadata.cashbackAmount || amountVal,
                createdAt: entry.createdAt,
                status: entry.status || 'Completed',
              } : null),
            };

            seenIds.add(item.id);
            if (entry.metadata?.transactionId) seenIds.add(entry.metadata.transactionId);
            if (matchedTx?._id) seenIds.add(String(matchedTx._id));
            combined.push(item);
          });
        }

        // 2. Process Store Transactions (if any transaction is distinct from ledger)
        if (txnRes.success && Array.isArray(txnRes.data)) {
          txnRes.data.forEach((t) => {
            if (seenIds.has(String(t._id))) return;
            seenIds.add(String(t._id));

            const hasCashback = Number(t.cashbackAmount) > 0;
            const amountVal = hasCashback ? Number(t.cashbackAmount) : Number(t.amount);

            combined.push({
              id: t._id,
              name: t.vendorName || 'ZeeBac Partner Store',
              rawAmount: amountVal,
              amount: hasCashback ? `+₹${amountVal.toFixed(2)}` : `-₹${amountVal.toFixed(2)}`,
              time: new Date(t.createdAt || Date.now()).toLocaleString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
                month: 'short',
                day: 'numeric'
              }),
              rawDate: new Date(t.createdAt || Date.now()).getTime(),
              type: hasCashback ? 'Credited' : 'Debited',
              category: hasCashback ? 'cashback' : 'payment',
              isCashback: hasCashback,
              tag: hasCashback ? 'Cashback Gained' : 'Store Payment',
              tagIcon: hasCashback ? 'redeem' : 'storefront',
              icon: hasCashback ? 'redeem' : 'storefront',
              status: t.status || 'Completed',
              refId: t.billNumber || t._id,
              txData: t,
            });
          });
        }

        // Sort descending by date
        combined.sort((a, b) => b.rawDate - a.rawDate);

        setAllTransactions(combined);
        setCashbackTransactions(combined.filter((item) => item.isCashback));

        // 3. Process Store Bills & Invoices
        if (billsRes && billsRes.success && Array.isArray(billsRes.data) && billsRes.data.length > 0) {
          setStoreBills(billsRes.data);
        } else {
          // Fallback: extract store bills from txnRes
          const extractedBills = [];
          const seenBillKeys = new Set();
          if (txnRes.success && Array.isArray(txnRes.data)) {
            txnRes.data.forEach((tx) => {
              const bKey = tx.billNumber || tx.transactionId;
              if (bKey && !seenBillKeys.has(bKey)) {
                seenBillKeys.add(bKey);
                extractedBills.push({
                  id: tx._id,
                  transactionId: tx.transactionId,
                  billNumber: tx.billNumber || tx.transactionId,
                  date: tx.createdAt || tx.timestamp || new Date(),
                  vendorStoreName: tx.vendorName || 'Zeebac Store',
                  vendorZeebacId: tx.vendorZeebacId || 'ZBV-STORE',
                  vendorPhone: tx.vendorPhone || '',
                  vendorAddress: formatVendorAddress(tx.vendorAddress || tx.vendorId?.address),
                  customerName: tx.customerName || currentUser?.name || 'Valued Customer',
                  customerZeebacId: tx.customerZeebacId || currentUser?.zeebacId || (currentUser?.phone === '9335825081' ? 'ZBC-5266' : (currentUser?.phone ? `ZBC-${currentUser.phone.slice(-4)}` : 'ZBC-5266')),
                  paymentMethod: tx.paymentMethod || 'Cash',
                  items: Array.isArray(tx.items) && tx.items.length > 0 ? tx.items : [
                    { name: 'Store Purchase', quantity: 1, price: tx.amount, total: tx.amount }
                  ],
                  amount: tx.amount,
                  cashbackAmount: tx.cashbackAmount || 0,
                  cashbackPercent: tx.cashbackPercent || 0,
                  status: tx.status || 'Approved',
                });
              }
            });
          }
          setStoreBills(extractedBills);
        }
      } catch (err) {
        console.error('Failed to load passbook', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  // Active list based on selected Tab
  const currentList = activeTab === 'Transactions' 
    ? allTransactions 
    : activeTab === 'Cashback' 
    ? cashbackTransactions 
    : storeBills;

  const filteredItems = activeTab === 'Bills'
    ? storeBills.filter((b) => {
        const q = searchQuery.toLowerCase();
        return (
          (b.vendorStoreName || '').toLowerCase().includes(q) ||
          (b.billNumber || '').toLowerCase().includes(q) ||
          (b.vendorZeebacId || '').toLowerCase().includes(q) ||
          (b.items || []).some((it) => (it.name || '').toLowerCase().includes(q))
        );
      })
    : currentList.filter((t) => {
        const matchesSearch =
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.tag.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterType === 'All' || t.type === filterType;
        return matchesSearch && matchesFilter;
      });

  const handleExport = () => {
    if (activeTab === 'Bills') {
      if (storeBills.length === 0) return alert('No store bills to export');
      const exportData = storeBills.map((b) => ({
        date: formatSafeDateTime(b.date),
        title: `${b.vendorStoreName} (Bill #${b.billNumber})`,
        type: 'debit',
        amount: `₹${b.amount}`,
        status: b.status || 'Completed'
      }));
      generatePassbookPDF(exportData, currentUser?.name || 'Customer', 'Store Invoices & Bills');
    } else if (activeTab === 'Transactions') {
      const exportData = allTransactions.map((t) => ({
        date: t.time,
        title: t.name,
        type: t.type === 'Credited' ? 'credit' : 'debit',
        amount: t.amount,
        status: t.status || 'Completed'
      }));
      if (exportData.length === 0) return alert('No transactions to export');
      generatePassbookPDF(exportData, currentUser?.name || 'Customer', 'All Transactions');
    } else {
      const exportData = cashbackTransactions.map((t) => ({
        date: t.time,
        title: t.name,
        type: 'credit',
        amount: t.amount,
        status: t.status || 'Completed'
      }));
      if (exportData.length === 0) return alert('No cashback history to export');
      generatePassbookPDF(exportData, currentUser?.name || 'Customer', 'Gained Cashback History');
    }
  };

  return (
    <div className="bg-white text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      {/* Top Gradient Area */}
      <div className="bg-white pt-3 pb-3 px-container-margin border-b border-outline-variant/10">
        <div className="app-container">
          {/* Header */}
          <header className="flex items-center gap-2 mb-3">
            <button
              onClick={() => safeNavigateBack(navigate, '/wallet')}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-variant/20 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="font-display text-title-lg font-black tracking-tight text-on-surface flex-1">
              {t('Wallet Passbook', 'Passbook')}
            </h1>

            {/* Top Right Action Icons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  showSearch ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-variant/20'
                }`}
                title="Search"
              >
                <span className="material-symbols-outlined text-[19px]">search</span>
              </button>
              {activeTab !== 'Bills' && (
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    showFilter || filterType !== 'All' ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-variant/20'
                  }`}
                  title="Filter"
                >
                  <span className="material-symbols-outlined text-[19px]">tune</span>
                </button>
              )}
              <button
                onClick={handleExport}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant/20 active:scale-95 transition-all cursor-pointer"
                title="Export PDF Statement"
              >
                <span className="material-symbols-outlined text-[19px]">download</span>
              </button>
            </div>
          </header>

          {/* Quick Stats Banner */}
          <div className="bg-gradient-to-r from-primary/10 via-purple-500/5 to-primary/5 rounded-2xl p-3 border border-primary/15 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-wider">
                {t('Current Wallet Balance', 'Available Balance')}
              </p>
              <p className="font-display font-black text-xl text-primary mt-0.5">
                ₹{Number(authBalance || 0).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-emerald-800 uppercase font-black tracking-wider flex items-center justify-end gap-1">
                <span className="material-symbols-outlined text-[12px] text-emerald-600">redeem</span>
                {t('Lifetime Cashback', 'Total Cashback')}
              </p>
              <p className="font-display font-black text-xl text-emerald-600 mt-0.5">
                ₹{Number(totalEarned || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="app-container px-container-margin py-3 flex-1 flex flex-col space-y-3">
        {/* Search Bar Input */}
        {showSearch && (
          <div className="relative animate-reveal">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder={activeTab === 'Bills' ? t('Search by store, bill no or items...') : t('Search transactions, stores, tags...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container-low pl-9 pr-9 py-2 rounded-xl text-xs text-on-surface border border-outline-variant/20 focus:border-primary focus:bg-white transition-all outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        )}

        {/* Filter Pills */}
        {showFilter && activeTab !== 'Bills' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar animate-reveal">
            {['All', 'Credited', 'Debited'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                  filterType === type
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-variant/20'
                }`}
              >
                {t(type, type)}
              </button>
            ))}
          </div>
        )}

        {/* 3-Way Tab Toggle: Transactions vs Cashback vs Store Bills */}
        <div className="bg-surface-variant/30 p-1 rounded-xl flex mx-1 mt-1 gap-1 border border-outline-variant/15">
          <button
            onClick={() => {
              setActiveTab('Transactions');
              setFilterType('All');
            }}
            className={`flex-1 py-2 text-[11px] sm:text-[12px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'Transactions'
                ? 'bg-white text-on-surface shadow-sm font-black'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">sync_alt</span>
            <span>{t('All', 'All')}</span>
            <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'Transactions' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'
            }`}>
              {allTransactions.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('Cashback');
              setFilterType('All');
            }}
            className={`flex-1 py-2 text-[11px] sm:text-[12px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'Cashback'
                ? 'bg-white text-emerald-700 shadow-sm font-black'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] text-emerald-600">redeem</span>
            <span>{t('Cashback', 'Cashback')}</span>
            <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'Cashback' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {cashbackTransactions.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('Bills');
              setFilterType('All');
            }}
            className={`flex-1 py-2 text-[11px] sm:text-[12px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'Bills'
                ? 'bg-white text-purple-700 shadow-sm font-black'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] text-purple-600">receipt_long</span>
            <span>{t('Store Bills', 'Store Bills')}</span>
            <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'Bills' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {storeBills.length}
            </span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="mt-2">
            {/* Header Banner for Active Tab */}
            {activeTab === 'Transactions' ? (
              <div className="bg-primary/5 flex justify-between items-center py-2 px-3 rounded-xl mx-1 mb-2 border border-primary/10">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">history</span>
                  <span className="text-[11px] font-bold text-on-surface">
                    {t('All Wallet Credits & Debits', 'All Wallet Activity')}
                  </span>
                </div>
                <span className="text-[10px] text-on-surface-variant font-medium">
                  {filteredItems.length} {t('records', 'items')}
                </span>
              </div>
            ) : activeTab === 'Cashback' ? (
              <div className="bg-emerald-50/70 flex justify-between items-center py-2 px-3 rounded-xl mx-1 mb-2 border border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">savings</span>
                  <span className="text-[11px] font-bold text-emerald-950">
                    {t('Lifetime Cashback Points Credited', 'Cashback Points Gained')}
                  </span>
                </div>
                <span className="text-[10.5px] font-black text-emerald-700 font-mono">
                  ₹{Number(totalEarned || 0).toFixed(2)}
                </span>
              </div>
            ) : (
              <div className="bg-purple-50/70 flex justify-between items-center py-2 px-3 rounded-xl mx-1 mb-2 border border-purple-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-700 text-[18px]">receipt_long</span>
                  <span className="text-[11px] font-bold text-purple-950">
                    {t('Store Shopping Bills & Tax Invoices', 'In-Store Purchase Bills')}
                  </span>
                </div>
                <span className="text-[10px] text-purple-700 font-bold">
                  {storeBills.length} {t('invoices', 'bills')}
                </span>
              </div>
            )}

            {/* List View */}
            <div className="space-y-2">
              {activeTab === 'Bills' ? (
                /* Store Bills Dedicated List View */
                filteredItems.length > 0 ? (
                  filteredItems.map((bill) => (
                    <div
                      key={bill.id || bill.billNumber}
                      className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition-all space-y-2.5 text-left"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-display font-black text-[14px] text-slate-900 truncate">
                              {bill.vendorStoreName || 'Zeebac Store'}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded text-[10px] border border-purple-200/60">
                                {bill.vendorZeebacId || 'ZBV-STORE'}
                              </span>
                              <span>•</span>
                              <span className="font-mono font-semibold text-slate-700">{bill.billNumber}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-black text-[15px] text-slate-900 leading-tight">
                            ₹{Number(bill.amount || 0).toLocaleString('en-IN')}
                          </p>
                          <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-0.5">
                            <span className="material-symbols-outlined text-[11px]">redeem</span>
                            +{Number(bill.cashbackAmount || 0)} Cashback
                          </span>
                        </div>
                      </div>

                      {/* Items preview */}
                      <div className="bg-slate-50/80 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1">
                        <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                          <span>Items ({(bill.items || []).length})</span>
                          <span className="font-mono font-normal lowercase">{bill.paymentMethod || 'Cash'}</span>
                        </div>
                        <div className="space-y-0.5">
                          {(bill.items || []).slice(0, 3).map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center text-slate-700 text-[11px]">
                              <span className="truncate pr-2 font-medium">{it.name} (x{it.quantity})</span>
                              <span className="font-mono font-medium shrink-0">₹{it.total || (it.price * it.quantity)}</span>
                            </div>
                          ))}
                          {(bill.items || []).length > 3 && (
                            <p className="text-[10px] text-slate-400 font-medium italic pt-0.5">
                              +{(bill.items.length - 3)} more items
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Date & Actions */}
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[10.5px] text-slate-400 font-medium">
                          {formatSafeDateTime(bill.date)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => generateReceiptPDF(bill)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                            title="Download Receipt PDF"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(bill)}
                            className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[14px]">visibility</span>
                            <span>View Bill</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center space-y-2 opacity-60">
                    <span className="material-symbols-outlined text-[38px] text-purple-600">receipt_long</span>
                    <p className="text-sm font-bold text-slate-800">{t('No store bills yet')}</p>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      {t('When you shop at any partner store and provide your Zeebac ID or mobile number, digital bills with items and instant cashback appear here.')}
                    </p>
                  </div>
                )
              ) : (
                /* Transactions & Cashback List View */
                filteredItems.length > 0 ? (
                  filteredItems.map((tx, idx) => {
                    const isCredit = tx.type === 'Credited';
                    const isCashback = tx.category === 'cashback';
                    const isWithdrawal = tx.category === 'withdrawal';
                    const isPerk = tx.category === 'perk';
                    const hasInvoice = !!(tx.txData || tx.refId || tx.isCashback);

                    return (
                      <div
                        key={tx.id}
                        onClick={() => {
                          if (hasInvoice) {
                            setSelectedInvoice(tx.txData || tx);
                          }
                        }}
                        className={`py-2.5 px-2 rounded-xl transition-colors flex items-center gap-3 ${
                          hasInvoice ? 'cursor-pointer hover:bg-primary/5 active:scale-[0.99]' : 'hover:bg-surface-container-low/40'
                        } ${
                          idx !== filteredItems.length - 1 ? 'border-b border-gray-100' : ''
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                            isCashback
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : isWithdrawal
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : isPerk
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : isCredit
                              ? 'bg-green-100 text-green-700'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">{tx.icon}</span>
                        </div>

                        {/* Center Details */}
                        <div className="flex-grow min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-on-surface text-[13px] leading-tight truncate">{tx.name}</h4>
                            {hasInvoice && (
                              <span className="material-symbols-outlined text-[13px] text-primary/60 shrink-0" title="Click to view digital bill invoice">
                                receipt_long
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <p className="text-on-surface-variant text-[10px]">{tx.time}</p>

                            {/* Tag Pill */}
                            <div
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                isCashback
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isWithdrawal
                                  ? 'bg-rose-100 text-rose-800'
                                  : isPerk
                                  ? 'bg-purple-100 text-purple-800'
                                  : isCredit
                                  ? 'bg-green-50 text-green-800'
                                  : 'bg-primary/5 text-primary'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[10px]">{tx.tagIcon}</span>
                              <span>{t(tx.tag, tx.tag)}</span>
                            </div>

                            {/* Quick View Bill Badge */}
                            {hasInvoice && (
                              <span className="text-[9px] font-bold text-primary hover:underline flex items-center">
                                {t('View Bill', 'View Bill')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right Amount */}
                        <div className="text-right shrink-0">
                          <p
                            className={`font-mono font-black text-[13.5px] ${
                              isCashback
                                ? 'text-emerald-600'
                                : isWithdrawal
                                ? 'text-rose-600'
                                : isCredit
                                ? 'text-green-600'
                                : 'text-on-surface'
                            }`}
                          >
                            {tx.amount}
                          </p>
                          <p className="text-[9px] text-on-surface-variant flex items-center justify-end gap-1 mt-0.5 font-medium">
                            {tx.status === 'Completed' || tx.status === 'Approved' ? (
                              <span className="text-green-600 font-bold">Success</span>
                            ) : (
                              <span>{tx.status}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center space-y-2 opacity-60">
                    <span className="material-symbols-outlined text-[36px]">
                      {activeTab === 'Cashback' ? 'savings' : 'history'}
                    </span>
                    <p className="text-sm font-bold">
                      {activeTab === 'Cashback'
                        ? t('No gained cashback found')
                        : t('No transactions found')}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      {activeTab === 'Cashback'
                        ? t('Shop at partner stores or scan receipts to earn instant cashback!')
                        : t('Your wallet transactions and withdrawals will show here.')}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL: THERMAL POS RECEIPT (MATCHING SCREENSHOT media_1794940746404_eef49dbe.jpg) ─── */}
      {selectedInvoice && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-reveal"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-[420px] w-full shadow-2xl p-5 sm:p-6 text-left space-y-4 relative max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            {/* Printable Thermal POS Slip Card */}
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white text-slate-800 font-mono text-xs space-y-3 shadow-xs">
              {/* Store Brand Header */}
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-3">
                <div className="w-10 h-10 mx-auto rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold mb-1 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">storefront</span>
                </div>
                <h3 className="font-display font-black text-base text-slate-900 tracking-wide uppercase">
                  {selectedInvoice.vendorStoreName || selectedInvoice.vendorName || selectedInvoice.storeName || 'Zeebac Store'}
                </h3>
                <p className="text-[11px] text-slate-500 font-sans">
                  Zeebac Store ID: <span className="font-mono font-bold text-purple-700">{selectedInvoice.vendorZeebacId || 'ZBV-STORE'}</span>
                </p>
                <p className="text-[10px] text-slate-500 font-sans">Verified Merchant Store</p>
                {selectedInvoice.vendorPhone && (
                  <p className="text-[10px] text-slate-500 font-sans">Ph: {selectedInvoice.vendorPhone}</p>
                )}
                {selectedInvoice.vendorAddress && (
                  <p className="text-[9.5px] text-slate-400 font-sans truncate max-w-[280px] mx-auto">
                    {formatVendorAddress(selectedInvoice.vendorAddress)}
                  </p>
                )}
              </div>

              {/* Invoice & Customer Meta */}
              <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Tax Invoice / Bill No:</span>
                  <span className="font-bold text-slate-900">{selectedInvoice.billNumber || selectedInvoice.transactionId || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Date & Time:</span>
                  <span className="text-slate-700">
                    {formatSafeDateTime(selectedInvoice.date || selectedInvoice.createdAt, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Customer:</span>
                  <span className="font-bold text-slate-800">{selectedInvoice.customerName || currentUser?.name || 'Valued Customer'}</span>
                </div>
                {selectedInvoice.customerZeebacId && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Customer ID:</span>
                    <span className="font-bold text-purple-700">{selectedInvoice.customerZeebacId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Payment Mode:</span>
                  <span className="font-bold text-slate-900">{selectedInvoice.paymentMethod || selectedInvoice.paymentMode || 'Cash'}</span>
                </div>
              </div>

              {/* Itemized Table */}
              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-2.5">
                <div className="grid grid-cols-12 font-bold text-[10.5px] text-slate-500 pb-1 border-b border-slate-100 font-sans">
                  <span className="col-span-6">Item</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-2 text-right">Price</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>
                {(Array.isArray(selectedInvoice.items) && selectedInvoice.items.length > 0 ? selectedInvoice.items : [
                  { name: 'Store Purchase', quantity: 1, price: selectedInvoice.amount || selectedInvoice.rawAmount || 0, total: selectedInvoice.amount || selectedInvoice.rawAmount || 0 }
                ]).map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 text-[11px] text-slate-800">
                    <span className="col-span-6 truncate font-medium">{it.name}</span>
                    <span className="col-span-2 text-center">{it.quantity}</span>
                    <span className="col-span-2 text-right">₹{Number(it.price || it.rate || 0).toFixed(0)}</span>
                    <span className="col-span-2 text-right font-bold">
                      ₹{Number(it.total || ((it.price || it.rate || 0) * (it.quantity || 1))).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grand Total */}
              <div className="space-y-1 pt-1 text-[11px]">
                <div className="flex justify-between font-bold text-[13px] text-slate-900 pt-1 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span>₹{Number(selectedInvoice.amount || selectedInvoice.rawAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10.5px] font-sans">
                  <span>GST (Statutory Included):</span>
                  <span>₹0 (Inc.)</span>
                </div>
              </div>

              {/* Zeebac Instant Reward Box */}
              {Number(selectedInvoice.cashbackAmount || (selectedInvoice.isCashback ? selectedInvoice.rawAmount : 0)) > 0 && (
                <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-center space-y-0.5 text-[11px] font-sans">
                  <p className="text-[10px] font-bold uppercase text-purple-700">
                    <span className="material-symbols-outlined text-[13px] align-middle">redeem</span> Zeebac Instant Reward
                  </p>
                  <p className="font-black text-purple-900 text-[14px]">
                    +₹{Number(selectedInvoice.cashbackAmount || (selectedInvoice.isCashback ? selectedInvoice.rawAmount : 0)).toFixed(0)} Cashback
                  </p>
                  <p className="text-[9.5px] text-purple-700">
                    Points Credited Instantly to Customer Wallet!
                  </p>
                </div>
              )}

              <div className="text-center pt-1 text-[10px] text-slate-400 leading-tight font-sans">
                <p>Thank you for shopping with us!</p>
                <p>Powered by Zeebac Retail POS Network</p>
              </div>
            </div>

            {/* Receipt Modal Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-sans">
              <button
                type="button"
                onClick={() => generateReceiptPDF(selectedInvoice)}
                className="py-3 px-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Download PDF Bill"
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-3 px-2 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">print</span>
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const bill = selectedInvoice;
                  const text = `*Zeebac Bill Receipt*\nStore: ${bill.vendorStoreName || 'Zeebac Store'}\nBill No: ${bill.billNumber || bill.transactionId}\nCustomer: ${bill.customerName || 'Customer'} (${bill.customerZeebacId || ''})\nTotal: ₹${bill.amount || bill.rawAmount}\n*Cashback Credited:* ₹${bill.cashbackAmount || 0} Points in Zeebac Wallet!\nThank you!`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="py-3 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">share</span>
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bottom Navigation */}
      <BottomNavBar />
    </div>
  );
}
