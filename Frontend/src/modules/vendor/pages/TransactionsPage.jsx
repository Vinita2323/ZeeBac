import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  const tabs = ['All', 'Pending', 'Approved', 'Rejected'];

  const [transactions, setTransactions] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await VendorAPI.getTransactions();
        if (res.success) {
          const formatted = res.data.map(t => ({
            id: t.transactionId,
            customer: t.customerName || t.customerPhone,
            amount: `₹${t.amount.toLocaleString()}`,
            time: new Date(t.timestamp).toLocaleString(),
            status: t.status,
            hasReceipt: t.hasReceipt,
            receiptUrl: t.receiptUrl
          }));
          setTransactions(formatted);
        }
      } catch (err) {
        console.error("Failed to fetch transactions", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
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
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Transactions</span>
      </header>

      <div className="space-y-3.5 pt-1">
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
          {loading ? (
            <div className="py-10 text-center">
               <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
               <p className="font-bold text-on-surface-variant">Loading...</p>
            </div>
          ) : filteredTransactions.length > 0 ? filteredTransactions.map(trx => (
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

              {trx.status === 'Pending' && (trx.hasReceipt || trx.receiptUrl) && (
                <div
                  onClick={() => {
                    if (trx.receiptUrl) setViewReceiptUrl(trx.receiptUrl);
                    else alert('Receipt URL not found');
                  }}
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
                    onClick={() => alert(`Please use the 'Requests' page to approve or reject pending cashback claims.`)}
                    className="flex-1 py-2.5 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 text-[13px] font-bold transition-colors active:scale-[0.97]"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => alert(`Please use the 'Requests' page to approve or reject pending cashback claims.`)}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-fixed-variant text-[13px] font-bold shadow-sm transition-colors shadow-primary/20 active:scale-[0.97]"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          )) : (
            <div className="py-12 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">search_off</span>
              <p className="font-bold text-[16px]">No transactions found</p>
              <p className="text-[14px]">Try changing your filters.</p>
            </div>
          )}
        </div>
      </div>

      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setViewReceiptUrl(null)}>
          <div className="relative max-w-full max-h-full">
            <button 
              onClick={() => setViewReceiptUrl(null)}
              className="absolute -top-10 right-0 text-white p-2"
            >
              <span className="material-symbols-outlined text-3xl">close</span>
            </button>
            <img src={viewReceiptUrl} alt="Receipt" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}

    </div>
  );
}
