import { useState, useEffect } from 'react';

export default function TransactionsPage() {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const transactions = [
    { id: 'TX-9204', customer: 'Amit Kumar', vendor: 'Noir Concept Store', amount: '₹4,500', cashback: '₹450', status: 'Approved', time: '10 mins ago', type: 'Credit Card' },
    { id: 'TX-9205', customer: 'Priya Singh', vendor: 'Fresh Mart', amount: '₹12,400', cashback: '₹0', status: 'Flagged', time: '25 mins ago', type: 'Cash' },
    { id: 'TX-9206', customer: 'Rahul Sharma', vendor: 'Tech Zone', amount: '₹850', cashback: '₹42', status: 'Approved', time: '1 hour ago', type: 'UPI' },
    { id: 'TX-9207', customer: 'Sneha Patel', vendor: 'Daily Needs', amount: '₹150', cashback: '₹5', status: 'Rejected', time: '2 hours ago', type: 'UPI' },
    { id: 'TX-9208', customer: 'Vikram Gupta', vendor: 'Style Icon', amount: '₹2,100', cashback: '₹210', status: 'Approved', time: '5 hours ago', type: 'Credit Card' },
    { id: 'TX-9209', customer: 'Karan Verma', vendor: 'Elite Electronics', amount: '₹45,000', cashback: '₹0', status: 'Flagged', time: 'Yesterday', type: 'Cash' },
  ];



  let filteredTransactions = transactions.filter(t => 
    (filter === 'All' || t.status === filter) &&
    (t.customer.toLowerCase().includes(search.toLowerCase()) || 
     t.vendor.toLowerCase().includes(search.toLowerCase()) ||
     t.id.toLowerCase().includes(search.toLowerCase()))
  );

  filteredTransactions.sort((a, b) => {
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
    return 0; // default 'newest' keeps array order
  });

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Transactions Ledger</h1>
          <p className="text-body-md text-on-surface-variant">Monitor all platform transactions and fraud flags</p>
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full xl:w-auto">
          {/* Search Bar */}
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
            <input 
              type="text" 
              placeholder="Search ID, User, Vendor..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 focus:w-full sm:focus:w-72 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] transition-all duration-300"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl px-4 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
            >
              <option value="All">All Statuses</option>
              <option value="Approved">Approved</option>
              <option value="Flagged">Flagged</option>
              <option value="Rejected">Rejected</option>
            </select>

            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl px-4 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
            >
              <option value="newest">Newest First</option>
              <option value="amount_high">Amount (High-Low)</option>
              <option value="amount_low">Amount (Low-High)</option>
            </select>

            <button className="h-10 px-4 bg-primary text-white rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shrink-0 w-full sm:w-auto">
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span className="sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-[#f8f9fc]">
                <th className="p-4 font-bold">Transaction ID</th>
                <th className="p-4 font-bold">Time</th>
                <th className="p-4 font-bold">Customer</th>
                <th className="p-4 font-bold">Vendor</th>
                <th className="p-4 font-bold text-right">Amount</th>
                <th className="p-4 font-bold text-right">Cashback</th>
                <th className="p-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className={`border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px] ${tx.status === 'Flagged' ? 'bg-red-500/5' : ''}`}>
                  <td className="p-4 font-mono text-on-surface-variant">
                    {tx.id}
                    <div className="text-[11px] mt-0.5">{tx.type}</div>
                  </td>
                  <td className="p-4 text-on-surface-variant text-[12px]">{tx.time}</td>
                  <td className="p-4 font-medium text-on-surface">{tx.customer}</td>
                  <td className="p-4 text-on-surface-variant">{tx.vendor}</td>
                  <td className="p-4 font-bold text-on-surface text-right">{tx.amount}</td>
                  <td className="p-4 font-bold text-primary text-right">{tx.cashback}</td>
                  <td className="p-4 flex justify-center">
                    <span className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide flex items-center gap-1
                      ${tx.status === 'Approved' ? 'bg-green-500/10 text-green-600' : ''}
                      ${tx.status === 'Flagged' ? 'bg-red-500 text-white animate-pulse shadow-md' : ''}
                      ${tx.status === 'Rejected' ? 'bg-outline-variant/20 text-on-surface-variant' : ''}
                    `}>
                      {tx.status === 'Flagged' && <span className="material-symbols-outlined text-[14px]">warning</span>}
                      {tx.status}
                    </span>
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
