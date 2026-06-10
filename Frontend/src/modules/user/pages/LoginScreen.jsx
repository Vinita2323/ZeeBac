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
      navigate('/verify-otp');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9ff] text-on-surface font-body-lg">
      <main className="w-full max-w-[440px] flex flex-col px-container-margin py-xl space-y-lg">
        
        {/* Welcome Image Illustration */}
        <div className="relative overflow-hidden rounded-xl aspect-[4/3] w-full flex items-center justify-center shadow-lg bg-surface-container-low">
          <img 
            alt="Welcome Illustration" 
            className="w-full h-full object-cover" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCkQ53e83kMjUCESoFhZrvjzXFDD3ZJ5PFdSVAN4OIJQve06lxI5gHAPr17d94Ye6vOjVpsl14r09UC0bC5AlQIbqQal8am74nwS-g2ZhSvCx_HA4R_CcYosz4I4x4Uh6jzCX3SWJWJpGVWdj4yF_hDdTYzoUJ07wTtaHDEdsdhBRGXOMjlM2JAWnYd7afykLgG7_F6z0lsDkKMNksegHX-CXEYzNI-4_T1ApCobFWRCL024CT7-D9l6rthVxSqJXqXW1KAr6uilc_O"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white/40 to-transparent"></div>
        </div>

        {/* Identity Section */}
        <div className="space-y-xs text-center">
          <h1 className="text-headline-lg-mobile text-primary tracking-tight font-extrabold">Welcome to Zeebac</h1>
          <p className="text-body-sm text-on-surface-variant">The premium ecosystem for rewards and global transactions.</p>
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
                  className={`w-full h-full px-md bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary-container focus:bg-white text-body-lg placeholder:text-outline transition-all ${isFormValid ? 'ring-2 ring-primary-container bg-white' : ''}`}
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
