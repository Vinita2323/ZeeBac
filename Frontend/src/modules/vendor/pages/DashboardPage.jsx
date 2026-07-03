import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI } from '../../../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [showQRModal, setShowQRModal] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const zeebacId = currentUser.zeebacId || 'ZBV-0000';
  const qrData = `zeebac://vendor/${zeebacId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=96-0-218&data=${encodeURIComponent(qrData)}`;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, txnsRes] = await Promise.all([
          VendorAPI.getDashboardStats(),
          VendorAPI.getTransactions()
        ]);
        setDashboardData(statsRes);
        if (txnsRes.success) {
          // Take top 5 transactions for dashboard
          setRecentTransactions(txnsRes.data.slice(0, 5).map(t => ({
            id: t.transactionId,
            customer: t.customerName || t.customerPhone,
            amount: `₹${t.amount.toLocaleString()}`,
            cashback: `₹${t.cashbackAmount?.toLocaleString()}`,
            time: new Date(t.timestamp).toLocaleDateString(),
            status: t.status
          })));
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const stats = [
    { label: 'Total Revenue', value: dashboardData ? `₹${dashboardData.data?.totalRevenue?.toLocaleString() || 0}` : '₹0', icon: 'payments', trend: 'All time', color: 'text-green-600', bg: 'bg-green-500/10', link: '/vendor/passbook' },
    { label: 'Cashback Given', value: dashboardData ? `₹${dashboardData.data?.totalCashbackGiven?.toLocaleString() || 0}` : '₹0', icon: 'savings', trend: 'All time', color: 'text-orange-500', bg: 'bg-orange-500/10', link: '/vendor/passbook' },
    { label: 'Total TXNs', value: dashboardData ? dashboardData.data?.totalTransactions || 0 : '0', icon: 'sync_alt', trend: 'All time', color: 'text-primary', bg: 'bg-primary/10', link: '/vendor/passbook' },
    { label: 'Customers', value: dashboardData ? dashboardData.data?.totalCustomers || 0 : '0', icon: 'groups', trend: 'Unique', color: 'text-secondary', bg: 'bg-secondary/10', link: '/vendor/customers' },
  ];

  // Restoring pending requests UI for Phase 4 (Customer-initiated transactions)
  const pendingRequests = [
    { id: 'TRX-9921', customer: 'Rahul Sharma', amount: '₹850', cashback: '₹85', time: '2 mins ago', hasReceipt: true, paymentMethod: 'Card' },
    { id: 'TRX-9920', customer: 'Sneha Patel', amount: '₹1,200', cashback: '₹120', time: '15 mins ago', hasReceipt: false, paymentMethod: 'UPI' },
  ];

  return (
    <div className="space-y-6 pt-2 pb-6 text-left">

      {/* Top Section: Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Welcome back</p>
          <h1 className="font-display text-[18px] font-black text-on-surface leading-none tracking-tight">
            {currentUser.storeName || 'Noir Concept Store'}
          </h1>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 max-w-[350px] mx-auto w-full">
        <button 
          onClick={() => navigate('/vendor/scan-customer')}
          className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary text-white shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
          </div>
          <div className="text-left">
            <p className="text-[12px] font-bold leading-tight">Scan Customer</p>
            <p className="text-[9px] text-white/70">Log a transaction</p>
          </div>
        </button>
        <button 
          onClick={() => setShowQRModal(true)}
          className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-outline-variant/15 text-on-surface shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
          </div>
          <div className="text-left">
            <p className="text-[12px] font-bold leading-tight">My Store QR</p>
            <p className="text-[9px] text-on-surface-variant">Show to customers</p>
          </div>
        </button>
      </div>

      {/* Stats Grid - 2x2 Compact */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, index) => (
          <div 
            key={index} 
            onClick={() => navigate(stat.link)}
            className="bg-white rounded-2xl p-3.5 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] cursor-pointer hover:shadow-md hover:border-primary/20 transition-all active:scale-[0.98]"
          >
            <div className="flex justify-between items-start mb-2">
              <div className={`w-8 h-8 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center`}>
                <span className="material-symbols-outlined text-[16px]">{stat.icon}</span>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${stat.trend === 'Action needed' ? 'bg-orange-100 text-orange-700' : 'bg-surface-container text-on-surface-variant'}`}>
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="text-on-surface-variant text-[11px] font-medium mb-0.5">{stat.label}</p>
              <h3 className="text-[20px] font-black text-on-surface leading-none tracking-tight">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Action Required (Pending Approvals) - Preserved for Phase 4 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[16px] font-extrabold text-on-surface">Action Required</h3>
          <button 
            onClick={() => navigate('/vendor/transactions')} 
            className="text-[12px] text-primary font-bold cursor-pointer hover:underline"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {pendingRequests.map(req => (
            <div key={req.id} className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-3 flex gap-3 items-start">
              <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 font-bold border border-orange-100 flex-shrink-0">
                {req.customer.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-[14px] text-on-surface truncate">{req.customer}</h4>
                  <p className="font-black text-[14px] text-on-surface">{req.amount}</p>
                </div>
                <div className="flex justify-between items-center mt-0.5">
                  <p className="text-[11px] text-on-surface-variant">{req.time} <span className="mx-1">•</span> Paid via: {req.paymentMethod}</p>
                  <p className="text-[10px] text-green-600 font-bold">CB: {req.cashback}</p>
                </div>

                {req.hasReceipt && (
                  <div
                    onClick={() => alert('Viewing attached receipt...')}
                    className="mt-2.5 flex items-center justify-between bg-surface-container-low/50 border border-outline-variant/10 rounded-lg p-1.5 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-1.5 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">View Attached Receipt</span>
                    </div>
                    <span className="material-symbols-outlined text-[14px] text-primary">visibility</span>
                  </div>
                )}

                <div className="flex gap-2 mt-2.5">
                  <button className="flex-1 py-1.5 rounded-lg text-red-600 bg-red-50 text-[11px] font-bold">Reject</button>
                  <button className="flex-1 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold shadow-sm">Approve</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h3 className="font-display text-[16px] font-extrabold text-on-surface">Recent Activity</h3>

        <div className="space-y-3">
          {recentTransactions.map(tx => (
            <div key={tx.id} className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-outline-variant/10 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  tx.status === 'Approved' ? 'bg-green-500/10 text-green-600' : 
                  tx.status === 'Rejected' ? 'bg-red-500/10 text-red-600' : 'bg-orange-500/10 text-orange-600'
                }`}>
                  <span className="material-symbols-outlined text-[20px]">{tx.status === 'Approved' ? 'check_circle' : tx.status === 'Rejected' ? 'cancel' : 'pending'}</span>
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-on-surface leading-tight">{tx.customer}</h3>
                  <p className="text-[11px] text-on-surface-variant">{tx.id} • {tx.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-black text-on-surface">{tx.amount}</p>
                <p className={`text-[10px] font-bold ${tx.status === 'Approved' ? 'text-green-600' : 'text-on-surface-variant'}`}>{tx.status}</p>
              </div>
            </div>
          ))}
          {recentTransactions.length === 0 && (
            <div className="text-center py-6 text-on-surface-variant">
              No recent transactions
            </div>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showQRModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
          <div className="bg-white w-full max-w-[320px] rounded-3xl p-6 shadow-2xl relative mx-auto">
            <button 
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            
            <div className="flex flex-col items-center pt-2">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-4">
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
              </div>
              <h3 className="font-display font-bold text-[20px] text-on-surface text-center leading-tight">My Store QR</h3>
              <p className="text-[13px] text-on-surface-variant text-center mt-1 mb-6 px-4">
                Show this code to customers for instant payments and cashback
              </p>
              
              <div className="bg-[#fcfaff] border-2 border-secondary/20 rounded-3xl p-5 w-56 h-56 flex items-center justify-center shadow-inner mb-6">
                <img src={qrUrl} alt="Store QR" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              
              <div className="bg-surface-container py-2 px-4 rounded-full flex items-center gap-2">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Store ID:</span>
                <span className="text-[14px] font-black tracking-widest text-on-surface">{zeebacId}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
