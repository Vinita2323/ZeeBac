import { useNavigate, useLocation } from 'react-router-dom';

export default function VendorBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Home', icon: 'home', path: '/vendor', exact: true },
    { label: 'Chat', icon: 'chat', path: '/vendor/chat' },
    { label: 'Bills', icon: 'sync_alt', path: '/vendor/transactions' },
    { label: 'Wallet', icon: 'account_balance_wallet', path: '/vendor/wallet' },
    { label: 'Store', icon: 'storefront', path: '/vendor/storefront' },
    { label: 'Profile', icon: 'person', path: '/vendor/profile' },
  ];

  return (
    <nav id="vendor-bottom-nav" className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-outline-variant/10 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] flex justify-around items-center w-full h-[62px] px-1 sm:px-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      {navItems.map((item) => {
        const isActive = item.exact
          ? location.pathname === '/vendor' || location.pathname === '/vendor/'
          : location.pathname.startsWith(item.path);

        return (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer py-1 px-1.5 sm:px-3 rounded-xl min-w-0 flex-1 max-w-[64px] ${
              isActive 
                ? 'bg-secondary text-white shadow-sm font-semibold' 
                : 'text-secondary/60 hover:text-secondary hover:bg-secondary/5'
            }`}
          >
            <span 
              className="material-symbols-outlined text-[19px] sm:text-[20px]" 
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            <span className="font-display text-[8.5px] sm:text-[9px] mt-0.5 font-bold tracking-tight truncate w-full text-center">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

