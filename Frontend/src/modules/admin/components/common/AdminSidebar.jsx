import { useNavigate, useLocation } from 'react-router-dom';
import { AuthAPI } from '../../../../services/api';

export default function AdminSidebar({ isCollapsed, onToggleCollapse, onMobileClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
    { label: 'Users', icon: 'person', path: '/admin/users' },
    { label: 'Vendors', icon: 'storefront', path: '/admin/vendors' },
    { label: 'Transactions', icon: 'receipt_long', path: '/admin/transactions' },
    { label: 'Cashback Rules', icon: 'tune', path: '/admin/rules' },
    { label: 'Wallet Monitor', icon: 'account_balance_wallet', path: '/admin/wallet' },
    { label: 'Fraud Detection', icon: 'security', path: '/admin/fraud' },
    { label: 'Referrals', icon: 'hub', path: '/admin/referrals' },
    { label: 'Rewards', icon: 'featured_play_list', path: '/admin/rewards' },
    { label: 'Support', icon: 'support_agent', path: '/admin/support' },
    { label: 'Analytics', icon: 'insights', path: '/admin/analytics' },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const handleLogout = async () => {
    try {
      await AuthAPI.logout();
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout failed', error);
      // Fallback
      localStorage.removeItem('zeebac_current_user');
      navigate('/admin/login');
    }
  };

  return (
    <aside className="h-full bg-[#31006E] text-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.1)]">
      {/* Logo Area */}
      <div className={`h-[64px] flex items-center ${isCollapsed ? 'justify-center' : 'px-5 justify-between'} border-b border-white/10 relative shrink-0`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full`}>
          <div 
            className={`bg-white rounded-xl flex items-center justify-center cursor-pointer shadow-md shrink-0 w-11 h-11 p-1`}
            onClick={() => navigate('/admin')}
          >
            <img 
              alt="Zeebac Logo" 
              className="object-contain w-full h-full" 
              src="/Logo (6).png"
            />
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white font-display font-bold text-[18px] tracking-tight leading-none">Zeebac</span>
              <span className="px-1.5 py-0.5 bg-white/15 text-white/80 text-[9px] font-bold uppercase rounded tracking-wider shrink-0">
                Admin
              </span>
            </div>
          )}
        </div>

        {/* Collapse Toggle Button (Desktop only) */}
        {onToggleCollapse && (
          <button 
            onClick={onToggleCollapse}
            className={`hidden md:flex absolute ${isCollapsed ? '-right-3' : 'right-4'} top-1/2 -translate-y-1/2 w-6 h-6 bg-[#31006E] border border-white/20 rounded-full items-center justify-center text-white/80 hover:text-white shadow-sm z-10 cursor-pointer`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {isCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className={`flex-1 overflow-y-auto py-4 ${isCollapsed ? 'px-2' : 'px-3'} space-y-1 scroll-hide`}>
        {navItems.map((item) => {
          // Exact match for dashboard, prefix match for others
          const isActive = item.path === '/admin' 
            ? location.pathname === '/admin' || location.pathname === '/admin/'
            : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.path)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                isActive 
                  ? 'bg-white text-[#31006E] font-bold shadow-sm' 
                  : 'text-white/70 hover:bg-white/10 hover:text-white font-medium'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span 
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              {!isCollapsed && (
                <span className={`font-title-md text-[13px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile Area */}
      <div className={`p-4 border-t border-white/10 bg-black/10 flex ${isCollapsed ? 'justify-center' : ''}`}>
        <div 
          className={`flex items-center gap-3 ${isCollapsed ? 'p-1' : 'p-2'} rounded-xl hover:bg-white/5 transition-colors cursor-pointer w-full`}
        >
          <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-bold text-base flex-shrink-0 border border-red-500/30">
            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="font-title-md font-bold text-[13px] text-white truncate">Super Admin</p>
                <p className="text-[11px] text-white/60 truncate">God Mode Active</p>
              </div>
              <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors">
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
