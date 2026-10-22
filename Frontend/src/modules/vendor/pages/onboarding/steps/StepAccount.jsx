import { useState, useEffect } from 'react';
import { AuthAPI } from '../../../../../services/api';
import useAuthStore from '../../../../../store/useAuthStore';
import useLanguageStore from '../../../../../store/useLanguageStore';
import FloatingInput from '../components/FloatingInput';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StepAccount({
  onComplete,
  businessType = 'Retailer',
  retailerSubtype = 'independent_store',
  shopType = 'Independent Store',
  accountState = {},
  onUpdateAccountState,
}) {
  const { t } = useLanguageStore();
  const [phase, setPhase] = useState('form'); // 'form' | 'otp'
  const [name, setName] = useState(accountState?.name || '');
  const [phone, setPhone] = useState(accountState?.phone || '');
  const [email, setEmail] = useState(accountState?.email || '');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Sync back to parent so back navigation preserves entered inputs
  useEffect(() => {
    if (onUpdateAccountState) {
      onUpdateAccountState({ name, phone, email });
    }
  }, [name, phone, email, onUpdateAccountState]);

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
      const res = await AuthAPI.vendorRegister({
        phone,
        otp: otpString,
        name: name.trim(),
        email,
        businessType,
        retailerSubtype,
        shopType,
      });
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

  // Badge details for header banner
  const getBadgeInfo = () => {
    if (businessType === 'Manufacturer') {
      return { emoji: '🏭', title: 'Manufacturer Registration', desc: 'Direct supply chain & production' };
    }
    if (businessType === 'Wholesaler') {
      return { emoji: '📦', title: 'Wholesaler Registration', desc: 'Bulk trade & distributor' };
    }
    if (retailerSubtype === 'chain_brand' || shopType === 'Chain & Brand') {
      return { emoji: '🏢', title: 'Retailer — Chain Brand', desc: 'Multi-outlet retail chain' };
    }
    return { emoji: '🏪', title: 'Retailer — Independent Store', desc: 'Single-outlet standalone shop' };
  };

  const badgeInfo = getBadgeInfo();

  return (
    <div className="w-full box-border bg-white/85 backdrop-blur-xl border border-white/90 rounded-3xl p-4 sm:p-7 shadow-xl animate-reveal">
      {/* Selected Business Model Context Banner */}
      <div className="flex items-center gap-3 p-3 sm:p-3.5 bg-purple-50/80 border border-purple-200/80 rounded-2xl mb-5">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl flex-shrink-0">
          <span>{badgeInfo.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700">
            {t('Selected Business Type')}
          </p>
          <p className="text-[13.5px] font-black text-gray-900 leading-tight">
            {t(badgeInfo.title)}
          </p>
          <p className="text-[11px] text-gray-500 truncate">
            {t(badgeInfo.desc)}
          </p>
        </div>
      </div>

      {phase === 'form' ? (
        <>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: '0 0 6px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            {t('Create your vendor account')}
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
            {t("Let's start with the basics. We'll verify your mobile number with an OTP.")}
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
              : <><span>{t('Send OTP')}</span><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span></>
            }
          </button>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: '0 0 6px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            {t('Verify your number')}
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
            {t('Enter the 4-digit code sent to')} <strong style={{ color: '#111827' }}>+91 {phone}</strong>
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
              : <><span>{t('Verify & Create Account')}</span><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span></>
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
            ← {t('Change mobile number')}
          </button>
        </>
      )}
    </div>
  );
}
