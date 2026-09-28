import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../hooks/useNotifications';
import NotificationItemCard from '../../../components/common/NotificationItemCard';

const TYPE_ROUTES = {
  VENDOR_KYC: '/admin/vendors',
  FRAUD_ALERT: '/admin/fraud',
  HIGH_VALUE_REQUEST: '/admin/fraud',
  SUPPORT_TICKET: '/admin/support',
  PAYOUT_REQUEST: '/admin/payouts',
};

export default function AdminNotificationsPage() {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const hasUnread = notifications.some((n) => !n.isRead);

  const handleCardClick = (notif) => {
    navigate(TYPE_ROUTES[notif.type] || '/admin/notifications');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-tight font-display">System Notifications</h1>
          <p className="text-sm text-on-surface-variant mt-1">Monitor all alerts, fraud flags, and system updates.</p>
        </div>
        {hasUnread && (
          <button
            onClick={markAllAsRead}
            className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-[13px] rounded-lg transition-colors border border-outline-variant/30"
          >
            Mark all as read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-16 flex justify-center items-center bg-white rounded-xl border border-outline-variant/20 min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-3 border-primary border-t-transparent"></div>
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-16 text-center flex flex-col items-center bg-white rounded-xl border border-outline-variant/20 min-h-[400px] justify-center">
          <span className="material-symbols-outlined text-[64px] text-outline/30 mb-4">notifications_off</span>
          <h3 className="font-bold text-lg text-on-surface">You're all caught up!</h3>
          <p className="text-on-surface-variant text-sm mt-1">No system alerts to show right now.</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-3">
          {notifications.map((notif) => (
            <NotificationItemCard
              key={notif._id}
              notif={notif}
              onMarkAsRead={markAsRead}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
