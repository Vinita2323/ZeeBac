import { useState } from 'react';
import { AuthAPI } from '../../../../../services/api';
import useAuthStore from '../../../../../store/useAuthStore';
import FloatingInput from '../components/FloatingInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const card = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.9)',
  borderRadius: '24px',
  padding: '28px 24px',
  boxShadow: '0 20px 60px -12px rgba(22,8,47,0.14), 0 8px 24px rgba(96,0,218,0.07)',
};

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
    <div style={card}>
      {/* Icon */}
      <div style={{
        width: '52px', height: '52px', borderRadius: '14px',
        background: 'rgba(124,58,237,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <span className="material-symbols-outlined" style={{ color: '#7c3aed', fontSize: '26px' }}>storefront</span>
      </div>

      {phase === 'form' ? (
        <>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: '0 0 6px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            Create your vendor account
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
            Let's start with the basics. We'll verify your mobile number with an OTP.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FloatingInput
              label="Full Name" icon="person" required
              value={name} onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
            <FloatingInput
              label="Mobile Number" icon="phone_iphone" required type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              error={errors.phone}
            />
            <FloatingInput
              label="Email Address (Optional)" icon="mail" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />
          </div>

          {apiError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ef4444' }}>error</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444' }}>{apiError}</span>
            </div>
          )}

          <button
            onClick={handleSendOtp}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', height: '52px', marginTop: '24px',
              borderRadius: '14px', border: 'none',
              background: 'linear-gradient(135deg, #16082f 0%, #3b0764 50%, #6000da 100%)',
              color: '#fff', fontWeight: '700', fontSize: '15px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              boxShadow: '0 8px 24px rgba(96,0,218,0.28)',
              fontFamily: 'inherit',
              transition: 'opacity 0.2s',
            }}
          >
            {isLoading
              ? <span style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : <><span>Send OTP</span><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span></>
            }
          </button>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: '0 0 6px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            Verify your number
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
            Enter the 4-digit code sent to <strong style={{ color: '#111827' }}>+91 {phone}</strong>
          </p>

          {/* OTP inputs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`vendor-otp-${index}`}
                style={{
                  width: '58px', height: '64px',
                  background: '#fff',
                  border: `2px solid ${digit ? '#7c3aed' : '#e2e8f0'}`,
                  borderRadius: '14px',
                  textAlign: 'center',
                  fontSize: '24px', fontWeight: '900', color: '#111827',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                value={digit}
                maxLength="1"
                type="tel"
                inputMode="numeric"
                autoFocus={index === 0}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = '#7c3aed')}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !otp[index] && index > 0) {
                    document.getElementById(`vendor-otp-${index - 1}`)?.focus();
                  }
                }}
              />
            ))}
          </div>

          {apiError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ef4444' }}>error</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444' }}>{apiError}</span>
            </div>
          )}

          <button
            onClick={handleVerifyAndCreate}
            disabled={otp.join('').length !== 4 || isLoading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', height: '52px', marginTop: '24px',
              borderRadius: '14px', border: 'none',
              background: otp.join('').length === 4 && !isLoading
                ? 'linear-gradient(135deg, #16082f 0%, #3b0764 50%, #6000da 100%)'
                : '#e5e7eb',
              color: otp.join('').length === 4 && !isLoading ? '#fff' : '#9ca3af',
              fontWeight: '700', fontSize: '15px',
              cursor: otp.join('').length !== 4 || isLoading ? 'not-allowed' : 'pointer',
              boxShadow: otp.join('').length === 4 ? '0 8px 24px rgba(96,0,218,0.28)' : 'none',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            {isLoading
              ? <span style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : <><span>Verify &amp; Create Account</span><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span></>
            }
          </button>

          <button
            onClick={() => setPhase('form')}
            style={{
              display: 'block', width: '100%', marginTop: '12px',
              background: 'none', border: 'none',
              fontSize: '13px', fontWeight: '700', color: '#6b7280',
              cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
            }}
          >
            ← Change mobile number
          </button>
        </>
      )}
    </div>
  );
}
