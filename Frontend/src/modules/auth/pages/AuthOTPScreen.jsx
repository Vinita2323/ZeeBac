import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import useUIStore from '../../../store/useUIStore';

export default function AuthOTPScreen() {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(45);
  const [isShake, setIsShake] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const location = useLocation();
  const mobileNumber = location.state?.mobileNumber || '';
  const flow = location.state?.flow || 'login';
  const role = location.state?.role || 'customer';

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
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
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length === 4) {
      setVerified(true);

      if (flow === 'login') {
        // Look up user and set session
        const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
        const user = users.find(u => u.phone === mobileNumber && u.role === role);

        if (!user) {
          setError('Account not found. Please sign up.');
          setVerified(false);
          return;
        }

        // Set current user session via global store
        const login = useAuthStore.getState().login;
        login(user);

        // Also set legacy profile data for existing screens
        if (user.role === 'customer') {
          localStorage.setItem('user_profile', JSON.stringify({
            name: user.name,
            phone: `+91 ${user.phone}`,
            email: user.email
          }));
        }

        // Show success snackbar
        useUIStore.getState().showSnackbar('Logged in successfully!', 'success');

        setTimeout(() => {
          if (user.role === 'vendor') {
            navigate('/vendor');
          } else {
            navigate('/home');
          }
        }, 600);
      } else {
        // Signup flow — just go to location permission (handled by signup flow)
        setTimeout(() => {
          navigate('/location-permission');
        }, 600);
      }
    } else {
      setIsShake(true);
      setTimeout(() => setIsShake(false), 500);
    }
  };

  const handleResend = () => {
    if (timeLeft === 0) {
      setTimeLeft(45);
      setOtp(['', '', '', '']);
      inputRefs.current[0].focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9ff] text-on-surface font-body-lg relative overflow-hidden">

      {/* Decorative Blobs */}
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-container-margin h-16 border-b border-outline-variant/10 bg-white/80 backdrop-blur-md">
        <button
          onClick={() => navigate(role === 'vendor' ? '/vendor-app/login' : '/login')}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container transition-colors active:scale-95 duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Verify Number</span>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[440px] flex flex-col px-container-margin py-xl space-y-lg mt-12 relative z-10">
        <div className="text-left space-y-1">
          <h1 className="text-[26px] font-black tracking-tight text-on-surface leading-tight">Enter Code</h1>
          <p className="text-body-sm text-on-surface-variant">
            We sent a 4-digit OTP to {mobileNumber ? <>your registered number <span className="font-bold text-primary">+91 {mobileNumber}</span></> : 'your registered phone number'}.
          </p>
        </div>

        {/* OTP Entry Grid */}
        <form onSubmit={handleVerify} className="space-y-lg">
          <div className={`flex justify-center gap-4 ${isShake ? 'animate-shake' : ''}`}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                className={`w-14 h-16 bg-white border-2 rounded-xl text-center font-display text-headline-lg text-primary focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none transition-all otp-input ${
                  verified ? 'border-green-500 bg-green-50' : 'border-outline-variant/50'
                }`}
                inputMode="numeric"
                maxLength="1"
                pattern="\d*"
                type="text"
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                autoFocus={index === 0}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={verified}
            className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              verified
                ? 'bg-green-500 text-white'
                : 'btn-primary-gradient text-white hover:opacity-90 active:scale-[0.98]'
            }`}
          >
            {verified ? (
              <>
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                Verified!
              </>
            ) : (
              'Verify & Proceed'
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
      </main>
    </div>
  );
}
