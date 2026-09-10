import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { AuthAPI } from '../../../services/api';

export default function AdminLoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen w-full flex items-center justify-center mesh-gradient p-4 sm:p-6 text-slate-900 relative overflow-hidden">
      
      {/* Decorative ambient background glows */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-600/15 blur-3xl -top-32 -right-32 pointer-events-none animate-pulse" />
      <div className="absolute w-[450px] h-[450px] rounded-full bg-indigo-600/15 blur-3xl -bottom-32 -left-32 pointer-events-none" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-purple-400/10 blur-2xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      {/* Main Login Card - Explicitly sized to avoid container collision */}
      <div 
        className={`relative z-10 w-full max-w-[440px] bg-white/95 backdrop-blur-2xl p-8 sm:p-10 rounded-3xl border border-purple-100/80 shadow-[0_20px_50px_rgba(30,8,66,0.12)] transition-all ${isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
        style={{ minWidth: '320px' }}
      >
        
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100/60 mb-4 shadow-sm">
            <img src="/Logo (6).png" alt="Zeebac" className="w-28 sm:w-32 h-auto drop-shadow-sm transition-transform hover:scale-105" />
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-purple-50 text-purple-700 border border-purple-200/80 text-[11px] font-extrabold uppercase tracking-wider rounded-full mb-2.5">
            <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
            Super Admin Control Center
          </div>
          <p className="text-slate-500 text-xs sm:text-sm font-medium">
            Sign in to access platform controls & analytics
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider pl-1">
              Admin Email
            </label>
            <div className="relative flex items-center h-13 bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/90 focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-600/20 transition-all overflow-hidden">
              <span className="material-symbols-outlined text-slate-400 text-xl pl-4 pr-2 select-none">
                mail
              </span>
              <input 
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="admin@zeebac.com"
                className="w-full h-full bg-transparent pr-4 text-slate-900 font-semibold text-sm placeholder:text-slate-400 placeholder:font-normal outline-none border-none focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider pl-1">
              Password
            </label>
            <div className="relative flex items-center h-13 bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-200/90 focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-600/20 transition-all overflow-hidden">
              <span className="material-symbols-outlined text-slate-400 text-xl pl-4 pr-2 select-none">
                lock
              </span>
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••••••"
                className="w-full h-full bg-transparent pr-2 text-slate-900 font-semibold text-sm placeholder:text-slate-400 placeholder:font-normal outline-none border-none focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="pr-4 pl-2 text-slate-400 hover:text-purple-600 transition-colors focus:outline-none"
                tabIndex={-1}
              >
                <span className="material-symbols-outlined text-xl select-none">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-center gap-2.5 animate-reveal text-left">
              <span className="material-symbols-outlined text-rose-600 text-lg flex-shrink-0">
                error
              </span>
              <p className="text-rose-600 text-xs font-semibold leading-tight">{error}</p>
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className={`w-full h-13 mt-2 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/25 ${
              isLoading 
                ? 'bg-purple-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 hover:from-purple-800 hover:to-indigo-700 active:scale-[0.99] cursor-pointer'
            }`}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Authenticate</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </>
            )}
          </button>
        </form>
        
        {/* Footer Note */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-400 font-medium">
          <span className="material-symbols-outlined text-sm text-slate-400">verified_user</span>
          <span>End-to-End Encrypted Administrative Session</span>
        </div>
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
