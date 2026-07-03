import { useNavigate, useLocation } from 'react-router-dom';
import { AuthAPI } from '../../../../services/api';

export default function VendorSidebar({ onClose, isCollapsed, onToggleCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async (e) => {
    e.stopPropagation(); // prevent triggering the profile navigation
    try {
      await AuthAPI.logout();
      navigate('/auth/vendor/login');
    } catch (error) {
      console.error('Logout failed', error);
      localStorage.removeItem('zeebac_current_user');
      navigate('/auth/vendor/login');
    }
  };

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', path: '/vendor' },
    { label: 'Transactions', icon: 'sync_alt', path: '/vendor/transactions' },
    { label: 'Chat', icon: 'chat', path: '/vendor/chat' },
    { label: 'Wallet', icon: 'account_balance_wallet', path: '/vendor/wallet' },
    { label: 'Passbook', icon: 'receipt_long', path: '/vendor/passbook' },
    { label: 'Customers', icon: 'groups', path: '/vendor/customers' },
    { label: 'Storefront', icon: 'storefront', path: '/vendor/storefront' },
    { label: 'Profile', icon: 'person', path: '/vendor/profile' },
    { label: 'Ratings', icon: 'star_rate', path: '/vendor/ratings' },
    { label: 'Notifications', icon: 'notifications', path: '/vendor/notifications' },
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
      <nav className={`flex-1 overflow-y-auto py-6 ${isCollapsed ? 'px-3' : 'px-4'} space-y-1 scroll-hide`}>
        {navItems.map((item) => {
          // Exact match for dashboard, prefix match for others
          const isActive = item.path === '/vendor' 
            ? location.pathname === '/vendor' || location.pathname === '/vendor/'
            : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.path)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                isActive 
                  ? 'bg-primary text-white shadow-sm shadow-primary/20' 
                  : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span 
                className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              {!isCollapsed && (
                <span className={`font-title-md text-[14px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile Area */}
      <div className={`p-4 border-t border-outline-variant/10 bg-white/50 flex ${isCollapsed ? 'justify-center' : ''}`}>
        <div 
          onClick={() => handleNavClick('/vendor/profile')}
          className={`flex items-center gap-3 ${isCollapsed ? 'p-1' : 'p-2'} rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer w-full`}
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
            N
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="font-title-md font-bold text-[13px] text-on-surface truncate">Noir Concept</p>
                <p className="text-[11px] text-on-surface-variant truncate">Premium Fashion</p>
              </div>
              <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-outline hover:text-red-500 transition-colors">
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
