import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAPI } from '../../../services/api';
export default function FraudDetectionPage() {
  const [alerts, setAlerts] = useState([]);
  const [flaggedAccounts, setFlaggedAccounts] = useState([]);
  const [riskLevel, setRiskLevel] = useState('Low');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFraudData = async () => {
      try {
        const res = await AdminAPI.getFraudAlerts();
        if (res.success) {
          setAlerts(res.data.alerts);
          setFlaggedAccounts(res.data.flaggedAccounts);
          setRiskLevel(res.data.riskLevel);
        }
      } catch (err) {
        console.error("Failed to fetch fraud alerts", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFraudData();
  }, []);

  const getRiskColors = () => {
    switch (riskLevel) {
      case 'Critical': return { border: 'border-red-500', text: 'text-red-500', abbr: 'CR' };
      case 'High': return { border: 'border-orange-500', text: 'text-orange-500', abbr: 'HI' };
      case 'Medium': return { border: 'border-amber-500', text: 'text-amber-500', abbr: 'MD' };
      case 'Low': default: return { border: 'border-green-500', text: 'text-green-500', abbr: 'LO' };
    }
  };
  const riskStyles = getRiskColors();

  const [showActionModal, setShowActionModal] = useState(false);
  const [actionTxnId, setActionTxnId] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const handleExecuteRefund = async (e) => {
    e.preventDefault();
    if (!actionTxnId.trim()) return alert('Please enter a Transaction ID');
    try {
      setIsProcessingAction(true);
      const res = await AdminAPI.refundTransaction(actionTxnId.trim(), actionReason || 'Refunded via Fraud Action');
      if (res.success) {
        alert(res.message || 'Transaction refunded and cashback reversed successfully.');
        setShowActionModal(false);
        setActionTxnId('');
        setActionReason('');
      } else {
        alert(res.message || 'Failed to process refund');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error processing transaction refund');
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Fraud Detection</h1>
          <p className="text-body-md text-on-surface-variant mt-1">Monitor suspicious activities and anomalies.</p>
        </div>
        <button 
          onClick={() => setShowActionModal(true)}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-xl font-bold text-[13px] hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">gavel</span> Take Action
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Risk Metrics */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
            <h3 className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-4">System Risk Level</h3>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full border-4 ${riskStyles.border} flex items-center justify-center ${riskLevel === 'Critical' ? 'animate-pulse' : ''}`}>
                <span className={`${riskStyles.text} font-black text-xl`}>{riskStyles.abbr}</span>
              </div>
              <div>
                <p className="text-on-surface font-bold text-lg">{riskLevel} Risk</p>
                <p className="text-on-surface-variant text-[12px]">{alerts.length} active threats detected</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
             <h3 className="text-on-surface-variant text-[11px] font-bold uppercase tracking-wider mb-4">Recent Alerts</h3>
             <div className="space-y-4">
               {alerts.length === 0 && !isLoading && (
                 <p className="text-sm text-on-surface-variant">No recent alerts found. System is healthy.</p>
               )}
               {alerts.map(alert => (
                 <div key={alert.id} className={`border-l-2 ${alert.risk === 'Critical' ? 'border-red-500' : 'border-orange-500'} pl-3`}>
                   <p className="text-on-surface text-[13px] font-bold">{alert.type}</p>
                   <p className="text-on-surface-variant text-[11px] mt-0.5">{alert.description}</p>
                   <div className="flex justify-between items-center mt-2">
                     <span className={`${alert.risk === 'Critical' ? 'text-red-500' : 'text-orange-500'} text-[10px] font-bold uppercase`}>{alert.risk} Risk</span>
                     <div className="flex items-center gap-2">
                       <span className="text-on-surface-variant/70 text-[10px]">{alert.time}</span>
                       {alert.user && (
                         <button 
                           onClick={() => navigate(`/admin/users?search=${encodeURIComponent(alert.user)}`)}
                           className="text-primary text-[10px] font-bold hover:underline bg-primary/10 px-2 py-1 rounded flex items-center gap-1"
                           title={`Search for User: ${alert.user}`}
                         >
                           <span className="material-symbols-outlined text-[12px]">person</span> User
                         </button>
                       )}
                       {alert.vendor && (
                         <button 
                           onClick={() => navigate(`/admin/vendors?search=${encodeURIComponent(alert.vendor)}`)}
                           className="text-primary text-[10px] font-bold hover:underline bg-primary/10 px-2 py-1 rounded flex items-center gap-1"
                           title={`Search for Vendor: ${alert.vendor}`}
                         >
                           <span className="material-symbols-outlined text-[12px]">storefront</span> Vendor
                         </button>
                       )}
                     </div>
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
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600`}>
                        {account.status}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button 
                        onClick={() => navigate(account.type === 'Vendor' ? `/admin/vendors?search=${encodeURIComponent(account.name)}` : `/admin/users?search=${encodeURIComponent(account.name)}`)}
                        className="text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {flaggedAccounts.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan="5" className="py-8 px-5 text-center text-on-surface-variant">
                      No flagged accounts. All users are in good standing! 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {showActionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-reveal text-left">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600">gavel</span> Admin Action Center
              </h3>
              <button onClick={() => setShowActionModal(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant mb-4">
              Enter a transaction ID to execute immediate cashback reversal & refund, or manage flagged account status.
            </p>

            <form onSubmit={handleExecuteRefund} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Transaction ID *</label>
                <input
                  type="text"
                  required
                  value={actionTxnId}
                  onChange={(e) => setActionTxnId(e.target.value)}
                  placeholder="e.g. TX-1788847220500-1 or Mongo ID"
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Action Note / Reason</label>
                <textarea
                  rows="2"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="e.g. Fraudulent receipt upload confirmed by vendor"
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowActionModal(false)}
                  className="flex-1 py-2.5 border border-outline-variant/30 text-on-surface-variant font-bold rounded-xl hover:bg-surface-container-low transition-colors text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors text-sm cursor-pointer shadow disabled:opacity-50"
                >
                  {isProcessingAction ? 'Processing...' : 'Reverse & Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
