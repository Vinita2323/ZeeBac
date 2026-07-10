import { useState, useEffect } from 'react';
import { requestNotificationPermission, onForegroundMessage } from '../../../../utils/notificationUtils';
import { AdminAPI, NotificationAPI } from '../../../../services/api';
import AdminNotificationDropdown from './AdminNotificationDropdown';

export default function AdminTopBar({ onMenuClick }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

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
  return (
    <div className="h-[64px] bg-white border-b border-outline-variant/20 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden p-2 -ml-2 text-on-surface hover:bg-surface-container-low rounded-lg transition-colors shrink-0"
          onClick={onMenuClick}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        {/* Left side: Search Bar */}
        <div className="relative group hidden md:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors text-[18px]">search</span>
          <input 
            type="text" 
            placeholder="Search platform..." 
            className="w-64 focus:w-96 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] transition-all duration-300"
          />
        </div>
      </div>

      {/* Right side: Actions & Profile */}
      <div className="flex items-center gap-4 ml-auto">
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors relative cursor-pointer"
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
        
        <div className="hidden sm:flex items-center gap-3 border-l border-outline-variant/20 pl-4 ml-2">
          <div className="text-right">
            <p className="text-[13px] font-bold text-on-surface leading-tight">Super Admin</p>
            <p className="text-[11px] text-on-surface-variant">System Owner</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          </div>
        </div>
      </div>
      
    </div>
  );
}
