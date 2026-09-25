import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../../store/useAuthStore';
import useLanguageStore from '../../../../store/useLanguageStore';
import LanguageSelectorModal from '../../../../components/common/LanguageSelectorModal';

export default function VendorTopBar() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const [showLangModal, setShowLangModal] = useState(false);

  const handleLogout = () => {
    useAuthStore.getState().logout();
    window.location.replace('/vendor-app/login');
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/5 hover:bg-primary/10 border border-primary/20 text-primary text-[11.5px] font-bold cursor-pointer transition-colors active:scale-95 mr-1"
            title="Change App Language"
          >
            <span className="material-symbols-outlined text-[15px]">translate</span>
            <span>{language === 'hi' ? 'हिन्दी' : 'English'}</span>
          </button>

          {/* Prominent Help & Support Highlight Button */}
          <button 
            type="button"
            onClick={() => navigate('/vendor/support')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-[#25D366] hover:from-emerald-600 hover:to-emerald-500 text-white font-black text-[12px] cursor-pointer shadow-sm hover:shadow active:scale-95 transition-all mr-1"
            title="Help & Support - WhatsApp & Helpline"
          >
            <span className="material-symbols-outlined text-[17px]">support_agent</span>
            <span className="hidden sm:inline">Help &amp; Support</span>
            <span className="sm:hidden">Help</span>
          </button>

          <button 
            onClick={() => navigate('/vendor/notifications')}
            className="text-[#420093] hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-low active:scale-95 relative"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[24px]">notifications</span>
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-[1.5px] border-white"></span>
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
