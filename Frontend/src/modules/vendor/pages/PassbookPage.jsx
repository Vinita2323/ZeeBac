import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI } from '../../../services/api';

export default function PassbookPage() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState('This Month');
  const balance = useAuthStore((state) => state.walletBalance);
  
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await VendorAPI.getWallet();
        if (res.success) {
          const formattedLedger = res.data.ledger.map(entry => ({
            id: entry._id,
            date: new Date(entry.timestamp).toLocaleDateString(),
            time: new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            rawDate: new Date(entry.timestamp),
            desc: entry.description || entry.category,
            ref: entry.referenceId || entry._id.substring(0,8),
            type: entry.type === 'credit' ? 'Credit' : 'Debit',
            amount: `₹${entry.amount.toLocaleString()}`,
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
      if (dateFilter === 'Today') return d >= startOfToday;
      if (dateFilter === 'This Week') return d >= startOfWeek;
      if (dateFilter === 'This Month') return d >= startOfMonth;
      if (dateFilter === 'Last Month') return d >= startOfLastMonth && d <= endOfLastMonth;
      return true; // All Time fallback
    });
  }, [ledgerEntries, dateFilter]);

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-lg">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Passbook</span>
        </div>
        <button 
          onClick={() => alert('Downloading statement...')}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-outline-variant/20 text-primary rounded-lg font-bold text-[12px] active:scale-[0.97] transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          Export
        </button>
      </header>

      <div className="space-y-6 pt-4">

      {/* Summary Cards */}
      <div className="space-y-3">
        <div className="bg-[#D4E9FC] p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#0F4C81]">
          <p className="text-[11px] font-bold opacity-80 mb-0.5">Current Wallet Balance</p>
          <p className="text-[22px] font-black">₹{balance.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        <h3 className="font-bold text-[14px] text-on-surface">History</h3>
        <select 
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="bg-surface-container-low border border-outline-variant/10 text-on-surface text-[13px] font-bold rounded-xl px-3 py-2 outline-none focus:border-primary appearance-none"
        >
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
          <option>Last Month</option>
        </select>
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
