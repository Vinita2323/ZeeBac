import { useNavigate, useLocation } from 'react-router-dom';
import useLanguageStore from '../../../../store/useLanguageStore';

export default function VendorBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguageStore();

  // Exactly matching the 5 tabs in the user's reference design:
  // [Home] [Products] [Inventory] [Orders] [Profile]
  const navItems = [
    { label: 'Home', icon: 'home', path: '/vendor', exact: true },
    { label: 'Products', icon: 'grid_view', path: '/vendor/products' },
    { label: 'Inventory', icon: 'inventory_2', path: '/vendor/inventory' },
    { label: 'Orders', icon: 'shopping_cart', path: '/vendor/orders' },
    { label: 'Profile', icon: 'person', path: '/vendor/profile' },
  ];

  return (
    <nav
      id="vendor-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/98 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] flex justify-around items-center w-full h-[62px] px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
    >
      {navItems.map((item) => {
        const isActive = item.exact
          ? location.pathname === '/vendor' || location.pathname === '/vendor/'
          : location.pathname.startsWith(item.path) ||
            (item.path === '/vendor/orders' && location.pathname.startsWith('/vendor/requests')) ||
            (item.path === '/vendor/products' && location.pathname.startsWith('/vendor/storefront'));

        return (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer py-1 px-2 rounded-xl flex-1 max-w-[68px] ${
              isActive
                ? 'text-purple-700 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[22px] transition-transform ${
                isActive ? 'scale-110 text-purple-700' : 'text-slate-400'
              }`}
              style={{ fontVariationSettings: isActive ? "'FILL' 1, 'wght' 600" : "'FILL' 0, 'wght' 400" }}
            >
              {item.icon}
            </span>
            <span
              className={`text-[10px] mt-0.5 tracking-tight truncate w-full text-center ${
                isActive ? 'font-black text-purple-700' : 'font-medium text-slate-500'
              }`}
            >
              {t(item.label)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
