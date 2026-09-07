import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import useUIStore from '../../../store/useUIStore';
import { AuthAPI } from '../../../services/api';

// Customer signup only — vendor registration lives in
// modules/vendor/pages/onboarding/VendorOnboardingWizard.jsx.
export default function SignupScreen() {
  const navigate = useNavigate();
  const loginPath = '/login';

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // OTP State for Steps 1 & 2
  const [otp, setOtp] = useState(['', '', '', '']);

  // Global Form State
  const [formData, setFormData] = useState({
    phone: '',
    name: '',
    email: '',
    referralCode: '',
  });

  const totalSteps = 3;

  const updateForm = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSendOtp = async () => {
    try {
      setIsLoading(true);
      setError('');
      await AuthAPI.sendOtp({ phone: formData.phone, purpose: 'signup', role: 'customer' });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const goNext = () => { setError(''); setStep(s => s + 1); };
  const goBack = () => { setError(''); setStep(s => s - 1); };

  const handleCreateAccount = async () => {
    try {
      setIsLoading(true);
      setError('');

      const response = await AuthAPI.customerSignup({
        phone: formData.phone,
        otp: otp.join(''),
        name: formData.name,
        email: formData.email,
        referralCode: formData.referralCode
      });

      useAuthStore.getState().login(response.user, response.accessToken, response.refreshToken);
      useUIStore.getState().showSnackbar('Account created successfully!', 'success');
      navigate('/location-permission');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col mesh-gradient text-gray-900 font-body-lg relative overflow-x-hidden">

      {/* Decorative floating orbs (steps 1 & 2 only — step 3 is a dense form) */}
      {step < 3 && (
        <>
          <div className="blob-orb w-72 h-72 bg-primary/15 -top-16 -right-16 animate-drift" />
          <div className="blob-orb w-64 h-64 bg-secondary/12 bottom-10 -left-16 animate-drift-reverse" />
        </>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-[600px] mx-auto w-full flex items-center px-4 h-16">
          {step > 1 ? (
            <button onClick={goBack} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-all cursor-pointer">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          ) : (
            <button onClick={() => navigate(loginPath)} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-all cursor-pointer">
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
          <span className="font-display text-lg font-black ml-3 text-gray-900">
            Create Account
          </span>
          <span className="ml-auto text-[13px] font-bold text-[#7c3aed] bg-[#7c3aed]/10 px-3 py-1 rounded-full">
            {step}/{totalSteps}
          </span>
        </div>
        <div className="h-[2px] bg-gray-100 w-full">
          <div className="h-full bg-[#7c3aed] transition-all duration-500 ease-out" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-[600px] mx-auto w-full relative z-10">

        {/* ================= STEP 1: MOBILE NUMBER ================= */}
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 animate-reveal">
            <div className="w-full max-w-[400px] glass-panel rounded-[2rem] p-7">
              <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">phone_iphone</span>
              </div>
              <h1 className="text-[26px] font-black tracking-tight text-gray-900 leading-tight mb-2">Enter your mobile number</h1>
              <p className="text-[14px] text-gray-500 mb-6">We'll send a 4-digit OTP to verify your number.</p>

              <FloatingInput
                label="Mobile Number"
                icon="phone_iphone"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateForm('phone', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              />

              {error && (
                <p className="mt-3 text-[12.5px] font-bold text-red-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">error</span>{error}
                </p>
              )}

              <button onClick={handleSendOtp} disabled={formData.phone.length !== 10 || isLoading}
                className={`w-full h-12 rounded-xl font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 mt-6 transition-all ${formData.phone.length === 10 && !isLoading ? 'btn-primary-gradient text-white active:scale-[0.98]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Send OTP <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: OTP VERIFICATION ================= */}
        {step === 2 && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 animate-reveal">
            <div className="w-full max-w-[420px] glass-panel rounded-[2rem] p-7 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-5 mx-auto">
                <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">sms</span>
              </div>
              <h1 className="text-[26px] font-black tracking-tight text-gray-900 leading-tight mb-2">Verify your number</h1>
              <p className="text-[14px] text-gray-500 mb-6">Enter the 4-digit code sent to <span className="font-bold text-gray-900">+91 {formData.phone}</span></p>

              <div className="flex justify-center gap-3 mb-2">
                {otp.map((digit, index) => (
                  <input key={index} id={`otp-${index}`}
                    className="w-14 h-16 bg-white/80 border-2 border-gray-200 rounded-xl text-center text-[26px] font-black focus:border-[#7c3aed] focus:shadow-[0_0_0_4px_rgba(91,33,182,0.12)] outline-none transition-all text-gray-800"
                    value={digit} maxLength="1" type="tel"
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val.length > 1) return;
                      const newOtp = [...otp]; newOtp[index] = val; setOtp(newOtp);
                      if (val && index < 3) document.getElementById(`otp-${index + 1}`)?.focus();
                    }}
                    onKeyDown={e => { if (e.key === 'Backspace' && !otp[index] && index > 0) document.getElementById(`otp-${index - 1}`)?.focus(); }}
                  />
                ))}
              </div>

              <button onClick={goNext} disabled={otp.join('').length !== 4}
                className={`w-full h-12 rounded-xl font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 mt-6 transition-all ${otp.join('').length === 4 ? 'btn-primary-gradient text-white active:scale-[0.98]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                Verify <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: CUSTOMER PROFILE ================= */}
        {step === 3 && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 animate-reveal">
            <div className="w-full max-w-[420px] glass-panel rounded-[2rem] p-7">
              <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">badge</span>
              </div>
              <h1 className="text-[26px] font-black tracking-tight text-gray-900 leading-tight mb-5">Complete your profile</h1>
              <div className="space-y-3">
                <FloatingInput label="Full Name" icon="person" value={formData.name} onChange={e => updateForm('name', e.target.value)} />
                <FloatingInput label="Email Address (Optional)" type="email" icon="mail" value={formData.email} onChange={e => updateForm('email', e.target.value)} />
                <div className="pt-2">
                  <FloatingInput label="Referral Code (Optional)" icon="card_giftcard" value={formData.referralCode} onChange={e => updateForm('referralCode', e.target.value)} />
                  <p className="text-[11px] text-[#7c3aed] mt-1 ml-1 font-medium">Got a referral code? Enter it to get a signup bonus!</p>
                </div>
              </div>
              <button onClick={handleCreateAccount} disabled={!formData.name.trim() || isLoading}
                className={`w-full h-12 rounded-xl font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 mt-6 transition-all ${formData.name.trim() && !isLoading ? 'btn-primary-gradient text-white active:scale-[0.98]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Create Account <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
                )}
              </button>
              {error && <p className="mt-4 text-center text-red-500 text-sm font-bold">{error}</p>}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// ─── Shared Premium Components ──────────────────────────────────────────────

function FloatingInput({ label, icon, type = 'text', value, onChange, readOnly, placeholder, multiline }) {
  const [focused, setFocused] = useState(false);
  const isFilled = value && value.length > 0;
  const InputEl = multiline ? 'textarea' : 'input';

  return (
    <div className={`relative flex ${multiline ? 'items-start pt-4' : 'items-center'} bg-white border-2 rounded-lg transition-all duration-300 ${focused ? 'border-[#7c3aed] shadow-[0_0_0_4px_rgba(91,33,182,0.08)]' : 'border-gray-200 hover:border-gray-300'
      } ${readOnly ? 'bg-gray-50 border-gray-200' : ''}`}>

      {icon && (
        <span className={`material-symbols-outlined absolute left-4 transition-colors ${focused ? 'text-[#7c3aed]' : 'text-gray-400'
          } ${multiline ? 'top-5' : ''}`}>{icon}</span>
      )}

      <InputEl
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused || readOnly ? placeholder : ''}
        rows={multiline ? 3 : undefined}
        className={`w-full bg-transparent outline-none px-4 pt-[18px] pb-[10px] text-[15px] font-bold text-gray-900 ${icon ? 'pl-12' : ''
          } ${multiline ? 'resize-none' : ''}`}
      />

      <label className={`absolute transition-all duration-200 pointer-events-none ${icon ? 'left-12' : 'left-4'} ${focused || isFilled || placeholder
        ? 'top-2 text-[11px] font-bold text-[#7c3aed]'
        : `text-[15px] text-gray-500 ${multiline ? 'top-5' : 'top-1/2 -translate-y-1/2'}`
        }`}>
        {label}
      </label>
    </div>
  );
}
