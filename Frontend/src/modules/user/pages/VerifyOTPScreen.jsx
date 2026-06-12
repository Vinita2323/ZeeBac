import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function VerifyOTPScreen() {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(45);
  const [isShake, setIsShake] = useState(false);
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const location = useLocation();
  const mobileNumber = location.state?.mobileNumber || '';

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

    // Focus next box
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
      // Navigate to location permission first
      navigate('/location-permission');
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9ff] text-on-surface font-body-lg">
      
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-container-margin h-16 border-b border-outline-variant/10">
        <button 
          onClick={() => navigate('/login')}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container transition-colors active:scale-95 duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Verify Number</span>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[440px] flex flex-col px-container-margin py-xl space-y-lg mt-12">
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
                className="w-14 h-16 bg-white border-2 border-outline-variant/50 rounded-xl text-center font-display text-headline-lg text-primary focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none transition-all otp-input"
                inputMode="numeric"
                maxLength="1"
                pattern="\d*"
                type="text"
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
              />
            ))}
          </div>

          <button 
            type="submit"
            className="w-full h-[56px] btn-primary-gradient text-white rounded-xl font-title-md shadow-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
          >
            Verify & Proceed
          </button>
        </form>

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
