import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, API_BASE_URL } from '../../../services/api';
import { getSocket } from '../../../services/socket';
import useLanguageStore from '../../../store/useLanguageStore';

export default function RequestsPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);
  const currentUser = useAuthStore((state) => state.currentUser);
  const cashbackRate = currentUser?.cashbackRate ?? 5;

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

    const socket = getSocket();
    if (socket) {
      const handleNewRequest = (data) => {
        setPendingRequests((prev) => {
          if (prev.some((r) => r._id === data.requestId)) return prev;
          return [
            {
              _id: data.requestId,
              customerId: { name: data.customerName },
              amount: data.amount,
              cashbackAmount: data.cashbackAmount,
              paymentMethod: 'Cash',
              verificationCode: data.verificationCode,
              status: 'Pending',
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ];
        });
      };

      const handleVerified = (data) => {
        setPendingRequests((prev) =>
          prev.map((r) =>
            r._id === data.requestId || r.verificationCode === data.verificationCode
              ? { ...r, status: 'Approved' }
              : r
          )
        );
        setTimeout(() => {
          setPendingRequests((prev) =>
            prev.filter(
              (r) =>
                r._id !== data.requestId &&
                r.verificationCode !== data.verificationCode
            )
          );
        }, 3500);
      };

      socket.on('new_cash_request', handleNewRequest);
      socket.on('cash_request_verified', handleVerified);

      return () => {
        socket.off('new_cash_request', handleNewRequest);
        socket.off('cash_request_verified', handleVerified);
      };
    }
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

  const handleHold = async (requestId) => {
    const reason = prompt('Please enter the reason for placing this cashback on hold:', 'Verification pending');
    if (reason === null) return;
    setIsProcessing(true);
    try {
      const res = await VendorAPI.holdRequest(requestId, reason);
      if (res.success) {
        setPendingRequests(prev =>
          prev.map(r => r._id === requestId ? { ...r, isHeld: true, holdReason: reason, status: 'Held' } : r)
        );
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to place request on hold');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnhold = async (requestId) => {
    setIsProcessing(true);
    try {
      const res = await VendorAPI.unholdRequest(requestId);
      if (res.success) {
        setPendingRequests(prev =>
          prev.map(r => r._id === requestId ? { ...r, isHeld: false, status: 'Approved' } : r)
        );
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to release hold');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="animate-reveal text-left">
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-[20px] text-primary">arrow_back</span>
        </button>
        <h1 className="ml-2 font-display text-[18px] font-black text-on-surface leading-none tracking-tight">{t('Pending Requests')}</h1>
      </header>

      <div className="hidden md:flex justify-between items-end mb-6">
        <div>
          <h1 className="font-display text-[24px] font-black text-on-surface leading-none tracking-tight">{t('Pending Requests')}</h1>
          <p className="text-on-surface-variant text-[12px] font-bold mt-1">{t('Review and approve cashback claims', 'कैशबैक दावों की समीक्षा करें और स्वीकृत करें')}</p>
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
          pendingRequests.map(req => {
            const isCashOtp = !!req.verificationCode;
            const isPendingCashOtp = isCashOtp && req.status === 'Pending';
            const isApproved = req.status === 'Approved';

            return (
              <div 
                key={req._id} 
                className={`rounded-2xl border transition-all p-4 flex gap-3 items-start ${
                  isPendingCashOtp 
                    ? 'bg-gradient-to-br from-red-50/95 via-white to-rose-50/80 border-2 border-red-500 shadow-lg ring-2 ring-red-400/20' 
                    : isApproved
                    ? 'bg-gradient-to-br from-emerald-50/95 via-white to-green-50/80 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-400/20'
                    : 'bg-white border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-[18px] border flex-shrink-0 shadow-xs ${
                  isPendingCashOtp 
                    ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                    : isApproved
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-orange-50 text-orange-600 border-orange-100'
                }`}>
                  {isPendingCashOtp ? (
                    <span className="material-symbols-outlined text-[24px]">pin</span>
                  ) : isApproved ? (
                    <span className="material-symbols-outlined text-[24px]">verified</span>
                  ) : (
                    req.customerId?.name?.charAt(0) || 'C'
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Top status indicator for cash OTP mode */}
                  {isPendingCashOtp && (
                    <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-red-200">
                      <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider bg-red-600 text-white flex items-center gap-1 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                        Cash Mode • OTP Required
                      </span>
                      <span className="text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                        Share Code to Approve
                      </span>
                    </div>
                  )}

                  {isApproved && (
                    <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-emerald-200">
                      <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider bg-emerald-600 text-white flex items-center gap-1 shadow-xs">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        Cashback Successful
                      </span>
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                        Verified via OTP
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-[15px] text-on-surface truncate">
                        {req.customerId?.name || req.customerId?.phone}
                      </h4>
                      {req.billNumber && (
                        <p className="text-[12px] font-mono font-bold text-primary mt-0.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">tag</span>
                          <span>Bill No: <span className="bg-primary/10 px-1.5 py-0.5 rounded font-mono">{req.billNumber}</span></span>
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <span className={`text-[10px] font-black uppercase block ${isPendingCashOtp ? 'text-red-700' : 'text-on-surface-variant'}`}>
                        {t('Bill Amount')}
                      </span>
                      <p className={`font-mono font-black text-[17px] leading-tight ${
                        isPendingCashOtp 
                          ? 'text-red-700 bg-red-100/90 px-2.5 py-0.5 rounded-lg border border-red-300 inline-block' 
                          : 'text-on-surface'
                      }`}>
                        ₹{req.amount?.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-2 flex-wrap gap-1">
                    <p className="text-[12px] text-on-surface-variant font-medium">
                      {new Date(req.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span className="mx-1">•</span> {req.paymentMethod || 'Cash'}
                    </p>
                    <div className={`px-2.5 py-0.5 rounded-lg font-black text-[12px] ${
                      isPendingCashOtp 
                        ? 'bg-red-600 text-white shadow-xs' 
                        : isApproved
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-green-700 bg-green-50 border border-green-200'
                    }`}>
                      Cashback: ₹{(req.amount * (cashbackRate / 100)).toFixed(2)}
                    </div>
                  </div>

                  {/* Highlighted 3-Digit Verification Code for Cash Requests */}
                  {req.verificationCode && req.status === 'Pending' && (
                    <div className="mt-3 bg-red-500/10 border-2 border-red-500 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shadow-sm">
                          <span className="material-symbols-outlined text-[22px]">pin</span>
                        </div>
                        <div>
                          <span className="inline-block px-2 py-0.5 bg-red-600 text-white text-[9.5px] font-black uppercase tracking-wider rounded-md mb-0.5">
                            {t('Customer OTP Code')}
                          </span>
                          <p className="text-[13px] font-black text-red-950 leading-tight">{t('Tell this code to customer')}</p>
                          <p className="text-[11px] font-semibold text-red-700">{t('Auto-approves cashback upon entry')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[28px] font-mono font-black text-red-700 tracking-[0.25em] bg-white px-5 py-1.5 rounded-xl border-2 border-red-500 shadow-md select-all">
                          {req.verificationCode}
                        </span>
                      </div>
                    </div>
                  )}

                {/* Hold Status Badge */}
                {req.isHeld && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-red-700 text-[11px] font-bold">
                      <span className="material-symbols-outlined text-[16px]">pause_circle</span>
                      <span>On Hold: {req.holdReason || 'Flagged for verification'}</span>
                    </div>
                    <button
                      disabled={isProcessing}
                      onClick={() => handleUnhold(req._id)}
                      className="text-[11px] font-bold text-primary bg-white border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-primary/5 active:scale-95 cursor-pointer"
                    >
                      Release Hold
                    </button>
                  </div>
                )}

                {req.billImageUrl && (
                  <div
                    onClick={() => setViewReceiptUrl(req.billImageUrl)}
                    className="mt-3 flex items-center justify-between bg-surface-container-low/50 border border-outline-variant/10 rounded-xl p-2.5 cursor-pointer hover:bg-surface-container hover:shadow-sm active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider">{t('View Attached Receipt')}</span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-primary">visibility</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-4">
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleRequestAction(req._id, 'Reject')}
                    className="flex-1 h-10 rounded-xl bg-red-50 text-red-600 font-bold text-[12px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer hover:bg-red-100"
                  >
                    {t('Reject')}
                  </button>
                  {!req.isHeld && (
                    <button 
                      disabled={isProcessing}
                      onClick={() => handleHold(req._id)}
                      className="px-3 h-10 rounded-xl bg-amber-50 text-amber-700 font-bold text-[12px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer hover:bg-amber-100 border border-amber-200/60"
                      title="Hold transaction if you have any doubt"
                    >
                      {t('Hold')}
                    </button>
                  )}
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleRequestAction(req._id, 'Approve')}
                    className="flex-1 h-10 rounded-xl bg-primary text-white font-bold text-[12px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer hover:bg-primary/90 hover:shadow-md"
                  >
                    {t('Approve')}
                  </button>
                </div>
              </div>
            </div>
          );
        })
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
