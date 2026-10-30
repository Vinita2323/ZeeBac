import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { AuthAPI } from '../../../services/api';

export default function AuthLoginScreen({ role = 'customer', initialMode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isVendor = role === 'vendor';

  // Determine initial mode from URL or prop
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

  // Optional referral code
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('ref') || params.get('referral') || '').trim().toUpperCase();
    } catch {
      return '';
    }
  });
  const [showReferralInput, setShowReferralInput] = useState(Boolean(referralCode));

  // Auto-redirect if already logged in
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

    if (!isVendor && authMode === 'register' && fullName.trim().length < 2) {
      setError('Please enter your full name');
      return;
    }

    if (mobileNumber.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 font-body-lg p-4">
      <div className="w-full max-w-[400px] bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-900/5 space-y-6">
        {/* Back button for Vendor */}
        {isVendor && (
          <button
            type="button"
            onClick={() => navigate('/vendor-app')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back
          </button>
        )}

        {/* Brand Logo */}
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <img
            alt="Zeebac"
            className="w-28 h-auto"
            src="/Logo (6).png"
          />
          {isVendor && (
            <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold rounded-full">
              Partner Portal
            </span>
          )}
        </div>

        {/* Clean Segmented Tab Switcher (Customer only) */}
        {!isVendor && (
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                authMode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setError('');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                authMode === 'register'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {/* Heading */}
        <div>
          {isVendor ? (
            <div>
              <h1 className="text-xl font-bold text-slate-900">Partner Sign In</h1>
              <p className="text-xs text-slate-500 mt-1">Enter your registered mobile number</p>
            </div>
          ) : authMode === 'register' ? (
            <div>
              <h1 className="text-xl font-bold text-slate-900">Create an account</h1>
              <p className="text-xs text-slate-500 mt-1">Sign up to start earning rewards</p>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-slate-900">Welcome back</h1>
              <p className="text-xs text-slate-500 mt-1">Sign in with your mobile number</p>
            </div>
          )}
        </div>

        {/* Form */}
        <form className="space-y-4" onSubmit={handleContinue}>
          {/* Full Name (Register mode only) */}
          {!isVendor && authMode === 'register' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">Full Name</label>
              <div className="flex items-center h-12 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-purple-600 focus-within:bg-white transition-all px-3">
                <input
                  autoFocus
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter your name"
                  className="w-full bg-transparent border-none outline-none text-slate-900 text-sm font-medium placeholder:text-slate-400"
                  required
                />
              </div>
            </div>
          )}

          {/* Mobile Number */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">Mobile Number</label>
            <div className="flex items-center h-12 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-purple-600 focus-within:bg-white transition-all overflow-hidden">
              <span className="px-3 text-slate-500 text-sm font-medium border-r border-slate-200 select-none">
                +91
              </span>
              <input
                autoFocus={isVendor || authMode === 'login'}
                type="tel"
                maxLength="10"
                value={mobileNumber}
                onChange={handlePhoneChange}
                placeholder="10-digit number"
                className="flex-1 px-3 bg-transparent border-none outline-none text-slate-900 text-sm font-medium placeholder:text-slate-400"
                required
              />
            </div>
          </div>

          {/* Referral Code (Optional for Customer) */}
          {!isVendor && (
            <div>
              {referralCode ? (
                <div className="flex items-center justify-between px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-700">
                  <span className="font-medium">
                    Referral: <strong className="font-mono">{referralCode}</strong> applied
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReferralCode('');
                      setShowReferralInput(false);
                    }}
                    className="text-slate-400 hover:text-slate-600 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ) : showReferralInput ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="Referral code"
                    className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase text-slate-800 outline-none focus:border-purple-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReferralInput(false)}
                    className="px-2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReferralInput(true)}
                  className="text-xs text-purple-700 hover:underline cursor-pointer"
                >
                  + Add referral code
                </button>
              )}
            </div>
          )}

          {/* Unregistered Vendor Prompt */}
          {isNotFound && isVendor && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
              <p className="text-amber-800">
                No merchant account found for <strong>+91 {mobileNumber}</strong>.
              </p>
              <button
                type="button"
                onClick={() => navigate('/vendor-app/signup')}
                className="w-full py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
              >
                Register Business
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={!isFormValid || isLoading}
            className={`w-full h-12 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isFormValid && !isLoading
                ? isVendor
                  ? 'bg-amber-600 hover:bg-amber-700 active:scale-[0.99]'
                  : 'bg-purple-700 hover:bg-purple-800 active:scale-[0.99] shadow-sm'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{authMode === 'register' ? 'Continue' : 'Get OTP'}</span>
            )}
          </button>

          {/* Switch Mode Prompt (Customer only) */}
          {!isVendor && (
            <div className="text-center pt-2 text-xs text-slate-500">
              {authMode === 'register' ? (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setError('');
                    }}
                    className="font-semibold text-purple-700 hover:underline cursor-pointer"
                  >
                    Sign in
                  </button>
                </span>
              ) : (
                <span>
                  New to Zeebac?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setError('');
                    }}
                    className="font-semibold text-purple-700 hover:underline cursor-pointer"
                  >
                    Create an account
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Partner & Rider Links */}
          {!isVendor && (
            <div className="pt-2 flex items-center justify-center gap-3 text-xs text-slate-400 border-t border-slate-100">
              <button
                type="button"
                onClick={() => navigate('/vendor-app/signup')}
                className="hover:text-slate-600 transition-colors cursor-pointer"
              >
                Store partner
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => navigate('/delivery/login')}
                className="hover:text-slate-600 transition-colors cursor-pointer"
              >
                Delivery partner
              </button>
            </div>
          )}
        </form>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="underline hover:text-slate-600">Terms</Link> &{' '}
          <Link to="/privacy" className="underline hover:text-slate-600">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
