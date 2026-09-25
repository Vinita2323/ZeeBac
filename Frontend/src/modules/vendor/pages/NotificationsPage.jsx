import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../../../hooks/useNotifications';

// ─── Time Ago Helper ───
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Icon Color Map by notification type ───
const typeStyle = {
  credit: { bg: 'bg-green-100', color: 'text-green-700', icon: 'payments' },
  approval: { bg: 'bg-blue-100', color: 'text-blue-700', icon: 'verified' },
  referral: { bg: 'bg-purple-100', color: 'text-purple-700', icon: 'group_add' },
  system: { bg: 'bg-gray-100', color: 'text-gray-700', icon: 'info' },
  promotion: { bg: 'bg-orange-100', color: 'text-orange-700', icon: 'local_offer' },
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="animate-reveal text-left">

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
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
              const isCashOtpNotif = notif.title?.includes('OTP') || 
                notif.message?.includes('OTP') || 
                notif.message?.includes('Code:') || 
                notif.data?.isCashMode === 'true' || 
                !!notif.data?.verificationCode;

              const isSuccessNotif = notif.type === 'credit' || 
                notif.title?.includes('Successful') || 
                notif.title?.includes('Approved') || 
                notif.title?.includes('Credited');

              const style = isCashOtpNotif
                ? { bg: 'bg-red-500 text-white', color: 'text-white', icon: 'pin' }
                : isSuccessNotif
                ? { bg: 'bg-emerald-600 text-white', color: 'text-white', icon: 'verified' }
                : typeStyle[notif.type] || typeStyle.system;

              // Extract OTP code if present
              const codeMatch = notif.title?.match(/OTP:\s*([0-9]{3})/i) || notif.message?.match(/code:\s*([0-9]{3})/i) || notif.message?.match(/OTP:\s*([0-9]{3})/i);
              const extractedCode = notif.data?.verificationCode || (codeMatch ? codeMatch[1] : null);

              // Extract amount if present
              const amountMatch = notif.title?.match(/₹([0-9,.]+)/) || notif.message?.match(/₹([0-9,.]+)/);
              const extractedAmount = notif.data?.amount || (amountMatch ? amountMatch[1] : null);

              return (
                <div
                  key={notif._id}
                  onClick={() => !notif.isRead && markAsRead(notif._id)}
                  className={`rounded-2xl border transition-all flex gap-3 cursor-pointer p-4 ${
                    isCashOtpNotif
                      ? 'bg-gradient-to-br from-red-50/95 via-white to-rose-50/80 border-2 border-red-500 ring-2 ring-red-400/20 shadow-md'
                      : isSuccessNotif
                      ? 'bg-emerald-50/90 border-2 border-emerald-500 ring-2 ring-emerald-400/20 shadow-sm'
                      : notif.isRead
                      ? 'bg-white border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'
                      : 'bg-white border-l-4 border-l-primary border-t-outline-variant/10 border-r-outline-variant/10 border-b-outline-variant/10 shadow-sm'
                  }`}
                >

                  <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center shadow-xs ${style.bg}`}>
                    <span className={`material-symbols-outlined text-[22px] ${style.color}`}>
                      {style.icon}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className={`font-bold text-[14px] ${
                          isCashOtpNotif ? 'text-red-950 font-black' : isSuccessNotif ? 'text-emerald-950 font-black' : notif.isRead ? 'text-on-surface-variant' : 'text-on-surface'
                        }`}>
                          {notif.title}
                        </h4>
                        {isCashOtpNotif && (
                          <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase tracking-wider animate-pulse">
                            Cash OTP
                          </span>
                        )}
                        {isSuccessNotif && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider">
                            Success
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {!notif.isRead && (
                          <div className={`w-2 h-2 rounded-full ${isCashOtpNotif ? 'bg-red-600' : isSuccessNotif ? 'bg-emerald-600' : 'bg-primary'}`}></div>
                        )}
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                          {timeAgo(notif.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className={`text-[13px] leading-relaxed ${
                      isCashOtpNotif ? 'text-red-900 font-medium' : isSuccessNotif ? 'text-emerald-900 font-medium' : notif.isRead ? 'text-on-surface-variant/70' : 'text-on-surface-variant'
                    }`}>
                      {notif.message}
                    </p>

                    {/* Highlighted OTP and Amount for Cash Request Notifications */}
                    {isCashOtpNotif && extractedCode && (
                      <div className="mt-2.5 bg-red-500/10 border-2 border-red-500 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-inner">
                        <div>
                          <span className="inline-block px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black uppercase rounded mb-0.5">
                            Customer OTP Code
                          </span>
                          <p className="text-[11px] font-bold text-red-950">Tell code to customer</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {extractedAmount && (
                            <span className="font-mono font-black text-red-700 bg-white px-2 py-0.5 rounded-lg border border-red-300 text-[12px]">
                              ₹{extractedAmount}
                            </span>
                          )}
                          <span className="font-mono font-black text-red-700 bg-white px-3 py-1 rounded-lg border-2 border-red-500 text-[18px] tracking-widest shadow-sm select-all">
                            {extractedCode}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Highlighted Success Banner for Approved Cashback Notifications */}
                    {isSuccessNotif && (
                      <div className="mt-2 bg-emerald-100/80 border border-emerald-300 rounded-xl p-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-900 text-[11px] font-bold">
                          <span className="material-symbols-outlined text-[16px] text-emerald-700">verified</span>
                          <span>Cashback Processed Successfully</span>
                        </div>
                        {extractedAmount && (
                          <span className="font-mono font-black text-emerald-900 bg-white px-2 py-0.5 rounded-lg border border-emerald-300 text-[12px]">
                            ₹{extractedAmount}
                          </span>
                        )}
                      </div>
                    )}
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
