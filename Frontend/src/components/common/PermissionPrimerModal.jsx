// Small explainer shown right before the native browser permission prompt,
// so the OS-level dialog that follows an "Allow" tap has context instead of
// appearing out of nowhere. Visual language borrows from native OS permission
// sheets (centered icon/preview, short copy, plain-language actions) kept
// minimal rather than copied literally — see `LocationPreview` below for the
// one place that gets a richer visual (a map glimpse, same idea as a GPS
// permission prompt showing you what you're unlocking).

export function LocationPreview() {
  return (
    <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-[#eef0fb] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="absolute inset-0 opacity-25 bg-[linear-gradient(rgba(79,39,227,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(79,39,227,0.25)_1px,transparent_1px)] bg-[size:12px_12px]" />
      <div className="absolute top-[22%] left-0 w-full h-[5px] bg-white/70 blur-[0.5px] -rotate-6" />
      <div className="absolute bottom-[28%] left-0 w-full h-[7px] bg-white/70 blur-[0.5px] rotate-[8deg]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="absolute w-3.5 h-3.5 rounded-full bg-primary/30 animate-ping" />
        <span className="material-symbols-outlined relative text-primary text-[30px] -translate-y-1" style={{ fontVariationSettings: "'FILL' 1" }}>
          location_on
        </span>
      </div>
    </div>
  );
}

export default function PermissionPrimerModal({
  open,
  icon = 'notifications',
  visual = null,
  title,
  message,
  allowLabel = 'Allow',
  skipLabel = 'Not now',
  onAllow,
  onSkip,
  isProcessing = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 select-none">
      <div className="w-full max-w-[320px] bg-white rounded-3xl shadow-2xl px-6 pt-7 pb-5 text-center animate-reveal">
        {visual || (
          <div className="w-14 h-14 mx-auto rounded-full ring-1 ring-primary/15 bg-primary/5 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[26px]">{icon}</span>
          </div>
        )}

        <div className="mt-4 space-y-1">
          <h2 className="text-[16px] font-black text-on-surface leading-snug">{title}</h2>
          <p className="text-[12.5px] text-on-surface-variant leading-relaxed px-1">{message}</p>
        </div>

        <div className="mt-5 space-y-1.5">
          <button
            onClick={onAllow}
            disabled={isProcessing}
            className="w-full h-11 btn-primary-gradient text-white rounded-full font-bold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
          >
            {isProcessing ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : allowLabel}
          </button>
          <button
            onClick={onSkip}
            disabled={isProcessing}
            className="w-full h-10 text-on-surface-variant font-semibold text-[12.5px] active:opacity-70 transition-opacity cursor-pointer disabled:opacity-40"
          >
            {skipLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
