import { useState, useEffect } from 'react';

export default function WalletMonitorPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const stats = [
    { label: 'Total Platform Float', value: '₹14.2M', icon: 'account_balance', color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending Payouts', value: '₹342K', icon: 'schedule', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Today\'s Credits', value: '₹125K', icon: 'arrow_downward', color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'Today\'s Debits', value: '₹45K', icon: 'arrow_upward', color: 'text-red-600', bg: 'bg-red-500/10' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <div className="h-8 bg-outline-variant/20 rounded w-48"></div>
            <div className="h-4 bg-outline-variant/10 rounded w-64"></div>
          </div>
          <div className="h-10 bg-outline-variant/10 rounded-xl w-40"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-outline-variant/10 rounded-2xl"></div>)}
        </div>
        <div className="bg-white rounded-xl border border-outline-variant/5 p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="h-6 bg-outline-variant/10 rounded w-48"></div>
            <div className="h-8 bg-outline-variant/10 rounded w-40"></div>
          </div>
          <div className="h-10 bg-outline-variant/10 rounded w-full mt-4"></div>
          {[1,2,3,4].map(i => <div key={i} className="h-14 bg-outline-variant/5 rounded w-full"></div>)}
        </div>
      </div>
    );
  }

  const movements = [
    { id: 'W-001', type: 'Credit', amount: '₹12,400', user: 'Fresh Mart', description: 'Vendor Wallet Top-up', time: '10 mins ago' },
    { id: 'W-002', type: 'Debit', amount: '₹4,500', user: 'Amit Kumar', description: 'Bank Withdrawal', time: '1 hour ago' },
    { id: 'W-003', type: 'Credit', amount: '₹450', user: 'Noir Concept', description: 'Cashback Credit (From TX-9204)', time: '2 hours ago' },
    { id: 'W-004', type: 'Debit', amount: '₹1,200', user: 'Priya Singh', description: 'Bank Withdrawal', time: '5 hours ago' },
    { id: 'W-005', type: 'Credit', amount: '₹50,000', user: 'Tech Zone', description: 'Vendor Wallet Top-up', time: 'Yesterday' },
  ];

  let filteredMovements = movements.filter(m => 
    (activeTab === 'All' || m.type === activeTab) &&
    (m.user.toLowerCase().includes(search.toLowerCase()) || 
     m.description.toLowerCase().includes(search.toLowerCase()) ||
     m.id.toLowerCase().includes(search.toLowerCase()))
  );

  filteredMovements.sort((a, b) => {
    if (sortBy === 'amount_high') {
      const valA = parseFloat(a.amount.replace(/[^0-9.-]+/g,""));
      const valB = parseFloat(b.amount.replace(/[^0-9.-]+/g,""));
      return valB - valA;
    }
    if (sortBy === 'amount_low') {
      const valA = parseFloat(a.amount.replace(/[^0-9.-]+/g,""));
      const valB = parseFloat(b.amount.replace(/[^0-9.-]+/g,""));
      return valA - valB;
    }
    return 0; // default 'newest'
  });

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Wallet Monitor</h1>
          <p className="text-body-md text-on-surface-variant">Real-time view of platform liquidity and movement</p>
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
            <input 
              type="text" 
              placeholder="Search ID, User, Desc..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 focus:w-full sm:focus:w-72 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] transition-all duration-300"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl px-4 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
            >
              <option value="newest">Newest First</option>
              <option value="amount_high">Amount (High-Low)</option>
              <option value="amount_low">Amount (Low-High)</option>
            </select>
            <button className="h-10 px-4 bg-white border border-outline-variant/30 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-surface-container-low transition-colors w-full sm:w-auto">
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span className="sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.bg} ${stat.color}`}>
              <span className="material-symbols-outlined text-[20px]">{stat.icon}</span>
            </div>
            <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">{stat.label}</p>
            <h3 className="font-display text-[24px] font-black text-on-surface leading-none mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Tabs & Table */}
      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
        <div className="border-b border-outline-variant/10 bg-[#f8f9fc] p-4 flex justify-between items-center">
          <h3 className="font-title-lg font-bold text-on-surface">Recent Wallet Movements</h3>
          <div className="flex bg-white rounded-lg border border-outline-variant/20 overflow-hidden shadow-sm">
            {['All', 'Credit', 'Debit'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-[12px] font-bold transition-colors ${activeTab === tab ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-white">
                <th className="p-4 font-bold">Transaction</th>
                <th className="p-4 font-bold">User/Entity</th>
                <th className="p-4 font-bold">Description</th>
                <th className="p-4 font-bold">Time</th>
                <th className="p-4 font-bold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((move) => (
                <tr key={move.id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${move.type === 'Credit' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {move.type === 'Credit' ? 'arrow_downward' : 'arrow_upward'}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-on-surface">{move.type}</p>
                        <p className="font-mono text-[11px] text-on-surface-variant">{move.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-medium text-on-surface">{move.user}</td>
                  <td className="p-4 text-on-surface-variant text-[13px]">{move.description}</td>
                  <td className="p-4 text-on-surface-variant text-[12px]">{move.time}</td>
                  <td className={`p-4 font-bold text-right ${move.type === 'Credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {move.type === 'Credit' ? '+' : '-'}{move.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
