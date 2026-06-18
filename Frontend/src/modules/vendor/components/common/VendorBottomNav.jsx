import { useNavigate, useLocation } from 'react-router-dom';

export default function VendorBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Home', icon: 'home', path: '/vendor', exact: true },
    { label: 'Chat', icon: 'chat', path: '/vendor/chat' },
    { label: 'Bills', icon: 'sync_alt', path: '/vendor/transactions' },
    { label: 'Wallet', icon: 'account_balance_wallet', path: '/vendor/wallet' },
    { label: 'Profile', icon: 'person', path: '/vendor/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-outline-variant/10 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] flex justify-around items-end w-full pb-2 pt-1 px-1 h-[68px]">
      {navItems.map((item) => {
        const isActive = item.exact
          ? location.pathname === '/vendor' || location.pathname === '/vendor/'
          : location.pathname.startsWith(item.path);

        return (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer w-14 mb-0.5 group"
          >
            <div className={`relative px-3 py-1 rounded-full transition-colors ${isActive ? 'bg-primary/10' : 'bg-transparent'}`}>
              <span
                className={`material-symbols-outlined text-[24px] transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'
                  }`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
            </div>
            <span className={`font-display text-[10px] mt-0.5 tracking-wide transition-colors ${isActive ? 'font-bold text-primary' : 'font-medium text-on-surface-variant'
              }`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
