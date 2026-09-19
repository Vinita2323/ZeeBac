import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { requestNotificationPermission, onForegroundMessage } from '../../../../utils/notificationUtils';
import { AdminAPI, NotificationAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';
import AdminNotificationDropdown from './AdminNotificationDropdown';

export default function AdminTopBar({ onMenuClick }) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    // 1. Fetch initial unread count
    const fetchUnread = async () => {
      try {
        const res = await NotificationAPI.getUnreadCount();
        if (res.success) setUnreadCount(res.count);
      } catch (e) {
        console.error('Failed to fetch unread count', e);
      }
    };
    fetchUnread();

    // 2. Register for Push Notifications (FCM)
    const initPush = async () => {
      try {
        const token = await requestNotificationPermission();
        if (token) {
          await AdminAPI.saveAdminFcmToken(token);
        }
      } catch (err) {
        console.error('Push notification setup failed', err);
      }
    };
    initPush();

    // 3. Listen for foreground messages
    const unsubscribe = onForegroundMessage((payload) => {
      // Refresh count when a new notification comes in while app is open
      fetchUnread();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    useAuthStore.getState().logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <>
    <div className="h-[64px] bg-white border-b border-slate-200/80 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
      
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-50 active:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
          onClick={onMenuClick}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        {/* Left side: Search Bar */}
        <div className="relative group hidden md:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors text-[18px]">search</span>
          <input 
            type="text" 
            placeholder="Search platform..." 
            className="w-60 focus:w-80 h-10 bg-slate-50/50 border border-slate-200 rounded-xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-primary focus:bg-white focus:shadow-[0_2px_12px_rgba(124,58,237,0.06)] transition-all duration-300"
          />
        </div>
      </div>

      {/* Right side: Actions & Profile */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition-colors relative cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          
          {showDropdown && (
            <>
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => {
                  setShowDropdown(false);
                  // Refresh count when closing dropdown as they might have read some
                  NotificationAPI.getUnreadCount().then(res => setUnreadCount(res.count || 0)).catch(() => {});
                }}
              ></div>
              <div className="relative z-50">
                <AdminNotificationDropdown onClose={() => {
                  setShowDropdown(false);
                  NotificationAPI.getUnreadCount().then(res => setUnreadCount(res.count || 0)).catch(() => {});
                }} />
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2.5 border-l border-slate-200/80 pl-3 sm:pl-4">
          <div className="hidden sm:block text-right">
            <p className="text-[13px] font-bold text-slate-800 leading-tight">Super Admin</p>
            <p className="text-[11px] text-slate-500">System Owner</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          </div>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
            title="Log Out of Admin"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
      
    </div>

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
              onClick={handleLogout}
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
