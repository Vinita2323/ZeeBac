import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../../hooks/useNotifications';
import VendorQRModal from '../VendorQRModal';

export default function VendorTopBar() {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const [showQRModal, setShowQRModal] = useState(false);

  useEffect(() => {
    const handleOpenQR = () => setShowQRModal(true);
    window.addEventListener('open-store-qr', handleOpenQR);
    return () => window.removeEventListener('open-store-qr', handleOpenQR);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white px-3.5 sm:px-5 py-2.5 flex items-center justify-between border-b border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        {/* Left: Proper Zeebac Logo */}
        <div className="flex items-center gap-2">
          <img 
            alt="Zeebac Logo" 
            className="h-[44px] sm:h-[48px] object-contain cursor-pointer active:scale-95 transition-transform" 
            src="/Logo (6).png"
            onClick={() => navigate('/vendor')}
          />
        </div>

        {/* Right: Exactly the two options */}
        <div className="flex items-center gap-2">
          {/* 1. Standee Store QR */}
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="w-10 h-10 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-800 flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-purple-100 shadow-xs"
            title="Store Standee QR"
            aria-label="Store Standee QR"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              qr_code_2
            </span>
          </button>

          {/* 2. Notifications Bell with red badge */}
          <button
            type="button"
            onClick={() => navigate('/vendor/notifications')}
            className="w-10 h-10 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-800 flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-purple-100 shadow-xs relative"
            title="Notifications"
            aria-label="Notifications"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {unreadCount > 0 ? (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-rose-500 rounded-full flex items-center justify-center text-white text-[9.5px] font-black px-1 border-[1.5px] border-white shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
            )}
          </button>
        </div>
      </header>

      {/* Counter Standee QR Modal */}
      <VendorQRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
      />
    </>
  );
}
