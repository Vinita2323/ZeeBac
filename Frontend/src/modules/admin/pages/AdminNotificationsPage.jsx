import React, { useState, useEffect } from 'react';
import { NotificationAPI } from '../../../services/api';

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await NotificationAPI.getAll(1);
      if (res.success) {
        setNotifications(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch admin notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await NotificationAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark all read', error);
    }
  };

  const getTimeAgo = (dateStr) => {
    const diff = new Date() - new Date(dateStr);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-tight font-display">System Notifications</h1>
          <p className="text-sm text-on-surface-variant mt-1">Monitor all alerts, fraud flags, and system updates.</p>
        </div>
        <button 
          onClick={handleMarkAllRead}
          className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-[13px] rounded-lg transition-colors border border-outline-variant/30"
        >
          Mark all as read
        </button>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="p-8 flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-3 border-primary border-t-transparent"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <span className="material-symbols-outlined text-[64px] text-outline/30 mb-4">notifications_off</span>
            <h3 className="font-bold text-lg text-on-surface">You're all caught up!</h3>
            <p className="text-on-surface-variant text-sm mt-1">No system alerts to show right now.</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {notifications.map(notif => (
              <div 
                key={notif._id}
                className={`p-4 hover:bg-surface-container-lowest transition-colors flex gap-4 ${!notif.isRead ? 'bg-primary/[0.02]' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${!notif.isRead ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-[24px]">
                    {notif.type === 'FRAUD_ALERT' ? 'gavel' : notif.type === 'SUPPORT_TICKET' ? 'support_agent' : notif.type === 'VENDOR_KYC' ? 'storefront' : 'notifications'}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center text-left">
                  <div className="flex items-center justify-between">
                    <p className={`text-[15px] ${!notif.isRead ? 'font-bold text-on-surface' : 'font-medium text-on-surface-variant'}`}>
                      {notif.message}
                    </p>
                    <p className="text-[12px] text-outline font-medium whitespace-nowrap ml-4">
                      {getTimeAgo(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <span className="inline-block px-2 py-0.5 mt-1 bg-red-100 text-red-600 rounded text-[10px] font-bold w-max uppercase tracking-wider">
                      Unread
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
