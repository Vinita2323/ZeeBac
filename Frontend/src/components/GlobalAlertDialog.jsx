import useUIStore from '../store/useUIStore';

// ─── Global Alert Dialog ────────────────────────────────────────────────────
// A native iOS/Android-style modal that blocks the screen.
// Usage: useUIStore.getState().showAlert('Title', 'Message', 'OK')

export default function GlobalAlertDialog() {
  const { alertDialog, hideAlert } = useUIStore();

  if (!alertDialog.isOpen) return null;

  const handleConfirm = () => {
    if (alertDialog.onConfirm) alertDialog.onConfirm();
    hideAlert();
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={hideAlert}
      />

      {/* Dialog Card */}
      <div 
        className="relative w-full max-w-[320px] bg-white rounded-3xl shadow-2xl overflow-hidden"
        style={{ animation: 'scaleIn 0.2s ease-out' }}
      >
        {/* Content */}
        <div className="px-6 pt-7 pb-4 text-center">
          <h3 className="text-[18px] font-black text-on-surface tracking-tight leading-tight">
            {alertDialog.title}
          </h3>
          <p className="text-[14px] text-on-surface-variant mt-2 leading-relaxed">
            {alertDialog.message}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-outline-variant/15" />

        {/* Action Button */}
        <button
          onClick={handleConfirm}
          className="w-full py-3.5 text-primary text-[16px] font-bold hover:bg-primary/5 active:bg-primary/10 transition-colors cursor-pointer"
        >
          {alertDialog.buttonText}
        </button>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
