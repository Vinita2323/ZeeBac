import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useLanguageStore from '../../../../store/useLanguageStore';
import useCartStore from '../../../../store/useCartStore';

export default function BottomNavBar() {
  const location = useLocation();
  const { t } = useLanguageStore();
  const initCart = useCartStore((state) => state.initCart);
  const cartItemsCount = useCartStore((state) => state.getTotalItemsCount());

  useEffect(() => {
    initCart();
  }, [initCart]);

  const navItems = [
    { label: 'Home', icon: 'home', path: '/home' },
    { label: 'Shops', icon: 'storefront', path: '/explore' },
    { label: 'BNPL', icon: 'credit_score', path: '/bnpl' },
    { label: 'Cart', icon: 'shopping_cart', path: '/cart', badge: cartItemsCount },
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
              className={`relative flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-90 cursor-pointer py-1.5 px-2.5 sm:px-3.5 rounded-2xl flex-1 max-w-[80px] ${
                isActive
                  ? 'btn-primary-gradient text-white shadow-md shadow-primary/25 font-semibold'
                  : 'text-[#7c3aed]/55 hover:text-[#7c3aed] hover:bg-[#7c3aed]/5'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-purple-950 font-black text-[9px] flex items-center justify-center shadow-xs">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="font-display text-[9px] font-bold tracking-wide truncate max-w-full">{t(item.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

