import { useState } from 'react';
import { createPortal } from 'react-dom';

const REASONS = ['Incomplete information', 'Invalid document', 'Document unclear', 'Business details mismatch', 'Location issue', 'Verification failed', 'Other'];

export default function RejectDialog({ vendorName, onConfirm, onClose }) {
  const [reasonCategory, setReasonCategory] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reasonCategory || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(reasonCategory, comment);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 overflow-y-auto">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-red-600 text-[28px]">cancel</span>
          </div>
          <h3 className="font-bold text-[18px] text-on-surface mb-1">Reject Application</h3>
          <p className="text-[13.5px] text-on-surface-variant mb-5">
            Rejecting <span className="font-bold">{vendorName}</span>'s application. A reason is required — the vendor will see this.
          </p>

          <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Rejection Reason *</label>
          <div className="space-y-1.5 mb-4">
            {REASONS.map((reason) => (
              <label key={reason} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                reasonCategory === reason ? 'border-red-400 bg-red-50' : 'border-outline-variant/20 hover:bg-surface-container-low'
              }`}>
                <input type="radio" name="reasonCategory" checked={reasonCategory === reason} onChange={() => setReasonCategory(reason)} className="accent-red-500" />
                <span className="text-[13.5px] font-semibold text-on-surface">{reason}</span>
              </label>
            ))}
          </div>

          <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Additional Comment (Optional)</label>
          <textarea
            value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            placeholder="E.g., GST certificate is blurry, please re-upload a clearer copy."
            className="w-full px-3 py-2.5 border border-outline-variant/30 rounded-xl outline-none focus:border-primary text-[13.5px] resize-none"
          />
        </div>
        <div className="p-4 border-t border-outline-variant/10 flex gap-3 bg-surface-container-lowest shrink-0">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-outline-variant/20 font-bold text-[13.5px] text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!reasonCategory || isSubmitting}
            className="flex-1 h-11 rounded-xl bg-red-600 text-white font-bold text-[13.5px] hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" /> : 'Reject Application'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
