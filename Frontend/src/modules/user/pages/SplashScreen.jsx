import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { accessToken, currentUser } = useAuthStore();

  useEffect(() => {
    // Check for existing session using AuthStore (not localStorage)
    const timer = setTimeout(() => {
      if (accessToken && currentUser?.role === 'vendor') {
        navigate('/vendor');
      } else if (accessToken && currentUser?.role === 'customer') {
        navigate('/home');
      } else {
        navigate('/login');
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, [navigate, accessToken, currentUser]);

  return (
    <div className="flex items-center justify-center min-h-screen mesh-gradient relative overflow-hidden select-none">
      {/* Decorative floating orbs */}
      <div className="blob-orb w-72 h-72 bg-primary/20 -top-16 -left-16 animate-drift" />
      <div className="blob-orb w-80 h-80 bg-secondary/15 -bottom-20 -right-10 animate-drift-reverse" />
      <div className="blob-orb w-56 h-56 bg-blue-400/10 top-1/3 right-0 animate-drift" />

      {/* Main Content Container */}
      <main className="relative z-10 flex flex-col items-center justify-between h-full py-16 min-h-screen w-full">
        <div className="flex-grow flex items-center justify-center">
          <div className="flex flex-col items-center animate-reveal">
            <div className="glass-panel rounded-[2.5rem] p-8 flex flex-col items-center">
              <img
                src="/Logo (6).png"
                alt="Zeebac Logo"
                className="w-40 md:w-56 h-auto drop-shadow-lg mb-2 animate-float"
              />
              <p className="font-caption text-[12px] text-primary/70 tracking-[0.2em] mt-2 uppercase font-bold">
                Premium Rewards
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Loading Section */}
        <div className="flex flex-col items-center justify-end pb-12">
          {/* Shimmer loading bar */}
          <div className="relative w-[140px] h-[4px] bg-primary/10 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full w-full btn-primary-gradient"
              style={{
                animation: 'shimmer-progress 1.8s infinite ease-in-out'
              }}
            />
          </div>
          <p className="font-caption text-[12px] text-on-surface-variant mt-6 tracking-widest font-bold">
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
