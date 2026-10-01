import { useState } from 'react';

// Map Visual: Precise (Selected state shows 3px blue border, city grid, dots, blue pin)
export function PreciseMapVisual({ selected }) {
  return (
    <div
      className={`w-[96px] h-[96px] rounded-full relative overflow-hidden bg-[#eef0f3] flex items-center justify-center transition-all ${
        selected ? 'ring-[3px] ring-[#1a73e8]' : 'ring-2 ring-gray-200'
      }`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full select-none pointer-events-none">
        {/* City grid street lines */}
        <g stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round">
          <line x1="-10" y1="28" x2="110" y2="42" />
          <line x1="-10" y1="52" x2="110" y2="66" />
          <line x1="-10" y1="76" x2="110" y2="90" />
          <line x1="30" y1="-10" x2="16" y2="110" />
          <line x1="58" y1="-10" x2="44" y2="110" />
          <line x1="84" y1="-10" x2="70" y2="110" />
          {/* Subtle minor cross alleys */}
          <line x1="5" y1="5" x2="95" y2="95" strokeWidth="1.2" stroke="#e5e7eb" />
          <line x1="10" y1="90" x2="90" y2="10" strokeWidth="1.2" stroke="#e5e7eb" />
        </g>

        {/* Small landmark dots */}
        <circle cx="28" cy="34" r="2.5" fill="#f59e0b" />
        <circle cx="76" cy="32" r="2.5" fill="#1e3a8a" />
        <circle cx="24" cy="74" r="2.5" fill="#3b82f6" />
        <circle cx="82" cy="76" r="2" fill="#10b981" />

        {/* Pin base shadow */}
        <ellipse cx="50" cy="56" rx="8" ry="3.5" fill="#1a73e8" fillOpacity="0.25" />
        <circle cx="50" cy="56" r="2" fill="#1a73e8" fillOpacity="0.7" />

        {/* Blue Precise Location Pin */}
        <g transform="translate(37, 24)">
          <path
            d="M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21s13-11.9 13-21c0-7.18-5.82-13-13-13z"
            fill="#1a73e8"
          />
          <circle cx="13" cy="12" r="4.5" fill="#ffffff" />
        </g>
      </svg>
    </div>
  );
}

// Map Visual: Approximate (Beige/gray map, yellow/orange highway arteries, route shields, no pin)
export function ApproximateMapVisual({ selected }) {
  return (
    <div
      className={`w-[96px] h-[96px] rounded-full relative overflow-hidden bg-[#f4f3f0] flex items-center justify-center transition-all ${
        selected ? 'ring-[3px] ring-[#1a73e8]' : 'ring-2 ring-gray-200'
      }`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full select-none pointer-events-none">
        {/* Background streets */}
        <g stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M-10 22 Q 40 32 110 18" />
          <path d="M-10 65 Q 50 58 110 74" />
          <path d="M26 -10 Q 30 50 22 110" />
          <path d="M74 -10 Q 70 50 78 110" />
          <path d="M10 85 Q 50 90 90 85" strokeWidth="1.5" />
        </g>

        {/* Yellow and Orange Highway Arteries */}
        <g stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M-5 45 Q 35 15 105 35" />
          <path d="M6 105 Q 40 70 65 -5" />
        </g>
        <g stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M-5 45 Q 35 15 105 35" />
          <path d="M6 105 Q 40 70 65 -5" />
        </g>
        <path d="M-5 82 Q 55 76 105 52" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* Highway shield badges */}
        <g transform="translate(22, 58)">
          <path d="M0 2 Q 0 0 2 0 L 8 0 Q 10 0 10 2 L 10 7 Q 5 11 0 7 Z" fill="#1a73e8" />
          <path d="M0 2 L 10 2 L 10 4.5 L 0 4.5 Z" fill="#ea4335" />
        </g>
        <g transform="translate(52, 68)">
          <path d="M0 2 Q 0 0 2 0 L 8 0 Q 10 0 10 2 L 10 7 Q 5 11 0 7 Z" fill="#1a73e8" />
          <path d="M0 2 L 10 2 L 10 4.5 L 0 4.5 Z" fill="#ea4335" />
        </g>
      </svg>
    </div>
  );
}

// Backwards-compatible export for existing callers importing LocationPreview
export function LocationPreview({ accuracy = 'precise', onChange }) {
  const [internalAccuracy, setInternalAccuracy] = useState('precise');
  const currentAccuracy = accuracy || internalAccuracy;
  const handleChange = onChange || setInternalAccuracy;

  return (
    <div className="flex items-center justify-center gap-6 my-4 select-none">
      <button
        type="button"
        onClick={() => handleChange('precise')}
        className="flex flex-col items-center cursor-pointer group focus:outline-none"
      >
        <PreciseMapVisual selected={currentAccuracy === 'precise'} />
        <span
          className={`text-[13px] mt-2 transition-colors ${
            currentAccuracy === 'precise' ? 'font-bold text-gray-900' : 'font-normal text-gray-500'
          }`}
        >
          Precise
        </span>
      </button>

      <button
        type="button"
        onClick={() => handleChange('approximate')}
        className="flex flex-col items-center cursor-pointer group focus:outline-none"
      >
        <ApproximateMapVisual selected={currentAccuracy === 'approximate'} />
        <span
          className={`text-[13px] mt-2 transition-colors ${
            currentAccuracy === 'approximate' ? 'font-bold text-gray-900' : 'font-normal text-gray-500'
          }`}
        >
          Approximate
        </span>
      </button>
    </div>
  );
}

export default function PermissionPrimerModal({
  open,
  type,
  icon = 'notifications',
  visual = null,
  title,
  message,
  appName = 'Zeebac',
  allowLabel = 'Allow',
  skipLabel = "Don't allow",
  onAllow,
  onSkip,
  isProcessing = false,
}) {
  const [accuracy, setAccuracy] = useState('precise');

  if (!open) return null;

  // Auto-detect permission type
  const detectedType = type || (() => {
    const combined = `${icon || ''} ${title || ''} ${message || ''}`.toLowerCase();
    if (combined.includes('location') || combined.includes('near') || combined.includes('gps') || visual) {
      return 'location';
    }
    if (combined.includes('notif') || combined.includes('alert') || combined.includes('loop')) {
      return 'notification';
    }
    if (combined.includes('camera') || combined.includes('qr') || combined.includes('scan')) {
      return 'camera';
    }
    if (combined.includes('mic') || combined.includes('audio') || combined.includes('call')) {
      return 'mic';
    }
    return 'notification';
  })();

  const isLocation = detectedType === 'location';
  const isNotification = detectedType === 'notification';

  const handleAllowClick = (actionKind) => {
    if (onAllow) {
      onAllow(isLocation ? { action: actionKind, accuracy } : actionKind);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4 select-none animate-reveal">
      <div className="w-full max-w-[330px] bg-white rounded-[28px] shadow-2xl p-6 text-center border border-black/5 animate-reveal">
        {/* Top Icon (Clean Android native style matching user screenshot) */}
        <div className="flex justify-center items-center text-gray-800 mb-2">
          {isLocation && (
            <span className="material-symbols-outlined text-[30px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
          )}
          {isNotification && (
            <span className="material-symbols-outlined text-[30px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              notifications
            </span>
          )}
          {detectedType === 'camera' && (
            <span className="material-symbols-outlined text-[30px]">
              photo_camera
            </span>
          )}
          {detectedType === 'mic' && (
            <span className="material-symbols-outlined text-[30px]">
              mic
            </span>
          )}
          {!isLocation && !isNotification && detectedType !== 'camera' && detectedType !== 'mic' && (
            <span className="material-symbols-outlined text-[30px]">
              {icon || 'info'}
            </span>
          )}
        </div>

        {/* Title: "Allow Zeebac to ..." */}
        <h2 className="text-[17px] text-gray-800 leading-snug px-1">
          {isLocation && (
            <>
              Allow <strong className="font-bold text-gray-900">{appName}</strong> to access this device&apos;s location?
            </>
          )}
          {isNotification && (
            <>
              Allow <strong className="font-bold text-gray-900">{appName}</strong> to send you notifications?
            </>
          )}
          {detectedType === 'camera' && (
            <>
              Allow <strong className="font-bold text-gray-900">{appName}</strong> to take pictures and record video?
            </>
          )}
          {detectedType === 'mic' && (
            <>
              Allow <strong className="font-bold text-gray-900">{appName}</strong> to record audio?
            </>
          )}
          {!isLocation && !isNotification && detectedType !== 'camera' && detectedType !== 'mic' && (
            title || `Allow ${appName} to access permissions?`
          )}
        </h2>

        {/* Map Accuracy Selector for Location (Image 1: Precise vs Approximate) */}
        {isLocation && (
          <div className="flex items-center justify-center gap-6 my-4 select-none">
            <button
              type="button"
              onClick={() => setAccuracy('precise')}
              className="flex flex-col items-center cursor-pointer group focus:outline-none"
            >
              <PreciseMapVisual selected={accuracy === 'precise'} />
              <span
                className={`text-[13px] mt-2 transition-colors ${
                  accuracy === 'precise' ? 'font-bold text-gray-900' : 'font-normal text-gray-500'
                }`}
              >
                Precise
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAccuracy('approximate')}
              className="flex flex-col items-center cursor-pointer group focus:outline-none"
            >
              <ApproximateMapVisual selected={accuracy === 'approximate'} />
              <span
                className={`text-[13px] mt-2 transition-colors ${
                  accuracy === 'approximate' ? 'font-bold text-gray-900' : 'font-normal text-gray-500'
                }`}
              >
                Approximate
              </span>
            </button>
          </div>
        )}

        {/* Action Buttons: Exact Android System Permission Buttons in system blue.
            The "While using the app / Only this time" split is a real, distinct
            choice only for location (Android's actual permission model) — camera
            and mic are plain Allow/Deny on the web, so they keep the simple
            2-button branch below, which also respects a caller's custom
            allowLabel/skipLabel (e.g. "Allow & Answer", "I'll enter their ID"). */}
        {isLocation ? (
          <div className="w-full mt-4 pt-1 border-t border-gray-100 flex flex-col items-center">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAllowClick('while_using')}
              className="w-full py-3.5 text-center text-[#1a73e8] font-bold text-[15px] hover:bg-blue-50/50 active:bg-blue-100/60 rounded-full transition-colors cursor-pointer select-none disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <span className="w-4 h-4 border-2 border-[#1a73e8] border-t-transparent rounded-full animate-spin" />
              ) : (
                'While using the app'
              )}
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAllowClick('only_this_time')}
              className="w-full py-3.5 text-center text-[#1a73e8] font-bold text-[15px] hover:bg-blue-50/50 active:bg-blue-100/60 rounded-full transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              Only this time
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={onSkip}
              className="w-full py-3.5 text-center text-[#1a73e8] font-bold text-[15px] hover:bg-blue-50/50 active:bg-blue-100/60 rounded-full transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              Don&apos;t allow
            </button>
          </div>
        ) : (
          <div className="w-full mt-6 pt-1 border-t border-gray-100 flex flex-col items-center">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAllowClick('allow')}
              className="w-full py-3.5 text-center text-[#1a73e8] font-bold text-[15px] hover:bg-blue-50/50 active:bg-blue-100/60 rounded-full transition-colors cursor-pointer select-none disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <span className="w-4 h-4 border-2 border-[#1a73e8] border-t-transparent rounded-full animate-spin" />
              ) : (
                allowLabel || 'Allow'
              )}
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={onSkip}
              className="w-full py-3.5 text-center text-[#1a73e8] font-bold text-[15px] hover:bg-blue-50/50 active:bg-blue-100/60 rounded-full transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              {skipLabel || "Don't allow"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
