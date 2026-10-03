import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useLanguageStore from '../../store/useLanguageStore';
import FourDigitPinInput from './FourDigitPinInput';

/**
 * Premium 4-Digit Security PIN Setup & Change Modal
 * Strictly handles 4-digit PINs with individual boxes, show/hide visibility,
 * matching validation, and 1-minute rate-limit countdown protection.
 */
export default function SecurityPinModal({
  isOpen,
  onClose,
  mode = 'setup', // 'setup' | 'change'
  onSubmit, // async (pin, currentPin) => Promise<void>
  onSuccess,
}) {
  const t = useLanguageStore((s) => s.t);

  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPin('');
      setPin('');
      setConfirmPin('');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, mode]);

  // Rate limit cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  if (!isOpen) return null;

  const isCurrentPinValid = mode === 'setup' || currentPin.length === 4;
  const isPinValid = pin.length === 4;
  const isConfirmValid = confirmPin.length === 4;
  const doPinsMatch = isPinValid && isConfirmValid && pin === confirmPin;
  const isMismatch = isConfirmValid && pin !== confirmPin;
  const canSubmit = isCurrentPinValid && isPinValid && doPinsMatch && !isSubmitting && cooldownSeconds === 0;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    if (mode === 'change' && currentPin.length !== 4) {
      setError(t('Current PIN must be exactly 4 digits.'));
      return;
    }

    if (pin.length !== 4) {
      setError(t('Security PIN must be exactly 4 digits.'));
      return;
    }

    if (pin !== confirmPin) {
      setError(t('PINs do not match. Please re-enter.'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(pin, mode === 'change' ? currentPin : null);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message || 'Failed to update PIN.';

      if (status === 429 || msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('attempts')) {
        setCooldownSeconds(60);
        setError(msg || 'Too many attempts. Maximum 5 attempts per minute allowed. Please wait 1 minute.');
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-reveal overflow-y-auto"
    >
      <div className="relative bg-white rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl space-y-5 text-left border border-slate-100 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0">
              <span className="material-symbols-outlined text-[26px]">
                {mode === 'setup' ? 'enhanced_encryption' : 'lock_reset'}
              </span>
            </div>
            <div>
              <h3 className="font-display font-extrabold text-[17px] text-on-surface leading-tight">
                {mode === 'setup' ? t('Set 4-Digit PIN') : t('Change 4-Digit PIN')}
              </h3>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                {t('Secures withdrawals & biometrics')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Informational Subtext */}
        <div className="px-3 py-2 rounded-xl bg-purple-50/70 border border-purple-100/80 text-[11.5px] text-purple-900 leading-snug flex items-center gap-2">
          <span className="material-symbols-outlined text-[17px] text-purple-700 shrink-0">shield</span>
          <span>
            {mode === 'setup'
              ? t('Create a secret 4-digit PIN for withdrawal authentication.')
              : t('Verify your current 4-digit PIN and choose a new one.')}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Change Mode: Current PIN */}
          {mode === 'change' && (
            <div className="space-y-2 pb-1 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                  {t('Current 4-Digit PIN')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showCurrentPin ? 'visibility_off' : 'visibility'}
                  </span>
                  <span>{showCurrentPin ? t('Hide') : t('Show')}</span>
                </button>
              </div>

              <FourDigitPinInput
                value={currentPin}
                onChange={(val) => {
                  setCurrentPin(val);
                  setError('');
                }}
                mask={!showCurrentPin}
                autoFocus={true}
                disabled={isSubmitting || cooldownSeconds > 0}
                idPrefix="pin-current"
              />
            </div>
          )}

          {/* New PIN */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                {mode === 'setup' ? t('Enter 4-Digit PIN') : t('New 4-Digit PIN')}
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showPin ? 'visibility_off' : 'visibility'}
                </span>
                <span>{showPin ? t('Hide') : t('Show')}</span>
              </button>
            </div>

            <FourDigitPinInput
              value={pin}
              onChange={(val) => {
                setPin(val);
                setError('');
              }}
              mask={!showPin}
              autoFocus={mode === 'setup'}
              disabled={isSubmitting || cooldownSeconds > 0}
              idPrefix="pin-new"
            />
          </div>

          {/* Confirm PIN */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                {t('Confirm 4-Digit PIN')}
              </label>
              <button
                type="button"
                onClick={() => setShowConfirmPin(!showConfirmPin)}
                className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showConfirmPin ? 'visibility_off' : 'visibility'}
                </span>
                <span>{showConfirmPin ? t('Hide') : t('Show')}</span>
              </button>
            </div>

            <FourDigitPinInput
              value={confirmPin}
              onChange={(val) => {
                setConfirmPin(val);
                setError('');
              }}
              mask={!showConfirmPin}
              hasError={isMismatch}
              disabled={isSubmitting || cooldownSeconds > 0}
              idPrefix="pin-confirm"
            />

            {/* Matching Feedback Badge */}
            {doPinsMatch && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 animate-fadeIn">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                <span>{t('4-digit PINs match perfectly')}</span>
              </div>
            )}
            {isMismatch && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-red-600 animate-fadeIn">
                <span className="material-symbols-outlined text-[15px]">cancel</span>
                <span>{t('PINs do not match')}</span>
              </div>
            )}
          </div>

          {/* Error & Rate Limit Banner */}
          {error && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200/80 text-red-700 text-[11.5px] font-semibold flex items-start gap-2 animate-shake">
              <span className="material-symbols-outlined text-[18px] shrink-0 text-red-500">
                {cooldownSeconds > 0 ? 'timer' : 'error'}
              </span>
              <div className="flex-1">
                <span>{error}</span>
                {cooldownSeconds > 0 && (
                  <div className="mt-1 text-[11px] text-red-800 font-bold">
                    {t('Try again in')}: {cooldownSeconds}s
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-xl border border-gray-200 font-bold text-[13px] text-gray-700 hover:bg-gray-50 active:scale-95 transition-all cursor-pointer"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-[13px] shadow-md shadow-purple-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>{mode === 'setup' ? t('Save PIN') : t('Update PIN')}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Security Footer Note */}
        <p className="text-[10px] text-gray-400 text-center leading-normal">
          🔒 {t('Strictly 4 digits. Never share your security PIN with anyone.')}
        </p>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
