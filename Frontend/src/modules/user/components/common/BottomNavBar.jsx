import { Link, useLocation } from 'react-router-dom';

export default function BottomNavBar() {
  const location = useLocation();

  const navItems = [
    { label: 'Home', icon: 'home', path: '/home' },
    { label: 'Explore', icon: 'storefront', path: '/explore' },
    { label: 'History', icon: 'history', path: '/passbook' },
    { label: 'Chats', icon: 'forum', path: '/chat' },
    { label: 'Profile', icon: 'person', path: '/profile' }
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="glass-nav pointer-events-auto w-full max-w-[480px] rounded-[1.75rem] flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-90 cursor-pointer py-1.5 px-2.5 sm:px-3.5 rounded-2xl flex-1 max-w-[80px] ${
                isActive
                  ? 'btn-primary-gradient text-white shadow-md shadow-primary/25 font-semibold'
                  : 'text-[#7c3aed]/55 hover:text-[#7c3aed] hover:bg-[#7c3aed]/5'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="font-display text-[9px] font-bold tracking-wide truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

