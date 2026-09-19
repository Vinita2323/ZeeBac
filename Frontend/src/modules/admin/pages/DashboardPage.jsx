import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAPI } from '../../../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [revenueChart, setRevenueChart] = useState({ labels: [], amounts: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, txRes, revenueRes] = await Promise.all([
          AdminAPI.getDashboardStats(),
          AdminAPI.getAllTransactions(1, '', ''),
          AdminAPI.getRevenueAnalytics()
        ]);
        setData(statsRes.data);
        setRecentTransactions(txRes.data?.slice(0, 5) || []);
        if (revenueRes.success) setRevenueChart(revenueRes.data);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const stats = [
    { label: 'Total Users', value: data?.totalUsers || 0, icon: 'groups', trend: 'Total registered customers', color: 'text-primary', bg: 'bg-primary/10', path: '/admin/users' },
    { label: 'Total Vendors', value: data?.totalVendors || 0, icon: 'storefront', trend: `${data?.pendingVendors || 0} pending approval`, color: 'text-orange-500', bg: 'bg-orange-500/10', path: '/admin/vendors' },
    { label: 'Support Tickets', value: data?.openSupportTickets || 0, icon: 'support_agent', trend: `${data?.openSupportTickets || 0} need attention`, color: data?.openSupportTickets > 0 ? 'text-amber-600' : 'text-purple-600', bg: data?.openSupportTickets > 0 ? 'bg-amber-500/10' : 'bg-purple-500/10', path: '/admin/support', isAlert: (data?.openSupportTickets || 0) > 0 },
    { label: 'Total Revenue', value: `₹${(data?.totalRevenue || 0).toLocaleString()}`, icon: 'payments', trend: 'Total volume processed', color: 'text-green-600', bg: 'bg-green-500/10', path: '/admin/transactions' },
    { label: 'Total Txns', value: data?.totalTransactions || 0, icon: 'receipt_long', trend: 'Total transactions', color: 'text-secondary', bg: 'bg-secondary/10', path: '/admin/transactions' },
  ];

  const pendingVendors = []; // We can fetch recent pending vendors if needed later

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Platform Overview</h1>
          <p className="text-body-md text-on-surface-variant">Real-time metrics and system health</p>
        </div>
      </div>

      {/* Support Alert Banner if open tickets exist */}
      {(data?.openSupportTickets || 0) > 0 && (
        <div 
          onClick={() => navigate('/admin/support')}
          className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-amber-100/60 transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[20px] animate-pulse">support_agent</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-amber-900 leading-snug">
                {data.openSupportTickets} Support Ticket{data.openSupportTickets === 1 ? '' : 's'} Pending Response
              </p>
              <p className="text-[12px] text-amber-800/80">
                Customers or merchants have submitted support inquiries that need admin review.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[12px] font-bold text-amber-900 bg-white px-3 py-1.5 rounded-xl border border-amber-200 shrink-0">
            Open Support Panel
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </span>
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, idx) => (
          <div 
            key={idx} 
            onClick={() => stat.path && navigate(stat.path)}
            className="bg-white p-4 rounded-xl border border-outline-variant/5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
          >
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                <span className="material-symbols-outlined text-[20px]">{stat.icon}</span>
              </div>
              {stat.isAlert && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" title="Needs Attention"></span>
              )}
            </div>
            <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">{stat.label}</p>
            <h3 className="font-display text-[24px] font-bold text-on-surface leading-none mt-1 mb-1.5">{stat.value}</h3>
            <p className={`text-[11px] font-medium ${stat.isAlert ? 'text-amber-600 font-bold' : stat.color === 'text-orange-500' ? 'text-orange-500 font-bold' : 'text-on-surface-variant'}`}>{stat.trend}</p>
          </div>
        ))}
      </div>

      {/* Middle Row: Chart & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Volume Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-outline-variant/5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-title-md font-bold text-on-surface">Transaction Volume</h3>
            <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">Last 7 Days</span>
          </div>
          
          <div className="h-44 flex items-end justify-between gap-4 pb-2 px-2">
            {revenueChart.amounts.map((val, idx) => {
              const maxVal = Math.max(...revenueChart.amounts, 1);
              const heightPercent = (val / maxVal) * 100;
              return (
                <div key={idx} className="w-full max-w-[40px] relative group flex flex-col items-center justify-end h-full">
                  <div 
                    className="w-full bg-primary/80 rounded-t-md transition-all duration-300 group-hover:bg-primary group-hover:shadow-[0_0_12px_rgba(98,0,234,0.3)]"
                    style={{ height: `${heightPercent}%` }}
                    title={`₹${val.toLocaleString()}`}
                  ></div>
                  <div className="absolute bottom-[-22px] text-[10px] text-on-surface-variant font-medium">
                    {revenueChart.labels[idx]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform Health */}
        <div className="bg-white p-5 rounded-xl border border-outline-variant/5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <h3 className="font-title-md font-bold text-on-surface mb-5">System Health</h3>
          <div className="space-y-4">
            {[
              { name: 'Core API', status: 'Operational', color: 'bg-green-500' },
              { name: 'Payment Gateway', status: 'Operational', color: 'bg-green-500' },
              { name: 'SMS Verification', status: 'Degraded', color: 'bg-orange-500' },
              { name: 'Fraud Engine', status: 'Operational', color: 'bg-green-500' },
            ].map((system, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-on-surface-variant">{system.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-on-surface">{system.status}</span>
                  <div className={`w-2 h-2 rounded-full ${system.color}`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Transactions */}
        <div className="bg-white rounded-xl border border-outline-variant/5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="p-4 border-b border-outline-variant/5 flex justify-between items-center bg-[#fafafa]">
            <h3 className="font-title-md font-bold text-on-surface text-[14px]">Live Transactions</h3>
            <button className="text-primary text-[12px] font-bold hover:underline">View All</button>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-outline-variant/5 text-[10px] uppercase tracking-wider text-on-surface-variant bg-white">
                  <th className="px-4 py-3 font-bold">User</th>
                  <th className="px-4 py-3 font-bold">Vendor</th>
                  <th className="px-4 py-3 font-bold text-right">Amount</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[12px]">
                    <td className="px-4 py-3 font-bold text-on-surface">{tx.customerName}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{tx.vendorName}</td>
                    <td className="px-4 py-3 font-bold text-on-surface text-right">₹{tx.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 flex justify-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                        ${tx.status === 'Approved' ? 'bg-green-500/10 text-green-600' : ''}
                        ${tx.status === 'Flagged' ? 'bg-red-500/10 text-red-600 animate-pulse' : ''}
                        ${tx.status === 'Rejected' ? 'bg-outline-variant/20 text-on-surface-variant' : ''}
                        ${tx.status === 'Pending' ? 'bg-orange-500/10 text-orange-600' : ''}
                      `}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center py-4 text-on-surface-variant text-xs">No recent transactions</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Vendors */}
        <div className="bg-white rounded-xl border border-outline-variant/5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-outline-variant/5 flex justify-between items-center bg-[#fafafa]">
            <h3 className="font-title-md font-bold text-on-surface text-[14px]">Verification Queue</h3>
            <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{data?.pendingVendors || 0} Pending</span>
          </div>
          <div className="p-3 space-y-2 flex-1">
            {pendingVendors.map((vendor, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-outline-variant/5 hover:border-primary/20 transition-colors bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-surface-container-low rounded-md flex items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px]">storefront</span>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-on-surface leading-tight">{vendor.name}</h4>
                    <p className="text-[11px] text-on-surface-variant">{vendor.category} • {vendor.date}</p>
                  </div>
                </div>
                <button className="px-3 py-1 bg-primary/10 text-primary font-bold text-[11px] rounded-md hover:bg-primary hover:text-white transition-colors">
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
