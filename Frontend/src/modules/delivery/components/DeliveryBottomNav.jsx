import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import { connectSocket, getSocket } from '../../../services/socket';
import { requestNotificationPermission } from '../../../utils/notificationUtils';

const ALERTS_DISMISS_KEY = 'zeebac_rider_alerts_prompt_dismissed_at';
const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export default function DeliveryBottomNav() {
  const location = useLocation();
  // The rider app must hold its own live connection (room rider_<id>) — previously it only ever
  // connected with the customer/vendor/admin token, so riders never received live events.
  // This nav is on every rider page and its effect runs before the page's own effects.
  useEffect(() => {
    const token = localStorage.getItem('zeebac_delivery_token');
    if (token) connectSocket(token);
  }, []);

  // Phone push notifications: register this device for the rider (order assigned, payouts, updates…)
  const [alertsPrompt, setAlertsPrompt] = useState(false);
  const [enabling, setEnabling] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('zeebac_delivery_token') || !pushSupported()) return;
    if (Notification.permission === 'granted') {
      requestNotificationPermission('delivery').catch(() => {}); // refresh / register token silently
    } else if (Notification.permission === 'default') {
      const dismissedAt = Number(localStorage.getItem(ALERTS_DISMISS_KEY) || 0);
      if (Date.now() - dismissedAt > 3 * 24 * 3600 * 1000) setAlertsPrompt(true);
    }
  }, []);
  const enableAlerts = async () => {
    setEnabling(true);
    const token = await requestNotificationPermission('delivery').catch(() => null);
    setEnabling(false);
    setAlertsPrompt(false);
    if (!token && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      localStorage.setItem(ALERTS_DISMISS_KEY, String(Date.now()));
    }
  };
  const dismissAlerts = () => {
    localStorage.setItem(ALERTS_DISMISS_KEY, String(Date.now()));
    setAlertsPrompt(false);
  };

  // Unread notification count for the Updates tab (live via socket)
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      DeliveryAPI.getNotifications()
        .then((r) => alive && r?.success && setUnread(r.data.unread))
        .catch(() => {});
    refresh();
    const socket = getSocket?.();
    const onNew = (n) => n?.recipientType === 'delivery' && setUnread((u) => u + 1);
    socket?.on('new_notification', onNew);
    const handleRiderNotifRead = (e) => {
      if (typeof e?.detail?.unread === 'number') {
        setUnread(e.detail.unread);
      } else {
        refresh();
      }
    };
    window.addEventListener('rider-notifications-read', handleRiderNotifRead);
    return () => {
      alive = false;
      socket?.off('new_notification', onNew);
      window.removeEventListener('rider-notifications-read', handleRiderNotifRead);
    };
  }, [location.pathname]);

  const navItems = [
    { label: 'Feed', icon: 'article', path: '/delivery/dashboard' },
    { label: 'Pocket', icon: 'account_balance_wallet', path: '/delivery/earnings' },
    { label: 'Gigs', icon: 'event_available', path: '/delivery/gigs' },
    { label: 'Updates', icon: 'notifications', path: '/delivery/updates' },
  ];

  return (
    <>
    {alertsPrompt && (
      <div className="fixed bottom-[60px] inset-x-0 z-50 px-3 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-[480px] mx-auto bg-slate-900 text-white rounded-2xl p-3 flex items-center gap-3 shadow-xl">
          <span className="material-symbols-outlined text-[22px] text-amber-300">notifications_active</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black">Turn on order alerts</p>
            <p className="text-[10.5px] text-slate-300 leading-snug">Get a phone notification when an order is assigned, even when the app is closed.</p>
          </div>
          <button onClick={dismissAlerts} className="text-[11px] font-bold text-slate-300 px-1 cursor-pointer">Later</button>
          <button onClick={enableAlerts} disabled={enabling} className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-[11px] font-black cursor-pointer disabled:opacity-60">
            {enabling ? '…' : 'Turn on'}
          </button>
        </div>
      </div>
    )}
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="max-w-[480px] mx-auto flex items-center justify-around h-14 px-2 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === '/delivery/dashboard' && location.pathname === '/delivery');
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 cursor-pointer ${
                isActive
                  ? 'text-slate-950 font-black'
                  : 'text-slate-400 font-semibold hover:text-slate-700'
              }`}
            >
              <div className="relative">
                <span
                  className="material-symbols-outlined text-[24px]"
                  style={{
                    fontVariationSettings: isActive ? "'FILL' 1, 'wght' 700" : "'FILL' 0, 'wght' 400",
                  }}
                >
                  {item.icon}
                </span>
                {item.path === '/delivery/updates' && unread > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-tight tracking-tight mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
