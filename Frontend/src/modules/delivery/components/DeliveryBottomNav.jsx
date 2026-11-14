import { Link, useLocation } from 'react-router-dom';

export default function DeliveryBottomNav() {
  const location = useLocation();

  const navItems = [
    { label: 'Feed', icon: 'article', path: '/delivery/dashboard' },
    { label: 'Pocket', icon: 'account_balance_wallet', path: '/delivery/earnings' },
    { label: 'Gigs', icon: 'event_available', path: '/delivery/gigs' },
    { label: 'Updates', icon: 'notifications', path: '/delivery/updates' },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="max-w-[480px] mx-auto flex items-center justify-around h-14 px-2 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === '/delivery/dashboard' && location.pathname === '/delivery');
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 cursor-pointer ${
                isActive
                  ? 'text-slate-950 font-black'
                  : 'text-slate-400 font-semibold hover:text-slate-700'
              }`}
            >
              <div className="relative">
                <span
                  className="material-symbols-outlined text-[24px]"
                  style={{
                    fontVariationSettings: isActive ? "'FILL' 1, 'wght' 700" : "'FILL' 0, 'wght' 400",
                  }}
                >
                  {item.icon}
                </span>
                {item.label === 'Gigs' && (
                  <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-emerald-600 text-white text-[8px] font-black rounded-full leading-none">
                    +₹300
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-tight tracking-tight mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
