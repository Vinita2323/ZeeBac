import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthAPI, AdminAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';

export default function AdminSidebar({ isCollapsed, onToggleCollapse, onMobileClose }) {
  const navigate = useNavigate();
  const currentAdmin = useAuthStore((state) => state.adminUser);
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [openGroups, setOpenGroups] = useState({});
  const [pageSearch, setPageSearch] = useState('');

  useEffect(() => {
    const fetchOpenTickets = async () => {
      try {
        const res = await AdminAPI.getDashboardStats();
        if (res.success && res.data?.openSupportTickets) {
          setOpenTicketsCount(res.data.openSupportTickets);
        } else {
          setOpenTicketsCount(0);
        }
      } catch (e) {}
    };
    fetchOpenTickets();
  }, [location.pathname]);

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
    { label: 'Users', icon: 'group', path: '/admin/users' },
    { label: 'Vendors', icon: 'storefront', path: '/admin/vendors' },
    { label: 'Vendor Settlements', icon: 'account_balance', path: '/admin/seller-settlements' },
    { label: 'Zeebac Coins', icon: 'toll', path: '/admin/coins' },
    {
      label: 'Delivery Partners',
      icon: 'two_wheeler',
      path: '/admin/delivery-partners',
      children: [
        { label: 'All Partners', icon: 'groups', path: '/admin/delivery-partners' },
        { label: 'Deposits & Payouts', icon: 'account_balance_wallet', path: '/admin/rider-settlements' },
        { label: 'Rider Cash Ledger', icon: 'payments', path: '/admin/rider-cash-ledger' },
        { label: 'Rider Earnings', icon: 'savings', path: '/admin/rider-earnings' },
        { label: 'Rider Updates', icon: 'campaign', path: '/admin/rider-updates' },
      ],
    },
    { label: 'Orders', icon: 'shopping_bag', path: '/admin/orders' },
    { label: 'Live Deliveries', icon: 'route', path: '/admin/delivery-operations' },
    { label: 'Subscription Plans', icon: 'card_membership', path: '/admin/subscriptions' },
    { label: 'Supply Chain & B2B', icon: 'hub', path: '/admin/supply-chain' },
    { label: 'Transactions', icon: 'receipt_long', path: '/admin/transactions' },
    { label: 'Payout Requests', icon: 'payments', path: '/admin/payouts' },
    { label: 'Cashback Rules', icon: 'tune', path: '/admin/rules' },
    { label: 'Platform Analytics', icon: 'analytics', path: '/admin/analytics' },
    { label: 'Wallet Monitor', icon: 'account_balance_wallet', path: '/admin/wallet' },
    { label: 'Fraud Detection', icon: 'security', path: '/admin/fraud' },
    { label: 'Referral Program', icon: 'share', path: '/admin/referrals' },
    { label: 'Rewards Manager', icon: 'military_tech', path: '/admin/rewards' },
    { label: 'Support Tickets', icon: 'headset_mic', path: '/admin/support', badge: openTicketsCount > 0 ? openTicketsCount : null },
    { label: 'Legal & Policies', icon: 'gavel', path: '/admin/legal-content' },
    { label: 'Notifications', icon: 'notifications', path: '/admin/notifications' },
    { label: 'Send Notifications', icon: 'campaign', path: '/admin/send-notifications' },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const searchTerm = pageSearch.trim().toLowerCase();
  const filteredNavItems = searchTerm
    ? navItems
        .map((item) => {
          if (item.children) {
            const parentMatches = item.label.toLowerCase().includes(searchTerm);
            const matchingChildren = parentMatches
              ? item.children
              : item.children.filter((c) => c.label.toLowerCase().includes(searchTerm));
            if (matchingChildren.length === 0) return null;
            return { ...item, children: matchingChildren, forceOpen: true };
          }
          return item.label.toLowerCase().includes(searchTerm) ? item : null;
        })
        .filter(Boolean)
    : navItems;

  const firstSearchTarget = (() => {
    const first = filteredNavItems[0];
    if (!first) return null;
    return first.children ? first.children[0]?.path : first.path;
  })();

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = () => {
    setShowLogoutConfirm(false);
    useAuthStore.getState().logout('admin');
    window.location.replace('/admin/login');
  };

  return (
    <>
      <aside className="h-full w-full bg-[#e5dbf7] text-[#4b3370] flex flex-col border-r border-[#cbbedf] shadow-[1px_0_10px_rgba(124,58,237,0.03)]">
      {/* Logo Area */}
      <div className={`h-[64px] flex items-center ${isCollapsed ? 'justify-center px-2' : 'pl-4 pr-11 justify-between'} border-b border-[#cbbedf] relative shrink-0`}>
        <div
          onClick={() => handleNavClick('/admin')}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-2.5'} w-full cursor-pointer hover:opacity-90 transition-opacity`}
        >
          <img
            src="/Logo (6).png"
            alt="ZeeBac Logo"
            className={`object-contain shrink-0 transition-all duration-300 ${isCollapsed ? 'h-9 w-9' : 'h-10 w-10'}`}
          />
          {!isCollapsed && (
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-[#381a6c] font-display font-black text-[21px] tracking-tight leading-none">
                Zee<span className="text-primary">Bac</span>
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded bg-white/75 text-[#5b3b96] border border-[#cbbedf]">
                Admin
              </span>
            </div>
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

      {/* Sidebar Page Search */}
      {!isCollapsed && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#70549c] text-[17px]">
              search
            </span>
            <input
              type="text"
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm && firstSearchTarget) {
                  handleNavClick(firstSearchTarget);
                } else if (e.key === 'Escape') {
                  setPageSearch('');
                }
              }}
              placeholder="Search any page..."
              className="w-full h-9 pl-8 pr-7 bg-white/80 hover:bg-white focus:bg-white border border-[#cbbedf] rounded-xl text-[12.5px] font-medium text-[#381a6c] placeholder:text-[#70549c]/70 focus:outline-none focus:border-primary transition-all shadow-2xs"
            />
            {pageSearch && (
              <button
                type="button"
                onClick={() => setPageSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#70549c] hover:text-[#381a6c] cursor-pointer flex items-center"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className={`flex-1 overflow-y-auto py-3 ${isCollapsed ? 'px-2' : 'px-3'} space-y-1 scroll-hide`}>
        {filteredNavItems.length === 0 ? (
          <p className="text-center text-[12px] font-medium text-[#70549c] py-6 px-2">
            No pages matching "{pageSearch}"
          </p>
        ) : (
          filteredNavItems.map((item) => {
          // Dropdown group (e.g. Delivery Partners)
          if (item.children) {
            const childActive = item.children.some((c) => location.pathname.startsWith(c.path));
            const isOpen = item.forceOpen || (openGroups[item.label] ?? childActive);
            return (
              <div key={item.label} className="space-y-1">
                <button
                  onClick={() =>
                    isCollapsed
                      ? handleNavClick(item.children[0].path)
                      : setOpenGroups((g) => ({ ...g, [item.label]: !isOpen }))
                  }
                  className={`w-full relative flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                    childActive && (isCollapsed || !isOpen)
                      ? 'bg-white/50 backdrop-blur-md border-white/50 text-primary font-bold shadow-sm'
                      : 'border-transparent text-[#4b3370] hover:bg-[#d8cced]/70 hover:text-[#25005b] font-medium'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ fontVariationSettings: childActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className={`font-title-md text-[13px] ${childActive ? 'font-bold' : 'font-medium'}`}>
                        {item.label}
                      </span>
                      <span
                        className={`material-symbols-outlined text-[18px] ml-auto transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        expand_more
                      </span>
                    </>
                  )}
                </button>
                {!isCollapsed && isOpen && (
                  <div className="ml-5 pl-3 border-l border-[#cbbedf] space-y-1">
                    {item.children.map((child) => {
                      const active = location.pathname.startsWith(child.path);
                      return (
                        <button
                          key={child.path}
                          onClick={() => handleNavClick(child.path)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200 cursor-pointer ${
                            active
                              ? 'bg-white/50 backdrop-blur-md border-white/50 text-primary font-bold shadow-sm'
                              : 'border-transparent text-[#4b3370] hover:bg-[#d8cced]/70 hover:text-[#25005b] font-medium'
                          }`}
                        >
                          <span
                            className="material-symbols-outlined text-[16px]"
                            style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                          >
                            {child.icon}
                          </span>
                          <span className="font-title-md text-[12.5px]">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Exact match for dashboard, prefix match for others
          const isActive = item.path === '/admin'
            ? location.pathname === '/admin' || location.pathname === '/admin/'
            : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.path)}
              className={`w-full relative flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
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
              {item.label === 'Support' && openTicketsCount > 0 && (
                <span className={`${
                  isCollapsed ? 'absolute top-1 right-1' : 'ml-auto'
                } bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm leading-none`}>
                  {openTicketsCount}
                </span>
              )}
            </button>
          );
        }))}
      </nav>

      {/* Bottom Profile Area */}
      <div className={`p-4 border-t border-[#cbbedf] bg-[#dad0ed] flex ${isCollapsed ? 'justify-center' : ''}`}>
        <div 
          onClick={() => navigate('/admin/profile')}
          title="My Profile"
          className={`flex items-center gap-3 ${isCollapsed ? 'p-1 justify-center' : 'p-2'} rounded-xl hover:bg-[#ccbfeb] transition-colors cursor-pointer w-full`}
        >
          <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 font-bold text-base flex-shrink-0 border border-red-500/20">
            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="font-title-md font-bold text-[13px] text-[#381a6c] truncate">{currentAdmin?.name || 'Admin'}</p>
                <p className="text-[11px] text-[#70549c] truncate">View profile</p>
              </div>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); handleLogoutClick(e); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-[#70549c] hover:text-red-600 transition-colors cursor-pointer"
                title="Log Out"
              >
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
      document.body
    )}
    </>
  );
}
