import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../hooks/useNotifications';
import useAuthStore from '../../../store/useAuthStore';
import NotificationItemCard from '../../../components/common/NotificationItemCard';

// TODO: remove — dummy data for local UI testing only
const DUMMY_NOTIFICATIONS = [
  {
    _id: 'dummy-1',
    type: 'credit',
    title: '✅ Cashback Successful: ₹120',
    message: 'Your cashback of ₹120 has been credited to your wallet instantly.',
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    _id: 'dummy-2',
    type: 'approval',
    title: '🔑 Cash Claim OTP Generated',
    message: 'Show this OTP to the vendor to verify your ₹850 cash payment.',
    data: { verificationCode: 'Z482', amount: 850 },
    isRead: false,
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  },
  {
    _id: 'dummy-3',
    type: 'referral',
    title: '🎉 Referral Bonus Earned!',
    message: 'You earned ₹50 for referring a friend who made their first purchase.',
    isRead: true,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'dummy-4',
    type: 'system',
    title: '🎉 Welcome to Zeebac!',
    message: 'Thanks for joining! Start saving cashback on every purchase you make.',
    isRead: true,
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'dummy-5',
    type: 'approval',
    title: '📝 Bill Approved',
    message: 'Your bill of ₹450 has been approved by the vendor.',
    isRead: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { notifications, isLoading, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();
  const [dummy, setDummy] = useState(DUMMY_NOTIFICATIONS);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const usingDummy = notifications.length === 0;
  const displayNotifications = usingDummy ? dummy : notifications;
  const hasUnread = displayNotifications.some((n) => !n.isRead);

  const handleMarkAsRead = (id) => {
    if (usingDummy) {
      setDummy((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } else {
      markAsRead(id);
    }
  };

  const handleMarkAllAsRead = () => {
    if (usingDummy) {
      setDummy((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } else {
      markAllAsRead();
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col font-sans select-none">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-100 shadow-2xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
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
              onClick={handleMarkAllAsRead}
              className="text-[#3b0764] text-[13px] font-semibold hover:opacity-80 active:scale-95 transition-all cursor-pointer"
            >
              Mark all
            </button>
          )}

          {/* Profile Circle Avatar */}
          <div className="w-8 h-8 rounded-full bg-[#4c1d95] flex items-center justify-center text-white shadow-2xs overflow-hidden">
            {currentUser?.profilePicture ? (
              <img src={currentUser.profilePicture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[20px]">person</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto p-3 sm:p-4 space-y-3 pb-16">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] font-medium">Loading notifications...</p>
          </div>
        ) : displayNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[36px] text-slate-400">notifications_off</span>
            </div>
            <p className="font-bold text-[16px] text-slate-700">No notifications yet</p>
            <p className="text-[13px] text-slate-500 max-w-xs">
              When you earn cashback, claim bills, or receive store updates, they will appear here.
            </p>
          </div>
        ) : (
          displayNotifications.map((notif) => (
            <NotificationItemCard
              key={notif._id}
              notif={notif}
              onMarkAsRead={handleMarkAsRead}
            />
          ))
        )}
      </main>
    </div>
  );
}
