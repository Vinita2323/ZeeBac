import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function VendorLandingScreen() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if already logged in as vendor
    const user = localStorage.getItem('zeebac_current_user');
    if (user) {
      const parsed = JSON.parse(user);
      if (parsed.role === 'vendor') {
        navigate('/vendor', { replace: true });
        return;
      }
    }
    setShow(true);
  }, [navigate]);

  if (!show) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9ff] text-on-surface font-body-lg relative overflow-hidden">

      {/* Decorative Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-secondary/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-72 h-72 bg-secondary/6 rounded-full blur-3xl" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">

        {/* Logo & Branding */}
        <div className="flex flex-col items-center mb-6 animate-reveal">
          <div className="w-16 h-16 rounded-3xl bg-secondary/10 flex items-center justify-center mb-4 shadow-lg shadow-secondary/10">
            <span className="material-symbols-outlined text-secondary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
          </div>
          <img
            alt="Zeebac Logo"
            className="w-32 h-auto mb-3"
            src="/Logo (6).png"
          />
          <div className="flex items-center gap-2 px-4 py-1.5 bg-secondary/10 rounded-full">
            <span className="material-symbols-outlined text-secondary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            <span className="text-[12px] font-black text-secondary uppercase tracking-widest">Vendor Partner</span>
          </div>
        </div>

        {/* Hero Text */}
        <div className="text-center max-w-[340px] mb-8 animate-reveal" style={{ animationDelay: '100ms' }}>
          <h1 className="text-[24px] font-black tracking-tight text-on-surface leading-tight mb-2">
            Grow your business with Zeebac
          </h1>
          <p className="text-[13px] text-on-surface-variant leading-relaxed px-4">
            List your store, offer cashback to customers, and watch your customer base grow.
          </p>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8 animate-reveal" style={{ animationDelay: '200ms' }}>
          {[
            { icon: 'qr_code_scanner', label: 'QR Payments' },
            { icon: 'trending_up', label: 'Analytics' },
            { icon: 'group', label: 'Customer Base' },
            { icon: 'savings', label: 'Cashback Tools' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-full border border-outline-variant/15 shadow-sm">
              <span className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
              <span className="text-[11px] font-bold text-on-surface">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-6 pt-2 space-y-3 relative z-10 max-w-[440px] mx-auto w-full animate-reveal mt-auto" style={{ animationDelay: '300ms' }}>
        <button
          onClick={() => navigate('/vendor-app/login')}
          className="w-full h-[56px] rounded-xl font-title-md text-white shadow-lg bg-secondary hover:bg-secondary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">login</span>
          Sign In to Vendor Portal
        </button>

        <button
          onClick={() => navigate('/vendor-app/signup')}
          className="w-full h-[52px] rounded-xl font-title-md border-2 border-secondary/20 text-secondary bg-secondary/5 hover:bg-secondary/10 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">store</span>
          Register Your Business
        </button>


      </div>
    </div>
  );
}
