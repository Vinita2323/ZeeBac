import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { AuthAPI } from '../../../services/api';

export default function AuthLoginScreen({ role = 'customer', initialMode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isVendor = role === 'vendor';

  // Determine initial mode from URL (?mode=register / ?tab=register) or prop
  const [authMode, setAuthMode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryMode = (params.get('mode') || params.get('tab') || params.get('flow') || '').toLowerCase();
      if (queryMode === 'register' || queryMode === 'signup' || window.location.pathname.includes('/signup') || window.location.pathname.includes('/register')) {
        return 'register';
      }
    } catch {
      // fallback
    }
    return initialMode || 'login';
  });

  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState('');
  const [isNotFound, setIsNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Optional referral code for customer signups
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('ref') || params.get('referral') || '').trim().toUpperCase();
    } catch {
      return '';
    }
  });
  const [showReferralInput, setShowReferralInput] = useState(Boolean(referralCode));

  // If already authenticated for this role, auto-redirect immediately
  useEffect(() => {
    const state = useAuthStore.getState();
    const hasVendor = Boolean(
      state.vendorToken ||
      localStorage.getItem('zeebac_vendor_token') ||
      (localStorage.getItem('zeebac_current_user')?.includes('"vendor"') && localStorage.getItem('zeebac_access_token'))
    );
    const hasCustomer = Boolean(
      state.customerToken ||
      localStorage.getItem('zeebac_customer_token') ||
      (localStorage.getItem('zeebac_current_user')?.includes('"customer"') && localStorage.getItem('zeebac_access_token'))
    );

    if (isVendor && hasVendor) {
      navigate('/vendor', { replace: true });
    } else if (!isVendor && hasCustomer) {
      navigate('/home', { replace: true });
    }
  }, [isVendor, navigate]);

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 10) {
      setMobileNumber(value);
      setError('');
      setIsNotFound(false);
    }
  };

  const isFormValid = isVendor
    ? mobileNumber.length === 10
    : authMode === 'register'
    ? fullName.trim().length >= 2 && mobileNumber.length === 10
    : mobileNumber.length === 10;

  const handleContinue = async (e) => {
    e.preventDefault();

    if (!isVendor && authMode === 'register') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name (at least 2 letters).');
        return;
      }
    }

    if (mobileNumber.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      setIsNotFound(false);
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setIsNotFound(false);

      await AuthAPI.sendOtp({
        phone: mobileNumber,
        purpose: 'login',
        role,
      });

      navigate(isVendor ? '/vendor-app/verify-otp' : '/verify-otp', {
        state: {
          mobileNumber,
          flow: authMode,
          role,
          referralCode: referralCode.trim().toUpperCase(),
          fullName: !isVendor && authMode === 'register' ? fullName.trim() : '',
        },
      });
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      if (isVendor && (status === 404 || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('please register'))) {
        setIsNotFound(true);
      } else {
        setError(msg);
      }
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
            Pay seamlessly or discover partner stores to get instant points & rewards credited directly to your wallet.
          </p>

          <div className="mt-8 flex items-center gap-6">
            <div>
              <p className="text-2xl font-black text-slate-900 leading-none">100%</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Instant Payouts</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div>
              <p className="text-2xl font-black text-purple-700 leading-none">₹2 Crore+</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Cashback Distributed</p>
            </div>
          </div>
        </div>

        {/* Right: Modern Single-Card Login / Registration Form */}
        <main className="w-full max-w-[430px] mx-auto bg-white/90 backdrop-blur-2xl border border-white/80 rounded-[2rem] p-6 md:p-8 shadow-2xl shadow-slate-900/10 space-y-5 animate-reveal text-left relative">
          {/* Back button for Vendor */}
          {isVendor && (
            <button
              type="button"
              onClick={() => navigate('/vendor-app')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to Overview
            </button>
          )}

          {/* Header Brand & Logo */}
          <div className="flex flex-col items-center justify-center text-center space-y-2 pt-1">
            <img
              alt="Zeebac Logo"
              className="w-28 h-auto drop-shadow-sm transition-transform hover:scale-105"
              src="/Logo (6).png"
            />
            {isVendor ? (
              <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[11px] font-extrabold uppercase tracking-wider rounded-full mt-1">
                Vendor Partner Portal
              </span>
            ) : null}
          </div>

          {/* Segmented Mode Selector: Sign In vs Register (Customer Only) */}
          {!isVendor && (
            <div className="flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-white text-purple-700 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">login</span>
                <span>Sign In / लॉग इन</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
                  authMode === 'register'
                    ? 'bg-gradient-to-r from-purple-700 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                <span>New User / रजिस्टर</span>
                <span className="absolute -top-1.5 -right-1 px-1.5 py-0.5 bg-amber-400 text-amber-950 text-[9px] font-black rounded-full shadow-xs leading-none">
                  FREE
                </span>
              </button>
            </div>
          )}

          {/* Mode Title & Guidance */}
          {!isVendor && (
            <div>
              {authMode === 'register' ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-purple-700">
                    <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                    <h2 className="text-[18px] font-black text-slate-900">Create New Account</h2>
                  </div>
                  <p className="text-slate-500 text-[12px] font-medium leading-snug">
                    Enter your name & mobile number to register and claim instant welcome cashback points.
                  </p>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200/70 rounded-xl text-purple-800 text-[11px] font-bold">
                    <span className="material-symbols-outlined text-[15px] text-purple-600">stars</span>
                    <span>₹100 Welcome Points credited on first signup!</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <h2 className="text-[18px] font-black text-slate-900">Welcome Back</h2>
                  <p className="text-slate-500 text-[12.5px] font-medium">
                    Enter your registered 10-digit mobile number to sign in.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Vendor Title */}
          {isVendor && (
            <div>
              <h2 className="text-[18px] font-black text-slate-900">Partner Login</h2>
              <p className="text-slate-500 text-[12.5px] font-medium mt-0.5">
                Enter your registered mobile number to manage your store.
              </p>
            </div>
          )}

          {/* Referral Code Applied Pill (Customer Register/Login) */}
          {!isVendor && referralCode && (
            <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-[11.5px] font-bold animate-reveal">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">card_giftcard</span>
                <span>Referral <strong className="font-mono text-emerald-950">{referralCode}</strong> applied (+₹25 bonus)</span>
              </div>
              <button
                type="button"
                onClick={() => setReferralCode('')}
                className="text-slate-400 hover:text-slate-700 text-xs px-1"
                title="Remove referral code"
              >
                ✕
              </button>
            </div>
          )}

          {/* Main Form */}
          <form className="space-y-4" onSubmit={handleContinue}>
            {/* Full Name Field (Customer Register Mode Only) */}
            {!isVendor && authMode === 'register' && (
              <div className="space-y-1.5 animate-reveal">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Full Name <span className="text-purple-600 font-semibold lowercase">/ पूरा नाम *</span>
                </label>
                <div className="relative flex items-center h-13 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm focus-within:border-purple-600 focus-within:bg-white transition-all">
                  <div className="flex items-center justify-center pl-3.5 pr-2 text-slate-400">
                    <span className="material-symbols-outlined text-[20px]">person</span>
                  </div>
                  <input
                    autoFocus
                    className="flex-1 h-full pr-4 bg-transparent border-none outline-none text-slate-900 font-bold text-sm placeholder:text-slate-400 placeholder:font-normal"
                    placeholder="Enter your full name (e.g. Rahul Sharma)"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setError('');
                    }}
                    required
                  />
                </div>
              </div>
            )}

            {/* Mobile Number Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Mobile Number <span className="text-purple-600 font-semibold lowercase">/ मोबाइल नंबर *</span>
              </label>

              <div className="relative flex items-center h-13 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm focus-within:border-purple-600 focus-within:bg-white transition-all">
                {/* Country Code Block */}
                <div className="flex items-center justify-center px-3.5 h-full border-r border-slate-200 text-slate-700 font-bold text-sm select-none">
                  <span>+91</span>
                </div>

                {/* Input Field */}
                <input
                  autoFocus={isVendor || authMode === 'login'}
                  className="flex-1 h-full px-4 bg-transparent border-none outline-none text-slate-900 font-bold text-sm placeholder:text-slate-400 placeholder:font-normal"
                  maxLength="10"
                  placeholder="Enter 10-digit number"
                  type="tel"
                  value={mobileNumber}
                  onChange={handlePhoneChange}
                  required
                />
              </div>
            </div>

            {/* Optional Manual Referral Code input for Customer */}
            {!isVendor && !referralCode && (
              <div className="pt-0.5">
                {!showReferralInput ? (
                  <button
                    type="button"
                    onClick={() => setShowReferralInput(true)}
                    className="text-[11.5px] font-bold text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">card_giftcard</span>
                    <span>Have a referral code? (Optional) / रेफरल कोड जोड़ें</span>
                  </button>
                ) : (
                  <div className="space-y-1 animate-reveal">
                    <label className="text-[11px] font-bold text-slate-600">Referral Code (Optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="e.g. ZEEBACUSER150"
                        className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-800 outline-none focus:border-purple-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowReferralInput(false)}
                        className="px-2.5 text-xs text-slate-400 hover:text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Unregistered Vendor Banner */}
            {isNotFound && isVendor && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5 animate-reveal">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <span className="material-symbols-outlined text-amber-600 text-[18px]">store</span>
                  <span>Not a registered Partner?</span>
                </div>
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  No vendor account was found for <span className="font-bold">+91 {mobileNumber}</span>. Register your business to start growing with Zeebac!
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/vendor-app/signup')}
                  className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>Register Your Business</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2 animate-reveal">
                <span className="material-symbols-outlined text-base">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit CTA Button */}
            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className={`w-full h-13 rounded-2xl font-bold text-sm tracking-wide text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                isFormValid && !isLoading
                  ? isVendor
                    ? 'bg-amber-600 hover:bg-amber-700 active:scale-[0.98]'
                    : 'bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 hover:opacity-95 shadow-purple-600/25 active:scale-[0.98]'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {isVendor
                      ? 'Continue'
                      : authMode === 'register'
                      ? 'Register & Get OTP'
                      : 'Get OTP & Sign In'}
                  </span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </>
              )}
            </button>

            {/* Toggle Mode Switcher (Customer Only) */}
            {!isVendor && (
              <div className="text-center pt-1 border-t border-slate-100 mt-2">
                {authMode === 'register' ? (
                  <p className="text-xs text-slate-600">
                    Already have a Zeebac account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setError('');
                      }}
                      className="font-black text-purple-700 hover:underline cursor-pointer"
                    >
                      Sign In / लॉग इन करें →
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">
                    New to Zeebac?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setError('');
                      }}
                      className="font-black text-purple-700 hover:underline cursor-pointer"
                    >
                      Create Account / नया अकाउंट बनाएं →
                    </button>
                  </p>
                )}
              </div>
            )}

            {/* Bottom link for Vendor registration */}
            {isVendor && (
              <div className="text-center pt-1">
                <span className="text-xs text-slate-500">Don't have a partner account? </span>
                <button
                  type="button"
                  onClick={() => navigate('/vendor-app/signup')}
                  className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
                >
                  Register Business
                </button>
              </div>
            )}

            {/* Merchant / Rider Cross Links (Customer Mode) */}
            {!isVendor && (
              <div className="pt-2 flex flex-col items-center gap-1 text-[11px] text-slate-500 border-t border-dashed border-slate-200">
                <div className="flex items-center gap-1.5">
                  <span>Store Owner?</span>
                  <button
                    type="button"
                    onClick={() => navigate('/vendor-app/signup')}
                    className="font-bold text-purple-700 hover:underline cursor-pointer"
                  >
                    Register Business
                  </button>
                  <span className="text-slate-300">•</span>
                  <span>Delivery Rider?</span>
                  <button
                    type="button"
                    onClick={() => navigate('/delivery/login')}
                    className="font-bold text-purple-700 hover:underline cursor-pointer"
                  >
                    Join Delivery
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Terms Footer */}
          <p className="text-center text-[10.5px] text-slate-400 pt-1">
            By continuing, you agree to Zeebac's{' '}
            <Link to="/terms" className="text-purple-700 font-bold hover:underline">Terms</Link> and{' '}
            <Link to="/privacy" className="text-purple-700 font-bold hover:underline">Privacy Policy</Link>.
          </p>
        </main>
      </div>
    </div>
  );
}
