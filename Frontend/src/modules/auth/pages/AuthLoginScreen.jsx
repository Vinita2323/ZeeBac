import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthAPI } from '../../../services/api';

export default function AuthLoginScreen({ role = 'customer' }) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const isVendor = role === 'vendor';

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 10) {
      setMobileNumber(value);
      setError('');
    }
  };

  const isFormValid = mobileNumber.length === 10;

  const handleContinue = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await AuthAPI.sendOtp({ phone: mobileNumber, purpose: 'login', role });

      navigate(isVendor ? '/vendor-app/verify-otp' : '/verify-otp', {
        state: { mobileNumber, flow: 'login', role }
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950/20 mesh-gradient text-slate-900 font-body-lg relative overflow-hidden p-4 md:p-8">

      {/* Decorative ambient background glows */}
      <div className={`absolute w-[500px] h-[500px] rounded-full ${isVendor ? 'bg-purple-600/10' : 'bg-violet-600/15'} blur-3xl -top-32 -right-32 pointer-events-none animate-pulse`} />
      <div className={`absolute w-[400px] h-[400px] rounded-full ${isVendor ? 'bg-indigo-600/10' : 'bg-fuchsia-600/10'} blur-3xl -bottom-32 -left-32 pointer-events-none`} />

      <div className="relative z-10 w-full max-w-[920px] grid md:grid-cols-2 items-center gap-10 md:gap-16">

        {/* Left Branding Showcase (Desktop) */}
        <div className="hidden md:flex flex-col items-start pl-4 text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/70 backdrop-blur-md rounded-full border border-white/80 shadow-sm mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-[12px] font-bold text-slate-800 tracking-wide">India's Premium Cashback Network</span>
          </div>
          
          <h1 className="text-[42px] leading-[1.1] font-black tracking-tight text-slate-900 mb-4">
            Shop Local.<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-600">
              Earn Instant Cashback.
            </span>
          </h1>

          <p className="text-slate-600 text-base max-w-[360px] leading-relaxed">
            Pay seamlessly or upload bills at thousands of verified partner stores and get real money credited to your wallet.
          </p>

          <div className="flex items-center gap-8 mt-10">
            <div>
              <p className="text-2xl font-black text-purple-700 leading-none">10,000+</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Active Merchants</p>
            </div>
            <div className="w-px h-8 bg-slate-300/60" />
            <div>
              <p className="text-2xl font-black text-purple-700 leading-none">₹2 Crore+</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Cashback Distributed</p>
            </div>
          </div>
        </div>

        {/* Right: Classy Single-Card Login Form */}
        <main className="w-full max-w-[420px] mx-auto bg-white/90 backdrop-blur-2xl border border-white/80 rounded-[2rem] p-7 md:p-9 shadow-2xl shadow-slate-900/10 space-y-6 animate-reveal text-left">

          {/* Header Brand & Logo */}
          <div className="flex flex-col items-center justify-center text-center space-y-2 pt-2">
            <img
              alt="Zeebac Logo"
              className="w-32 h-auto drop-shadow-sm transition-transform hover:scale-105"
              src="/Logo (6).png"
            />
            {isVendor ? (
              <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[11px] font-extrabold uppercase tracking-wider rounded-full mt-1">
                Vendor Partner Portal
              </span>
            ) : (
              <p className="text-slate-500 text-[13px] font-semibold">Welcome back! Sign in with your phone number.</p>
            )}
          </div>

          {/* Unified Single-Border Mobile Input Form */}
          <form className="space-y-5" onSubmit={handleContinue}>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Mobile Number
              </label>

              {/* Single Simple Container — Clean Static Border */}
              <div className="relative flex items-center h-14 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Country Code Block */}
                <div className="flex items-center justify-center px-4 h-full border-r border-slate-200 text-slate-700 font-bold text-base select-none">
                  <span>+91</span>
                </div>

                {/* Input Field */}
                <input
                  autoFocus
                  className="flex-1 h-full px-4 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none text-slate-900 font-bold text-base placeholder:text-slate-400 placeholder:font-normal"
                  style={{ outline: 'none', boxShadow: 'none' }}
                  maxLength="10"
                  placeholder="Enter 10-digit number"
                  type="tel"
                  value={mobileNumber}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2 animate-reveal">
                <span className="material-symbols-outlined text-base">error</span>
                {error}
              </div>
            )}

            {/* Action Button */}
            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className={`w-full h-14 rounded-2xl font-bold text-sm tracking-wide text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                isFormValid && !isLoading
                  ? 'bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 hover:opacity-95 shadow-purple-600/25 active:scale-[0.98]'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Continue
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Registration / Signup Divider */}
          <div className="pt-1 text-center space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              onClick={() => navigate(isVendor ? '/vendor-app/signup' : '/signup')}
              className="w-full h-12 rounded-xl font-bold text-xs text-purple-700 bg-purple-50 hover:bg-purple-100/80 border border-purple-200/60 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">{isVendor ? 'store' : 'person_add'}</span>
              {isVendor ? 'Register Business Partner' : 'Create New Customer Account'}
            </button>
          </div>

          {/* Terms Footer */}
          <p className="text-center text-[11px] text-slate-400 pt-2">
            By continuing, you agree to Zeebac's{' '}
            <Link to="/terms" className="text-purple-700 font-bold hover:underline">Terms</Link> and{' '}
            <Link to="/privacy" className="text-purple-700 font-bold hover:underline">Privacy Policy</Link>.
          </p>
        </main>
      </div>
    </div>
  );
}

