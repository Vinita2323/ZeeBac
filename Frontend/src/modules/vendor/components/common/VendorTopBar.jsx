import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../../store/useAuthStore';
import useLanguageStore from '../../../../store/useLanguageStore';
import LanguageSelectorModal from '../../../../components/common/LanguageSelectorModal';
import useNotifications from '../../../../hooks/useNotifications';

export default function VendorTopBar() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const [showLangModal, setShowLangModal] = useState(false);
  const { unreadCount } = useNotifications();

  const handleLogout = () => {
    useAuthStore.getState().logout();
    window.location.replace('/vendor-app');
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white px-4 py-2 flex items-center justify-between border-b border-outline-variant/10">
        <img 
          alt="Zeebac Logo" 
          className="h-[56px] object-contain ml-[-8px] md:hidden cursor-pointer" 
          src="/Logo (6).png"
          onClick={() => navigate('/vendor')}
        />
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Language Switcher */}
          <button 
            type="button"
            onClick={() => setShowLangModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary text-[11px] font-semibold cursor-pointer transition-all active:scale-95"
            title="Change App Language"
          >
            <span className="material-symbols-outlined text-[13px] text-primary">translate</span>
            <span className="leading-none">{language === 'hi' ? 'हिन्दी' : 'English'}</span>
          </button>

          <button 
            onClick={() => navigate('/vendor/notifications')}
            className="text-[#420093] hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-low active:scale-95 relative"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[24px]">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-black px-0.5 border-[1.5px] border-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button 
            type="button"
            onClick={handleLogout}
            className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:bg-red-50 active:scale-95"
            title="Log Out"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </div>
      </header>

      <LanguageSelectorModal
        isOpen={showLangModal}
        onClose={() => setShowLangModal(false)}
      />
    </>
  );
}
