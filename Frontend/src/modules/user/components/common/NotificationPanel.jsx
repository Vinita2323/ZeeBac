import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../../hooks/useNotifications';
import NotificationItemCard from '../../../../components/common/NotificationItemCard';

export default function NotificationPanel({ isOpen, onClose, triggerRef }) {
  const navigate = useNavigate();
  const { notifications, isLoading, fetchNotifications, markAsRead, markAllAsRead } = useNotifications();
  const panelRef = useRef(null);

  // Fetch notifications when panel opens
  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef?.current &&
        !triggerRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, triggerRef]);

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/25 backdrop-blur-[1px] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-[380px] max-w-full z-[101] bg-[#fafafa] shadow-2xl
          flex flex-col transition-transform duration-300 ease-in-out select-none
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-[#3b0764] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
            </button>
            <h2 className="font-bold text-[18px] text-[#3b0764] tracking-tight">Notifications</h2>
          </div>

          <div className="flex items-center gap-2">
            {hasUnread && (
              <button
                onClick={markAllAsRead}
                className="text-[12px] text-[#3b0764] font-semibold hover:opacity-80 transition-all cursor-pointer"
              >
                Mark all
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                navigate('/notifications');
              }}
              title="Full screen view"
              className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_full</span>
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 py-20">
              <div className="w-8 h-8 border-2 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
              <p className="text-[13px] font-medium">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 px-6 text-center py-20">
              <span className="material-symbols-outlined text-[48px] text-slate-300">notifications_off</span>
              <p className="font-bold text-[15px] text-slate-700">No notifications yet</p>
              <p className="text-[12px] text-slate-500">Your updates and cashbacks will appear here!</p>
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
        </div>
      </div>
    </>
  );
}
