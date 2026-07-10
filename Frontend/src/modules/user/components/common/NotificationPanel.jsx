import { useState, useEffect, useRef } from 'react';
import useNotifications from '../../../../hooks/useNotifications';

// ─── Time Ago Helper ───
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Abhi';
  if (diff < 3600) return `${Math.floor(diff / 60)}m pehle`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h pehle`;
  return `${Math.floor(diff / 86400)}d pehle`;
}

// ─── Icon Color Map by notification type ───
const typeStyle = {
  credit:   { bg: 'bg-green-100', color: 'text-green-700', icon: 'payments' },
  approval: { bg: 'bg-blue-100',  color: 'text-blue-700',  icon: 'verified' },
  referral: { bg: 'bg-purple-100', color: 'text-purple-700', icon: 'group_add' },
  system:   { bg: 'bg-gray-100',  color: 'text-gray-700',  icon: 'info' },
  promotion:{ bg: 'bg-orange-100',color: 'text-orange-700',icon: 'local_offer' },
};

// ─── Notification Panel ───
export default function NotificationPanel({ isOpen, onClose, triggerRef }) {
  const { notifications, isLoading, fetchNotifications, markAsRead, markAllAsRead } =
    useNotifications();
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

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-[340px] max-w-full z-[101] bg-white shadow-2xl
          flex flex-col transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-[#420093]/5 to-white">
          <div>
            <h2 className="font-black text-[17px] text-[#420093]">Notifications</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Aapke saare updates</p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.isRead) && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-[#420093] font-bold hover:underline"
              >
                Sab Read Karen
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] text-gray-600">close</span>
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-[#420093] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Load ho raha hai...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 px-8 text-center">
              <span className="material-symbols-outlined text-[56px] text-gray-200">notifications_off</span>
              <p className="font-bold text-[15px] text-gray-500">Koi notification nahi</p>
              <p className="text-[13px] text-gray-400">Payment karo ya koi activity karo, notifications yahan dikhengi!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifications.map((notif) => {
                const style = typeStyle[notif.type] || typeStyle.system;
                return (
                  <div
                    key={notif._id}
                    onClick={() => !notif.isRead && markAsRead(notif._id)}
                    className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors duration-150
                      ${notif.isRead ? 'bg-white hover:bg-gray-50' : 'bg-[#420093]/[0.03] hover:bg-[#420093]/[0.06]'}`}
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${style.bg}`}>
                      <span className={`material-symbols-outlined text-[20px] ${style.color}`}>
                        {notif.icon || style.icon}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] leading-tight font-bold text-gray-800 ${!notif.isRead ? 'font-extrabold' : ''}`}>
                          {notif.title}
                        </p>
                        {!notif.isRead && (
                          <div className="w-2 h-2 rounded-full bg-[#420093] flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-[12px] text-gray-500 mt-0.5 leading-snug line-clamp-2">
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        {timeAgo(notif.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
