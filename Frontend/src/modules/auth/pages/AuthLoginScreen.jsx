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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9ff] text-on-surface font-body-lg relative overflow-hidden">

      {/* Decorative Blobs */}
      <div className={`absolute -top-32 -right-32 w-64 h-64 ${isVendor ? 'bg-secondary/8' : 'bg-primary/5'} rounded-full blur-3xl pointer-events-none`} />
      <div className={`absolute -bottom-32 -left-32 w-72 h-72 ${isVendor ? 'bg-primary/5' : 'bg-secondary/5'} rounded-full blur-3xl pointer-events-none`} />

      <main className="w-full max-w-[440px] flex flex-col px-container-margin py-6 md:py-10 space-y-5 md:space-y-6 relative z-10">

        {/* Welcome Logo */}
        <div className="w-full flex flex-col items-center justify-center pt-2 pb-1">
          <img
            alt="Zeebac Logo"
            className="w-36 md:w-48 h-auto drop-shadow-md"
            src="/Logo (6).png"
          />
          {isVendor && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-secondary/10 rounded-full mt-3">
              <span className="material-symbols-outlined text-secondary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
              <span className="text-[12px] font-black text-secondary uppercase tracking-widest">Vendor Partner</span>
            </div>
          )}
        </div>


        {/* Mobile Number Entry Form */}
        <form className="space-y-5" onSubmit={handleContinue}>
          <div className="space-y-1.5 text-left">
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase">MOBILE NUMBER</label>
            <div className="flex items-center gap-xs h-[56px]">
              {/* Country Code Picker */}
              <div className="flex items-center justify-center px-md h-full bg-[#F3F4F6] rounded-xl cursor-pointer hover:bg-surface-container transition-colors group">
                <span className="font-title-md text-on-surface">+91</span>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] ml-1 group-hover:translate-y-0.5 transition-transform">keyboard_arrow_down</span>
              </div>
              {/* Number Input */}
              <div className="flex-1 h-full relative">
                <input
                  autoFocus
                  className={`w-full h-full px-md bg-[#F3F4F6] rounded-xl outline-none border-2 border-transparent focus:border-[#420093] focus:bg-white text-body-lg placeholder:text-outline transition-all ${isFormValid ? 'border-[#420093] bg-white' : ''}`}
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
            disabled={!isFormValid}
            className={`w-full h-[56px] rounded-xl font-title-md text-on-primary shadow-lg transition-all flex items-center justify-center cursor-pointer ${isFormValid
              ? (isVendor ? 'bg-secondary hover:bg-secondary/90 text-white' : 'btn-primary-gradient hover:opacity-90') + ' active:scale-[0.98]'
              : 'bg-outline-variant/60 cursor-not-allowed opacity-50'}`}
          >
            Continue
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
        <p className="text-center text-[11px] text-on-surface-variant pt-2 mt-auto">
          By continuing, you agree to our <Link to="/terms" className="text-secondary font-bold hover:underline">Terms</Link> and <Link to="/privacy" className="text-secondary font-bold hover:underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
