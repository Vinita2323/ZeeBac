import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicyScreen() {
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
        <h1 className="font-display font-black text-[20px]">Privacy Policy</h1>
      </header>

      <main className="flex-1 max-w-[600px] mx-auto w-full px-5 py-8 space-y-6">
        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">1. Information We Collect</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            We collect information that you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, and postal address.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">2. How We Use Information</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            We may use the information we collect about you to provide, maintain, and improve our services, including to facilitate payments, send receipts, provide products and services you request, and develop new features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">3. Sharing of Information</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            We may share the information we collect about you with vendors to provide you with the services you request. We will not sell your personal information to third parties without your explicit consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-bold text-[18px] text-primary">4. Security Data</h2>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.
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
