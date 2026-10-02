// Big-target on-screen number pad + digit-box display for entering a PIN.
// Replaces a plain <input type="password"> — typing a 4-8 digit PIN on a
// cramped mobile keyboard (autocomplete bar, tiny keys, keyboard popping
// the layout around) is the friction this removes. Supports variable
// length (4-8 digits) since existing PINs aren't a fixed size.
export default function PinKeypad({ value, onChange, maxLength = 8, autoFocusError = false }) {
  const digits = value.split('');

  const press = (d) => {
    if (value.length >= maxLength) return;
    onChange(value + d);
  };
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="space-y-5">
      <div className={`flex items-center justify-center gap-2.5 ${autoFocusError ? 'animate-shake' : ''}`}>
        {Array.from({ length: Math.max(maxLength, value.length) }).map((_, i) => {
          if (i >= maxLength) return null;
          const filled = i < digits.length;
          return (
            <div
              key={i}
              className={`w-9 h-11 rounded-xl border-2 flex items-center justify-center transition-colors ${
                filled ? 'border-primary bg-primary/5' : 'border-outline-variant/30 bg-surface-container-low'
              }`}
            >
              {filled && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
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
