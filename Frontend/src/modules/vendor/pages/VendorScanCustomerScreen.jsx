import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { VendorAPI } from '../../../services/api';

const CAMERA_REGION_ID = 'zeebac-scan-customer-camera';
const FILE_REGION_ID = 'zeebac-scan-customer-file';

export default function VendorScanCustomerScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cameraScannerRef = useRef(null);
  const fileScannerRef = useRef(null);
  const isBusyRef = useRef(false);

  const [query, setQuery] = useState('');
  const [showIdInput, setShowIdInput] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('starting'); // starting | active | denied

  const lookupCustomer = async (searchQuery) => {
    try {
      const res = await VendorAPI.lookupCustomerByPhone(searchQuery);
      if (res.success && res.data) {
        return res.data;
      }
      return null;
    } catch (err) {
      setError(err.response?.data?.message || 'No customer found for that QR code.');
      return null;
    }
  };

  // Shared by the live camera scan, a picked gallery image, and manual entry.
  // Used to hardcode a lookup of test phone 9999999999 regardless of what
  // was actually scanned — this now resolves whatever the QR/manual entry
  // actually says.
  const resolveCustomer = useCallback(async (scannedValue) => {
    if (isBusyRef.current || !scannedValue) return;
    isBusyRef.current = true;
    setIsLoading(true);
    setError('');
    try {
      const customer = await lookupCustomer(scannedValue);
      if (customer) {
        navigate('/vendor/log-transaction', { state: { customer } });
        return; // unmounting
      }
      if (!error) setError('No customer found. Check the ID and try again.');
    } finally {
      setIsLoading(false);
      isBusyRef.current = false;
      cameraScannerRef.current?.resume?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Real camera scanning with safe fallback
  useEffect(() => {
    let cancelled = false;
    let html5QrCode = null;

    try {
      const element = document.getElementById(CAMERA_REGION_ID);
      if (element) {
        html5QrCode = new Html5Qrcode(CAMERA_REGION_ID, { verbose: false });
        cameraScannerRef.current = html5QrCode;

        html5QrCode
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decodedText) => {
              try { html5QrCode?.pause?.(true); } catch (e) {}
              resolveCustomer(decodedText);
            },
            () => {}
          )
          .then(() => { if (!cancelled) setCameraStatus('active'); })
          .catch(() => { if (!cancelled) setCameraStatus('denied'); });
      } else {
        setCameraStatus('denied');
      }
    } catch (err) {
      console.warn("Vendor camera init error:", err);
      if (!cancelled) setCameraStatus('denied');
    }

    return () => {
      cancelled = true;
      if (html5QrCode) {
        try {
          html5QrCode.stop().catch(() => {}).finally(() => {
            try { html5QrCode.clear(); } catch (e) {}
          });
        } catch (e) {}
      }
    };
  }, [resolveCustomer]);

  const handleManualSearch = async () => {
    if (!query.trim() || isLoading) return;
    await resolveCustomer(query.trim());
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isBusyRef.current) return;

    setError('');
    setIsLoading(true);
    try {
      if (!fileScannerRef.current) {
        fileScannerRef.current = new Html5Qrcode(FILE_REGION_ID, { verbose: false });
      }
      const decodedText = await fileScannerRef.current.scanFile(file, false);
      await resolveCustomer(decodedText);
    } catch (err) {
      setError('Could not find a QR code in that image.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white overflow-hidden font-body-lg select-none">
      
      {/* Hidden inputs: gallery picker + an off-screen region html5-qrcode uses to decode picked images */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      <div id={FILE_REGION_ID} className="hidden" />

      {/* Live camera feed */}
      <div
        id={CAMERA_REGION_ID}
        className="absolute inset-0 z-0 bg-neutral-950 [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
      />

      {/* Status / guidance overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
        {cameraStatus !== 'active' && (
          <div className="text-center p-6 space-y-2 text-neutral-400 select-none mb-10">
            <span className="material-symbols-outlined text-[48px] animate-pulse">
              {cameraStatus === 'denied' ? 'videocam_off' : 'qr_code_scanner'}
            </span>
            <p className="text-[14px] font-semibold text-neutral-300">
              {cameraStatus === 'denied' ? 'Camera access denied' : 'Starting camera…'}
            </p>
            <p className="text-[11px] text-neutral-500 max-w-[240px] mx-auto leading-relaxed">
              {cameraStatus === 'denied'
                ? 'Allow camera access in your browser, or use the options below to enter their ID manually'
                : "Point your camera at the customer's Zeebac QR code once it starts"}
            </p>
          </div>
        )}

        {cameraStatus === 'active' && (
          <div className="relative w-64 h-64 border-2 border-dashed border-secondary/60 rounded-3xl flex items-center justify-center">
            <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
            <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl"></div>
            {!isLoading && (
              <div className="absolute left-1 right-1 h-0.5 bg-secondary shadow-[0_0_10px_#6000da] animate-[laser_2.5s_infinite_ease-in-out]"></div>
            )}
            {isLoading && (
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </div>
        )}
      </div>

      {/* Top Header */}
      <div className="absolute top-6 left-0 right-0 px-5 flex items-center justify-between z-20">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>

        <div className="px-4 py-2 rounded-full bg-white/20 backdrop-blur-md text-white text-[12px] font-bold flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${cameraStatus === 'active' ? 'bg-green-400' : cameraStatus === 'denied' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`}
          />
          {cameraStatus === 'active' ? 'Camera Ready' : cameraStatus === 'denied' ? 'No Camera Access' : 'Starting…'}
        </div>

        <div className="w-10 h-10" />
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-10 md:bottom-24 left-0 right-0 px-8 flex justify-between items-center z-20 max-w-[440px] mx-auto">
        <button 
          onClick={handleGalleryClick}
          className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">image</span>
        </button>

        <button 
          onClick={() => setShowIdInput(!showIdInput)}
          className={`px-5 py-3 rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer text-[13px] font-bold ${
            showIdInput 
              ? 'bg-secondary text-white' 
              : 'bg-white/90 text-black'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">dialpad</span>
          Enter ID
        </button>

        <div className="w-12 h-12" />
      </div>

      {/* Manual ID Input Panel */}
      {showIdInput && (
        <div className="absolute bottom-28 md:bottom-44 left-4 right-4 z-30 animate-reveal">
          <div className="bg-white rounded-2xl p-4 shadow-2xl max-w-[400px] mx-auto text-left">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
              <span className="text-[13px] font-bold text-on-surface">Enter Customer's Zeebac ID</span>
            </div>
            
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder="ZBC-1234 or phone"
                className="flex-1 h-12 px-4 bg-[#f3f4f6] rounded-xl outline-none border-2 border-transparent focus:border-secondary text-[15px] font-bold text-on-surface uppercase transition-all"
              />
              <button 
                onClick={handleManualSearch}
                disabled={isLoading}
                className="w-12 h-12 bg-secondary text-white rounded-xl flex items-center justify-center hover:bg-secondary/90 active:scale-95 transition-all shadow-[0_4px_12px_rgba(96,0,218,0.3)] disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                )}
              </button>
            </div>
            
            {error && (
              <p className="text-error text-[11px] mt-2 flex items-center gap-1 font-bold animate-reveal">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {error}
              </p>
            )}
            
            {/* Recent Customers Quick Select */}
            <div className="mt-4 pt-3 border-t border-outline-variant/10">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Recent</p>
              {(() => {
                const currentUser = JSON.parse(localStorage.getItem('zeebac_current_user') || '{}');
                const txns = JSON.parse(localStorage.getItem('zeebac_transactions') || '[]');
                const myTxns = txns.filter(t => t.vendorId === currentUser.zeebacId).slice(0, 3);
                if (myTxns.length === 0) return <p className="text-[11px] text-on-surface-variant/60">No recent transactions yet</p>;
                return (
                  <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
                    {myTxns.map((txn, idx) => (
                      <button
                        key={idx}
                        onClick={() => { 
                          setQuery(txn.customerId); 
                          resolveCustomer(txn.customerId);
                        }}
                        className="px-3 py-1.5 bg-surface-container rounded-lg border border-outline-variant/10 text-[11px] font-bold text-on-surface hover:bg-secondary/10 whitespace-nowrap"
                      >
                        {txn.customerName}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Laser animation */}
      <style>{`
        @keyframes laser {
          0% { top: 4%; }
          50% { top: 96%; }
          100% { top: 4%; }
        }
      `}</style>
    </div>
  );
}
