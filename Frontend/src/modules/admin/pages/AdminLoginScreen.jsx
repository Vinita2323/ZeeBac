import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { AuthAPI } from '../../../services/api';

export default function AdminLoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError('');
      
      const response = await AuthAPI.adminLogin({ email, password });
      
      useAuthStore.getState().login(response.admin, response.accessToken, response.refreshToken);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid admin credentials.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4 sm:p-6 font-body-lg text-slate-900 relative overflow-hidden">
      
      {/* Decorative ambient background glows */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-600/15 blur-3xl -top-32 -right-32 pointer-events-none animate-pulse" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-3xl -bottom-32 -left-32 pointer-events-none" />

      <div className={`relative z-10 w-full max-w-md bg-white/90 backdrop-blur-2xl p-7 sm:p-9 rounded-3xl border border-white/80 shadow-2xl shadow-slate-900/10 ${isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <img src="/Logo (6).png" alt="Zeebac" className="w-32 h-auto drop-shadow-sm mb-3 transition-transform hover:scale-105" />
          <span className="inline-block px-3.5 py-1 bg-purple-600/10 text-purple-700 border border-purple-600/20 text-[11px] font-extrabold uppercase tracking-widest rounded-full mb-2">
            Super Admin Control Center
          </span>
          <p className="text-slate-500 text-xs font-semibold">Sign in to access platform controls & analytics</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider pl-1">Admin Email</label>
            <div className="relative flex items-center h-14 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
              <span className="material-symbols-outlined text-slate-400 text-xl pl-4 pr-2">mail</span>
              <input 
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="admin@zeebac.com"
                className="w-full h-full bg-transparent pr-4 text-slate-900 font-bold text-sm placeholder:text-slate-400 placeholder:font-normal outline-none border-none focus:outline-none focus:ring-0"
                style={{ outline: 'none', boxShadow: 'none' }}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider pl-1">Password</label>
            <div className="relative flex items-center h-14 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
              <span className="material-symbols-outlined text-slate-400 text-xl pl-4 pr-2">lock</span>
              <input 
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full h-full bg-transparent pr-4 text-slate-900 font-bold text-sm placeholder:text-slate-400 placeholder:font-normal outline-none border-none focus:outline-none focus:ring-0"
                style={{ outline: 'none', boxShadow: 'none' }}
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 animate-reveal">
              <span className="material-symbols-outlined text-rose-600 text-base">error</span>
              <p className="text-rose-600 text-xs font-semibold leading-tight">{error}</p>
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className={`w-full h-14 mt-4 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/25 ${isLoading ? 'bg-purple-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 hover:opacity-95 active:scale-[0.98] cursor-pointer'}`}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Authenticate
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </>
            )}
          </button>
        </form>
        
        {/* Footer Note */}
        <p className="text-center text-[11px] text-slate-400 mt-8 font-semibold">
          🔒 Secure Administrative Session
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
