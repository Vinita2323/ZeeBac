export default function FraudDetectionPage() {
  const alerts = [
    { id: 1, type: "High Volume", description: "15 transactions in 5 minutes", vendor: "Cafe Mocha", time: "10 mins ago", risk: "High" },
    { id: 2, type: "Velocity Limit", description: "Exceeded daily limit by 300%", vendor: "Tech Hub", time: "1 hour ago", risk: "Critical" },
    { id: 3, type: "Failed OTPs", description: "5 failed attempts from same IP", vendor: "N/A", time: "2 hours ago", risk: "Medium" }
  ];

  const flaggedAccounts = [
    { id: 'V-901', name: "Super Mart", type: "Vendor", flag: "Suspicious Refunds", status: "Under Review" },
    { id: 'U-442', name: "Rahul S.", type: "Customer", flag: "Multiple Devices", status: "Suspended" },
    { id: 'V-102', name: "Sneaker Head", type: "Vendor", flag: "Fake Receipts", status: "Under Review" }
  ];

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Fraud Detection</h1>
          <p className="text-body-md text-on-surface-variant mt-1">Monitor suspicious activities and anomalies.</p>
        </div>
        <button className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold text-[13px] hover:bg-red-100 transition-colors">
          <span className="material-symbols-outlined text-[18px]">gavel</span> Take Action
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Risk Metrics */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
            <h3 className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-4">System Risk Level</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-amber-500 flex items-center justify-center">
                <span className="text-amber-500 font-black text-xl">MD</span>
              </div>
              <div>
                <p className="text-on-surface font-bold text-lg">Medium Risk</p>
                <p className="text-on-surface-variant text-[12px]">3 active threats detected</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
             <h3 className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-4">Recent Alerts</h3>
             <div className="space-y-4">
               {alerts.map(alert => (
                 <div key={alert.id} className="border-l-2 border-red-500 pl-3">
                   <p className="text-on-surface text-[13px] font-bold">{alert.type}</p>
                   <p className="text-on-surface-variant text-[11px] mt-0.5">{alert.description}</p>
                   <div className="flex justify-between items-center mt-2">
                     <span className="text-red-500 text-[10px] font-bold uppercase">{alert.risk} Risk</span>
                     <span className="text-on-surface-variant/70 text-[10px]">{alert.time}</span>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Flagged Accounts Table */}
        <div className="lg:col-span-2 bg-white border border-outline-variant/10 rounded-2xl flex flex-col shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
            <h2 className="text-on-surface font-bold text-[15px]">Flagged Accounts</h2>
            <button className="text-primary text-[12px] font-bold hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-[#f8f9fc]">
                  <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">ID / Name</th>
                  <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Type</th>
                  <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Reason Flagged</th>
                  <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                  <th className="py-3 px-5 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {flaggedAccounts.map((account, i) => (
                  <tr key={i} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-4 px-5">
                      <p className="text-on-surface font-bold text-[13px]">{account.name}</p>
                      <p className="text-on-surface-variant text-[11px] font-mono">{account.id}</p>
                    </td>
                    <td className="py-4 px-5">
                      <span className="px-2 py-1 rounded bg-surface-container text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                        {account.type}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-[13px] text-on-surface-variant">{account.flag}</td>
                    <td className="py-4 px-5">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                        account.status === 'Suspended' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {account.status}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button className="text-on-surface-variant hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
