import { useRef, useEffect } from 'react';

/**
 * Modern 4-digit PIN input with individual boxes, auto-focus advancement,
 * backspace reversal, arrow navigation, paste handling, and optional masking.
 */
export default function FourDigitPinInput({
  value = '',
  onChange,
  disabled = false,
  autoFocus = false,
  mask = true,
  hasError = false,
  idPrefix = 'pin',
}) {
  const inputsRef = useRef([]);

  const digits = Array.from({ length: 4 }).map((_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e, index) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const currentDigits = [...digits];
      if (currentDigits[index]) {
        currentDigits[index] = '';
        onChange(currentDigits.join('').trim());
      } else if (index > 0) {
        currentDigits[index - 1] = '';
        onChange(currentDigits.join('').trim());
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
      return;
    }

    if (e.key === 'ArrowRight' && index < 3) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const currentDigits = [...digits];
      currentDigits[index] = e.key;
      const nextVal = currentDigits.join('');
      onChange(nextVal);

      if (index < 3) {
        inputsRef.current[index + 1]?.focus();
      }
    }
  };

  const handlePaste = (e) => {
    if (disabled) return;
    e.preventDefault();
    const pastedData = (e.clipboardData || window.clipboardData).getData('text');
    const cleaned = pastedData.replace(/\D/g, '').slice(0, 4);
    if (!cleaned) return;

    onChange(cleaned);
    const targetIdx = Math.min(cleaned.length, 3);
    inputsRef.current[targetIdx]?.focus();
  };

  return (
    <div className={`flex items-center justify-center gap-3 ${hasError ? 'animate-shake' : ''}`}>
      {[0, 1, 2, 3].map((index) => {
        const isFilled = Boolean(digits[index]);
        const displayChar = isFilled ? (mask ? '•' : digits[index]) : '';

        return (
          <div key={index} className="relative">
            <input
              id={`${idPrefix}-${index}`}
              ref={(el) => (inputsRef.current[index] = el)}
              type={mask ? 'password' : 'text'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              disabled={disabled}
              value={displayChar}
              onChange={() => {}} // Controlled by onKeyDown & onPaste
              onKeyDown={(e) => handleKeyDown(e, index)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-[22px] sm:text-[24px] font-black rounded-2xl border-2 transition-all outline-none select-none ${
                hasError
                  ? 'border-red-400 bg-red-50/50 text-red-600 focus:border-red-500 focus:ring-4 focus:ring-red-100'
                  : isFilled
                  ? 'border-primary/70 bg-primary/5 text-primary shadow-xs'
                  : 'border-gray-200 bg-white text-on-surface focus:border-primary focus:ring-4 focus:ring-primary/10'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            />
          </div>
        );
      })}
    </div>
  );
}
