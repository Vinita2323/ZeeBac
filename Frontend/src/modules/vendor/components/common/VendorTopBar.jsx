import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../../hooks/useNotifications';
import VendorQRModal from '../VendorQRModal';
import useAuthStore from '../../../../store/useAuthStore';
import { VendorAPI } from '../../../../services/api';
import toast from 'react-hot-toast';

export default function VendorTopBar() {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const [showQRModal, setShowQRModal] = useState(false);
  const currentUser = useAuthStore((state) => state.currentUser);
  const updateProfile = useAuthStore((state) => state.updateProfile);

  const [isStoreOpen, setIsStoreOpen] = useState(currentUser?.isStoreOpen !== false);
  const [isTogglingStore, setIsTogglingStore] = useState(false);

  useEffect(() => {
    if (currentUser?.isStoreOpen !== undefined) {
      setIsStoreOpen(currentUser.isStoreOpen !== false);
    }
  }, [currentUser?.isStoreOpen]);

  const handleToggleStoreStatus = async () => {
    const nextStatus = !isStoreOpen;
    setIsTogglingStore(true);
    try {
      const res = await VendorAPI.toggleStoreStatus({ isStoreOpen: nextStatus });
      if (res.success) {
        setIsStoreOpen(nextStatus);
        if (updateProfile) {
          updateProfile({ isStoreOpen: nextStatus });
        }
        toast.success(nextStatus ? '🟢 Store is now Online (Accepting Orders)' : '🔴 Store is now Offline (Closed)');
      }
    } catch (err) {
      toast.error('Failed to update store status');
    } finally {
      setIsTogglingStore(false);
    }
  };

  useEffect(() => {
    const handleOpenQR = () => setShowQRModal(true);
    window.addEventListener('open-store-qr', handleOpenQR);
    return () => window.removeEventListener('open-store-qr', handleOpenQR);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white px-3.5 sm:px-5 py-2.5 flex items-center justify-between border-b border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        {/* Left: Single Brand Logo on Mobile/Tablet (hidden on lg+ where Sidebar displays the logo) */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            onClick={() => navigate('/vendor')}
            className="flex lg:hidden items-center gap-2 cursor-pointer active:scale-95 transition-transform"
          >
            <img
              alt="ZeeBac Logo"
              className="h-11 sm:h-12 w-11 sm:w-12 object-contain shrink-0"
              src="/Logo (6).png"
            />
            <span className="font-display font-black text-[20px] sm:text-[22px] leading-none tracking-tight text-slate-900">
              Zee<span className="text-primary">Bac</span>
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 min-w-0">
            <span className="font-display font-black text-[15px] text-slate-900 truncate max-w-[260px]">
              {currentUser?.storeName || 'Partner Store'}
            </span>
          </div>

          {currentUser?.businessType === 'Manufacturer' ? (
            <span className="hidden xs:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
              <span>🏭</span>
              <span>Manufacturer Hub</span>
            </span>
          ) : (currentUser?.businessType === 'Wholesaler' || currentUser?.businessType === 'Distributor') ? (
            <span className="hidden xs:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
              <span>📦</span>
              <span>Wholesale Hub</span>
            </span>
          ) : (
            <span className="hidden xs:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
              <span>🏪</span>
              <span>Retail Store</span>
            </span>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Store Online / Offline Toggle Pill */}
          <button
            type="button"
            onClick={handleToggleStoreStatus}
            disabled={isTogglingStore}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer active:scale-95 shadow-2xs border ${
              isStoreOpen
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
            }`}
            title={isStoreOpen ? 'Store is Online & Accepting Orders. Tap to Pause.' : 'Store is Offline / Closed. Tap to Open.'}
          >
            <span className="relative flex h-2 w-2">
              {isStoreOpen && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isStoreOpen ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-[11px] font-bold">
              {isStoreOpen ? 'Open' : 'Closed'}
            </span>
          </button>

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
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-rose-500 rounded-full flex items-center justify-center text-white text-[9.5px] font-black px-1 border-[1.5px] border-white shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
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
