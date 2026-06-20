import { useNavigate } from 'react-router-dom';

export default function VendorTopBar() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-white px-4 py-2 flex items-center justify-between">
      <img 
        alt="Zeebac Logo" 
        className="h-[56px] object-contain ml-[-8px] md:hidden cursor-pointer" 
        src="/Logo (6).png"
        onClick={() => navigate('/vendor')}
      />
      <div className="flex items-center gap-1">
        <button 
          onClick={() => navigate('/vendor/notifications')}
          className="text-[#420093] hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-low active:scale-95 relative"
        >
          <span className="material-symbols-outlined text-[26px]">notifications</span>
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-[1.5px] border-white"></span>
        </button>
      </div>
    </header>
  );
}
