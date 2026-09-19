import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI } from '../../../services/api';
import { generatePassbookPDF } from '../../../utils/exportUtils';

export default function PassbookPage() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState('This Month');
  const [typeFilter, setTypeFilter] = useState('All');
  const balance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser);
  
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await VendorAPI.getWallet();
        if (res.success) {
          if (res.data?.wallet) {
            useAuthStore.getState().updateBalance(res.data.wallet.balance ?? 0);
          }
          const formattedLedger = res.data.ledger.map(entry => ({
            id: entry._id,
            date: new Date(entry.timestamp).toLocaleDateString(),
            time: new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            rawDate: new Date(entry.timestamp),
            desc: entry.description || entry.category,
            category: entry.category,
            ref: entry.referenceId || entry._id.substring(0,8),
            type: entry.type === 'credit' ? 'Credit' : 'Debit',
            amount: `₹${entry.amount.toLocaleString()}`,
            rawAmount: entry.amount,
            balance: `₹${entry.balanceAfter.toLocaleString()}`
          }));
          setLedgerEntries(formattedLedger);
        }
      } catch (error) {
        console.error('Failed to fetch ledger', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWallet();
  }, []);

  const filteredLedger = useMemo(() => {
    if (!ledgerEntries) return [];
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    return ledgerEntries.filter(entry => {
      const d = entry.rawDate;
      const matchesDate = 
        dateFilter === 'Today' ? d >= startOfToday :
        dateFilter === 'This Week' ? d >= startOfWeek :
        dateFilter === 'This Month' ? d >= startOfMonth :
        dateFilter === 'Last Month' ? d >= startOfLastMonth && d <= endOfLastMonth : true;

      if (!matchesDate) return false;

      if (typeFilter === 'Cashback') return entry.type === 'Debit' && (entry.category === 'cashback' || entry.desc.toLowerCase().includes('cashback'));
      if (typeFilter === 'Recharge') return entry.category === 'settlement' || entry.desc.toLowerCase().includes('recharge');
      if (typeFilter === 'Payments') return entry.category === 'payment_received' || entry.desc.toLowerCase().includes('payment received');

      return true;
    });
  }, [ledgerEntries, dateFilter, typeFilter]);

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Wallet Passbook</span>
        </div>
        <button 
          onClick={() => generatePassbookPDF(filteredLedger, currentUser?.storeName || currentUser?.name, dateFilter)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-outline-variant/20 text-primary rounded-lg font-bold text-[12px] active:scale-[0.97] transition-all shadow-sm cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          Export
        </button>
      </header>

      <div className="space-y-4 pt-1">

      {/* Sales & Revenue History Switcher Banner */}
      <div 
        onClick={() => navigate('/vendor/transactions')}
        className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-primary/20 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 cursor-pointer active:scale-[0.99] transition-transform shadow-xs"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">receipt_long</span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-on-surface leading-tight truncate">Looking for Store Sales / Revenue?</p>
            <p className="text-[11px] text-on-surface-variant leading-tight mt-0.5">View customer bill transactions & gross sales history</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-primary text-[12px] font-bold shrink-0 self-start sm:self-auto">
          <span>View Bills</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-3">
        <div className="bg-[#D4E9FC] p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#0F4C81]">
          <p className="text-[11px] font-bold opacity-80 mb-0.5">Current Wallet Balance</p>
          <p className="text-[22px] font-black">₹{balance.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Filter Header */}
      <div className="space-y-2 bg-white rounded-2xl p-4 border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[14px] text-on-surface">Wallet Ledger</h3>
          <select 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/10 text-on-surface text-[12px] font-bold rounded-xl px-2.5 py-1.5 outline-none focus:border-primary appearance-none cursor-pointer"
          >
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
            <option>Last Month</option>
          </select>
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto scroll-hide pt-1">
          {['All', 'Cashback', 'Recharge', 'Payments'].map((tab) => (
            <button
              key={tab}
              onClick={() => setTypeFilter(tab)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                typeFilter === tab
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab === 'Cashback' ? 'Cashback Given (-₹)' : (tab === 'Recharge' ? 'Recharges (+₹)' : (tab === 'Payments' ? 'Payments (+₹)' : 'All Entries'))}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Entries */}
      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-on-surface-variant font-bold">Loading ledger...</div>
        ) : filteredLedger.length > 0 ? (
          filteredLedger.map((entry, index) => (
            <div key={entry.id} className={`p-4 active:bg-surface-container-low/50 transition-colors ${
              index !== filteredLedger.length - 1 ? 'border-b border-outline-variant/5' : ''
            }`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0 mr-3">
                  <h4 className="font-bold text-[14px] text-on-surface truncate">{entry.desc}</h4>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">{entry.date} • {entry.time}</p>
                </div>
                <p className={`font-black font-label-mono text-[15px] whitespace-nowrap ${entry.type === 'Credit' ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.type === 'Credit' ? '+' : '-'}{entry.amount}
                </p>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-outline-variant/5 text-[11px]">
                <span className="text-on-surface-variant font-label-mono">Ref: {entry.ref}</span>
                <span className="font-bold text-on-surface font-label-mono">Bal: {entry.balance}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-on-surface-variant font-bold">No ledger entries found</div>
        )}
      </div>

      </div>

    </div>
  );
}
