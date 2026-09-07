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
      // Call real backend API
      await AuthAPI.sendOtp({ phone: mobileNumber, purpose: 'login', role });

      // Navigate to OTP screen on success
      navigate(isVendor ? '/vendor-app/verify-otp' : '/verify-otp', {
        state: { mobileNumber, flow: 'login', role }
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const accent = isVendor ? 'secondary' : 'primary';

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient text-on-surface font-body-lg relative overflow-hidden p-4 md:p-8">

      {/* Decorative Blobs */}
      <div className={`blob-orb w-80 h-80 ${isVendor ? 'bg-secondary/18' : 'bg-primary/18'} -top-20 -right-20 animate-drift`} />
      <div className={`blob-orb w-72 h-72 ${isVendor ? 'bg-primary/12' : 'bg-secondary/12'} -bottom-24 -left-20 animate-drift-reverse`} />
      <div className="blob-orb w-48 h-48 bg-blue-400/10 top-1/2 left-1/4 animate-drift" />

      <div className="relative z-10 w-full max-w-[960px] grid md:grid-cols-2 items-center gap-10 md:gap-16">

        {/* Left branding panel — desktop only */}
        <div className="hidden md:flex flex-col items-start pl-8">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-white/50 backdrop-blur-sm border border-white/60 rounded-full mb-6 shadow-sm">
            <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span className="text-[12px] font-black text-primary uppercase tracking-widest">Cashback on every purchase</span>
          </div>
          <h1 className="text-[44px] leading-[1.05] font-black tracking-tight text-on-surface mb-4">
            Shop local.<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#7c3aed] to-[#7a2dfe]">Earn real rewards.</span>
          </h1>
          <p className="text-on-surface-variant text-body-lg max-w-[380px] leading-relaxed">
            Scan, pay, and get instant cashback at thousands of partner stores near you — all tracked in one beautiful wallet.
          </p>

          <div className="flex items-center gap-6 mt-10">
            <div>
              <p className="text-[26px] font-black text-primary leading-none">10K+</p>
              <p className="text-[12px] text-on-surface-variant font-semibold mt-1">Partner Stores</p>
            </div>
            <div className="w-px h-10 bg-outline-variant/30" />
            <div>
              <p className="text-[26px] font-black text-primary leading-none">₹2Cr+</p>
              <p className="text-[12px] text-on-surface-variant font-semibold mt-1">Cashback Paid</p>
            </div>
          </div>
        </div>

        {/* Right: Login Card */}
        <main className="w-full max-w-[440px] mx-auto flex flex-col glass-panel rounded-[2rem] px-container-margin py-8 md:py-10 space-y-6 animate-reveal">

          {/* Welcome Logo */}
          <div className="w-full flex flex-col items-center justify-center pt-1 pb-1">
            <img
              alt="Zeebac Logo"
              className="w-32 md:w-36 h-auto drop-shadow-md"
              src="/Logo (6).png"
            />
            {isVendor ? (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-secondary/10 rounded-full mt-3">
                <span className="material-symbols-outlined text-secondary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                <span className="text-[12px] font-black text-secondary uppercase tracking-widest">Vendor Partner</span>
              </div>
            ) : (
              <p className="text-on-surface-variant text-[13px] font-semibold mt-2">Welcome back! Let's get you signed in.</p>
            )}
          </div>

          {/* Mobile Number Entry Form */}
          <form className="space-y-5" onSubmit={handleContinue}>
            <div className="space-y-1.5 text-left">
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase">Mobile Number</label>
              <div className="flex items-center gap-xs h-[56px]">
                {/* Country Code Picker */}
                <div className="flex items-center justify-center px-md h-full bg-white/70 border border-white/70 rounded-xl cursor-pointer hover:bg-white transition-colors group shadow-sm">
                  <span className="font-title-md text-on-surface">+91</span>
                  <span className="material-symbols-outlined text-on-surface-variant text-[18px] ml-1 group-hover:translate-y-0.5 transition-transform">keyboard_arrow_down</span>
                </div>
                {/* Number Input */}
                <div className="flex-1 h-full relative">
                  <input
                    autoFocus
                    className={`w-full h-full px-md bg-white/70 rounded-xl outline-none border-2 border-white/70 focus:border-[#7c3aed] focus:bg-white text-body-lg placeholder:text-outline transition-all shadow-sm ${isFormValid ? 'border-[#7c3aed] bg-white' : ''}`}
                    maxLength="10"
                    placeholder="Enter number"
                    type="tel"
                    value={mobileNumber}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px] font-medium flex items-center gap-2 animate-reveal">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className={`w-full h-[56px] rounded-xl font-title-md text-on-primary shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${isFormValid && !isLoading
                ? (isVendor ? 'bg-secondary hover:bg-secondary/90 text-white shadow-secondary/25' : 'btn-primary-gradient hover:opacity-90 shadow-primary/25') + ' active:scale-[0.98]'
                : 'bg-outline-variant/50 cursor-not-allowed opacity-60'}`}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Continue
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="text-center space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-outline-variant/20" />
              <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-outline-variant/20" />
            </div>
            <button
              onClick={() => navigate(isVendor ? '/vendor-app/signup' : '/signup')}
              className={`w-full h-[52px] rounded-xl font-title-md border-2 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer ${
                isVendor
                  ? 'border-secondary/20 text-secondary bg-secondary/5 hover:bg-secondary/10'
                  : 'border-primary/20 text-primary bg-primary/5 hover:bg-primary/10'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{isVendor ? 'store' : 'person_add'}</span>
              {isVendor ? 'Register Your Business' : 'Create New Account'}
            </button>
          </div>

          {/* Footer Note */}
          <p className="text-center text-[11px] text-on-surface-variant pt-1">
            By continuing, you agree to our <Link to="/terms" className="text-secondary font-bold hover:underline">Terms</Link> and <Link to="/privacy" className="text-secondary font-bold hover:underline">Privacy Policy</Link>.
          </p>
        </main>
      </div>
    </div>
  );
}
