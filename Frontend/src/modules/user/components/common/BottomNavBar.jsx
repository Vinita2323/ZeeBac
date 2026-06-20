import { Link, useLocation } from 'react-router-dom';

export default function BottomNavBar() {
  const location = useLocation();

  const navItems = [
    { label: 'Home', icon: 'home', path: '/home' },
    { label: 'Explore', icon: 'storefront', path: '/explore' },
    { label: 'History', icon: 'history', path: '/passbook' },
    { label: 'Profile', icon: 'person', path: '/profile' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-outline-variant/10 shadow-lg flex justify-around items-center w-full h-15 px-2">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.label}
            to={item.path}
            className={`flex flex-col items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer py-1 px-3 rounded-xl ${
              isActive 
                ? 'bg-[#420093] text-white shadow-sm font-semibold' 
                : 'text-[#420093]/60 hover:text-[#420093] hover:bg-[#420093]/5'
            }`}
          >
            <span 
              className="material-symbols-outlined text-[20px]" 
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            <span className="font-display text-[9px] mt-0.5 font-bold tracking-wide">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
