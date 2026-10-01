// One-time, mandatory data-usage notice shown right after login (user &
// vendor alike) before any feature permission is requested.
export default function DataConsentModal({ open, onAgree }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[28px]">shield_person</span>
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-[18px] font-black text-on-surface">Your Data, Protected</h2>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            To give you cashback, verify transactions, and keep the platform safe from fraud, Zeebac collects and uses:
          </p>
        </div>
        <ul className="space-y-2.5 text-[12.5px] text-on-surface-variant text-left">
          <li className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">call</span>
            Your phone number, for login and OTP verification
          </li>
          <li className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">location_on</span>
            Your location, to show nearby stores and verify in-store cashback claims
          </li>
          <li className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">receipt_long</span>
            Your transaction & bill details, to calculate and credit cashback
          </li>
          <li className="flex gap-2 items-start">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">gpp_good</span>
            Device & usage data, to detect fraud and protect your account
          </li>
        </ul>
        <p className="text-[11.5px] text-on-surface-variant/80 leading-relaxed text-center">
          Read the full{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-bold underline">
            Privacy Policy
          </a>
          {' '}and{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-bold underline">
            Terms of Service
          </a>.
        </p>
        <button
          onClick={onAgree}
          className="w-full h-12 btn-primary-gradient text-white rounded-xl font-bold active:scale-95 transition-transform cursor-pointer"
        >
          I Agree & Continue
        </button>
      </div>
    </div>
  );
}
