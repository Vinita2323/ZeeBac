import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import useUIStore from '../../../store/useUIStore';
import { AuthAPI, UserAPI } from '../../../services/api';
import { markPrimerSeen } from '../../../utils/permissionPrimer.util';

export default function AuthOTPScreen() {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(45);
  const [isShake, setIsShake] = useState(false);
  const [verified, setVerified] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const location = useLocation();
  const mobileNumber = location.state?.mobileNumber || '';
  const flow = location.state?.flow || 'login';
  const role = location.state?.role || 'customer';
  const referralCode = location.state?.referralCode || '';
  const fullName = location.state?.fullName || '';

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleInputChange = (index, value) => {
    const numValue = value.replace(/[^0-9]/g, '');
    if (numValue.length > 1) return;

    const newOtp = [...otp];
    newOtp[index] = numValue;
    setOtp(newOtp);

    if (numValue && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when 4th digit is filled
    if (numValue && index === 3 && newOtp.every((d) => d !== '')) {
      triggerVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const triggerVerify = async (otpString) => {
    if (otpString.length !== 4 || isLoading) return;

    try {
      setIsLoading(true);
      setError('');

      let response;
      if (role === 'vendor') {
        response = await AuthAPI.vendorLogin({ phone: mobileNumber, otp: otpString });
      } else {
        response = await AuthAPI.customerLogin({
          phone: mobileNumber,
          otp: otpString,
          referralCode,
          name: fullName || undefined,
        });
      }

      const { user, vendor, accessToken, refreshToken } = response;
      const account = user || vendor;

      setVerified(true);

      // Set current user session via global store (including tokens and explicit role)
      const login = useAuthStore.getState().login;
      login(account, accessToken, refreshToken, role);

      if (role === 'vendor' || account?.role === 'vendor') {
        useUIStore.getState().showSnackbar('Logged in successfully!', 'success');
        setTimeout(() => {
          navigate('/vendor', { replace: true });
        }, 500);
        return;
      }

      // Customer Flow: Instant Location detection & Direct App Open!
      if (flow === 'register') {
        useUIStore.getState().showSnackbar(`Welcome to Zeebac, ${account?.name || fullName}! Account created 🎉`, 'success');
      } else {
        useUIStore.getState().showSnackbar(`Welcome back, ${account?.name || 'Customer'}!`, 'success');
      }

      setStatusText('Detecting location & opening app...');
      markPrimerSeen('data_consent');
      markPrimerSeen('location');
      markPrimerSeen('notifications');

      // Request background push notifications without blocking
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }

      let hasNavigated = false;
      const openCustomerHome = () => {
        if (hasNavigated) return;
        hasNavigated = true;
        navigate('/home', { replace: true });
      };

      // Fallback safeguard: Never wait more than 2.5s for GPS prompt
      const timeoutId = setTimeout(openCustomerHome, 2500);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            clearTimeout(timeoutId);
            try {
              const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
              try {
                localStorage.setItem('zeebac_location', JSON.stringify(coords));
              } catch (_) {}

              const res = await UserAPI.updateLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
              if (res.success && res.data) {
                useAuthStore.getState().updateProfile(res.data);
              }
            } catch (locErr) {
              console.warn('Location save err:', locErr);
            } finally {
              openCustomerHome();
            }
          },
          (geoErr) => {
            console.warn('Location permission skipped or denied:', geoErr.message);
            clearTimeout(timeoutId);
            openCustomerHome();
          },
          { timeout: 3000, enableHighAccuracy: true }
        );
      } else {
        clearTimeout(timeoutId);
        openCustomerHome();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
      setIsShake(true);
      setTimeout(() => setIsShake(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    triggerVerify(otp.join(''));
  };

  const handleResend = async () => {
    if (timeLeft === 0) {
      try {
        await AuthAPI.sendOtp({ phone: mobileNumber, purpose: 'login', role });
        setTimeLeft(45);
        setOtp(['', '', '', '']);
        inputRefs.current[0]?.focus();
        useUIStore.getState().showSnackbar('OTP resent successfully!', 'success');
        setError('');
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to resend OTP.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center mesh-gradient text-on-surface font-body-lg relative overflow-hidden p-4">
      {/* Decorative Blobs */}
      <div className="blob-orb w-80 h-80 bg-primary/15 -top-24 -right-24 animate-drift" />
      <div className="blob-orb w-64 h-64 bg-secondary/12 -bottom-20 -left-20 animate-drift-reverse" />

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-container-margin h-16 border-b border-outline-variant/10 glass-header">
        <button
          onClick={() => navigate(role === 'vendor' ? '/vendor-app/login' : '/login')}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container transition-colors active:scale-95 duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Verify Number</span>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[440px] flex flex-col glass-panel rounded-[2rem] px-container-margin py-10 space-y-lg mt-12 relative z-10 animate-reveal">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[28px]">
            {verified ? 'check_circle' : 'sms'}
          </span>
        </div>

        <div className="text-left space-y-1">
          <h1 className="text-[26px] font-black tracking-tight text-on-surface leading-tight">
            {verified
              ? 'Phone Verified!'
              : flow === 'register' && fullName
              ? `Welcome, ${fullName}!`
              : 'Enter 4-Digit Code'}
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            {statusText ? (
              <span className="font-bold text-primary animate-pulse">{statusText}</span>
            ) : mobileNumber ? (
              <>
                {flow === 'register' ? 'Verify your number to activate your account. ' : ''}
                We sent an OTP to <span className="font-bold text-primary">+91 {mobileNumber}</span>.
              </>
            ) : (
              'Enter the 4-digit code sent to your phone.'
            )}
          </p>
        </div>

        {/* OTP Entry Grid */}
        <form onSubmit={handleVerify} className="space-y-lg">
          <div className={`flex justify-center gap-4 ${isShake ? 'animate-shake' : ''}`}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                className={`w-12 sm:w-14 h-14 sm:h-16 bg-white border rounded-xl text-center font-display text-2xl text-purple-700 focus:border-purple-600 outline-none transition-colors ${
                  verified ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'
                }`}
                inputMode="numeric"
                maxLength="1"
                pattern="\d*"
                type="text"
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                autoFocus={index === 0}
                disabled={verified || isLoading}
              />
            ))}
          </div>

          <button
            className={`w-full h-[56px] rounded-xl font-title-lg font-bold flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden ${
              otp.join('').length === 4 && !isLoading
                ? 'btn-primary-gradient text-white shadow-lg shadow-primary/25 hover:-translate-y-0.5 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            disabled={otp.join('').length !== 4 || isLoading || verified}
            type="submit"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
            ) : verified ? (
              <>
                <span>Opening App...</span>
                <span className="material-symbols-outlined text-[18px]">check</span>
              </>
            ) : (
              <>
                <span>Verify & Continue</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px] font-medium flex items-center gap-2 animate-reveal">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        {/* Resend Loader Code */}
        {!verified && (
          <div className="text-center">
            {timeLeft > 0 ? (
              <p className="text-body-sm text-on-surface-variant">
                Resend code in <span className="text-primary font-bold">{timeLeft}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                className="text-body-sm text-primary font-bold hover:underline cursor-pointer"
              >
                Resend verification code
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
