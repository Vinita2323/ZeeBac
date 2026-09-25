import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';
import { generatePassbookPDF } from '../../../utils/exportUtils';
import useLanguageStore from '../../../store/useLanguageStore';

export default function WalletPassbookScreen() {
  const navigate = useNavigate();
  const authBalance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const { t } = useLanguageStore();

  const [activeTab, setActiveTab] = useState('Transactions'); // 'Transactions' (All) or 'Cashback' (Gained only)
  
  const [allTransactions, setAllTransactions] = useState([]);
  const [cashbackTransactions, setCashbackTransactions] = useState([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Search & Filter State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState('All'); // 'All', 'Credited', 'Debited'

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [walletRes, txnRes] = await Promise.all([
          UserAPI.getMyWallet(),
          UserAPI.getMyTransactions()
        ]);

        const combined = [];
        const seenIds = new Set();

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
              name = entry.vendorName || entry.description || 'Cashback Gained';
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
              refId: entry.transactionId || entry._id
            };

            seenIds.add(item.id);
            if (entry.metadata?.transactionId) seenIds.add(entry.metadata.transactionId);
            combined.push(item);
          });
        }

        // 2. Process Store Transactions (if any transaction is distinct from ledger)
        if (txnRes.success && Array.isArray(txnRes.data)) {
          txnRes.data.forEach((t) => {
            if (seenIds.has(t._id)) return;
            seenIds.add(t._id);

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
              refId: t.billNumber || t._id
            });
          });
        }

        // Sort descending by date
        combined.sort((a, b) => b.rawDate - a.rawDate);

        setAllTransactions(combined);
        setCashbackTransactions(combined.filter((item) => item.isCashback));
      } catch (err) {
        console.error('Failed to load passbook', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  // Active list based on selected Tab
  // 1. Transactions: ALL transactions (gained cashback, withdrawal, perks, payments)
  // 2. Cashback: ONLY gained cashback
  const currentList = activeTab === 'Transactions' ? allTransactions : cashbackTransactions;

  const filteredItems = currentList.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tag.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'All' || t.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleExport = () => {
    if (activeTab === 'Transactions') {
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
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center text-on-surface active:scale-95 transition-transform cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
            <h1 className="font-display text-title-md text-primary font-bold tracking-tight">
              {t('Balance & History', 'Balance & History')}
            </h1>
          </header>

          {/* Your Accounts Section */}
          <div className="space-y-2">
            <h2 className="text-[12px] uppercase tracking-wider text-on-surface-variant font-bold px-1">
              {t('Your Accounts', 'Your Accounts')}
            </h2>

            {/* Horizontal scroll for cards */}
            <div className="flex gap-3 overflow-x-auto pb-1 scroll-hide">
              {/* ZeeBac Wallet Card */}
              <div className="min-w-[220px] bg-gradient-to-br from-[#7c3aed] via-[#9333ea] to-[#a855f7] rounded-[14px] p-3 text-white shadow-md shadow-primary/20 relative overflow-hidden flex flex-col justify-between h-[96px]">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-xs tracking-wide">ZeeBac Wallet</h3>
                    <p className="text-[9px] text-white/80 mt-0.5">
                      A/c No: {currentUser.phone ? currentUser.phone.slice(-4) : 'XXXX'}
                    </p>
                  </div>
                  <div className="w-5.5 h-5.5 bg-white/20 rounded-full flex items-center justify-center shadow-inner">
                    <span className="material-symbols-outlined text-white text-[12px]">account_balance_wallet</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/wallet')}
                  className="bg-white hover:bg-white/90 text-primary text-[10.5px] font-bold py-1 rounded-lg w-full transition-colors active:scale-[0.98] cursor-pointer"
                >
                  Check Balance
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-grow app-container px-container-margin pt-3 text-left space-y-3">
        {/* Upload Receipt CTA */}
        <button
          onClick={() => navigate('/request-cashback')}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/15 rounded-xl px-4 py-3 active:scale-[0.98] transition-all group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <span className="material-symbols-outlined text-primary text-[20px]">receipt_long</span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-[13px] text-on-surface leading-tight">Missing Cashback?</p>
            <p className="text-[10.5px] text-on-surface-variant">Upload your receipt to claim it</p>
          </div>
          <span className="material-symbols-outlined text-primary text-[18px]">chevron_right</span>
        </button>

        {/* Payment History Header */}
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-[15px] text-[#1A202C] font-black tracking-tight">
            {t('Payment History', 'Payment History')}
          </h2>
          <div className="flex items-center gap-3.5 text-[#4A5568]">
            <button onClick={() => setShowSearch(!showSearch)} className="active:scale-95 transition-transform cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>
            <button onClick={() => setShowFilter(!showFilter)} className="active:scale-95 transition-transform cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </button>
            <button onClick={handleExport} className="active:scale-95 transition-transform cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">download</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="mx-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-400 text-[18px]">search</span>
            <input
              type="text"
              placeholder="Search by name, cashback or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 text-[13px] text-gray-800 placeholder-gray-400"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="cursor-pointer">
                <span className="material-symbols-outlined text-gray-400 text-[16px]">close</span>
              </button>
            )}
          </div>
        )}

        {/* Filter Chips */}
        {showFilter && (
          <div className="mx-1 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['All', 'Credited', 'Debited'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 text-[11px] font-bold rounded-full border whitespace-nowrap transition-colors cursor-pointer ${
                  filterType === type
                    ? 'bg-[#1A202C] text-white border-[#1A202C]'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {t(type, type)}
              </button>
            ))}
          </div>
        )}

        {/* Tab Toggle: Transactions (All) vs Cashback (Gained Only) */}
        <div className="bg-surface-variant/30 p-1 rounded-xl flex mx-1 mt-1 gap-1 border border-outline-variant/15">
          <button
            onClick={() => {
              setActiveTab('Transactions');
              setFilterType('All');
            }}
            className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'Transactions'
                ? 'bg-white text-on-surface shadow-sm font-black'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">sync_alt</span>
            <span>{t('All Transactions', 'Transactions')}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
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
            className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'Cashback'
                ? 'bg-white text-emerald-700 shadow-sm font-black'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-emerald-600">redeem</span>
            <span>{t('Gained Cashback', 'Cashback')}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'Cashback' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {cashbackTransactions.length}
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
                  <span className="font-bold text-primary text-[12.5px]">{t('All Activity (Cashback, Withdrawal, Perks)', 'All Activity')}</span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-on-surface-variant leading-tight">{t('Current Balance', 'Current Balance')}</p>
                  <p className="font-black text-primary text-[12px]">₹{authBalance.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/10 flex justify-between items-center py-2 px-3 rounded-xl mx-1 mb-2 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-700 text-[18px]">verified</span>
                  <span className="font-black text-emerald-800 text-[12.5px]">{t('Gained Cashback Only', 'Gained Cashback Only')}</span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-emerald-800/80 leading-tight">{t('Total Cashback Earned', 'Total Earned')}</p>
                  <p className="font-black text-emerald-700 text-[12px]">₹{totalEarned.toFixed(2)}</p>
                </div>
              </div>
            )}

            {/* Transaction List */}
            <div className="space-y-1">
              {filteredItems.length > 0 ? (
                filteredItems.map((tx, idx) => {
                  const isCredit = tx.type === 'Credited';
                  const isCashback = tx.isCashback;
                  const isWithdrawal = tx.category === 'withdrawal';
                  const isPerk = tx.category === 'perk';

                  return (
                    <div
                      key={tx.id}
                      className={`py-2.5 px-2 rounded-xl hover:bg-surface-container-low/40 transition-colors flex items-center gap-3 ${
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
                        <h4 className="font-bold text-on-surface text-[13px] leading-tight truncate">{tx.name}</h4>
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
                          {tx.status === 'Completed' ? (
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
                      ? 'No gained cashback found'
                      : 'No transactions found'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    {activeTab === 'Cashback'
                      ? 'Shop at partner stores or scan receipts to earn instant cashback!'
                      : 'Your wallet transactions and withdrawals will show here.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <BottomNavBar />
    </div>
  );
}
