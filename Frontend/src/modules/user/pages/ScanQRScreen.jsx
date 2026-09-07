import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';

const CAMERA_REGION_ID = 'zeebac-scan-vendor-camera';
const FILE_REGION_ID = 'zeebac-scan-vendor-file';

export default function ScanQRScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cameraScannerRef = useRef(null);
  const fileScannerRef = useRef(null);
  const isBusyRef = useRef(false);

  const [vendorId, setVendorId] = useState('');
  const [showIdInput, setShowIdInput] = useState(true);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('starting'); // starting | active | denied

  // Shared by the live camera scan, a picked gallery image, and manual entry
  // — whichever produced a value, this is what actually resolves it to a
  // vendor. Guards against the camera firing the same successful decode
  // repeatedly per frame while the QR stays in view.
  const resolveVendor = useCallback(async (scannedValue) => {
    if (isBusyRef.current || !scannedValue) return;
    isBusyRef.current = true;
    setIsSearching(true);
    setError('');
    const cleanValue = scannedValue.trim().toUpperCase();

    // 1. Check if it's a POS Printed Bill Code (e.g., ZEEBAC-89214)
    if (cleanValue.startsWith('ZEEBAC-') || cleanValue.startsWith('BILL-')) {
      try {
        const posRes = await UserAPI.claimPosBill(cleanValue);
        if (posRes.success) {
          useAuthStore.getState().updateBalance(posRes.data.newWalletBalance);
          navigate('/transaction-success', {
            state: {
              vendorName: posRes.data.vendorName,
              amount: posRes.data.amount,
              cashback: posRes.data.cashbackEarned,
              transactionId: posRes.data.transactionId,
            }
          });
          return;
        }
      } catch (posErr) {
        const msg = posErr.response?.data?.message || posErr.message || 'Error processing POS Bill Code';
        setError(msg);
        setIsSearching(false);
        isBusyRef.current = false;
        return;
      }
    }

    // 2. Standard Vendor Lookup (Store ID / QR Token)
    try {
      const res = await UserAPI.lookupVendor(scannedValue);
      if (res.success) {
        navigate('/pay-vendor', { state: { vendor: res.data } });
        return;
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No vendor or POS Bill found. Check the ID and try again.');
    } finally {
      setIsSearching(false);
      isBusyRef.current = false;
      cameraScannerRef.current?.resume?.();
    }
  }, [navigate]);

  // Real camera scanning with safe fallback for desktops without webcams
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
              try { html5QrCode?.pause?.(true); } catch (e) { }
              resolveVendor(decodedText);
            },
            () => { }
          )
          .then(() => { if (!cancelled) setCameraStatus('active'); })
          .catch(() => { if (!cancelled) setCameraStatus('denied'); });
      } else {
        setCameraStatus('denied');
      }
    } catch (err) {
      console.warn("Camera init error:", err);
      if (!cancelled) setCameraStatus('denied');
    }

    return () => {
      cancelled = true;
      if (html5QrCode) {
        try {
          html5QrCode.stop().catch(() => { }).finally(() => {
            try { html5QrCode.clear(); } catch (e) { }
          });
        } catch (e) { }
      }
    };
  }, [resolveVendor]);

  const handleManualSearch = async () => {
    if (!vendorId.trim() || isSearching) return;
    await resolveVendor(vendorId.trim());
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isBusyRef.current) return;

    setError('');
    setIsSearching(true);
    try {
      if (!fileScannerRef.current) {
        fileScannerRef.current = new Html5Qrcode(FILE_REGION_ID, { verbose: false });
      }
      const decodedText = await fileScannerRef.current.scanFile(file, false);
      await resolveVendor(decodedText);
    } catch (err) {
      setError('Could not find a QR code in that image.');
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative font-body-lg select-none">

      {/* Hidden inputs: gallery picker + an off-screen region html5-qrcode uses to decode picked images */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      <div id={FILE_REGION_ID} className="hidden" />

      {/* Live camera feed */}
      <div
        id={CAMERA_REGION_ID}
        className="absolute inset-0 z-0 bg-neutral-950 [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
      />

      {/* Status / guidance overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        {cameraStatus !== 'active' && (
          <div className="text-center p-md space-y-sm text-neutral-400 select-none">
            <span className="material-symbols-outlined text-[48px] animate-pulse">
              {cameraStatus === 'denied' ? 'videocam_off' : 'qr_code_scanner'}
            </span>
            <p className="text-body-sm font-semibold text-neutral-300">
              {cameraStatus === 'denied' ? 'Camera access denied' : 'Starting camera…'}
            </p>
            <p className="text-[10px] text-neutral-500 max-w-[240px] mx-auto leading-relaxed">
              {cameraStatus === 'denied'
                ? 'Allow camera access in your browser, or use the options below to enter vendor details manually'
                : 'Point your camera at the vendor\'s QR code once it starts'}
            </p>
          </div>
        )}

        {cameraStatus === 'active' && (
          <div className="w-64 h-64 border-2 border-dashed border-[#a67cff]/60 rounded-3xl relative flex items-center justify-center">
            <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
            <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl"></div>
            {!isSearching && (
              <div className="absolute left-1 right-1 h-0.5 bg-[#a67cff] shadow-[0_0_10px_#a67cff] animate-[laser_2.5s_infinite_ease-in-out]"></div>
            )}
            {isSearching && (
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </div>
        )}
      </div>

      {/* Top Header */}
      <div className="absolute top-6 left-0 right-0 px-5 z-20">
        <div className="app-container flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>

          <div className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-[12px] font-bold flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${cameraStatus === 'active' ? 'bg-green-400' : cameraStatus === 'denied' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`}
            />
            {cameraStatus === 'active' ? 'Camera Ready' : cameraStatus === 'denied' ? 'No Camera Access' : 'Starting…'}
          </div>

          <div className="w-11 h-11" />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-24 left-0 right-0 px-5 z-20">
        <div className="app-container flex justify-between items-center px-4">
          <button
            onClick={handleGalleryClick}
            className="w-12 h-12 rounded-full bg-white text-[#7c3aed] flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">image</span>
          </button>

          <button
            onClick={() => setShowIdInput(!showIdInput)}
            className={`px-5 py-3 rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer text-[13px] font-bold ${showIdInput
              ? 'btn-primary-gradient text-white'
              : 'bg-white/95 text-[#7c3aed]'
              }`}
          >
            <span className="material-symbols-outlined text-[18px]">dialpad</span>
            Type Store ID
          </button>

          <button
            onClick={() => navigate('/find-vendor')}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/20 shadow-lg active:scale-95 transition-all cursor-pointer border border-white/15"
          >
            <span className="material-symbols-outlined text-[24px]">search</span>
          </button>
        </div>
      </div>

      {/* Manual ID Input Panel */}
      {showIdInput && (
        <div className="absolute bottom-44 left-0 right-0 px-4 z-30 animate-reveal">
          <div className="bg-white rounded-2xl p-4 shadow-2xl app-container">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
              <span className="text-[13px] font-bold text-on-surface">Enter Vendor's Zeebac ID</span>
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={vendorId}
                onChange={(e) => { setVendorId(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder="ZBV-1234"
                className="flex-1 h-12 px-4 bg-[#f3f4f6] rounded-xl outline-none border-2 border-transparent focus:border-primary text-[15px] font-bold text-on-surface uppercase transition-all"
              />
              <button
                onClick={handleManualSearch}
                disabled={!vendorId.trim()}
                className="h-12 px-5 bg-primary text-white rounded-xl font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
            {error && (
              <p className="text-red-500 text-[11px] font-medium mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Errors surfaced from a camera/gallery scan */}
      {error && !showIdInput && (
        <div className="absolute bottom-44 left-0 right-0 px-4 z-30 animate-reveal">
          <div className="bg-white rounded-2xl p-4 shadow-2xl app-container flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
            <p className="text-red-600 text-[12px] font-semibold flex-1">{error}</p>
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
