import { useState } from 'react';

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState('This Month');

  const userGrowth = [30, 45, 60, 55, 75, 100];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

  const categories = [
    { name: 'Food & Beverage', percentage: 45, color: 'bg-primary' },
    { name: 'Fashion & Apparel', percentage: 25, color: 'bg-purple-500' },
    { name: 'Electronics', percentage: 15, color: 'bg-blue-500' },
    { name: 'Services', percentage: 10, color: 'bg-teal-500' },
    { name: 'Other', percentage: 5, color: 'bg-outline-variant' },
  ];


  return (
    <div className="space-y-6 animate-reveal text-left pb-10">
      <div>
        <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Analytics & Insights</h1>
        <p className="text-body-md text-on-surface-variant">Deep dive into platform usage and growth metrics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* User Growth Chart */}
        <div className="bg-white p-6 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <h3 className="font-title-lg font-bold text-on-surface mb-2">User Growth (Last 6 Months)</h3>
          <p className="text-[13px] text-on-surface-variant mb-6">Total active customer accounts registered on the platform.</p>
          
          <div className="h-56 flex items-end justify-between gap-4 pb-6 relative">
            {/* Background grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pb-6 opacity-10 pointer-events-none">
              <div className="border-t border-on-surface w-full"></div>
              <div className="border-t border-on-surface w-full"></div>
              <div className="border-t border-on-surface w-full"></div>
              <div className="border-t border-on-surface w-full"></div>
            </div>

            {userGrowth.map((val, idx) => (
              <div key={idx} className="w-full relative group flex flex-col items-center justify-end h-full z-10">
                <div 
                  className="w-full bg-primary/20 rounded-t-lg transition-all duration-500 group-hover:bg-primary"
                  style={{ height: `${val}%` }}
                ></div>
                <div className="absolute bottom-[-24px] text-[12px] text-on-surface-variant font-bold">
                  {months[idx]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vendor Categories */}
        <div className="bg-white p-6 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <h3 className="font-title-lg font-bold text-on-surface mb-2">Vendor Category Distribution</h3>
          <p className="text-[13px] text-on-surface-variant mb-6">Breakdown of registered vendors by business type.</p>
          
          <div className="space-y-4">
            {categories.map((cat, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-[13px] font-bold">
                  <span className="text-on-surface">{cat.name}</span>
                  <span className="text-on-surface-variant">{cat.percentage}%</span>
                </div>
                <div className="h-3 w-full bg-surface-container-low rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${cat.color} rounded-full`}
                    style={{ width: `${cat.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Vendors */}
        <div className="bg-white p-6 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <h3 className="font-title-lg font-bold text-on-surface mb-6">Top Vendors by Volume</h3>
          
          <div className="space-y-4">
            {[
              { name: 'Noir Concept Store', amount: '₹1.2M', transactions: 450 },
              { name: 'Fresh Mart', amount: '₹840K', transactions: 1200 },
              { name: 'Elite Electronics', amount: '₹650K', transactions: 45 },
            ].map((vendor, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 rounded-xl border border-outline-variant/10">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[14px]">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <h4 className="text-[14px] font-bold text-on-surface">{vendor.name}</h4>
                  <p className="text-[11px] text-on-surface-variant">{vendor.transactions} transactions</p>
                </div>
                <div className="font-display font-black text-primary text-[16px]">
                  {vendor.amount}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Peak Activity Heatmap (Mocked) */}
        <div className="bg-white rounded-xl border border-outline-variant/5 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-x-auto">
          <h3 className="font-title-md font-bold text-on-surface mb-2">Peak Activity Hours</h3>
          <p className="text-body-sm text-on-surface-variant mb-6">Darker squares indicate higher transaction volume.</p>
          
          <div className="min-w-[400px]">
            <div className="flex mb-2">
              <div className="w-16 flex-shrink-0"></div>
              <div className="flex-1 grid grid-cols-7 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="text-center text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{day}</div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {[
                { label: 'Morning', time: '6AM-12PM' },
                { label: 'Afternoon', time: '12PM-6PM' },
                { label: 'Evening', time: '6PM-12AM' },
                { label: 'Night', time: '12AM-6AM' }
              ].map((row, rIndex) => (
                <div key={rIndex} className="flex items-center">
                  <div className="w-16 flex-shrink-0 text-[10px] text-on-surface-variant pr-2 text-right leading-tight">
                    <span className="block font-bold">{row.label}</span>
                    <span className="block text-[9px]">{row.time}</span>
                  </div>
                  <div className="flex-1 grid grid-cols-7 gap-2">
                    {[...Array(7)].map((_, cIndex) => {
                      // Deterministic mock data based on index so it doesn't flash on re-renders
                      const intensity = [1, 3, 2, 4, 1, 0, 2, 2, 4, 3, 4, 2, 1, 3, 3, 4, 4, 3, 2, 2, 4, 0, 1, 1, 2, 1, 0, 1][rIndex * 7 + cIndex];
                      const colors = ['bg-primary/10', 'bg-primary/30', 'bg-primary/50', 'bg-primary/70', 'bg-primary'];
                      return (
                        <div 
                          key={cIndex} 
                          className={`aspect-square rounded-md ${colors[intensity]} hover:ring-2 hover:ring-primary/50 hover:scale-105 transition-all cursor-pointer`}
                          title={`${row.label} (${row.time}) on ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][cIndex]}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
