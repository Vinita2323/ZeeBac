import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import PermissionPrimerModal from '../../../components/common/PermissionPrimerModal';
import { hasSeenPrimer, markPrimerSeen, usePrimerGate, usePrimerSlot, PRIMER_PRIORITY } from '../../../utils/permissionPrimer.util';

const CAMERA_REGION_ID = 'zeebac-scan-vendor-camera';
const FILE_REGION_ID = 'zeebac-scan-vendor-file';

export default function ScanQRScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cameraScannerRef = useRef(null);
  const fileScannerRef = useRef(null);
  const isBusyRef = useRef(false);

  const [vendorId, setVendorId] = useState('');
  const [inputMode, setInputMode] = useState('storeId'); // 'storeId' | 'utr'
  const [showIdInput, setShowIdInput] = useState(true);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('starting'); // starting | active | denied
  const [cameraPrimed, setCameraPrimed] = useState(hasSeenPrimer('camera'));

  // Interactive POS Bill Payment Modal state
  const [pendingPosBill, setPendingPosBill] = useState(null);
  const [isPayingBill, setIsPayingBill] = useState(false);
  const [billUtrInput, setBillUtrInput] = useState('');
  const [isVerifyingBillUtr, setIsVerifyingBillUtr] = useState(false);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const walletBalance = useAuthStore((state) => state.walletBalance ?? currentUser?.walletBalance ?? 0);

  // Only show the explainer once the shared primer gate is free — queued
  // behind any higher-priority primer (e.g. notifications right after login).
  const showCameraPrimer = usePrimerSlot('camera', PRIMER_PRIORITY.camera, !cameraPrimed);

  // Shared by the live camera scan, a picked gallery image, and manual entry
  // — whichever produced a value, this is what actually resolves it to a
  // vendor. Guards against the camera firing the same successful decode
  // repeatedly per frame while the QR stays in view.
  const resolveVendor = useCallback(async (scannedValue) => {
    if (isBusyRef.current || !scannedValue) return;
    isBusyRef.current = true;
    setIsSearching(true);
    setError('');

    const rawStr = scannedValue.trim();
    const cleanValue = rawStr.toUpperCase();

    // 1. Check if it's a dynamic POS Bill QR or Printed Bill Code (BILL-XXXXXX, ZEEBAC-XXXXXX, or tr=BILL-...)
    let detectedBillCode = null;
    if (rawStr.toLowerCase().startsWith('upi://') || rawStr.includes('tr=')) {
      const trMatch = rawStr.match(/[?&]tr=([^&]+)/i) || rawStr.match(/tr=([^&]+)/i);
      if (trMatch) {
        const trVal = decodeURIComponent(trMatch[1]).trim().toUpperCase();
        if (trVal.startsWith('BILL-') || trVal.startsWith('ZEEBAC-')) {
          detectedBillCode = trVal;
        }
      }
    }
    if (!detectedBillCode && (cleanValue.startsWith('BILL-') || cleanValue.startsWith('ZEEBAC-'))) {
      detectedBillCode = cleanValue;
    }

    if (detectedBillCode) {
      try {
        const billRes = await UserAPI.getPosBillDetails(detectedBillCode);
        if (billRes && billRes.success && billRes.data) {
          if (billRes.paid || billRes.data.status === 'CLAIMED') {
            setError(`Bill #${detectedBillCode} has already been paid and settled.`);
            setIsSearching(false);
            isBusyRef.current = false;
            return;
          }
          // Open interactive POS Checkout Drawer
          setPendingPosBill(billRes.data);
          setIsSearching(false);
          isBusyRef.current = false;
          return;
        }
      } catch (intentErr) {
        // Fallback for offline printed vouchers
        try {
          const posRes = await UserAPI.claimPosBill(detectedBillCode);
          if (posRes.success) {
            useAuthStore.getState().updateBalance(posRes.data.newWalletBalance);
            navigate('/transaction-success', {
              state: {
                vendorName: posRes.data.vendorName,
                amount: posRes.data.amount,
                cashback: posRes.data.cashbackEarned,
                transactionId: posRes.data.transactionId,
                billNumber: detectedBillCode,
                isStoreBill: true,
              }
            });
            return;
          }
        } catch (posErr) {
          const msg = posErr.response?.data?.message || intentErr.response?.data?.message || 'Error processing POS Bill Code';
          setError(msg);
          setIsSearching(false);
          isBusyRef.current = false;
          return;
        }
      }
    }

    // 2. Check if it's a 12-digit UPI UTR / Transaction ID (e.g. from GPay, PhonePe, Paytm)
    if (/^\d{12}$/.test(rawStr) || rawStr.toLowerCase().startsWith('pay_')) {
      try {
        const upiRes = await UserAPI.claimUpiCashback(rawStr);
        if (upiRes.success) {
          useAuthStore.getState().updateBalance(upiRes.data.newWalletBalance);
          navigate('/transaction-success', {
            state: {
              vendorName: upiRes.data.vendorName,
              amount: upiRes.data.amount,
              cashback: upiRes.data.cashbackEarned,
              transactionId: upiRes.data.transactionId,
              isStoreBill: true,
            }
          });
          return;
        }
      } catch (upiErr) {
        if (/^\d{12}$/.test(rawStr)) {
          const msg = upiErr.response?.data?.message || upiErr.message || 'No payment found matching this 12-digit UPI Reference ID.';
          setError(msg);
          setIsSearching(false);
          isBusyRef.current = false;
          return;
        }
      }
    }

    // 3. Standard Vendor Lookup (Store ID / QR Token / UPI Reference)
    let lookupQuery = rawStr;
    if (lookupQuery.toLowerCase().startsWith('upi://') || lookupQuery.includes('tr=')) {
      const trMatch = lookupQuery.match(/tr=([^&]+)/i);
      if (trMatch) {
        lookupQuery = decodeURIComponent(trMatch[1]);
      }
    }

    try {
      const res = await UserAPI.lookupVendor(lookupQuery);
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

  // Handle Pay POS Bill via Zeebac Wallet
  const handlePayPosBillWithWallet = async () => {
    if (!pendingPosBill || isPayingBill) return;
    setIsPayingBill(true);
    setError('');
    try {
      const res = await UserAPI.payPosBillIntent({
        billCode: pendingPosBill.billCode,
        paymentMethod: 'Wallet',
      });
      if (res.success) {
        if (typeof res.data?.newWalletBalance === 'number') {
          useAuthStore.getState().updateBalance(res.data.newWalletBalance);
        }
        navigate('/transaction-success', {
          state: {
            vendorName: pendingPosBill.vendor?.storeName || res.data?.vendorName || 'Zeebac Store',
            vendorZeebacId: pendingPosBill.vendor?.zeebacId || pendingPosBill.vendorZeebacId,
            vendorPhone: pendingPosBill.vendor?.phone,
            amount: pendingPosBill.amount,
            billAmount: pendingPosBill.amount,
            cashback: res.data?.cashbackEarned || pendingPosBill.cashbackAmount,
            transactionId: res.data?.transactionId || res.data?.transaction?.transactionId,
            billNumber: pendingPosBill.billCode,
            items: pendingPosBill.items || [],
            paymentMethod: 'Zeebac Wallet',
            isStoreBill: true,
          }
        });
      } else {
        setError(res.message || 'Payment failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Payment failed');
    } finally {
      setIsPayingBill(false);
    }
  };

  // Open external UPI App for payment
  const handleOpenUpiApp = () => {
    if (!pendingPosBill) return;
    const upiId = pendingPosBill.vendor?.upiId || pendingPosBill.vendor?.bankDetails?.upiId || 'zeebac@upi';
    const storeName = pendingPosBill.vendor?.storeName || 'Zeebac Store';
    const upiUri = pendingPosBill.upiUri || `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${pendingPosBill.amount}&cu=INR&tr=${encodeURIComponent(pendingPosBill.billCode)}&tn=${encodeURIComponent(`Zeebac POS Bill ${pendingPosBill.billCode}`)}`;
    window.location.href = upiUri;
  };

  // Verify external UPI 12-digit UTR
  const handleVerifyBillUtr = async () => {
    if (!pendingPosBill || isVerifyingBillUtr) return;
    const cleanUtr = billUtrInput.replace(/\D/g, '').trim();
    if (cleanUtr.length !== 12) {
      setError('Please enter a valid 12-digit UPI Reference ID (UTR)');
      return;
    }
    setIsVerifyingBillUtr(true);
    setError('');
    try {
      const res = await UserAPI.payPosBillIntent({
        billCode: pendingPosBill.billCode,
        paymentMethod: 'UPI',
        utr: cleanUtr,
      });
      if (res.success) {
        if (typeof res.data?.newWalletBalance === 'number') {
          useAuthStore.getState().updateBalance(res.data.newWalletBalance);
        }
        navigate('/transaction-success', {
          state: {
            vendorName: pendingPosBill.vendor?.storeName || res.data?.vendorName || 'Zeebac Store',
            vendorZeebacId: pendingPosBill.vendor?.zeebacId || pendingPosBill.vendorZeebacId,
            vendorPhone: pendingPosBill.vendor?.phone,
            amount: pendingPosBill.amount,
            billAmount: pendingPosBill.amount,
            cashback: res.data?.cashbackEarned || pendingPosBill.cashbackAmount,
            transactionId: res.data?.transactionId || res.data?.transaction?.transactionId,
            billNumber: pendingPosBill.billCode,
            items: pendingPosBill.items || [],
            paymentMethod: 'UPI',
            isStoreBill: true,
          }
        });
      } else {
        setError(res.message || 'Verification failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'UTR verification failed');
    } finally {
      setIsVerifyingBillUtr(false);
    }
  };

  // Real camera scanning with safe fallback for desktops without webcams
  useEffect(() => {
    if (!cameraPrimed) return;
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
  }, [resolveVendor, cameraPrimed]);

  const handleAllowCamera = () => {
    markPrimerSeen('camera');
    setCameraPrimed(true);
    usePrimerGate.getState().release('camera');
  };

  const handleSkipCamera = () => {
    markPrimerSeen('camera');
    setCameraStatus('denied');
    setShowIdInput(true);
    usePrimerGate.getState().release('camera');
  };

  const handleManualSearch = async () => {
    if (!vendorId.trim() || isSearching) return;
    const cleanInput = vendorId.trim();

    if (inputMode === 'utr') {
      setIsSearching(true);
      setError('');
      try {
        const upiRes = await UserAPI.claimUpiCashback(cleanInput);
        if (upiRes.success) {
          useAuthStore.getState().updateBalance(upiRes.data.newWalletBalance);
          navigate('/transaction-success', {
            state: {
              vendorName: upiRes.data.vendorName,
              amount: upiRes.data.amount,
              cashback: upiRes.data.cashbackEarned,
              transactionId: upiRes.data.transactionId,
            }
          });
          return;
        }
      } catch (upiErr) {
        const msg = upiErr.response?.data?.message || upiErr.message || 'No payment found for this UPI UTR. Please ensure payment was completed.';
        setError(msg);
      } finally {
        setIsSearching(false);
      }
      return;
    }

    await resolveVendor(cleanInput);
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

      <PermissionPrimerModal
        open={showCameraPrimer}
        icon="qr_code_scanner"
        title="Scan to Pay & Earn"
        message="Zeebac needs camera access to scan the vendor's QR code and credit your cashback instantly."
        allowLabel="Enable Camera"
        skipLabel="I'll type the Store ID"
        onAllow={handleAllowCamera}
        onSkip={handleSkipCamera}
      />

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

      {/* Manual Input Panel */}
      {showIdInput && (
        <div className="absolute bottom-44 left-0 right-0 px-4 z-30 animate-reveal">
          <div className="bg-white rounded-2xl p-4 shadow-2xl app-container">
            {/* Input Mode Selector Tabs */}
            <div className="flex bg-[#f3f4f6] p-1 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => { setInputMode('storeId'); setError(''); }}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${inputMode === 'storeId' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                <span className="material-symbols-outlined text-[14px]">store</span>
                Store ID
              </button>
              <button
                type="button"
                onClick={() => { setInputMode('utr'); setError(''); }}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${inputMode === 'utr' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                Claim GPay / UPI UTR
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  {inputMode === 'utr' ? 'receipt' : 'badge'}
                </span>
                {inputMode === 'utr' ? 'Enter 12-Digit UPI Reference No. (UTR)' : "Enter Vendor's Zeebac ID"}
              </span>
              {inputMode === 'utr' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">GPay Backup</span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={vendorId}
                onChange={(e) => {
                  setVendorId(inputMode === 'utr' ? e.target.value.trim() : e.target.value.toUpperCase());
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder={inputMode === 'utr' ? "e.g. 425512345678" : "ZBV-1234"}
                className="flex-1 h-12 px-4 bg-[#f3f4f6] rounded-xl outline-none border-2 border-transparent focus:border-primary text-[14px] font-bold text-on-surface transition-all"
              />
              <button
                onClick={handleManualSearch}
                disabled={!vendorId.trim() || isSearching}
                className="h-12 px-5 bg-primary text-white rounded-xl font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shadow-sm"
              >
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[18px]">
                    {inputMode === 'utr' ? 'redeem' : 'arrow_forward'}
                  </span>
                )}
              </button>
            </div>

            {inputMode === 'utr' && (
              <p className="text-[10px] text-on-surface-variant mt-2 leading-relaxed">
                Paid via Google Pay, PhonePe, or Paytm at the counter? Enter the 12-digit UPI Transaction / Ref ID from your payment screen to claim instant cashback.
              </p>
            )}

            {error && (
              <p className="text-red-500 text-[11px] font-medium mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── INTERACTIVE POS BILL CHECKOUT DRAWER ─── */}
      {pendingPosBill && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end p-0 sm:p-4 animate-reveal select-text">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full mx-auto max-h-[88vh] flex flex-col text-slate-800 shadow-2xl overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">point_of_sale</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-slate-900 text-[15px] leading-tight">
                      {pendingPosBill.vendor?.storeName || 'Store Counter Bill'}
                    </h3>
                    <span className="material-symbols-outlined text-green-500 text-[16px]">verified</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Bill #{pendingPosBill.billCode} • {pendingPosBill.vendor?.category || 'Retail Store'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingPosBill(null);
                  cameraScannerRef.current?.resume?.();
                }}
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Bill Body (Scrollable) */}
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Payable Amount & Cashback Banner */}
              <div className="bg-gradient-to-br from-purple-700 to-indigo-800 rounded-2xl p-4 text-white shadow-md">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-purple-200 uppercase tracking-wider font-semibold">Total Bill Amount</span>
                  <span className="text-2xl font-black">₹{Number(pendingPosBill.amount).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-xs px-3 py-2 rounded-xl text-xs font-medium mt-2">
                  <span className="material-symbols-outlined text-amber-300 text-[18px]">savings</span>
                  <span>
                    🎁 Instant Cashback: <strong className="text-amber-300 font-bold">+₹{Number(pendingPosBill.cashbackAmount || (pendingPosBill.amount * 0.1)).toFixed(2)} ({pendingPosBill.cashbackRate || 10}%)</strong> will be credited to your wallet!
                  </span>
                </div>
              </div>

              {/* Itemized breakdown if items present */}
              {pendingPosBill.items && pendingPosBill.items.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bill Items</h4>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/60 max-h-40 overflow-y-auto">
                    {pendingPosBill.items.map((it, idx) => (
                      <div key={idx} className="p-2.5 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-semibold text-slate-800">{it.name}</span>
                          <span className="text-slate-400 ml-1.5">× {it.quantity || 1}</span>
                        </div>
                        <span className="font-bold text-slate-900">₹{Number(it.total || (it.price * (it.quantity || 1))).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Options */}
              <div className="space-y-2.5 pt-1">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pay & Auto-Confirm</h4>

                {/* Option 1: Zeebac Wallet */}
                <button
                  type="button"
                  onClick={handlePayPosBillWithWallet}
                  disabled={isPayingBill || walletBalance < pendingPosBill.amount}
                  className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer ${
                    walletBalance >= pendingPosBill.amount
                      ? 'border-purple-600 bg-purple-50/80 hover:bg-purple-100/80 text-purple-900 active:scale-[0.99]'
                      : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${walletBalance >= pendingPosBill.amount ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm">Pay from Zeebac Wallet</p>
                      <p className="text-[11px] text-slate-500">
                        Available Balance: ₹{Number(walletBalance).toFixed(2)}
                        {walletBalance < pendingPosBill.amount && ' (Insufficient)'}
                      </p>
                    </div>
                  </div>
                  {isPayingBill ? (
                    <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-600 text-white shadow-xs">
                      ⚡ 1-Tap Pay
                    </span>
                  )}
                </button>

                {/* Option 2: UPI Apps (GPay, PhonePe, Paytm) */}
                <div className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-800">Pay with Any UPI App</p>
                        <p className="text-[11px] text-slate-500">Google Pay, PhonePe, Paytm, BHIM</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenUpiApp}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-xs"
                    >
                      Open UPI App
                    </button>
                  </div>

                  {/* Inline UTR Confirmation */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <p className="text-[10.5px] text-slate-500 mb-1.5 font-medium">
                      Already paid on GPay / PhonePe? Enter 12-digit UTR to auto-confirm & claim cashback:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={12}
                        value={billUtrInput}
                        onChange={(e) => setBillUtrInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="12-digit UTR (e.g. 425512345678)"
                        className="flex-1 px-3 py-2 bg-white rounded-xl text-xs font-mono font-bold border border-slate-200 focus:border-indigo-600 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyBillUtr}
                        disabled={isVerifyingBillUtr || billUtrInput.length !== 12}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                      >
                        {isVerifyingBillUtr ? 'Verifying...' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{error}</span>
                </div>
              )}
            </div>
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
