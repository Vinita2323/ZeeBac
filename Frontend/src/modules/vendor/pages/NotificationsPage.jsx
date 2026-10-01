import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../hooks/useNotifications';
import useAuthStore from '../../../store/useAuthStore';
import NotificationItemCard from '../../../components/common/NotificationItemCard';
import { safeNavigateBack } from '../../../utils/navigationUtils';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { notifications, isLoading, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();
  const hasAutoReadRef = useRef(false);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Once notifications load or on page open, automatically mark them as read so the red dot clears
  useEffect(() => {
    if (!hasAutoReadRef.current && notifications.length > 0) {
      const unreadExists = notifications.some((n) => !n.isRead);
      if (unreadExists) {
        hasAutoReadRef.current = true;
        const timer = setTimeout(() => {
          markAllAsRead();
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [notifications, markAllAsRead]);

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col font-sans select-none -m-4 sm:-m-6 p-4 sm:p-6">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-100 shadow-2xs -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => safeNavigateBack(navigate, '/vendor')}
            aria-label="Go back"
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-[#3b0764] active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px] font-bold">arrow_back</span>
          </button>
          <h1 className="font-bold text-[20px] text-[#3b0764] tracking-tight">Notifications</h1>
        </div>

        <div className="flex items-center gap-3">
          {hasUnread && (
            <button
              onClick={markAllAsRead}
              className="text-[#3b0764] text-[13px] font-semibold hover:opacity-80 active:scale-95 transition-all cursor-pointer"
            >
              Mark all
            </button>
          )}

          {/* Profile Circle Avatar */}
          <div className="w-8 h-8 rounded-full bg-[#4c1d95] flex items-center justify-center text-white shadow-2xs overflow-hidden">
            {currentUser?.profilePicture || currentUser?.logoUrl ? (
              <img src={currentUser.profilePicture || currentUser.logoUrl} alt="Store Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[20px]">person</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto space-y-3 pb-16">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] font-medium">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[36px] text-slate-400">notifications_off</span>
            </div>
            <p className="font-bold text-[16px] text-slate-700">No notifications</p>
            <p className="text-[13px] text-slate-500 max-w-xs">
              You're all caught up! Customer OTPs and cashback approval alerts will show here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <NotificationItemCard
              key={notif._id}
              notif={notif}
              onMarkAsRead={markAsRead}
            />
          ))
        )}
      </main>
    </div>
  );
}
