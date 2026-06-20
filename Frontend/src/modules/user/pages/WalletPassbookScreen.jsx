import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';

export default function WalletPassbookScreen() {
  const navigate = useNavigate();
  const authBalance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};

  const [activeTab, setActiveTab] = useState('Transactions'); // 'Transactions' or 'Cashback Audits'
  
  const [transactions, setTransactions] = useState([]);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    // Load Transactions
    const txns = JSON.parse(localStorage.getItem('zeebac_transactions') || '[]');
    const myTxns = txns.filter(t => t.customerId === currentUser.zeebacId || t.customerPhone === currentUser.phone);
    
    const formattedTx = myTxns.map(t => {
      const isCredit = !!t.cashbackAmount;
      const displayAmount = isCredit ? `+₹${t.cashbackAmount.toFixed(2)}` : `-₹${t.amount.toFixed(2)}`;
      const tagText = isCredit ? 'Cashback' : 'Payment';
      const tagIcon = isCredit ? 'redeem' : 'payments';
      
      return {
        id: t.id,
        name: t.vendorName || "ZeeBac Partner",
        time: new Date(t.timestamp).toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true, month: 'short', day: 'numeric' }),
        amount: displayAmount,
        type: isCredit ? "Credited" : "Debited",
        tag: tagText,
        tagIcon: tagIcon,
        icon: "storefront",
        from: "ZeeBac Wallet"
      };
    });

    if (formattedTx.length === 0) {
      formattedTx.push({
        id: 'dummy',
        name: "Welcome Bonus",
        time: "Just now",
        amount: "+₹50.00",
        type: "Credited",
        tag: "Reward",
        tagIcon: "featured_seasonal_and_gifts",
        icon: "card_giftcard",
        from: "ZeeBac"
      });
    }
    setTransactions(formattedTx);

    // Load Cashback Requests
    const storedReq = JSON.parse(localStorage.getItem('cashback_requests') || '[]');
    setRequests(storedReq);
  }, [currentUser]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="bg-green-100 text-green-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Approved</span>;
      case 'Rejected':
        return <span className="bg-red-100 text-red-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Rejected</span>;
      default:
        return <span className="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Pending</span>;
    }
  };

  return (
    <div className="bg-white text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Top Gradient Area */}
      <div className="bg-primary/5 pt-4 pb-6 px-container-margin rounded-b-[24px]">
        {/* Header */}
        <header className="flex items-center gap-3 mb-6">
          <button 
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center text-on-surface active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <h1 className="font-display text-title-lg text-primary font-bold tracking-tight">Balance & History</h1>
        </header>

        {/* Your Accounts Section */}
        <div className="space-y-3">
          <h2 className="font-title-md text-on-surface font-bold text-body-lg px-1">Your Accounts</h2>
          
          {/* Horizontal scroll for cards */}
          <div className="flex gap-4 overflow-x-auto pb-2 scroll-hide">
            
            {/* ZeeBac Wallet Card */}
            <div className="min-w-[220px] bg-gradient-to-br from-[#420093] via-[#5B00C2] to-[#31006E] rounded-[16px] p-3 text-white shadow-md relative overflow-hidden flex flex-col justify-between h-[110px]">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm tracking-wide">ZeeBac Wallet</h3>
                  <p className="text-[10px] text-white/80 mt-0.5">A/c No: {currentUser.phone ? currentUser.phone.slice(-4) : 'XXXX'}</p>
                </div>
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center shadow-inner">
                  <span className="material-symbols-outlined text-white text-[14px]">account_balance_wallet</span>
                </div>
              </div>
              <button 
                onClick={() => navigate('/wallet')}
                className="bg-white hover:bg-white/90 text-primary text-xs font-bold py-1.5 rounded-lg w-full transition-colors active:scale-[0.98]"
              >
                Check Balance
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin pt-6 text-left space-y-md">
        
        {/* Payment History Header */}
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-title-md text-[#1A202C] font-black tracking-tight">Payment History</h2>
          <div className="flex items-center gap-4 text-[#4A5568]">
            <button className="active:scale-95 transition-transform"><span className="material-symbols-outlined text-[24px]">search</span></button>
            <button className="active:scale-95 transition-transform"><span className="material-symbols-outlined text-[24px]">tune</span></button>
            <button className="active:scale-95 transition-transform"><span className="material-symbols-outlined text-[24px]">download</span></button>
          </div>
        </div>

        {/* Tab Toggle for ZeeBac logic */}
        <div className="bg-surface-variant/40 p-1 rounded-xl flex mx-1 mt-2">
          <button 
            onClick={() => setActiveTab('Transactions')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'Transactions' ? 'bg-white text-[#1A202C] shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Transactions
          </button>
          <button 
            onClick={() => setActiveTab('Cashback')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'Cashback' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Cashback History
          </button>
        </div>

        {activeTab === 'Transactions' ? (
          <div className="mt-4">
            {/* Month Header */}
            <div className="bg-primary/5 flex justify-between items-center py-2 px-3 rounded-lg mx-1 mb-2">
               <span className="font-bold text-primary text-sm">Recent Activity</span>
               <div className="flex items-center gap-1.5">
                 <div className="text-right">
                   <p className="text-[10px] text-on-surface-variant leading-tight">Current Balance</p>
                   <p className="font-bold text-primary text-xs">₹{authBalance.toFixed(2)}</p>
                 </div>
                 <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
                   <span className="material-symbols-outlined text-primary text-[14px]">chevron_right</span>
                 </div>
               </div>
            </div>

            <div className="space-y-0">
              {transactions.length > 0 ? (
                transactions.map((tx, idx) => (
                  <div key={tx.id} className={`p-3 flex items-start gap-3 ${idx !== transactions.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    {/* Circular Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'Credited' ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
                      <span className="material-symbols-outlined text-[20px]">{tx.icon}</span>
                    </div>
                    
                    {/* Center Details */}
                    <div className="flex-grow space-y-0.5">
                      <h4 className="font-bold text-on-surface text-sm leading-tight">{tx.name}</h4>
                      <p className="text-on-surface-variant text-[11px]">{tx.time}</p>
                      
                      {/* Tag Pill */}
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full mt-1 ${tx.type === 'Credited' ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
                        <span className="material-symbols-outlined text-[10px]">{tx.tagIcon}</span>
                        <span className="font-bold text-[9px]">{tx.tag}</span>
                      </div>
                    </div>

                    {/* Right Amount */}
                    <div className="text-right space-y-1">
                      <p className={`font-display font-bold text-sm ${tx.type === 'Credited' ? 'text-green-600' : 'text-on-surface'}`}>{tx.amount}</p>
                      <p className="text-[10px] text-on-surface-variant flex items-center justify-end gap-1">
                        From <span className="w-3 h-3 bg-primary rounded-full flex items-center justify-center text-white text-[8px] font-bold">Z</span>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center space-y-2 opacity-60">
                  <span className="material-symbols-outlined text-[32px]">history</span>
                  <p className="text-sm font-bold">No transactions found</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 mt-4 mx-1">
            {requests.length > 0 ? (
                requests.map((req) => (
                  <div 
                    key={req.id}
                    onClick={() => navigate(`/request/${req.id}`)}
                    className="bg-white rounded-2xl p-4 border border-outline-variant/30 flex flex-col gap-sm shadow-sm hover:shadow-md cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-left space-y-0.5">
                        <h4 className="font-title-md text-[#1A202C] font-extrabold text-body-lg leading-tight">{req.vendorName}</h4>
                        <p className="font-label-mono text-[11px] text-outline">ID: {req.id}</p>
                      </div>
                      {getStatusBadge(req.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-sm pt-xs border-t border-outline-variant/10 text-body-sm text-on-surface-variant">
                      <div>
                        <p className="font-caption text-[10px] uppercase">Bill Amount</p>
                        <p className="font-bold text-[#1A202C]">₹{req.amount}</p>
                      </div>
                      <div>
                        <p className="font-caption text-[10px] uppercase text-secondary font-bold">Est. Cashback</p>
                        <p className="font-bold text-secondary">₹{req.cashbackAmount}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center space-y-2 opacity-60">
                  <span className="material-symbols-outlined text-[32px]">receipt_long</span>
                  <p className="text-sm font-bold">No audits found</p>
                </div>
              )}
          </div>
        )}
      </main>

      <BottomNavBar />
    </div>
  );
}
