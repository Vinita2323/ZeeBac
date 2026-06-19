import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const tabs = ['All', 'Pending', 'Approved', 'Rejected'];

  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const txns = JSON.parse(localStorage.getItem('zeebac_transactions') || '[]');
    const currentUser = JSON.parse(localStorage.getItem('zeebac_current_user') || '{}');
    
    const myTxns = txns.filter(t => t.vendorId === currentUser.zeebacId || t.vendorPhone === currentUser.phone);
    
    const formatted = myTxns.map(t => ({
      id: t.id,
      customer: t.customerName,
      amount: `₹${t.purchaseAmount.toLocaleString()}`,
      time: new Date(t.timestamp).toLocaleString(),
      status: 'Approved',
      hasReceipt: false
    }));

    if (formatted.length === 0) {
      formatted.push({ id: 'dummy', customer: 'Welcome transaction', amount: '₹0', time: 'Just now', status: 'Approved', hasReceipt: false });
    }
    
    setTransactions(formatted);
  }, []);

  const filteredTransactions = transactions.filter(t => {
    const matchesTab = activeTab === 'All' || t.status === activeTab;
    const matchesSearch = t.customer.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'Approved': return 'text-green-600 bg-green-500/10 border-green-500/20';
      case 'Rejected': return 'text-red-600 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-500 bg-gray-100 border-gray-200';
    }
  };

  return (
    <div className="animate-reveal text-left">

      {/* Mobile Header — like user app sub-pages */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Transactions</span>
      </header>

      <div className="space-y-6 pt-4">
        {/* Search Bar */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID or customer..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-outline-variant/10 focus:border-primary rounded-2xl outline-none transition-all text-[14px] font-medium shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
          />
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-container-low p-1.5 rounded-2xl overflow-x-auto scroll-hide">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2 rounded-xl font-bold text-[13px] whitespace-nowrap transition-all active:scale-[0.97] ${activeTab === tab
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Transaction Cards */}
        <div className="space-y-3">
          {filteredTransactions.map(trx => (
            <div key={trx.id} className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 active:scale-[0.98] transition-transform">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-primary/5 rounded-full flex items-center justify-center text-primary font-bold text-lg border border-primary/10">
                    {trx.customer.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-on-surface">{trx.customer}</h4>
                    <p className="text-on-surface-variant font-label-mono text-[11px] mt-0.5">{trx.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-on-surface text-[16px]">{trx.amount}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/5">
                <span className="text-on-surface-variant text-[12px]">{trx.time}</span>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getStatusColor(trx.status)}`}>
                  {trx.status}
                </span>
              </div>

              {trx.status === 'Pending' && trx.hasReceipt && (
                <div
                  onClick={() => alert('Viewing attached receipt...')}
                  className="mt-3 flex items-center justify-between bg-surface-container-low/50 border border-outline-variant/10 rounded-lg p-1.5 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-1.5 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">View Attached Receipt</span>
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-primary">visibility</span>
                </div>
              )}

              {trx.status === 'Pending' && (
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => alert(`Rejected ${trx.id}`)}
                    className="flex-1 py-2.5 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 text-[13px] font-bold transition-colors active:scale-[0.97]"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => alert(`Approved ${trx.id}`)}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-fixed-variant text-[13px] font-bold shadow-sm transition-colors shadow-primary/20 active:scale-[0.97]"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          ))}

          {filteredTransactions.length === 0 && (
            <div className="py-12 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">search_off</span>
              <p className="font-bold text-[16px]">No transactions found</p>
              <p className="text-[14px]">Try changing your filters.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
