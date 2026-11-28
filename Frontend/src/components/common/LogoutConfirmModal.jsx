import { createPortal } from 'react-dom';

export default function LogoutConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Logout',
  message = 'Are you sure you want to log out of your account?',
  confirmLabel = 'Log Out',
  cancelLabel = 'Cancel',
  isLoading = false,
}) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs"
      onClick={() => !isLoading && onClose?.()}
    >
      <div
        className="bg-white rounded-3xl overflow-hidden shadow-2xl p-6 w-full max-w-[340px] space-y-5 text-center border border-slate-100 animate-reveal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
          <span className="material-symbols-outlined text-[24px]">logout</span>
        </div>

        <div className="space-y-1.5">
          <h3 className="font-display text-[18px] font-black text-slate-800">{title}</h3>
          <p className="text-[13px] text-slate-500 leading-relaxed">{message}</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-red-500 hover:bg-red-600 transition-colors shadow-sm shadow-red-500/20 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? 'Logging out...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
