import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function SplashScreen() {
  const navigate = useNavigate();
  const [orbTranslate, setOrbTranslate] = useState({ x: 0, y: 0 });
  const { accessToken, currentUser } = useAuthStore();

  useEffect(() => {
    // Parallax motion tracking
    const handleMouseMove = (e) => {
      const x = (window.innerWidth / 2 - e.pageX) / 50;
      const y = (window.innerHeight / 2 - e.pageY) / 50;
      setOrbTranslate({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Check for existing session using AuthStore (not localStorage)
    const timer = setTimeout(() => {
      if (accessToken && currentUser?.role === 'vendor') {
        navigate('/vendor');
      } else if (accessToken && currentUser?.role === 'customer') {
        navigate('/home');
      } else {
        navigate('/login');
      }
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timer);
    };
  }, [navigate, accessToken, currentUser]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white relative overflow-hidden select-none">
      {/* Main Content Container */}
      <main className="relative z-10 flex flex-col items-center justify-between h-full py-16 min-h-screen w-full">
        <div className="flex-grow flex items-center justify-center">
          <div className="flex flex-col items-center animate-reveal">
            <img 
              src="/Logo (6).png" 
              alt="Zeebac Logo" 
              className="w-48 md:w-64 h-auto drop-shadow-md mb-2" 
            />
            <p className="font-caption text-[12px] text-gray-500 tracking-[0.2em] mt-2 uppercase font-medium">
              Premium Rewards
            </p>
          </div>
        </div>

        {/* Bottom Loading Section */}
        <div className="flex flex-col items-center justify-end pb-12">
          {/* Shimmer loading bar */}
          <div className="relative w-[140px] h-[3px] bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-gray-400 to-transparent"
              style={{
                animation: 'shimmer-progress 1.8s infinite ease-in-out'
              }}
            />
          </div>
          <p className="font-caption text-[12px] text-gray-400 mt-6 tracking-widest font-medium">
            SECURELY LOADING
          </p>
        </div>
      </main>

      <style>{`
        @keyframes shimmer-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
