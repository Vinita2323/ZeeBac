import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../../store/useAuthStore';
import useLanguageStore from '../../../../store/useLanguageStore';
import LanguageSelectorModal from '../../../../components/common/LanguageSelectorModal';
import useNotifications from '../../../../hooks/useNotifications';

export default function VendorTopBar() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguageStore();
  const [showLangModal, setShowLangModal] = useState(false);
  const { unreadCount } = useNotifications();

  const handleLogout = () => {
    useAuthStore.getState().logout('vendor');
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
          {/* Switch to Customer App */}
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-[11.5px] font-black cursor-pointer transition-all active:scale-95 shadow-xs"
            title="Switch to Customer / User App"
          >
            <span className="material-symbols-outlined text-[15px]">person</span>
            <span>User App</span>
          </button>
          {/* Language Switcher */}
          <button 
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
            className="flex items-center justify-center px-2.5 py-1 rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary text-[12px] font-bold cursor-pointer transition-all active:scale-95 shadow-xs"
            title={language === 'en' ? 'Switch to Hindi / हिन्दी में बदलें' : 'Switch to English / अंग्रेज़ी में बदलें'}
          >
            <span className="leading-none flex items-center tracking-tight">
              <span className={language === 'en' ? 'text-primary font-black' : 'text-on-surface-variant/50 font-medium'}>Eng</span>
              <span className="text-outline-variant/60 font-normal">/</span>
              <span className={language === 'hi' ? 'text-primary font-black' : 'text-on-surface-variant/50 font-medium'}>हि</span>
            </span>
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
