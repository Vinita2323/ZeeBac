import { useNavigate, useLocation } from 'react-router-dom';
import { AuthAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';
import useLanguageStore from '../../../../store/useLanguageStore';

export default function VendorSidebar({ onClose, isCollapsed, onToggleCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const { t } = useLanguageStore();

  const handleLogout = (e) => {
    if (e) e.stopPropagation();
    useAuthStore.getState().logout();
    window.location.replace('/vendor-app/login');
  };

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', path: '/vendor' },
    { label: 'Subscription', icon: 'card_membership', path: '/vendor/subscription' },
    { label: 'Transactions', icon: 'sync_alt', path: '/vendor/transactions' },
    { label: 'Shop & Pay Later', icon: 'credit_score', path: '/vendor?openPayLater=true', badge: '₹25k' },
    { label: 'Apply Loan', icon: 'payments', path: '/vendor/apply-loan', badge: 'Soon' },
    { label: 'Chat', icon: 'chat', path: '/vendor/chat' },
    { label: 'Wallet', icon: 'account_balance_wallet', path: '/vendor/wallet' },
    { label: 'Passbook', icon: 'receipt_long', path: '/vendor/passbook' },
    { label: 'Customers', icon: 'groups', path: '/vendor/customers' },
    { label: 'Storefront', icon: 'storefront', path: '/vendor/storefront' },
    { label: 'Profile', icon: 'person', path: '/vendor/profile' },
    { label: 'Ratings', icon: 'star_rate', path: '/vendor/ratings' },
    { label: 'Notifications', icon: 'notifications', path: '/vendor/notifications' },
    { label: 'Help & Support', icon: 'support_agent', path: '/vendor/support', badge: '24x7', isHighlight: true },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  return (
    <aside className="h-full bg-white/80 backdrop-blur-xl border-r border-outline-variant/20 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Logo Area */}
      <div className={`h-20 flex items-center ${isCollapsed ? 'justify-center' : 'px-6 justify-between'} border-b border-outline-variant/10 relative`}>
        <div className="flex items-center justify-center w-full">
          <img
            alt="Zeebac Logo"
            className={`object-contain transition-all duration-300 cursor-pointer ${isCollapsed ? 'h-5 max-w-[64px]' : 'h-7'}`}
            src="/Logo (6).png"
            onClick={() => navigate('/vendor')}
          />
          {!isCollapsed && (
            <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary text-[9px] font-bold uppercase rounded tracking-wider whitespace-nowrap">
              Vendor
            </span>
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
                    ? 'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/5 text-emerald-800 border border-emerald-500/30 hover:bg-emerald-500/20 font-bold'
                    : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
                }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${!isActive && isHighlight ? 'text-[#25D366]' : ''}`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              {!isCollapsed && (
                <span className={`font-title-md text-[14px] ${isActive || isHighlight ? 'font-bold' : 'font-medium'}`}>
                  {t(item.label)}
                </span>
              )}
              {!isCollapsed && item.badge && (
                <span className={`ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  isActive 
                    ? 'bg-white/20 text-white' 
                    : isHighlight
                      ? 'bg-emerald-600 text-white animate-pulse shadow-sm'
                      : 'bg-amber-400/20 text-amber-600 border border-amber-300/40'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 24x7 Quick Help Box (Visible when sidebar not collapsed) */}
      {!isCollapsed && (
        <div className="mx-3 mb-2 p-3 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-primary/5 border border-emerald-500/30 text-left shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Support Desk</span>
            </div>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-800">24x7 Help</span>
          </div>
          <p className="text-[11.5px] font-extrabold text-on-surface leading-tight">Need Help with your Store?</p>
          <div className="flex items-center gap-1.5 mt-2">
            <a
              href="https://wa.me/919111966732?text=Hello%20Zeebac%20Support,%20I%20am%20a%20partner%20store%20and%20need%20assistance."
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-1.5 px-2 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.971.53 1.761.815 2.796.815 3.183 0 5.769-2.587 5.77-5.767 0-3.181-2.587-5.767-5.77-5.767zm7.391 5.766c-.001 4.075-3.316 7.39-7.391 7.39-1.287 0-2.496-.334-3.555-.92L4.01 19.5l1.093-3.992c-.675-1.127-1.072-2.428-1.072-3.818 0-4.075 3.316-7.39 7.391-7.39 4.075 0 7.39 3.315 7.391 7.39z"/>
              </svg>
              <span>WhatsApp</span>
            </a>
            <button
              onClick={() => handleNavClick('/vendor/support')}
              className="py-1.5 px-2.5 bg-white hover:bg-surface-container-low border border-outline-variant/30 text-primary rounded-xl text-[11px] font-black shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Helpdesk
            </button>
          </div>
        </div>
      )}

      {/* Bottom Profile Area */}
      <div className={`p-4 border-t border-outline-variant/10 bg-white/50 flex ${isCollapsed ? 'flex-col items-center gap-2' : ''}`}>
        <div
          onClick={() => handleNavClick('/vendor/profile')}
          className={`flex items-center gap-3 ${isCollapsed ? 'p-1 justify-center' : 'p-2'} rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer ${isCollapsed ? '' : 'w-full'}`}
          title="Vendor Profile"
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
            {currentUser?.storeName ? currentUser.storeName.charAt(0).toUpperCase() : 'V'}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="font-title-md font-bold text-[13px] text-on-surface truncate">{currentUser?.storeName || 'Vendor Store'}</p>
                <p className="text-[11px] text-on-surface-variant truncate">Vendor Account</p>
              </div>
              <button 
                type="button"
                onClick={handleLogout} 
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-outline hover:text-red-500 transition-colors cursor-pointer"
                title="Log Out"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          )}
        </div>
        {isCollapsed && (
          <button 
            type="button"
            onClick={handleLogout} 
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-outline hover:text-red-500 transition-colors cursor-pointer"
            title="Log Out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        )}
      </div>
    </aside>
  );
}
