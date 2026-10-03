// Big-target on-screen number pad + digit-box display for entering a 4-digit PIN.
export default function PinKeypad({ value, onChange, maxLength = 4, autoFocusError = false }) {
  const digits = value.split('');

  const press = (d) => {
    if (value.length >= maxLength) return;
    onChange(value + d);
  };
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="space-y-5">
      <div className={`flex items-center justify-center gap-3 ${autoFocusError ? 'animate-shake' : ''}`}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < digits.length;
          return (
            <div
              key={i}
              className={`w-12 h-14 sm:w-14 sm:h-16 rounded-2xl border-2 flex items-center justify-center transition-all ${
                filled
                  ? 'border-primary bg-primary/10 shadow-xs scale-105'
                  : 'border-outline-variant/30 bg-surface-container-low'
              }`}
            >
              {filled && <span className="w-3.5 h-3.5 rounded-full bg-primary animate-pop" />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            className="h-14 rounded-2xl bg-surface-container-low text-on-surface text-[20px] font-bold active:scale-95 active:bg-primary/10 transition-transform cursor-pointer select-none"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press('0')}
          className="h-14 rounded-2xl bg-surface-container-low text-on-surface text-[20px] font-bold active:scale-95 active:bg-primary/10 transition-transform cursor-pointer select-none"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={!value}
          className="h-14 rounded-2xl flex items-center justify-center text-on-surface-variant disabled:opacity-30 active:scale-95 transition-transform cursor-pointer select-none"
        >
          <span className="material-symbols-outlined text-[22px]">backspace</span>
        </button>
      </div>
    </div>
  );
}
