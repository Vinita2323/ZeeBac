import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationAPI } from '../../../../services/api';

export default function AdminNotificationDropdown({ onClose }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await NotificationAPI.getAll(1);
      if (res.success) {
        setNotifications(res.data.slice(0, 5)); // Only show top 5 in dropdown
      }
    } catch (error) {
      console.error('Failed to fetch admin notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      try {
        await NotificationAPI.markAsRead(notif._id);
      } catch (err) {
        console.error('Failed to mark read', err);
      }
    }
    onClose();

    // Route based on notification type
    switch (notif.type) {
      case 'VENDOR_KYC':
        navigate('/admin/vendors');
        break;
      case 'FRAUD_ALERT':
        navigate('/admin/fraud');
        break;
      case 'SUPPORT_TICKET':
        navigate('/admin/support');
        break;
      case 'PAYOUT_REQUEST':
        navigate('/admin/payouts');
        break;
      default:
        navigate('/admin/notifications');
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
    <div className="absolute top-[50px] right-4 w-[320px] bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-outline-variant/20 z-50 overflow-hidden flex flex-col max-h-[400px]">
      
      <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-lowest">
        <h3 className="font-bold text-on-surface text-[14px]">Notifications</h3>
        <button 
          onClick={() => { onClose(); navigate('/admin/notifications'); }}
          className="text-[12px] text-primary hover:underline font-bold cursor-pointer"
        >
          View All
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-6 text-center text-on-surface-variant flex flex-col items-center">
            <span className="material-symbols-outlined text-[32px] text-outline/50 mb-2">notifications_off</span>
            <p className="text-[13px] font-medium">No new notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {notifications.map(notif => (
              <div 
                key={notif._id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-3 hover:bg-surface-container-low transition-colors cursor-pointer flex gap-3 ${!notif.isRead ? 'bg-primary/5' : ''}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${!notif.isRead ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-[20px]">
                    {notif.type === 'FRAUD_ALERT' ? 'gavel' : notif.type === 'SUPPORT_TICKET' ? 'support_agent' : 'notifications'}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-[13px] line-clamp-2 leading-tight ${!notif.isRead ? 'font-bold text-on-surface' : 'font-medium text-on-surface-variant'}`}>
                    {notif.message}
                  </p>
                  <p className="text-[11px] text-outline mt-1 font-medium">{getTimeAgo(notif.createdAt)}</p>
                </div>
                {!notif.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0"></div>}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
