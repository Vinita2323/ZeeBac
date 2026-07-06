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
  const [isLoading, setIsLoading] = useState(true);

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
      <div className="bg-[#f9f9ff] min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="bg-[#f9f9ff] min-h-screen flex flex-col items-center justify-center p-container-margin select-none font-body-lg">
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
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm justify-between">
        <div className="flex items-center gap-xs">
          <button 
            onClick={() => navigate('/passbook')}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Request Status</span>
        </div>
      </header>

      {/* Main body details content */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
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
            <div className="flex justify-between items-center">
              <span className="font-caption text-xs">Date of Purchase</span>
              <span className="font-bold text-on-surface">{new Date(request.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-caption text-xs">Payment Method</span>
              <span className="font-bold text-on-surface">Digital Payment</span>
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
            <p className="font-caption text-xs uppercase text-primary font-bold">Requested Amount</p>
            <p className="font-display text-title-lg font-black text-on-surface">₹{request.amount}</p>
          </div>
          
          {request.billImg && (
            <div className="border-t border-outline-variant/10 pt-sm flex flex-col gap-sm">
              <p className="font-caption text-[10px] uppercase text-on-surface-variant">Bill Attachment Preview</p>
              <img className="w-full h-44 object-cover rounded-xl border shadow-sm" src={request.billImg} alt="Receipt copy" />
            </div>
          )}
        </div>

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
