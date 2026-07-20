import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AdminAPI } from '../../../services/api';

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState({ users: [], vendors: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('vendors');
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, id: null, type: null, action: null });
  const [transactionId, setTransactionId] = useState('');
  const [remarks, setRemarks] = useState('');

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getPendingPayouts();
      if (res.success) setPayouts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPayouts(); }, []);

  const openModal = (id, type, action) => {
    setModal({ isOpen: true, id, type, action });
    setTransactionId('');
    setRemarks('');
  };

  const closeModal = () => {
    setModal({ isOpen: false, id: null, type: null, action: null });
  };

  const handleConfirmProcess = async () => {
    if (modal.action === 'Approve' && !transactionId.trim()) {
      alert('Transaction ID (UTR) is mandatory for approval.');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await AdminAPI.processPayout(modal.id, {
        type: modal.type,
        action: modal.action,
        remarks,
        transactionId,
      });
      if (res.success) {
        alert(`Payout ${modal.action}ed successfully!`);
        closeModal();
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
      {/* Header */}
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

      {/* Table Card */}
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
                <tr><td colSpan="5" className="p-8 text-center">Loading...</td></tr>
              ) : currentList.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-on-surface-variant font-bold">No pending requests in this category.</td></tr>
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
                        <div>
                          {!(item.ownerId?.bankDetails?.upiId || item.ownerId?.bankDetails?.accountNumber) && (
                            <span className="italic text-[12px] text-red-500">Bank info missing</span>
                          )}
                          {item.ownerId?.bankDetails?.accountNumber && (
                            <div className="mb-1 border-b border-outline-variant/10 pb-1">
                              <p><span className="font-bold">Bank:</span> {item.ownerId.bankDetails.bankName || 'N/A'}</p>
                              <p><span className="font-bold">A/C:</span> {item.ownerId.bankDetails.accountNumber}</p>
                              {item.ownerId.bankDetails.ifscCode && <p><span className="font-bold">IFSC:</span> {item.ownerId.bankDetails.ifscCode}</p>}
                            </div>
                          )}
                          {item.ownerId?.bankDetails?.upiId && (
                            <p><span className="font-bold">UPI:</span> {item.ownerId.bankDetails.upiId}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-bold text-[16px] text-primary">₹{item.amount.toLocaleString()}</td>
                    <td className="p-4 text-[12px] text-on-surface-variant">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openModal(item._id, activeTab === 'vendors' ? 'Vendor' : 'User', 'Approve')}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded text-[12px] transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openModal(item._id, activeTab === 'vendors' ? 'Vendor' : 'User', 'Reject')}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded text-[12px] transition-colors disabled:opacity-50 cursor-pointer"
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

      {/* Action Modal via Portal */}
      {modal.isOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '1rem' }}
        >
          <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '28rem', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #eee', color: 'white', fontWeight: 'bold', background: modal.action === 'Approve' ? '#16a34a' : '#ef4444' }}>
              {modal.action === 'Approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '14px', color: '#666' }}>
                You are about to <strong>{modal.action.toLowerCase()}</strong> this payout request.
                {modal.action === 'Approve' && ' Please enter the Bank/UPI Transaction ID.'}
              </p>

              {modal.action === 'Approve' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Transaction ID / UTR <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g. UTR1234567890"
                    style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #ddd', borderRadius: '0.75rem', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remarks (Optional)</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any notes for the user..."
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #ddd', borderRadius: '0.75rem', fontSize: '14px', outline: 'none', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem', background: '#f9f9fc', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={closeModal}
                disabled={isProcessing}
                style={{ padding: '0.5rem 1rem', fontWeight: 'bold', color: '#666', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmProcess}
                disabled={isProcessing || (modal.action === 'Approve' && !transactionId.trim())}
                style={{
                  padding: '0.5rem 1.5rem',
                  fontWeight: 'bold',
                  color: 'white',
                  borderRadius: '0.75rem',
                  border: 'none',
                  cursor: isProcessing || (modal.action === 'Approve' && !transactionId.trim()) ? 'not-allowed' : 'pointer',
                  opacity: isProcessing || (modal.action === 'Approve' && !transactionId.trim()) ? 0.5 : 1,
                  background: modal.action === 'Approve' ? '#16a34a' : '#ef4444',
                }}
              >
                {isProcessing ? 'Processing...' : `Confirm ${modal.action}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
