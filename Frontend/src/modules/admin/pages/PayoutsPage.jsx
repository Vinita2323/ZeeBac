import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState({ users: [], vendors: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('vendors'); // 'vendors' or 'users'
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getPendingPayouts();
      if (res.success) {
        setPayouts(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const handleProcess = async (id, type, action) => {
    const remarks = window.prompt(`Enter remarks for ${action.toLowerCase()}ing this payout (optional):`);
    if (remarks === null) return; // cancelled

    setIsProcessing(true);
    try {
      const res = await AdminAPI.processPayout(id, { type, action, remarks });
      if (res.success) {
        alert(`Payout ${action}ed successfully!`);
        fetchPayouts();
      } else {
        alert(res.message || 'Failed to process payout');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Server error while processing');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentList = activeTab === 'vendors' ? payouts.vendors : payouts.users;

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Pending Payouts</h1>
          <p className="text-body-md text-on-surface-variant">Review and approve vendor and user withdrawal requests</p>
        </div>
        <button 
          onClick={fetchPayouts}
          className="px-4 py-2 bg-white border border-outline-variant/30 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="border-b border-outline-variant/10 bg-[#f8f9fc] p-4 flex gap-2">
          <button
            onClick={() => setActiveTab('vendors')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'vendors' ? 'bg-primary text-white' : 'bg-white text-on-surface-variant border border-outline-variant/20 hover:bg-surface-container-low'}`}
          >
            Vendor Requests ({payouts.vendors.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'users' ? 'bg-primary text-white' : 'bg-white text-on-surface-variant border border-outline-variant/20 hover:bg-surface-container-low'}`}
          >
            User Requests ({payouts.users.length})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-white">
                <th className="p-4 font-bold">Requested By</th>
                <th className="p-4 font-bold">Bank Details</th>
                <th className="p-4 font-bold">Amount</th>
                <th className="p-4 font-bold">Requested At</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center">Loading...</td>
                </tr>
              ) : currentList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-on-surface-variant font-bold">
                    No pending requests in this category.
                  </td>
                </tr>
              ) : (
                currentList.map((item) => (
                  <tr key={item._id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                    <td className="p-4">
                      {activeTab === 'vendors' ? (
                        <div>
                          <p className="font-bold text-on-surface">{item.vendorId?.storeName || 'Unknown Store'}</p>
                          <p className="text-[12px] text-on-surface-variant">{item.vendorId?.ownerName} • {item.vendorId?.phone}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-on-surface">{item.ownerId?.name || 'Unknown User'}</p>
                          <p className="text-[12px] text-on-surface-variant">{item.ownerId?.phone}</p>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-[13px] text-on-surface-variant">
                      {activeTab === 'vendors' ? (
                        <div>
                          <p><span className="font-bold">Bank:</span> {item.bankDetailsSnapshot?.bankName || item.vendorId?.bankDetails?.bankName || 'N/A'}</p>
                          <p><span className="font-bold">A/C:</span> {item.bankDetailsSnapshot?.accountNumber || item.vendorId?.bankDetails?.accountNumber || 'N/A'}</p>
                          <p><span className="font-bold">IFSC:</span> {item.bankDetailsSnapshot?.ifscCode || item.vendorId?.bankDetails?.ifscCode || 'N/A'}</p>
                          {item.bankDetailsSnapshot?.upiId && <p><span className="font-bold">UPI:</span> {item.bankDetailsSnapshot.upiId}</p>}
                        </div>
                      ) : (
                        <span className="italic text-[12px]">Bank info usually handled by payment gateway for users, or manual UPI entry.</span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-[16px] text-primary">₹{item.amount.toLocaleString()}</td>
                    <td className="p-4 text-[12px] text-on-surface-variant">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleProcess(item._id, activeTab === 'vendors' ? 'Vendor' : 'User', 'Approve')}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded text-[12px] transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleProcess(item._id, activeTab === 'vendors' ? 'Vendor' : 'User', 'Reject')}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded text-[12px] transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
