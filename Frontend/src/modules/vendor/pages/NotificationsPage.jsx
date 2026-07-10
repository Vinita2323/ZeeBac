import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../hooks/useNotifications';

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

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications();

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-lg">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Notifications</span>
        </div>
        {notifications.some((n) => !n.isRead) && (
          <button 
            onClick={markAllAsRead}
            className="text-primary text-[12px] font-bold"
          >
            Mark all read
          </button>
        )}
      </header>

      <div className="space-y-6 pt-4 max-w-2xl mx-auto">
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant px-8 text-center">
              <span className="material-symbols-outlined text-[56px] opacity-50">notifications_off</span>
              <p className="font-bold text-[15px]">No notifications</p>
              <p className="text-[13px] opacity-80">You're all caught up!</p>
            </div>
          ) : (
            notifications.map(notif => {
              const style = typeStyle[notif.type] || typeStyle.system;
              
              return (
                <div 
                  key={notif._id} 
                  onClick={() => !notif.isRead && markAsRead(notif._id)}
                  className={`bg-white rounded-2xl border shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 active:scale-[0.98] transition-all flex gap-3 cursor-pointer ${notif.isRead ? 'border-outline-variant/10' : 'border-l-4 border-l-primary border-t-outline-variant/10 border-r-outline-variant/10 border-b-outline-variant/10'}`}
                >
                  
                  <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center ${style.bg}`}>
                    <span className={`material-symbols-outlined text-[22px] ${style.color}`}>
                      {notif.icon || style.icon}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`font-bold text-[14px] ${notif.isRead ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                        {notif.title}
                      </h4>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {!notif.isRead && (
                          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(55,0,161,0.4)]"></div>
                        )}
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                          {timeAgo(notif.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className={`text-[13px] leading-relaxed ${notif.isRead ? 'text-on-surface-variant/70' : 'text-on-surface-variant'}`}>
                      {notif.message}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
