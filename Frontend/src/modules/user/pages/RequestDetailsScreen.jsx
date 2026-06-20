import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

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

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('cashback_requests')) || [];
    const found = stored.find(r => r.id === id);
    if (found) {
      setRequest(found);
    }
  }, [id]);

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
              <h3 className="font-display text-body-lg font-black text-on-surface pt-1">{request.vendorName}</h3>
            </div>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
              request.status === 'Approved' 
                ? 'bg-green-100 text-green-800' 
                : request.status === 'Rejected' 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-amber-100 text-amber-800'
            }`}>
              {request.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-md gap-x-sm text-body-sm text-on-surface-variant">
            <div>
              <p className="font-caption text-[10px] uppercase">Request ID</p>
              <p className="font-bold text-on-surface font-label-mono">{request.id}</p>
            </div>
            <div>
              <p className="font-caption text-[10px] uppercase">Payment Method</p>
              <p className="font-bold text-on-surface">{request.paymentMethod}</p>
            </div>
            <div>
              <p className="font-caption text-[10px] uppercase">Bill Amount</p>
              <p className="font-bold text-on-surface">₹{request.amount}</p>
            </div>
            <div>
              <p className="font-caption text-[10px] uppercase text-secondary font-bold">Cashback Earned</p>
              <p className="font-bold text-secondary font-display text-body-lg">
                +₹{request.cashbackAmount}
              </p>
            </div>
          </div>

          {request.description && (
            <div className="border-t border-outline-variant/10 pt-sm">
              <p className="font-caption text-[10px] uppercase text-on-surface-variant">Purchase Note</p>
              <p className="text-body-sm text-on-surface font-medium leading-relaxed">{request.description}</p>
            </div>
          )}

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
            {TIMELINE_STEPS.map((stepName, stepIndex) => {
              // Custom handling for step 4 status labeling
              let displayStepName = stepName;
              if (stepName === "Approved / Rejected") {
                displayStepName = request.status === "Rejected" ? "Rejected" : "Approved";
              }

              // Determine visual step status state
              const isStepCompleted = stepIndex <= activeIndex;
              const isCurrentStep = stepIndex === activeIndex;

              return (
                <div key={stepName} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 transition-all ${
                    isStepCompleted 
                      ? 'bg-primary border-primary shadow-sm scale-110' 
                      : 'bg-white border-outline-variant/60'
                  }`}>
                    {isStepCompleted && (
                      <div className="absolute inset-[3px] rounded-full bg-white animate-scaleUp" />
                    )}
                  </div>

                  <div className="text-left space-y-0.5">
                    <p className={`font-title-md font-bold text-body-sm transition-colors ${
                      isCurrentStep 
                        ? 'text-primary font-black' 
                        : isStepCompleted 
                          ? 'text-on-surface' 
                          : 'text-outline'
                    }`}>
                      {displayStepName}
                    </p>
                    <p className="font-caption text-[10px] text-on-surface-variant">
                      {isStepCompleted && stepIndex === 1 && (request.submittedAt || "Jun 10, 2026 • 06:00 PM")}
                      {isStepCompleted && stepIndex === 0 && (request.submittedAt || "Jun 10, 2026 • 05:58 PM")}
                      {isStepCompleted && stepIndex === 2 && (request.submittedAt || "Jun 10, 2026 • 06:00 PM")}
                      {isStepCompleted && stepIndex === 3 && "Verified by Validator"}
                      {isStepCompleted && stepIndex === 4 && (request.status === 'Approved' ? 'Approved by Merchant' : request.status === 'Rejected' ? 'Declined by Merchant' : '')}
                      {isStepCompleted && stepIndex === 5 && "Credited to wallet balance"}
                      {!isStepCompleted && "Pending progression..."}
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
