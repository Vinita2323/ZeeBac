import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../../store/useAuthStore';

export default function VendorTopBar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    useAuthStore.getState().logout();
    window.location.replace('/vendor-app/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-white px-4 py-2 flex items-center justify-between border-b border-outline-variant/10">
      <img 
        alt="Zeebac Logo" 
        className="h-[56px] object-contain ml-[-8px] md:hidden cursor-pointer" 
        src="/Logo (6).png"
        onClick={() => navigate('/vendor')}
      />
      <div className="flex items-center gap-1.5 ml-auto">
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
  );
}
