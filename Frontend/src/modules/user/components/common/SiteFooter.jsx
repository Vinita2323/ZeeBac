import { Link } from 'react-router-dom';
import useLanguageStore from '../../../../store/useLanguageStore';

// Website footer — shown only on tablet/desktop (md+). Every link points to an existing route.
const sections = [
  {
    title: 'Shop',
    links: [
      { label: 'Home', to: '/home' },
      { label: 'Explore Shops', to: '/explore' },
      { label: 'Cart', to: '/cart' },
      { label: 'Buy Now Pay Later', to: '/bnpl' },
    ],
  },
  {
    title: 'My Account',
    links: [
      { label: 'My Orders', to: '/orders' },
      { label: 'Wallet & Points', to: '/wallet' },
      { label: 'Transaction History', to: '/passbook' },
      { label: 'Refer & Earn', to: '/refer-earn' },
    ],
  },
  {
    title: 'Partner With Us',
    links: [
      { label: 'Become a Vendor', to: '/vendor-app' },
      { label: 'Delivery Partner', to: '/delivery/login' },
    ],
  },
  {
    title: 'Help & Legal',
    links: [
      { label: 'Help & Support', to: '/profile/support' },
      { label: 'Chat Support', to: '/chat' },
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
    ],
  },
];

export default function SiteFooter() {
  const { t } = useLanguageStore();

  return (
    <footer className="hidden md:block relative bg-white mt-auto overflow-hidden">
      {/* Light curved accent lines along the top edge */}
      <svg
        className="absolute top-0 left-0 w-full h-16 pointer-events-none overflow-visible"
        style={{ filter: 'drop-shadow(0 4px 6px rgba(124, 58, 237, 0.35))' }}
        viewBox="0 0 1440 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 22 C 240 62, 480 0, 720 26 S 1200 58, 1440 18" fill="none" stroke="#ddd6fe" strokeWidth="3" />
        <path d="M0 34 C 260 4, 520 60, 760 34 S 1220 6, 1440 40" fill="none" stroke="#ede9fe" strokeWidth="2" />
      </svg>
      <div className="relative app-container px-4 pt-14 pb-10">
        <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] gap-8">
          <div className="col-span-2 lg:col-span-1 space-y-3">
            <Link to="/home">
              <img alt="ZeeBac Logo" src="/Logo (6).png" className="h-16 lg:h-20 w-auto object-contain" />
            </Link>
            <p className="text-[12.5px] text-slate-500 leading-relaxed max-w-xs">
              {t('Shop at Zeebac partner stores, pay your way and earn cashback points on every purchase.')}
            </p>
            <p className="text-[12px] font-bold text-purple-700">1 Zeebac Point = ₹1</p>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="space-y-3">
              <h4 className="font-display text-[13px] font-black text-slate-900">{t(section.title)}</h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      state={link.state}
                      className="text-[12.5px] text-slate-500 hover:text-purple-700 transition-colors"
                    >
                      {t(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between gap-4 text-[12px] text-slate-500">
          <p>© {new Date().getFullYear()} Zeebac. {t('All rights reserved.')}</p>
          <div className="flex items-center gap-5">
            <Link to="/terms" className="hover:text-purple-700">{t('Terms')}</Link>
            <Link to="/privacy" className="hover:text-purple-700">{t('Privacy')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
