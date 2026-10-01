// Small explainer shown right before the native browser permission prompt,
// so the OS-level dialog that follows an "Allow" tap has context instead of
// appearing out of nowhere.
export default function PermissionPrimerModal({
  open,
  icon = 'notifications',
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
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center space-y-4 animate-reveal">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[32px]">{icon}</span>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[17px] font-black text-on-surface">{title}</h2>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">{message}</p>
        </div>
        <div className="space-y-2 pt-1">
          <button
            onClick={onAllow}
            disabled={isProcessing}
            className="w-full h-12 btn-primary-gradient text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
          >
            {isProcessing ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : allowLabel}
          </button>
          <button
            onClick={onSkip}
            disabled={isProcessing}
            className="w-full h-11 text-on-surface-variant font-semibold text-[13px] active:opacity-70 transition-opacity cursor-pointer disabled:opacity-40"
          >
            {skipLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
