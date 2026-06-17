import { useNavigate } from 'react-router-dom';

export default function VendorTopBar() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-[#f8f9fc]/90 backdrop-blur-md px-4 py-2 flex items-center justify-between">
      <img 
        alt="Zeebac Logo" 
        className="h-[40px] object-contain ml-[-8px] md:hidden" 
        src="/Logo (6).png"
      />
      <div className="flex items-center gap-1">
        <span className="hidden md:inline-block px-1.5 py-0.5 bg-primary/10 text-primary text-[9px] font-bold uppercase rounded tracking-wider mr-2">
          Vendor
        </span>
        <button 
          onClick={() => navigate('/vendor/notifications')}
          className="text-on-surface hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-low active:scale-95 relative"
        >
          <span className="material-symbols-outlined text-[26px]">notifications</span>
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-[1.5px] border-[#f8f9fc]"></span>
        </button>
      </div>
    </header>
  );
}
