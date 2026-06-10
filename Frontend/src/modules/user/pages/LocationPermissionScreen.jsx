import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LocationPermissionScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle'); // 'idle', 'requesting', 'authorized'

  const handleEnableLocation = () => {
    setStatus('requesting');
    setTimeout(() => {
      setStatus('authorized');
      setTimeout(() => {
        navigate('/home');
      }, 800);
    }, 1200);
  };

  const handleNotNow = () => {
    navigate('/home');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-container-margin bg-[#f9f9ff] text-on-surface relative overflow-hidden select-none font-body-lg">
      {/* Top AppBar */}
      <header className="fixed top-0 left-0 w-full z-50 px-container-margin py-md flex items-center justify-between">
        <div className="font-display text-headline-lg-mobile text-primary tracking-tight font-black">Zeebac</div>
        <button 
          onClick={handleNotNow}
          className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <main className="w-full max-w-[440px] flex flex-col items-center text-center mt-12 z-10 space-y-lg">
        {/* Illustration Section */}
        <div className="relative w-full aspect-square flex items-center justify-center">
          {/* Background Decorative Blobs */}
          <div className="absolute w-64 h-64 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute w-48 h-48 bg-secondary/10 rounded-full blur-2xl -bottom-4 -right-4"></div>
          
          {/* Glassmorphic Map Component */}
          <div className="relative glass-card w-72 h-72 rounded-[40px] shadow-2xl flex items-center justify-center overflow-hidden animate-float">
            <span className="material-symbols-outlined text-primary text-[96px] animate-[pulse_2s_infinite]">my_location</span>
          </div>
        </div>

        {/* Text Area */}
        <div className="space-y-md">
          <h1 className="text-headline-lg-mobile font-black tracking-tight text-on-surface">Find Vendors Nearby</h1>
          <p className="text-body-lg text-on-surface-variant max-w-[320px] mx-auto">
            We use your location to show you the best cashback deals in your neighborhood. Enjoy exclusive rewards at local shops.
          </p>
        </div>

        {/* Actions button */}
        <div className="w-full space-y-sm">
          <button 
            onClick={handleEnableLocation}
            disabled={status !== 'idle'}
            className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform duration-100 cursor-pointer"
          >
            {status === 'idle' && (
              <>
                <span className="material-symbols-outlined">near_me</span>
                Enable Location Access
              </>
            )}
            {status === 'requesting' && (
              <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            )}
            {status === 'authorized' && (
              <>
                <span className="material-symbols-outlined text-green-300">check_circle</span>
                Location Authorized!
              </>
            )}
          </button>
          
          <button 
            onClick={handleNotNow}
            className="w-full h-12 bg-transparent text-secondary font-title-md active:opacity-75 transition-opacity cursor-pointer"
          >
            Not Now
          </button>
        </div>
      </main>
    </div>
  );
}
