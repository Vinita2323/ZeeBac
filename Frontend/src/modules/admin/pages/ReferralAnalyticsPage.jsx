import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function ReferralAnalyticsPage() {
  const [stats, setStats] = useState({
    totalReferrals: 0,
    totalPayouts: '₹0',
    conversionRate: '0%',
    topReferrers: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await AdminAPI.getReferralStats();
        if (res.success) {
          setStats(res.data);
        }
      } catch (err) {
        console.error("Failed to load referral stats:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (isLoading) return <div className="p-8 text-center text-on-surface-variant font-bold">Loading Stats...</div>;

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Referral Analytics</h1>
          <p className="text-body-md text-on-surface-variant mt-1">Track virality and referral program costs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-outline-variant/10 rounded-2xl p-5 shadow-sm">
          <p className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider">Total Referrals</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-primary text-[28px] font-black leading-none">{stats.totalReferrals}</h3>
          </div>
        </div>
        <div className="bg-white border border-outline-variant/10 rounded-2xl p-5 shadow-sm">
          <p className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider">Total Payouts</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-primary text-[28px] font-black leading-none">{stats.totalPayouts}</h3>
          </div>
        </div>
        <div className="bg-white border border-outline-variant/10 rounded-2xl p-5 shadow-sm">
          <p className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider">Conversion Rate</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-primary text-[28px] font-black leading-none">{stats.conversionRate}</h3>
            <span className="text-on-surface-variant text-[12px] font-medium">of invites accepted</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-outline-variant/10 rounded-2xl flex flex-col shadow-sm overflow-hidden">
        <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
          <h2 className="text-on-surface font-bold text-[15px]">Top Referrers</h2>
          <button className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-bold text-[11px] hover:bg-primary hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[14px]">download</span> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/10 bg-[#f8f9fc]">
                <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">User</th>
                <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Successful Invites</th>
                <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Earned</th>
                <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {stats.topReferrers.map((user, i) => (
                <tr key={i} className="hover:bg-surface-container-low transition-colors">
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[12px]">
                        {user.name.charAt(0)}
                      </div>
                      <p className="text-on-surface font-bold text-[13px]">{user.name}</p>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-[13px] text-on-surface-variant font-medium">{user.invites}</td>
                  <td className="py-4 px-5 text-[13px] text-green-600 font-bold">{user.earned}</td>
                  <td className="py-4 px-5">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      user.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-surface-container text-on-surface-variant'
                    }`}>
                      {user.status}
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
