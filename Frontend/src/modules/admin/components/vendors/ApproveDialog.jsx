import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function ApproveDialog({ vendorName, onConfirm, onClose }) {
  const [cashbackRate, setCashbackRate] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(cashbackRate);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] shadow-2xl overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-green-600 text-[28px]">check_circle</span>
          </div>
          <h3 className="font-bold text-[18px] text-on-surface mb-1">Approve Vendor?</h3>
          <p className="text-[13.5px] text-on-surface-variant mb-5">
            Are you sure you want to approve <span className="font-bold">{vendorName}</span>? They will become an active vendor immediately.
          </p>

          <div className="text-left mb-2">
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Cashback Rate (%)</label>
            <input
              type="number" min="0" max="100" value={cashbackRate}
              onChange={(e) => setCashbackRate(e.target.value)}
              className="w-full h-11 px-3 border border-outline-variant/30 rounded-xl outline-none focus:border-primary text-[14px] font-bold"
            />
          </div>
        </div>
        <div className="p-4 border-t border-outline-variant/10 flex gap-3 bg-surface-container-lowest">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-outline-variant/20 font-bold text-[13.5px] text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 h-11 rounded-xl bg-green-600 text-white font-bold text-[13.5px] hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" /> : 'Approve'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
