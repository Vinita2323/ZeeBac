import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function AdminLoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (email === 'admin@zeebac.com' && password === 'admin123') {
      // Use the global auth store instead of directly modifying localStorage
      useAuthStore.getState().login({ role: 'admin', email: 'admin@zeebac.com', name: 'Super Admin' });
      navigate('/admin');
    } else {
      setError('Invalid admin credentials.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4 font-body-lg text-white">
      <div className={`w-full max-w-[400px] bg-[#1a1a1a] p-8 rounded-3xl border border-white/10 shadow-2xl ${isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <img src="/Logo (6).png" alt="Zeebac" className="h-12 mb-4 brightness-200" />
          <h1 className="font-display text-headline-sm font-black tracking-tight text-white">Admin Portal</h1>
          <p className="text-body-md text-white/50 mt-1">Restricted access only</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[12px] font-bold text-white/70 uppercase tracking-wider pl-1">Admin Email</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-white/40">mail</span>
              <input 
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="admin@zeebac.com"
                className="w-full h-14 bg-black/50 border border-white/10 rounded-xl pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-bold text-white/70 uppercase tracking-wider pl-1">Password</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-white/40">lock</span>
              <input 
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full h-14 bg-black/50 border border-white/10 rounded-xl pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 animate-reveal">
              <span className="material-symbols-outlined text-red-500 text-[18px] mt-0.5">error</span>
              <p className="text-red-500 text-[13px] font-medium leading-tight">{error}</p>
            </div>
          )}

          <button 
            type="submit"
            className="w-full h-14 mt-4 bg-primary text-white font-title-md font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer"
          >
            Authenticate
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </form>
        
        {/* Footer Note */}
        <p className="text-center text-[11px] text-white/30 mt-8 font-mono">
          UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED
        </p>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-10px); }
          80% { transform: translateX(10px); }
        }
      `}} />
    </div>
  );
}
