import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashScreen() {
  const navigate = useNavigate();
  const [orbTranslate, setOrbTranslate] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Parallax motion tracking
    const handleMouseMove = (e) => {
      const x = (window.innerWidth / 2 - e.pageX) / 50;
      const y = (window.innerHeight / 2 - e.pageY) / 50;
      setOrbTranslate({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Timeout redirection
    const timer = setTimeout(() => {
      navigate('/login');
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen premium-gradient relative overflow-hidden select-none">
      {/* Atmospheric Background Orbs */}
      <div 
        className="absolute rounded-full bg-[#C7AAFF] w-[400px] h-[400px] -top-20 -left-20 filter blur-[80px] opacity-40 z-0 transition-transform duration-75 ease-out"
        style={{ transform: `translate(${orbTranslate.x}px, ${orbTranslate.y}px)` }}
      />
      <div 
        className="absolute rounded-full bg-[#420093] w-[500px] h-[500px] -bottom-32 -right-20 filter blur-[80px] opacity-40 z-0 transition-transform duration-75 ease-out"
        style={{ transform: `translate(${-orbTranslate.x}px, ${-orbTranslate.y}px)` }}
      />

      {/* Main Content Container */}
      <main className="relative z-10 flex flex-col items-center justify-between h-full py-16 min-h-screen">
        <div className="flex-grow flex items-center justify-center">
          <div className="flex flex-col items-center animate-reveal">
            <h1 className="font-display text-[48px] leading-none font-black text-white tracking-tighter drop-shadow-2xl">
              Zeebac
            </h1>
            <p className="font-caption text-[12px] text-white/60 tracking-[0.2em] mt-4 uppercase">
              Premium Rewards
            </p>
          </div>
        </div>

        {/* Bottom Loading Section */}
        <div className="flex flex-col items-center justify-end pb-12">
          {/* Shimmer loading bar */}
          <div className="relative w-[140px] h-[3px] bg-white/20 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-white/80 to-transparent animate-[shimmer_1.8s_infinite_ease-in-out]"
              style={{
                animation: 'shimmer-progress 1.8s infinite ease-in-out'
              }}
            />
          </div>
          <p className="font-caption text-[12px] text-white/40 mt-6 tracking-widest">
            SECURELY LOADING
          </p>
        </div>
      </main>

      {/* Glassmorphic Overlay for Depth */}
      <div className="absolute inset-0 bg-white/5 pointer-events-none" />

      <style>{`
        @keyframes shimmer-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
