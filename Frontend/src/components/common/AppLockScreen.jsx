import { useEffect, useState, useRef } from 'react';
import useAuthStore from '../../store/useAuthStore';
import { UserAPI, VendorAPI } from '../../services/api';
import { verifyBiometricCredential } from '../../utils/biometric.util';
import PinKeypad from './PinKeypad';

// Full-screen PIN/biometric gate shown whenever the app is (re)opened for a
// user who has Security PIN or Biometrics enabled — see useAuthStore's
// `hydrate`/`lockApp`. Separate from the existing withdrawal-time security
// modal (WalletScreen/WalletPage), which stays as-is; this is the "opening
// the app" gate those screens don't provide on their own.
export default function AppLockScreen() {
  const isAppLocked = useAuthStore((s) => s.isAppLocked);
  const currentUser = useAuthStore((s) => s.currentUser);
  const unlockApp = useAuthStore((s) => s.unlockApp);
  const logout = useAuthStore((s) => s.logout);

  const isVendorRoute = typeof window !== 'undefined' && (window.location.pathname.startsWith('/vendor') || window.location.pathname.startsWith('/vendor-app'));
  const isVendor = currentUser?.role === 'vendor'
    ? true
    : currentUser?.role === 'customer'
      ? false
      : Boolean((currentUser?.role || currentUser?.userType) === 'vendor' || isVendorRoute);

  const API = isVendor ? VendorAPI : UserAPI;

  const [mode, setMode] = useState('biometric'); // 'biometric' | 'pin'
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isAppLocked) {
      setPin('');
      setError('');
      setAttempted(false);
      isSubmittingRef.current = false;
      return;
    }
    const biometricReady = !!currentUser?.security?.biometricEnabled;
    setMode(biometricReady ? 'biometric' : 'pin');
    if (biometricReady && !attempted) {
      setAttempted(true);
      triggerBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppLocked]);

  const triggerBiometric = async () => {
    setIsVerifying(true);
    setError('');
    try {
      const res = await verifyBiometricCredential(currentUser?.security?.biometricCredentialId);
      if (res.success) {
        unlockApp(isVendor ? 'vendor' : 'customer');
      } else {
        setError(res.error || 'Biometric validation failed. Use your PIN.');
        setMode('pin');
      }
    } catch {
      setError('Biometric verification failed. Please enter your PIN.');
      setMode('pin');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyPin = async (e, pinToVerify = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const candidatePin = String(pinToVerify !== null ? pinToVerify : pin).trim();
    if (!candidatePin || candidatePin.length !== 4) return;
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsVerifying(true);
    setError('');

    try {
      const res = await API.verifySecurityPin(candidatePin);
      if (res.success) {
        unlockApp(isVendor ? 'vendor' : 'customer');
      } else {
        setError(res.message || 'Incorrect PIN. Try again.');
        setPin(''); // Reset pin so user can cleanly type their next attempt
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Incorrect Security PIN.');
      setPin(''); // Reset pin so keypad doesn't stay blocked
    } finally {
      setIsVerifying(false);
      isSubmittingRef.current = false;
    }
  };

  const handlePinChange = (newVal) => {
    setPin(newVal);
    if (error) setError('');
    // Auto-verify when all 4 digits are entered
    if (newVal.length === 4) {
      handleVerifyPin(null, newVal);
    }
  };

  const handleNotYouLogout = () => {
    const isVendorNow = isVendor;
    // Log out all sessions cleanly so no secondary account is exposed without PIN
    logout('all');
    // Immediately redirect to login screen
    if (typeof window !== 'undefined') {
      window.location.replace(isVendorNow ? '/vendor-app/login' : '/login');
    }
  };

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  if (!isAppLocked || isAdmin || isAdminRoute) return null;

  const displayName = currentUser?.name || currentUser?.ownerName || currentUser?.storeName || '';
  const firstName = displayName ? displayName.split(' ')[0] : '';

  return (
    <div className="fixed inset-0 z-[300] bg-white flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[32px]">
            {mode === 'biometric' ? 'fingerprint' : 'lock'}
          </span>
        </div>

        <div>
          <h1 className="text-[18px] font-black text-on-surface">
            Welcome back{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-[13px] text-on-surface-variant mt-1">
            {mode === 'biometric' ? 'Verify it’s you to continue' : 'Enter your Security PIN to continue'}
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12px] font-medium text-left">
            {error}
          </div>
        )}

        {mode === 'biometric' ? (
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={triggerBiometric}
              disabled={isVerifying}
              className="w-full h-12 btn-primary-gradient text-white rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
            >
              {isVerifying ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">fingerprint</span>
                  Try Again
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setMode('pin'); setError(''); }}
              className="w-full h-11 border border-outline-variant/30 text-on-surface font-bold text-[13px] rounded-xl hover:bg-gray-50 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">pin</span>
              Use PIN Instead
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => handleVerifyPin(e)} className="space-y-4">
            <PinKeypad
              value={pin}
              onChange={handlePinChange}
              autoFocusError={!!error}
            />
            <button
              type="submit"
              disabled={isVerifying || pin.length !== 4}
              className="w-full h-12 btn-primary-gradient text-white rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
            >
              {isVerifying ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : 'Unlock'}
            </button>
            {currentUser?.security?.biometricEnabled && (
              <button
                type="button"
                onClick={() => { setMode('biometric'); setError(''); }}
                className="w-full text-center text-primary font-bold text-[12.5px] py-1 cursor-pointer"
              >
                Switch back to Biometrics
              </button>
            )}
          </form>
        )}

        <button
          type="button"
          onClick={handleNotYouLogout}
          className="text-on-surface-variant font-semibold text-[12px] underline underline-offset-2 cursor-pointer"
        >
          Not you? Logout
        </button>
      </div>
    </div>
  );
}
