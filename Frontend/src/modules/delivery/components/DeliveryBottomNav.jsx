import { Link, useLocation } from 'react-router-dom';

export default function DeliveryBottomNav() {
  const location = useLocation();

  const navItems = [
    { label: 'Deliveries', icon: 'two_wheeler', path: '/delivery/dashboard' },
    { label: 'History', icon: 'history', path: '/delivery/history' },
    { label: 'Earnings', icon: 'payments', path: '/delivery/earnings' },
    { label: 'Profile', icon: 'person', path: '/delivery/profile' },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="glass-nav pointer-events-auto w-full max-w-[440px] rounded-3xl flex justify-around items-center h-16 px-2 bg-white/95 backdrop-blur-md border border-slate-100 shadow-xl">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`relative flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-95 cursor-pointer py-1 px-3 rounded-2xl flex-1 ${
                isActive
                  ? 'btn-primary-gradient text-white shadow-md shadow-primary/25 font-bold'
                  : 'text-slate-500 hover:text-primary hover:bg-purple-50'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
