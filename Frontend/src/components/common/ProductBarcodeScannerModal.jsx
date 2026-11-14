import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

// Audio beep synthesizer on successful scan
const playBeep = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    if (navigator.vibrate) navigator.vibrate(50);
  } catch (_) {}
};

export default function ProductBarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Product Barcode',
  subtitle = 'Hold product barcode inside the viewfinder',
}) {
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('initializing'); // 'initializing' | 'active' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scannedSuccess, setScannedSuccess] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const scannerRef = useRef(null);
  const readerElementId = useRef(`barcode-reader-${Math.random().toString(36).substring(2, 9)}`).current;
  const isStoppingRef = useRef(false);

  // Initialize and start scanner when opened
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    isStoppingRef.current = false;
    setCameraStatus('initializing');
    setErrorMessage('');
    setScannedSuccess(false);

    const startScanner = async () => {
      try {
        // Enumerate devices to prefer the rear/environment camera
        let availableCameras = [];
        try {
          availableCameras = await Html5Qrcode.getCameras();
          if (isMounted) setCameras(availableCameras || []);
        } catch (e) {
          console.warn('Could not enumerate cameras:', e);
        }

        if (!isMounted) return;

        // Find rear/back camera (on mobile devices, label usually includes 'back' / 'rear' / 'environment'
        // or it's the last camera in the list)
        let selectedConfig = { facingMode: 'environment' };
        if (availableCameras && availableCameras.length > 0) {
          const rearIndex = availableCameras.findIndex((c) =>
            /back|rear|environment|wide|camera\s*0/i.test(c.label)
          );
          const chosenIdx = rearIndex >= 0 ? rearIndex : availableCameras.length - 1;
          if (isMounted) setCurrentCameraIndex(chosenIdx);
          selectedConfig = { deviceId: { exact: availableCameras[chosenIdx].id } };
        }

        // Ensure container element exists in DOM
        const el = document.getElementById(readerElementId);
        if (!el) {
          if (isMounted) {
            setCameraStatus('error');
            setErrorMessage('Scanner viewfinder element not found in DOM.');
          }
          return;
        }

        const html5Qr = new Html5Qrcode(readerElementId, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        });
        scannerRef.current = html5Qr;

        await html5Qr.start(
          selectedConfig,
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // Wide rectangular box perfect for both standard 1D product barcodes (EAN-13, UPC) and 2D QR codes
              const width = Math.min(Math.floor(viewfinderWidth * 0.88), 320);
              const height = Math.min(Math.floor(viewfinderHeight * 0.6), 220);
              return { width: Math.max(width, 240), height: Math.max(height, 160) };
            },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (isStoppingRef.current) return;
            isStoppingRef.current = true;
            playBeep();
            setScannedSuccess(true);
            try {
              html5Qr.pause(true);
            } catch (_) {}
            setTimeout(() => {
              onScan(decodedText);
              handleClose();
            }, 300);
          },
          () => {}
        );

        if (isMounted) {
          setCameraStatus('active');
          // Check if torch/flashlight is supported
          try {
            const capabilities = html5Qr.getRunningTrackCapabilities();
            if (capabilities && capabilities.torch) {
              setHasTorch(true);
            }
          } catch (_) {}
        }
      } catch (err) {
        console.error('Barcode scanner start error:', err);
        // Fallback: try plain { facingMode: "environment" } if deviceId failed
        try {
          if (!scannerRef.current && isMounted) {
            const fallbackQr = new Html5Qrcode(readerElementId, {
              formatsToSupport: SUPPORTED_FORMATS,
              verbose: false,
            });
            scannerRef.current = fallbackQr;
            await fallbackQr.start(
              { facingMode: 'environment' },
              {
                fps: 15,
                qrbox: { width: 260, height: 180 },
              },
              (decodedText) => {
                if (isStoppingRef.current) return;
                isStoppingRef.current = true;
                playBeep();
                setScannedSuccess(true);
                setTimeout(() => {
                  onScan(decodedText);
                  handleClose();
                }, 300);
              },
              () => {}
            );
            if (isMounted) setCameraStatus('active');
            return;
          }
        } catch (fallbackErr) {
          console.error('Fallback camera error:', fallbackErr);
        }

        if (isMounted) {
          setCameraStatus('error');
          setErrorMessage(
            err.name === 'NotAllowedError' || err.message?.includes('Permission')
              ? 'Camera permission denied. Please allow camera permissions in browser settings or type the barcode below.'
              : 'Unable to access rear camera. You can flip camera or enter barcode manually below.'
          );
        }
      }
    };

    const timer = setTimeout(startScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopCurrentScanner();
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCurrentScanner = async () => {
    isStoppingRef.current = true;
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (_) {}
      scannerRef.current = null;
    }
  };

  const handleClose = async () => {
    await stopCurrentScanner();
    onClose();
  };

  // Flip/switch camera between available devices
  const handleSwitchCamera = async () => {
    if (!cameras.length || cameras.length < 2) return;
    await stopCurrentScanner();
    const nextIdx = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIdx);
    setCameraStatus('initializing');
    isStoppingRef.current = false;

    try {
      const html5Qr = new Html5Qrcode(readerElementId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = html5Qr;

      await html5Qr.start(
        { deviceId: { exact: cameras[nextIdx].id } },
        {
          fps: 15,
          qrbox: (w, h) => ({
            width: Math.max(Math.floor(w * 0.85), 240),
            height: Math.max(Math.floor(h * 0.55), 160),
          }),
        },
        (decodedText) => {
          if (isStoppingRef.current) return;
          isStoppingRef.current = true;
          playBeep();
          setScannedSuccess(true);
          setTimeout(() => {
            onScan(decodedText);
            handleClose();
          }, 300);
        },
        () => {}
      );
      setCameraStatus('active');
    } catch (err) {
      console.error('Failed to switch camera:', err);
      setCameraStatus('error');
      setErrorMessage('Could not switch to selected camera.');
    }
  };

  // Toggle Torch / Flashlight
  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch toggle not supported:', err);
    }
  };

  const handleManualSubmit = (e) => {
    e?.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    playBeep();
    onScan(trimmed);
    handleClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-reveal select-none">
      <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-[380px] w-full shadow-2xl text-center space-y-4 relative overflow-hidden border border-slate-100">
        {/* Header with Title and Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="text-left min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="material-symbols-outlined text-[20px] text-purple-700">barcode_scanner</span>
              <h3 className="font-display font-black text-[16px] sm:text-[17px] text-slate-900 truncate">
                {title}
              </h3>
            </div>
            <p className="text-[11.5px] text-slate-500">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
          {/* HTML5 QR reader mounts its video here */}
          <div
            id={readerElementId}
            className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />

          {/* Loading Spinner */}
          {cameraStatus === 'initializing' && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 z-10 text-white">
              <div className="w-8 h-8 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-[12px] font-bold text-slate-300">Starting Rear Camera...</p>
            </div>
          )}

          {/* Error Message */}
          {cameraStatus === 'error' && (
            <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-4 z-10 text-white space-y-3">
              <div className="w-11 h-11 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">videocam_off</span>
              </div>
              <p className="text-[12px] text-slate-300 leading-snug">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-[12px] font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Enter Barcode Manually
              </button>
            </div>
          )}

          {/* Scanning Overlay Corners & Laser Line */}
          {cameraStatus === 'active' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 p-5">
              <div
                className={`relative w-[85%] h-[60%] rounded-xl transition-all ${
                  scannedSuccess
                    ? 'border-4 border-emerald-400 bg-emerald-500/20 shadow-[0_0_25px_rgba(52,211,153,0.8)]'
                    : 'border-2 border-dashed border-white/60'
                }`}
              >
                {/* 4 Framing Corner Brackets */}
                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-3 border-l-3 border-purple-400 rounded-tl-sm" />
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-3 border-r-3 border-purple-400 rounded-tr-sm" />
                <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-3 border-l-3 border-purple-400 rounded-bl-sm" />
                <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-3 border-r-3 border-purple-400 rounded-br-sm" />

                {/* Animated Red Laser Scan Line */}
                {!scannedSuccess && (
                  <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-scan-bounce" />
                )}
              </div>
            </div>
          )}

          {/* Floating Controls Overlay: Switch Camera & Torch */}
          {cameraStatus === 'active' && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
              {hasTorch && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md ${
                    isTorchOn
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'bg-black/50 text-white backdrop-blur-sm hover:bg-black/70'
                  }`}
                  title={isTorchOn ? 'Turn off flash' : 'Turn on flash'}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isTorchOn ? 'flashlight_on' : 'flashlight_off'}
                  </span>
                </button>
              )}

              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="w-9 h-9 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95"
                  title="Switch camera (Flip)"
                >
                  <span className="material-symbols-outlined text-[18px]">flip_camera_ios</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions: Manual Entry Toggle / Input */}
        <div className="space-y-2 pt-1">
          {showManualInput ? (
            <form onSubmit={handleManualSubmit} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter barcode or SKU..."
                  className="flex-1 h-11 px-3 bg-slate-50 border-2 border-purple-200 focus:border-purple-600 rounded-xl text-[13px] font-mono font-bold text-slate-900 outline-none"
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="h-11 px-4 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowManualInput(false)}
                className="text-[11.5px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Back to Camera Scanner
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between text-[11.5px] text-slate-500 px-1">
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Rear Camera Ready
              </span>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="font-bold text-purple-700 hover:underline cursor-pointer"
              >
                Type Barcode Manually
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
