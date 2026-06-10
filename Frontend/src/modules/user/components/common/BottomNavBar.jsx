import { useNavigate, useLocation } from 'react-router-dom';

export default function BottomNavBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Home', icon: 'home', path: '/home' },
    { label: 'Explore', icon: 'explore', path: '/explore' },
    { label: 'Wallet', icon: 'account_balance_wallet', path: '/wallet' },
    { label: 'Passbook', icon: 'receipt_long', path: '/passbook' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-t border-outline-variant/20 shadow-lg flex justify-around items-center w-full py-2 px-container-margin">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center py-1 flex-1 transition-all duration-200 active:scale-95 cursor-pointer ${
              isActive ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span 
              className="material-symbols-outlined text-[24px]" 
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            <span className="font-label-mono text-[10px] mt-0.5 font-semibold">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
