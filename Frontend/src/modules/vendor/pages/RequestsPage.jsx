import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, API_BASE_URL } from '../../../services/api';

export default function RequestsPage() {
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);
  const currentUser = useAuthStore((state) => state.currentUser) || {};

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await VendorAPI.getPendingRequests();
        if (res.success) {
          setPendingRequests(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch pending requests", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRequests();
  }, []);

  const handleRequestAction = async (requestId, action) => {
    setIsProcessing(true);
    try {
      const res = await VendorAPI.respondToRequest(requestId, action);
      if (res.success) {
        setPendingRequests(prev => prev.filter(req => req._id !== requestId));
      }
    } catch (error) {
      console.error('Failed to process request', error);
      alert(error.response?.data?.message || 'Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="animate-reveal text-left">
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <h1 className="ml-2 font-display text-[18px] font-black text-on-surface leading-none tracking-tight">Pending Requests</h1>
      </header>

      <div className="hidden md:flex justify-between items-end mb-6">
        <div>
          <h1 className="font-display text-[24px] font-black text-on-surface leading-none tracking-tight">Pending Requests</h1>
          <p className="text-on-surface-variant text-[12px] font-bold mt-1">Review and approve cashback claims</p>
        </div>
      </div>

      <div className="space-y-3 pb-[100px] md:pb-6">
        {isLoading ? (
          <p className="text-[13px] text-on-surface-variant text-center py-8 font-bold">Loading...</p>
        ) : pendingRequests.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[28px] text-on-surface-variant">check_circle</span>
            </div>
            <h3 className="font-bold text-on-surface text-[15px] mb-1">All Caught Up!</h3>
            <p className="text-on-surface-variant text-[13px]">No pending requests require your attention.</p>
          </div>
        ) : (
          pendingRequests.map(req => (
            <div key={req._id} className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-4 flex gap-3 items-start">
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 font-black text-[18px] border border-orange-100 flex-shrink-0">
                {req.customerId?.name?.charAt(0) || 'C'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-[15px] text-on-surface truncate">{req.customerId?.name || req.customerId?.phone}</h4>
                  <p className="font-black text-[16px] text-on-surface">₹{req.amount?.toLocaleString()}</p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[12px] text-on-surface-variant font-medium">{new Date(req.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span className="mx-1">•</span> Request</p>
                  <p className="text-[11px] text-green-600 font-black">Estimated CB: ₹{(req.amount * (currentUser.cashbackRate / 100)).toFixed(2)}</p>
                </div>

                {req.billImageUrl && (
                  <div
                    onClick={() => setViewReceiptUrl(req.billImageUrl)}
                    className="mt-3 flex items-center justify-between bg-surface-container-low/50 border border-outline-variant/10 rounded-xl p-2.5 cursor-pointer hover:bg-surface-container hover:shadow-sm active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider">View Attached Receipt</span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-primary">visibility</span>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-4">
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleRequestAction(req._id, 'Reject')}
                    className="flex-1 h-10 rounded-xl bg-red-50 text-red-600 font-bold text-[13px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer hover:bg-red-100"
                  >
                    Reject
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleRequestAction(req._id, 'Approve')}
                    className="flex-1 h-10 rounded-xl bg-primary text-white font-bold text-[13px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer hover:bg-primary/90 hover:shadow-md"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Receipt Modal */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setViewReceiptUrl(null)}>
          <div className="relative max-w-full max-h-full overflow-hidden flex flex-col items-center">
            <button 
              onClick={() => setViewReceiptUrl(null)}
              className="absolute top-2 right-2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
            <img 
              src={viewReceiptUrl.startsWith('data:') || viewReceiptUrl.startsWith('http') ? viewReceiptUrl : `${API_BASE_URL.replace('/api', '')}${viewReceiptUrl}`} 
              alt="Receipt" 
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-white"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
