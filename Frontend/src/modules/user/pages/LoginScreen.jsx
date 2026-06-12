import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginScreen() {
  const [mobileNumber, setMobileNumber] = useState('');
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 10) {
      setMobileNumber(value);
    }
  };

  const isFormValid = mobileNumber.length === 10;

  const handleContinue = (e) => {
    e.preventDefault();
    if (isFormValid) {
      navigate('/verify-otp', { state: { mobileNumber } });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9ff] text-on-surface font-body-lg">
      <main className="w-full max-w-[440px] flex flex-col px-container-margin py-xl space-y-lg">
        
        {/* Welcome Logo */}
        <div className="w-full flex items-center justify-center pt-4 pb-2">
          <img 
            alt="Zeebac Logo" 
            className="w-48 md:w-64 h-auto drop-shadow-md" 
            src="/Logo (6).png"
          />
        </div>

        {/* Identity Section */}
        <div className="space-y-xs text-center">
          <h1 className="text-headline-lg-mobile text-primary tracking-tight font-extrabold">Welcome to Zeebac</h1>
        </div>

        {/* Mobile Number Entry Form */}
        <form className="space-y-lg" onSubmit={handleContinue}>
          <div className="space-y-xs text-left">
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

          <button 
            type="submit"
            disabled={!isFormValid}
            className={`w-full h-[56px] rounded-xl font-title-md text-on-primary shadow-lg transition-all flex items-center justify-center cursor-pointer ${isFormValid ? 'btn-primary-gradient hover:opacity-90 active:scale-[0.98]' : 'bg-outline-variant/60 cursor-not-allowed opacity-50'}`}
          >
            Continue
          </button>
        </form>



        {/* Footer Note */}
        <p className="text-center text-body-sm text-on-surface-variant pt-md">
          By continuing, you agree to our <a className="text-secondary font-bold hover:underline" href="#">Terms</a> and <a class="text-secondary font-bold hover:underline" href="#">Privacy Policy</a>.
        </p>
      </main>
    </div>
  );
}
