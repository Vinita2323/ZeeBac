import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function AuthLoginScreen() {
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 10) {
      setMobileNumber(value);
      setError('');
    }
  };

  const isFormValid = mobileNumber.length === 10;

  const handleContinue = (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    // Check if user exists in mock DB
    const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
    const existingUser = users.find(u => u.phone === mobileNumber);

    if (!existingUser) {
      setError('No account found with this number. Please sign up first.');
      return;
    }

    navigate('/verify-otp', { state: { mobileNumber, flow: 'login' } });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9ff] text-on-surface font-body-lg relative overflow-hidden">

      {/* Decorative Blobs */}
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      <main className="w-full max-w-[440px] flex flex-col px-container-margin py-xl space-y-lg relative z-10">

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
          <p className="text-[14px] text-on-surface-variant">Enter your mobile number to sign in</p>
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
            className={`w-full h-[56px] rounded-xl font-title-md text-on-primary shadow-lg transition-all flex items-center justify-center cursor-pointer ${isFormValid ? 'btn-primary-gradient hover:opacity-90 active:scale-[0.98]' : 'bg-outline-variant/60 cursor-not-allowed opacity-50'}`}
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
            onClick={() => navigate('/signup')}
            className="w-full h-[52px] rounded-xl font-title-md border-2 border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            Create New Account
          </button>
        </div>

        {/* Footer Note */}
        <p className="text-center text-body-sm text-on-surface-variant pt-md">
          By continuing, you agree to our <Link to="/terms" className="text-secondary font-bold hover:underline">Terms</Link> and <Link to="/privacy" className="text-secondary font-bold hover:underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
