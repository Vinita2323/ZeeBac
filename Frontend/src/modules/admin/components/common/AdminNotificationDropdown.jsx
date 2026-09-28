import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../../hooks/useNotifications';
import NotificationItemCard from '../../../../components/common/NotificationItemCard';

const TYPE_ROUTES = {
  VENDOR_KYC: '/admin/vendors',
  FRAUD_ALERT: '/admin/fraud',
  HIGH_VALUE_REQUEST: '/admin/fraud',
  SUPPORT_TICKET: '/admin/support',
  PAYOUT_REQUEST: '/admin/payouts',
};

export default function AdminNotificationDropdown({ onClose }) {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsRead, fetchNotifications } = useNotifications();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleCardClick = (notif) => {
    onClose();
    navigate(TYPE_ROUTES[notif.type] || '/admin/notifications');
  };

  const topFive = notifications.slice(0, 5);

  return (
    <div className="absolute top-[50px] right-4 w-[340px] bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-outline-variant/20 z-50 overflow-hidden flex flex-col max-h-[440px]">

      <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-lowest">
        <h3 className="font-bold text-on-surface text-[14px]">Notifications</h3>
        <button
          onClick={() => { onClose(); navigate('/admin/notifications'); }}
          className="text-[12px] text-primary hover:underline font-bold cursor-pointer"
        >
          View All
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-2.5 space-y-2">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
          </div>
        ) : topFive.length === 0 ? (
          <div className="p-6 text-center text-on-surface-variant flex flex-col items-center">
            <span className="material-symbols-outlined text-[32px] text-outline/50 mb-2">notifications_off</span>
            <p className="text-[13px] font-medium">No new notifications</p>
          </div>
        ) : (
          topFive.map((notif) => (
            <NotificationItemCard
              key={notif._id}
              notif={notif}
              onMarkAsRead={markAsRead}
              onCardClick={handleCardClick}
            />
          ))
        )}
      </div>

    </div>
  );
}
