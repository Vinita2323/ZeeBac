import { useNavigate } from 'react-router-dom';

export default function TermsScreen() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#f8f9fc] min-h-screen flex flex-col font-body-lg text-on-surface">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={() => navigate(-1)} 
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="font-display font-black text-[20px]">Terms of Service</h1>
      </header>

      <main className="flex-1 max-w-[600px] mx-auto w-full px-5 py-8 space-y-6">
        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">1. Acceptance of Terms</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            By accessing or using the Zeebac platform, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, then you may not access the platform or use any services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">2. User Responsibilities</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            You are responsible for maintaining the security of your account and password. Zeebac cannot and will not be liable for any loss or damage from your failure to comply with this security obligation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">3. Cashback & Rewards</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            Cashback offers and rewards are subject to change without notice. Zeebac reserves the right to modify, suspend, or terminate the cashback program at any time at our sole discretion.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">4. Vendor Agreements</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            Vendors must provide accurate business information and honor all promotional offers listed on the Zeebac platform. Failure to do so may result in account suspension or termination.
          </p>
        </section>

        <div className="pt-8 pb-12 text-center text-on-surface-variant text-[12px]">
          <p>Last updated: June 2026</p>
          <p>Zeebac Technologies Inc.</p>
        </div>
      </main>
    </div>
  );
}
