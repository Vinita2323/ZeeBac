import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';
import useLanguageStore from '../../../../store/useLanguageStore';
import LogoutConfirmModal from '../../../../components/common/LogoutConfirmModal';

export default function VendorSidebar({ onClose, isCollapsed, onToggleCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const { t } = useLanguageStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isWholesaleMerchant = ['manufacturer', 'wholesaler', 'distributor'].includes(
    String(currentUser?.businessType || '').trim().toLowerCase()
  );
  const isManufacturer = String(currentUser?.businessType || '').trim().toLowerCase() === 'manufacturer';

  const handleLogout = (e) => {
    if (e) e.stopPropagation();
    useAuthStore.getState().logout('vendor');
    localStorage.removeItem('zeebac_vendor_user');
    localStorage.removeItem('zeebac_vendor_token');
    localStorage.removeItem('zeebac_vendor_refresh_token');
    localStorage.removeItem('vendor_balance');
    localStorage.removeItem('vendor_transactions');
    try {
      const cur = localStorage.getItem('zeebac_current_user');
      if (cur && (cur.includes('"vendor"') || cur.includes('storeName') || cur.includes('ownerName'))) {
        localStorage.removeItem('zeebac_current_user');
        localStorage.removeItem('zeebac_access_token');
        localStorage.removeItem('zeebac_refresh_token');
      }
    } catch {}
    window.location.replace('/vendor-app/login');
  };

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', path: '/vendor' },
    { label: 'Products', icon: 'grid_view', path: '/vendor/products' },
    { label: 'Inventory', icon: 'inventory_2', path: '/vendor/inventory' },
    { label: 'Putaway', icon: 'shelves', path: '/vendor/putaway', badge: 'WMS' },
    {
      label: isWholesaleMerchant ? 'Wholesale POS' : 'Retail POS',
      icon: 'point_of_sale',
      path: '/vendor/billing',
      badge: isWholesaleMerchant ? 'B2B Trade' : 'POS Bill',
      isHighlight: true,
    },
    { label: 'GST & Tax', icon: 'bar_chart', path: '/vendor/gst', badge: 'Auto File' },
    {
      label: isWholesaleMerchant ? 'Purchase Orders' : 'Orders & Requests',
      icon: 'receipt_long',
      path: '/vendor/orders',
      badge: isWholesaleMerchant ? 'B2B' : 'Live',
    },
    { label: 'Merchant Payment', icon: 'swap_horiz', path: '/vendor/merchant-payment', badge: 'B2B' },
    { label: 'Subscription', icon: 'card_membership', path: '/vendor/subscription' },
    { label: 'Transactions', icon: 'sync_alt', path: '/vendor/transactions' },
    { label: 'Shop & Pay Later', icon: 'credit_score', path: '/vendor?openPayLater=true', badge: '₹25k' },
    { label: 'Apply Loan', icon: 'payments', path: '/vendor/apply-loan', badge: 'Soon' },
    { label: 'Chat', icon: 'chat', path: '/vendor/chat' },
    { label: 'Wallet', icon: 'account_balance_wallet', path: '/vendor/wallet' },
    { label: 'Passbook', icon: 'receipt_long', path: '/vendor/passbook' },
    { label: 'Settlements', icon: 'account_balance', path: '/vendor/settlements' },
    {
      label: isWholesaleMerchant ? 'Retailer Network' : 'Customers',
      icon: 'groups',
      path: '/vendor/customers',
      badge: isWholesaleMerchant ? 'Buyers' : undefined,
    },
    { label: 'Storefront', icon: 'storefront', path: '/vendor/storefront' },
    { label: 'Profile', icon: 'person', path: '/vendor/profile' },
    { label: 'Ratings', icon: 'star_rate', path: '/vendor/ratings' },
    { label: 'Notifications', icon: 'notifications', path: '/vendor/notifications' },
    { label: 'User App', icon: 'account_circle', path: '/home', badge: 'Switch' },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  return (
    <aside className="h-full bg-white/80 backdrop-blur-xl border-r border-outline-variant/20 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Logo Area */}
      <div className={`h-20 flex items-center ${isCollapsed ? 'justify-center' : 'pl-5 pr-10'} border-b border-outline-variant/10 relative`}>
        <div
          onClick={() => navigate('/vendor')}
          className={`flex items-center w-full cursor-pointer ${isCollapsed ? 'justify-center' : 'justify-start gap-2.5'}`}
        >
          <img
            alt="ZeeBac Logo"
            className={`object-contain transition-all duration-300 shrink-0 ${isCollapsed ? 'h-11 w-11' : 'h-12 w-12'}`}
            src="/Logo (6).png"
          />
          {!isCollapsed && (
            <div className="min-w-0 flex flex-col">
              <span className="font-display font-black text-[21px] leading-none tracking-tight text-slate-900">
                Zee<span className="text-primary">Bac</span>
              </span>
              <span className={`mt-1 self-start px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded tracking-wider whitespace-nowrap ${
                isManufacturer
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  : isWholesaleMerchant
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-primary/10 text-primary'
              }`}>
                {isManufacturer ? 'Manufacturer' : isWholesaleMerchant ? 'Wholesaler' : 'Retailer'}
              </span>
            </div>
          )}
        </div>

        {/* Collapse Toggle Button (Desktop only) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`hidden md:flex absolute ${isCollapsed ? '-right-3' : 'right-4'} top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-outline-variant/30 rounded-full items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary shadow-sm z-10 cursor-pointer`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {isCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className={`flex-1 overflow-y-auto py-4 ${isCollapsed ? 'px-3' : 'px-4'} space-y-1 scroll-hide`}>
        {navItems.map((item) => {
          const hasQuery = item.path.includes('?');
          const isActive = hasQuery
            ? (location.pathname + location.search) === item.path
            : item.path === '/vendor'
              ? (location.pathname === '/vendor' || location.pathname === '/vendor/') && !location.search.includes('openPayLater')
              : location.pathname.startsWith(item.path);
          const isHighlight = item.isHighlight;

          return (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.path)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${isActive
                  ? 'bg-primary text-white shadow-sm shadow-primary/20'
                  : isHighlight
                    ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
                }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span
                className={`material-symbols-outlined text-[20px] w-5 shrink-0 ${!isActive && isHighlight ? 'text-emerald-600' : ''}`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              {!isCollapsed && (
                <span className={`flex-1 min-w-0 text-left truncate text-[14px] leading-5 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {t(item.label)}
                </span>
              )}
              {!isCollapsed && item.badge && (
                <span className={`shrink-0 text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md leading-none ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {t(item.badge)}
                </span>
              )}
            </button>
          );
        })}
      </nav>



      {/* Bottom Profile Area */}
      <div className={`p-4 border-t border-outline-variant/10 bg-white/50 flex ${isCollapsed ? 'flex-col items-center gap-2' : ''}`}>
        <div
          onClick={() => handleNavClick('/vendor/profile')}
          className={`flex items-center gap-3 ${isCollapsed ? 'p-1 justify-center' : 'p-2'} rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer ${isCollapsed ? '' : 'w-full'}`}
          title={t('Vendor Profile')}
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
            {currentUser?.storeName ? currentUser.storeName.charAt(0).toUpperCase() : 'V'}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="font-title-md font-bold text-[13px] text-on-surface truncate">{currentUser?.storeName || 'Vendor Store'}</p>
                <p className="text-[11px] text-on-surface-variant truncate">{t('Vendor Account')}</p>
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLogoutConfirm(true);
                }} 
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-outline hover:text-red-500 transition-colors cursor-pointer"
                title={t('Log Out')}
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          )}
        </div>
        {isCollapsed && (
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowLogoutConfirm(true);
            }} 
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-outline hover:text-red-500 transition-colors cursor-pointer"
            title={t('Log Out')}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        )}
      </div>
      <LogoutConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          handleLogout();
        }}
        title={t('Confirm Logout')}
        message="Are you sure you want to log out of your vendor account?"
        confirmLabel={t('Log Out')}
        cancelLabel={t('Cancel')}
      />
    </aside>
  );
}
