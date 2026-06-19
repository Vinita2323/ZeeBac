import { useNavigate, useLocation } from 'react-router-dom';

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
    { label: 'Analytics', icon: 'insights', path: '/admin/analytics' },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zeebac_current_user');
    navigate('/admin/login');
  };

  return (
    <aside className="h-full bg-[#1e1e1e] border-r border-white/10 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.2)] text-white">
      {/* Logo Area */}
      <div className={`h-[64px] flex items-center ${isCollapsed ? 'justify-center' : 'px-5 justify-between'} border-b border-white/10 relative shrink-0`}>
        <div className="flex items-center justify-center w-full">
          <img 
            alt="Zeebac Logo" 
            className={`object-contain transition-all duration-300 cursor-pointer brightness-200 ${isCollapsed ? 'h-5 max-w-[64px]' : 'h-6'}`} 
            src="/Logo (6).png"
            onClick={() => navigate('/admin')}
          />
          {!isCollapsed && (
            <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold uppercase rounded tracking-wider whitespace-nowrap">
              Admin
            </span>
          )}
        </div>

        {/* Collapse Toggle Button (Desktop only) */}
        {onToggleCollapse && (
          <button 
            onClick={onToggleCollapse}
            className={`hidden md:flex absolute ${isCollapsed ? '-right-3' : 'right-4'} top-1/2 -translate-y-1/2 w-6 h-6 bg-[#2a2a2a] border border-white/20 rounded-full items-center justify-center text-white/70 hover:text-white hover:border-white shadow-sm z-10 cursor-pointer`}
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
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                isActive 
                  ? 'bg-white/10 text-white border-r-2 border-primary' 
                  : 'text-white/60 hover:bg-white/5 hover:text-white border-r-2 border-transparent'
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
      <div className={`p-4 border-t border-white/10 bg-[#1a1a1a] flex ${isCollapsed ? 'justify-center' : ''}`}>
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
                <p className="text-[11px] text-white/50 truncate">God Mode Active</p>
              </div>
              <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors">
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
