import { useState } from 'react';
import { AuthAPI } from '../../../../../services/api';
import useAuthStore from '../../../../../store/useAuthStore';
import FloatingInput from '../components/FloatingInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StepAccount({ onComplete }) {
  const [phase, setPhase] = useState('form'); // 'form' | 'otp'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validateForm = () => {
    const next = {};
    if (!name.trim() || name.trim().length < 2) next.name = 'Enter your full name';
    if (phone.length !== 10) next.phone = 'Enter a valid 10-digit mobile number';
    if (email && !EMAIL_RE.test(email)) next.email = 'Enter a valid email address';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSendOtp = async () => {
    if (!validateForm() || isLoading) return;
    setIsLoading(true);
    setApiError('');
    try {
      await AuthAPI.sendOtp({ phone, purpose: 'signup', role: 'vendor' });
      setPhase('otp');
    } catch (err) {
      setApiError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndCreate = async () => {
    const otpString = otp.join('');
    if (otpString.length !== 4 || isLoading) return;
    setIsLoading(true);
    setApiError('');
    try {
      const res = await AuthAPI.vendorRegister({ phone, otp: otpString, name: name.trim(), email });
      useAuthStore.getState().login(res.vendor, res.accessToken, res.refreshToken);
      onComplete(res.vendor);
    } catch (err) {
      setApiError(err.response?.data?.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const numValue = value.replace(/[^0-9]/g, '');
    if (numValue.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = numValue;
    setOtp(newOtp);
    if (numValue && index < 3) document.getElementById(`vendor-otp-${index + 1}`)?.focus();
  };

  return (
    <div className="w-full max-w-[440px] glass-panel rounded-[2rem] p-7">
      <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">storefront</span>
      </div>

      {phase === 'form' ? (
        <>
          <h1 className="text-[26px] font-black tracking-tight text-gray-900 leading-tight mb-2">Create your vendor account</h1>
          <p className="text-[14px] text-gray-500 mb-6">Let's start with the basics. We'll verify your mobile number with an OTP.</p>

          <div className="space-y-3">
            <FloatingInput label="Full Name" icon="person" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            <FloatingInput
              label="Mobile Number" icon="phone_iphone" required type="tel" value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              error={errors.phone}
            />
            <FloatingInput label="Email Address (Optional)" icon="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          </div>

          {apiError && (
            <p className="mt-3 text-[12.5px] font-bold text-red-500 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">error</span>{apiError}
            </p>
          )}

          <button
            onClick={handleSendOtp}
            disabled={isLoading}
            className="w-full h-12 rounded-xl font-bold text-[16px] shadow-lg btn-primary-gradient text-white flex items-center justify-center gap-2 mt-6 transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <>Send OTP <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>}
          </button>
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-black tracking-tight text-gray-900 leading-tight mb-2">Verify your number</h1>
          <p className="text-[14px] text-gray-500 mb-6">Enter the 4-digit code sent to <span className="font-bold text-gray-900">+91 {phone}</span></p>

          <div className="flex justify-center gap-3 mb-2">
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`vendor-otp-${index}`}
                className="w-14 h-16 bg-white/80 border-2 border-gray-200 rounded-xl text-center text-[26px] font-black focus:border-[#7c3aed] focus:shadow-[0_0_0_4px_rgba(124,58,237,0.12)] outline-none transition-all text-gray-800"
                value={digit} maxLength="1" type="tel" inputMode="numeric" autoFocus={index === 0}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[index] && index > 0) document.getElementById(`vendor-otp-${index - 1}`)?.focus(); }}
              />
            ))}
          </div>

          {apiError && (
            <p className="mt-3 text-[12.5px] font-bold text-red-500 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">error</span>{apiError}
            </p>
          )}

          <button
            onClick={handleVerifyAndCreate}
            disabled={otp.join('').length !== 4 || isLoading}
            className={`w-full h-12 rounded-xl font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 mt-6 transition-all ${
              otp.join('').length === 4 && !isLoading ? 'btn-primary-gradient text-white active:scale-[0.98] cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <>Verify & Create Account <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>}
          </button>
          <button onClick={() => setPhase('form')} className="w-full text-center text-[13px] font-bold text-gray-500 mt-3 hover:text-[#7c3aed] transition-colors cursor-pointer">
            Change mobile number
          </button>
        </>
      )}
    </div>
  );
}
