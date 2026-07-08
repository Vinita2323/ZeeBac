import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function WalletMonitorPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  
  const [isLoading, setIsLoading] = useState(true);
  const [walletStats, setWalletStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ totalPages: 1 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await AdminAPI.getWalletStats();
        if (res.success) setWalletStats(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setIsLoading(true);
        const res = await AdminAPI.getAllWalletTransactions(page, activeTab, search, sortBy);
        if (res.success) {
          setTransactions(res.data);
          setMeta(res.meta);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchTransactions();
    }, 300);
    return () => clearTimeout(timer);
  }, [page, activeTab, search, sortBy]);

  const stats = [
    { label: 'Total Platform Float', value: `₹${(walletStats?.totalFloat || 0).toLocaleString()}`, icon: 'account_balance', color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending Payouts', value: `₹${(walletStats?.pendingPayouts || 0).toLocaleString()}`, icon: 'schedule', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Today\'s Credits', value: `₹${(walletStats?.todaysCredits || 0).toLocaleString()}`, icon: 'arrow_downward', color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'Today\'s Debits', value: `₹${(walletStats?.todaysDebits || 0).toLocaleString()}`, icon: 'arrow_upward', color: 'text-red-600', bg: 'bg-red-500/10' },
  ];

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
              {transactions.map((move) => (
                <tr key={move._id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${move.type === 'credit' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {move.type === 'credit' ? 'arrow_downward' : 'arrow_upward'}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-on-surface capitalize">{move.type}</p>
                        <p className="font-mono text-[11px] text-on-surface-variant">#{move._id.substring(18)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-medium text-on-surface">
                    {move.ownerId ? (move.ownerId.storeName || move.ownerId.name) : 'Unknown'}
                  </td>
                  <td className="p-4 text-on-surface-variant text-[13px]">{move.description}</td>
                  <td className="p-4 text-on-surface-variant text-[12px]">{new Date(move.timestamp).toLocaleString()}</td>
                  <td className={`p-4 font-bold text-right ${move.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {move.type === 'credit' ? '+' : '-'}₹{move.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !isLoading && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-on-surface-variant">
                    No wallet movements found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="p-4 border-t border-outline-variant/10 flex justify-between items-center bg-white">
            <span className="text-[13px] font-bold text-on-surface-variant">
              Page {page} of {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-outline-variant/20 rounded-lg text-[13px] font-bold disabled:opacity-50 hover:bg-surface-container-low transition-colors"
              >
                Previous
              </button>
              <button 
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="px-4 py-2 border border-outline-variant/20 rounded-lg text-[13px] font-bold disabled:opacity-50 hover:bg-surface-container-low transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
