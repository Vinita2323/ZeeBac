import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function PassbookPage() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState('This Month');
  const [isLoading, setIsLoading] = useState(true);

  const [balance, setBalance] = useState(24500);

  useEffect(() => {
    const localBalance = localStorage.getItem('vendor_balance');
    if (localBalance) {
      setBalance(parseFloat(localBalance));
    }
    const timer = setTimeout(() => setIsLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);

  const ledgerEntries = [
    { id: 'LDG-104', date: 'Oct 24, 2023', time: '14:30', desc: 'Payment - Rahul S.', ref: 'TRX-9921', type: 'Credit', amount: '₹850.00', balance: '₹24,500.00' },
    { id: 'LDG-103', date: 'Oct 24, 2023', time: '14:30', desc: 'Cashback (10%)', ref: 'TRX-9921', type: 'Debit', amount: '₹85.00', balance: '₹23,650.00' },
    { id: 'LDG-102', date: 'Oct 23, 2023', time: '09:00', desc: 'Settlement - HDFC Bank', ref: 'SET-442', type: 'Debit', amount: '₹15,000.00', balance: '₹23,735.00' },
    { id: 'LDG-101', date: 'Oct 22, 2023', time: '18:45', desc: 'Payment - Amit K.', ref: 'TRX-9919', type: 'Credit', amount: '₹4,250.00', balance: '₹38,735.00' },
    { id: 'LDG-100', date: 'Oct 22, 2023', time: '18:45', desc: 'Cashback (8%)', ref: 'TRX-9919', type: 'Debit', amount: '₹340.00', balance: '₹34,485.00' },
    { id: 'LDG-099', date: 'Oct 21, 2023', time: '11:20', desc: 'Payment - Priya S.', ref: 'TRX-9918', type: 'Credit', amount: '₹2,100.00', balance: '₹34,825.00' },
  ];

  if (isLoading) {
    return <SkeletonLoader type="list" count={6} />;
  }

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
        <div className="bg-[#D1F2D9] p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#1B5E20] flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold opacity-80 mb-0.5">Total Credits (In)</p>
            <p className="text-[22px] font-black">₹1,42,500</p>
          </div>
          <span className="material-symbols-outlined text-[32px] opacity-40">arrow_downward</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#FFE5D9] p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#BF360C]">
            <p className="text-[11px] font-bold opacity-80 mb-0.5">Debits (Out)</p>
            <p className="text-[18px] font-black">₹1,18,000</p>
          </div>
          <div className="bg-[#D4E9FC] p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#0F4C81]">
            <p className="text-[11px] font-bold opacity-80 mb-0.5">Balance</p>
            <p className="text-[18px] font-black">₹{balance.toLocaleString('en-IN')}</p>
          </div>
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
        {ledgerEntries.map((entry, index) => (
          <div key={entry.id} className={`p-4 active:bg-surface-container-low/50 transition-colors ${
            index !== ledgerEntries.length - 1 ? 'border-b border-outline-variant/5' : ''
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
        ))}
      </div>

      </div>

    </div>
  );
}
