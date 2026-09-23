import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';

const TIMELINE_STEPS = [
  "Draft",
  "Submitted",
  "Pending Vendor Approval",
  "Under Verification",
  "Approved / Rejected",
  "Wallet Credited"
];

export default function RequestDetailsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [verifyInputCode, setVerifyInputCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifySuccessMsg, setVerifySuccessMsg] = useState('');

  const handleVerifyCode = async () => {
    if (!verifyInputCode || verifyInputCode.length !== 3) return;
    setIsVerifying(true);
    setVerifyError('');
    try {
      const res = await UserAPI.verifyCashbackRequestCode(id, verifyInputCode);
      if (res.success) {
        setVerifySuccessMsg('Approved successfully! Cashback credited to your wallet (locked for 24h from bank withdrawal).');
        setRequest((prev) => ({
          ...prev,
          status: 'Approved',
          lockedUntil: res.data.lockedUntil,
        }));
      }
    } catch (err) {
      setVerifyError(err.response?.data?.message || 'Verification failed. Please check the 3-digit code.');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        const res = await UserAPI.getCashbackRequestById(id);
        if (res.success) {
          setRequest(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch request', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRequest();
  }, [id]);

  if (isLoading) {
    return (
      <div className="mesh-gradient min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="mesh-gradient min-h-screen flex flex-col items-center justify-center p-container-margin select-none font-body-lg">
        <div className="text-center space-y-md">
          <span className="material-symbols-outlined text-outline text-[48px]">warning</span>
          <p className="font-title-md text-on-surface font-bold">Request details not found</p>
          <button 
            onClick={() => navigate('/passbook')}
            className="btn-primary-gradient px-lg py-sm text-white rounded-xl font-title-md shadow-md active:scale-95 transition-transform"
          >
            Back to Requests
          </button>
        </div>
      </div>
    );
  }

  // Determine active step index in timeline
  const getActiveTimelineIndex = () => {
    if (request.status === 'Approved') return 5; // Wallet Credited
    if (request.status === 'Rejected') return 4; // Rejected
    if (request.status === 'Pending') return 2; // Pending Vendor Approval
    return 2;
  };

  const activeIndex = getActiveTimelineIndex();

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button 
              onClick={() => navigate('/passbook')}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-1">Request Status</span>
          </div>
        </div>
      </header>

      {/* Main body details content */}
      <main className="flex-grow app-container px-container-margin py-lg space-y-lg text-left">
        
        {/* Detail overview card */}
        <div className="glass-card rounded-2xl p-md border border-outline-variant/30 text-left space-y-md shadow-sm">
          <div className="flex justify-between items-start border-b border-outline-variant/10 pb-sm">
            <div>
              <span className="text-[9px] uppercase font-bold text-primary tracking-widest leading-none">PARTNER SHOP</span>
              <p className="font-caption text-[11px] text-on-surface-variant uppercase tracking-wider">ID: {request._id}</p>
            </div>
            {request.vendorId?.zeebacId && <span className="bg-primary/10 text-primary font-label-mono text-[10px] px-2 py-0.5 rounded-full font-bold">{request.vendorId.zeebacId}</span>}
          </div>

          <div className="pt-sm space-y-2 text-body-md text-on-surface-variant">
            <div className="flex justify-between items-center">
              <span className="font-caption text-xs">Merchant Name</span>
              <span className="font-title-md font-bold text-on-surface">{request.vendorId?.storeName || request.vendorName}</span>
            </div>
            {request.billNumber && (
              <div className="flex justify-between items-center">
                <span className="font-caption text-xs">Bill / Invoice No</span>
                <span className="font-bold text-on-surface font-mono">{request.billNumber}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="font-caption text-xs">Date of Purchase</span>
              <span className="font-bold text-on-surface">{new Date(request.purchaseDate || request.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-caption text-xs">Payment Method</span>
              <span className="font-bold text-on-surface">{request.paymentMethod || 'Cash'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-caption text-xs">Receipt Total</span>
              <span className="font-bold text-on-surface">₹{request.amount}</span>
            </div>
          </div>
        </div>

        {/* Est Cashback Amount */}
        <div className="glass-card rounded-2xl p-md border border-outline-variant/30 flex items-center justify-between animate-slide-up animation-delay-200">
          <div>
            <p className="font-caption text-xs uppercase text-primary font-bold">Requested Bill Amount</p>
            <p className="font-display text-title-lg font-black text-on-surface">₹{request.amount?.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="font-caption text-xs uppercase text-green-600 font-bold">Cashback</p>
            <p className="font-display text-title-lg font-black text-green-600">
              ₹{((request.amount * ((request.vendorId?.cashbackRate || 10) / 100))).toFixed(2)}
            </p>
          </div>
        </div>

        {/* 3-Digit Verification Code Input (For Pending Cash Claims) */}
        {request.status === 'Pending' && (request.requestType === 'cash_claim' || request.paymentMethod === 'Cash') && (
          <div className="bg-gradient-to-br from-primary/10 via-white to-primary/5 rounded-2xl p-5 border-2 border-primary/30 shadow-md animate-reveal space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[20px]">pin</span>
              </div>
              <div>
                <h3 className="font-bold text-[16px] text-on-surface leading-tight">Enter 3-Digit Vendor Code</h3>
                <p className="text-[12px] text-on-surface-variant mt-0.5 leading-snug">
                  Ask the shopkeeper for the 3-digit code on their app for <strong>instant auto-approval</strong>.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <input
                type="text"
                maxLength={3}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="• • •"
                value={verifyInputCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setVerifyInputCode(val);
                  setVerifyError('');
                }}
                className="w-full sm:w-40 h-12 text-center text-[24px] font-black tracking-widest bg-white rounded-xl border border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-on-surface shadow-inner"
              />
              <button
                disabled={verifyInputCode.length !== 3 || isVerifying}
                onClick={handleVerifyCode}
                className="w-full sm:flex-1 h-12 rounded-xl bg-primary text-white font-title-md font-bold shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isVerifying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    <span>Verify & Auto-Approve</span>
                  </>
                )}
              </button>
            </div>

            {verifyError && (
              <p className="text-red-500 text-[12px] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{verifyError}</span>
              </p>
            )}

            {verifySuccessMsg && (
              <div className="bg-green-50 border border-green-200 text-green-800 text-[12px] font-medium p-3 rounded-xl flex items-start gap-2">
                <span className="material-symbols-outlined text-green-600 text-[18px] flex-shrink-0">check_circle</span>
                <span>{verifySuccessMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* 24-Hour Withdrawal Lock Banner (For Approved Cash Claims) */}
        {request.status === 'Approved' && request.lockedUntil && new Date(request.lockedUntil) > new Date() && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm animate-reveal">
            <span className="material-symbols-outlined text-amber-600 text-[24px] flex-shrink-0 mt-0.5">lock_clock</span>
            <div>
              <h4 className="font-bold text-[14px] text-amber-950 leading-tight">24-Hour Security Lock Active</h4>
              <p className="text-[12px] text-amber-900/80 mt-1 leading-normal">
                Your cash cashback is credited to your wallet! For anti-fraud safety, bank withdrawal will unlock on{' '}
                <strong>{new Date(request.lockedUntil).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(request.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Vendor Hold Banner */}
        {request.isHeld && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm animate-reveal">
            <span className="material-symbols-outlined text-red-600 text-[24px] flex-shrink-0 mt-0.5">pause_circle</span>
            <div>
              <h4 className="font-bold text-[14px] text-red-950 leading-tight">Cashback On Hold by Vendor</h4>
              <p className="text-[12px] text-red-900/80 mt-1 leading-normal">
                {request.holdReason || 'Vendor flagged transaction for verification'}. Bank withdrawal is frozen until reviewed.
              </p>
            </div>
          </div>
        )}

        {request.billImageUrl && (
          <div className="border-t border-outline-variant/10 pt-sm flex flex-col gap-sm">
            <p className="font-caption text-[10px] uppercase text-on-surface-variant">Bill Attachment Preview</p>
            <img
              className="w-full h-44 object-cover rounded-xl border shadow-sm"
              src={request.billImageUrl.startsWith('http') ? request.billImageUrl : `${import.meta.env.VITE_API_URL}${request.billImageUrl}`}
              alt="Receipt copy"
            />
          </div>
        )}

        {/* Timeline Tracking Widget */}
        <div className="glass-card rounded-2xl p-md border border-outline-variant/30 text-left space-y-md shadow-sm">
          <h4 className="font-display text-title-md text-on-surface font-extrabold pb-sm border-b border-outline-variant/10">Verification Timeline</h4>
          
          <div className="relative pl-6 space-y-lg border-l-2 border-outline-variant/30 ml-2 pt-2">
            <div className="absolute top-0 bottom-0 left-[9px] w-[2px] bg-outline-variant/20"></div>

              {TIMELINE_STEPS.map((stepName, idx) => {
                const isActive = idx === activeIndex;
                const isCompleted = idx <= activeIndex;
                const dateText = isCompleted ? new Date(request.updatedAt || request.createdAt).toLocaleDateString() : '';

                return (
                  <div key={idx} className="relative flex items-start gap-4">
                    {/* Timeline dot */}
                    <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 transition-all ${
                      isCompleted 
                        ? 'bg-primary border-primary shadow-sm scale-110' 
                        : 'bg-white border-outline-variant/60'
                    }`}>
                      {isCompleted && (
                        <div className="absolute inset-[3px] rounded-full bg-white animate-scaleUp" />
                      )}
                    </div>
                    <div className="flex-1 pb-4 text-left">
                      <p className={`font-title-md font-bold text-body-sm transition-colors ${
                        isActive 
                          ? 'text-primary font-black' 
                          : isCompleted 
                            ? 'text-on-surface' 
                            : 'text-outline'
                      }`}>
                        {stepName === "Approved / Rejected" ? (request.status === "Rejected" ? "Rejected" : "Approved") : stepName}
                      </p>
                      <p className="font-caption text-[10px] text-on-surface-variant">
                        {isCompleted && idx === 4 && (request.status === 'Approved' ? 'Approved by Merchant' : request.status === 'Rejected' ? 'Declined by Merchant' : '')}
                        {isCompleted && idx === 5 && "Credited to wallet balance"}
                        {isCompleted && dateText && idx < 4 ? `Status updated on ${dateText}` : ''}
                        {!isCompleted && "Pending progression..."}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

      </main>
    </div>
  );
}
