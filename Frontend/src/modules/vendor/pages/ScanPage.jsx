import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function ScanPage() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  // Mock flow: if scanning, auto-detect after 3 seconds
  useEffect(() => {
    let timer;
    if (isScanning) {
      timer = setTimeout(() => {
        setIsScanning(false);
        setShowSuccess(true);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [isScanning]);

  const handleApprove = () => {
    // Mock Data Update
    const newTx = { 
      id: `TRX-99${Math.floor(Math.random() * 90) + 10}`, 
      customer: 'Rahul Sharma', 
      amount: '₹850', 
      time: 'Just now', 
      status: 'Approved' 
    };
    
    const existing = JSON.parse(localStorage.getItem('vendor_transactions') || '[]');
    localStorage.setItem('vendor_transactions', JSON.stringify([newTx, ...existing]));
    
    const currentBalance = useAuthStore.getState().walletBalance;
    useAuthStore.getState().updateBalance(currentBalance + 850);

    navigate('/vendor/transactions');
  };

  return (
    <div className="animate-reveal text-left w-full block">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Scan Customer QR</span>
      </header>

      {!showSuccess ? (
        <div className="w-full flex flex-col items-center justify-center space-y-8 min-h-[60vh] py-8">
          <div className="text-center w-[320px] max-w-full px-4 space-y-2">
            <h2 className="font-display text-[24px] font-black text-on-surface">Scan QR Code</h2>
            <p className="text-on-surface-variant text-[14px]">Align the customer's Zeebac QR within the frame to process their bill.</p>
          </div>

          {/* Scanner Viewfinder */}
          <div className="relative w-[260px] h-[260px] max-w-full bg-black/5 rounded-3xl overflow-hidden border-2 border-dashed border-outline-variant/40 flex items-center justify-center flex-shrink-0">
            {/* Corner Markers */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
            <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl"></div>

            {/* Scanning Line Animation */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary shadow-[0_0_15px_rgba(66,0,147,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
            
            <span className="material-symbols-outlined text-[64px] text-on-surface-variant/30">qr_code_scanner</span>
          </div>

          <div className="flex gap-4 w-[320px] max-w-full px-4 pt-4">
            <button 
              onClick={() => {
                setIsScanning(false);
                setShowSuccess(true);
              }}
              className="w-full py-3.5 bg-surface-container-low border border-outline-variant/20 rounded-xl font-bold text-[14px] text-on-surface-variant active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[20px]">image</span>
              Gallery
            </button>
            <button 
              className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-[14px] active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[20px]">flash_on</span>
              Flash
            </button>
          </div>
        </div>
      ) : (
        /* Success Mock Flow */
        <div className="w-full flex flex-col items-center justify-center space-y-6 min-h-[60vh] py-8 animate-reveal">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 flex-shrink-0 animate-[bounce_1s_ease-in-out]">
            <span className="material-symbols-outlined text-[40px]" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>
          </div>
          
          <div className="text-center w-[320px] max-w-full px-4 space-y-1">
            <h2 className="font-display text-[22px] font-black text-on-surface">Customer Identified</h2>
            <p className="text-on-surface-variant text-[14px]">Scan successful for <span className="font-bold text-on-surface">Rahul Sharma</span></p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] w-[320px] max-w-full mx-4 space-y-4 text-left">
            {/* Bill Amount Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Record Purchase Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-black text-primary">₹</span>
                <input 
                  type="number"
                  placeholder="0.00"
                  className="w-full pl-9 pr-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all text-[20px] font-black text-primary placeholder-primary/30"
                />
              </div>
            </div>

            {/* Cashback Grant Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/5 bg-surface-container-low/50">
              <div>
                <p className="font-bold text-[13px] text-on-surface">Grant Cashback</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">10% from your wallet</p>
              </div>
              <div className="w-10 h-6 bg-primary rounded-full p-0.5 cursor-pointer transition-colors shadow-sm relative shadow-primary/20">
                <div className="w-5 h-5 bg-white rounded-full shadow-sm transform translate-x-4 transition-transform" />
              </div>
            </div>
            
            <div className="flex justify-between items-center text-red-500 bg-red-50 p-3 rounded-xl border border-red-100/50">
              <span className="text-[11px] font-bold uppercase tracking-wider">Estimated Deduction</span>
              <span className="text-[13px] font-black">-₹10%</span>
            </div>
          </div>

          <div className="w-[320px] max-w-full px-4 pt-2 space-y-3">
            <button 
              onClick={() => handleApprove()}
              className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-[14px] active:scale-[0.98] transition-transform shadow-md shadow-primary/20"
            >
              Send Cashback Request
            </button>
            <button 
              onClick={() => {
                setShowSuccess(false);
                setIsScanning(true);
              }}
              className="w-full py-3.5 bg-surface-container-low text-on-surface rounded-xl font-bold text-[14px] active:scale-[0.98] transition-transform border border-outline-variant/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tailwind arbitrary keyframe for scanner */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 5%; opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { top: 95%; }
        }
      `}</style>
    </div>
  );
}
