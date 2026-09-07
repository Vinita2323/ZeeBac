import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthAPI } from '../../../../services/api';

export default function AdminSidebar({ isCollapsed, onToggleCollapse, onMobileClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
    { label: 'Users', icon: 'person', path: '/admin/users' },
    { label: 'Vendors', icon: 'storefront', path: '/admin/vendors' },
    { label: 'Transactions', icon: 'receipt_long', path: '/admin/transactions' },
    { label: 'Pending Payouts', icon: 'account_balance', path: '/admin/payouts' },
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

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = async () => {
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
    <>
      <aside className="h-full w-full bg-[#e5dbf7] text-[#4b3370] flex flex-col border-r border-[#cbbedf] shadow-[1px_0_10px_rgba(124,58,237,0.03)]">
      {/* Logo Area */}
      <div className={`h-[64px] flex items-center ${isCollapsed ? 'justify-center' : 'px-5 justify-between'} border-b border-[#cbbedf] relative shrink-0`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'pl-6'} w-full`}>
          {isCollapsed ? (
            <span className="text-[#381a6c] font-display font-black text-[24px] tracking-tight leading-none cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/admin')}>Z</span>
          ) : (
            <span className="text-[#381a6c] font-display font-black text-[22px] tracking-tight leading-none cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/admin')}>Zeebac</span>
          )}
        </div>

        {/* Mobile Close Button */}
        {onMobileClose && (
          <button 
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg text-[#4b3370] hover:bg-[#d8cced] active:bg-[#cbbedf] transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}

        {/* Collapse Toggle Button (Desktop only) */}
        {onToggleCollapse && (
          <button 
            onClick={onToggleCollapse}
            className={`hidden md:flex absolute ${isCollapsed ? '-right-3' : 'right-4'} top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-[#cbbedf] rounded-full items-center justify-center text-slate-400 hover:text-[#7c3aed] hover:border-[#7c3aed] shadow-sm z-10 cursor-pointer transition-colors`}
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
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                isActive 
                  ? 'bg-white/50 backdrop-blur-md border-white/50 text-primary font-bold shadow-sm' 
                  : 'border-transparent text-[#4b3370] hover:bg-[#d8cced]/70 hover:text-[#25005b] font-medium'
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
      <div className={`p-4 border-t border-[#cbbedf] bg-[#dad0ed] flex ${isCollapsed ? 'justify-center' : ''}`}>
        <div 
          className={`flex items-center gap-3 ${isCollapsed ? 'p-1' : 'p-2'} rounded-xl hover:bg-[#ccbfeb] transition-colors cursor-pointer w-full`}
        >
          <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 font-bold text-base flex-shrink-0 border border-red-500/20">
            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="font-title-md font-bold text-[13px] text-[#381a6c] truncate">Super Admin</p>
                <p className="text-[11px] text-[#70549c] truncate">God Mode Active</p>
              </div>
              <button onClick={handleLogoutClick} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-[#70549c] hover:text-red-600 transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
    {showLogoutConfirm && createPortal(
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={() => setShowLogoutConfirm(false)}
      >
        <div 
          className="bg-white rounded-3xl overflow-hidden shadow-2xl p-6 w-full max-w-[340px] space-y-6 text-center animate-reveal"
          onClick={e => e.stopPropagation()}
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
            <span className="material-symbols-outlined text-[24px]">logout</span>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-[18px] font-black text-slate-800">Confirm Logout</h3>
            <p className="text-[13px] text-slate-500">Are you sure you want to log out of the admin panel?</p>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button 
              onClick={executeLogout}
              className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-red-500 hover:bg-red-600 transition-colors shadow-md cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>,
    )}
    </>
  );
}
