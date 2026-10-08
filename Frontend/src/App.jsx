import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import UserRoutes from './modules/user/routes';
import VendorRoutes from './modules/vendor/routes';
import AdminRoutes from './modules/admin/routes';

// Shared Auth Screens
import AuthLoginScreen from './modules/auth/pages/AuthLoginScreen';
import AuthOTPScreen from './modules/auth/pages/AuthOTPScreen';
import SignupScreen from './modules/auth/pages/SignupScreen';
import ProtectedRoute from './modules/auth/components/ProtectedRoute';
import TermsScreen from './modules/auth/pages/TermsScreen';
import PrivacyPolicyScreen from './modules/auth/pages/PrivacyPolicyScreen';
import AdminLoginScreen from './modules/admin/pages/AdminLoginScreen';
import VendorLandingScreen from './modules/vendor/pages/VendorLandingScreen';
import VendorOnboardingWizard from './modules/vendor/pages/onboarding/VendorOnboardingWizard';

// Global State & UI
import useAuthStore from './store/useAuthStore';
import useUIStore from './store/useUIStore';
import GlobalAlertDialog from './components/GlobalAlertDialog';
import GlobalSnackbar from './components/GlobalSnackbar';
import { AuthAPI } from './services/api';
import { requestNotificationPermission, onForegroundMessage } from './utils/notificationUtils';
import { Toaster, toast } from 'react-hot-toast';
import { CallProvider } from './context/CallContext';
import IncomingCallModal from './components/common/IncomingCallModal';
import MaskedCallModal from './components/common/MaskedCallModal';
import { connectSocket } from './services/socket';
import { playVendorCashRequestVoice, playCustomerCashbackCreditedVoice, playNotificationChime, speakVoice } from './utils/voiceUtils';
import { hasSeenPrimer, markPrimerSeen, usePrimerGate, usePrimerSlot, PRIMER_PRIORITY } from './utils/permissionPrimer.util';
import DataConsentModal from './components/common/DataConsentModal';
import PermissionPrimerModal from './components/common/PermissionPrimerModal';
import AppLockScreen from './components/common/AppLockScreen';

// Globally override browser alert to use toast for a better UI experience
window.alert = (message) => {
  if (typeof message !== 'string') return;
  const msgLower = message.toLowerCase();
  if (msgLower.includes('success') || msgLower.includes('copied') || msgLower.includes('added') || msgLower.includes('won')) {
    toast.success(message, { duration: 4000 });
  } else {
    toast.error(message, { duration: 4000 });
  }
};

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function RoleRouteSync() {
  const { pathname } = useLocation();
  const syncRoleForRoute = useAuthStore((s) => s.syncRoleForRoute);

  useEffect(() => {
    syncRoleForRoute(pathname);
  }, [pathname, syncRoleForRoute]);

  return null;
}

function PwaInstallManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const isAdminPath = pathname.startsWith('/admin');
    const existing = document.querySelector('link[rel="manifest"]');

    if (isAdminPath) {
      if (existing) existing.remove();
    } else {
      if (!existing) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest.json';
        document.head.appendChild(link);
      }
    }
  }, [pathname]);

  // Prevent browser's native "Install App / Download App" prompt on admin routes
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      if (window.location.pathname.startsWith('/admin')) {
        e.preventDefault();
        return false;
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  return null;
}

function App() {
  const { accessToken, logout, currentUser, lockApp } = useAuthStore();
  const fetchedRef = useRef(false);
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);

  // Re-lock on resume when switching tabs/apps, respecting the 10-minute grace period.
  // Once the user has entered their PIN/biometric, switching tabs will NOT re-prompt
  // for 10 minutes.
  useEffect(() => {
    if (!accessToken) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if the 10-minute unlock window has expired
        lockApp();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [accessToken, lockApp]);

  // These permission primers are for the customer/vendor-facing app only —
  // admins run an internal tool and shouldn't see a cashback-data consent
  // screen or feature permission prompts blocking their dashboard.
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  // One-time mandatory data-usage consent, shown before any permission is
  // requested. Highest priority — always wins the shared primer gate.
  const showDataConsent = usePrimerSlot(
    'data_consent',
    PRIMER_PRIORITY.data_consent,
    !!accessToken && !isAdmin && !hasSeenPrimer('data_consent')
  );

  const handleAgreeDataConsent = () => {
    markPrimerSeen('data_consent');
    usePrimerGate.getState().release('data_consent');
  };

  // Explain notifications before the native prompt, but only while the OS
  // hasn't already decided (still 'default') — otherwise just sync silently.
  const showNotifPrimer = usePrimerSlot(
    'notifications',
    PRIMER_PRIORITY.notifications,
    !!accessToken &&
      !isAdmin &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default' &&
      !hasSeenPrimer('notifications')
  );

  useEffect(() => {
    if (!accessToken || isAdmin || typeof Notification === 'undefined') return;
    const role = useAuthStore.getState().currentUser?.role || 'customer';

    if (Notification.permission === 'granted') {
      requestNotificationPermission(role).catch(console.error);
    } else if (Notification.permission === 'default') {
      const promptOnGesture = () => {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            requestNotificationPermission(role).catch(console.error);
          }
        }).catch(() => {});
        window.removeEventListener('click', promptOnGesture);
        window.removeEventListener('touchstart', promptOnGesture);
      };
      window.addEventListener('click', promptOnGesture, { once: true });
      window.addEventListener('touchstart', promptOnGesture, { once: true });
      return () => {
        window.removeEventListener('click', promptOnGesture);
        window.removeEventListener('touchstart', promptOnGesture);
      };
    }
  }, [accessToken, isAdmin]);

  const handleAllowNotifications = async () => {
    setIsRequestingNotif(true);
    const role = useAuthStore.getState().currentUser?.role || 'customer';
    try {
      await requestNotificationPermission(role);
    } catch (err) {
      console.error(err);
    }
    markPrimerSeen('notifications');
    setIsRequestingNotif(false);
    usePrimerGate.getState().release('notifications');
  };

  const handleSkipNotifications = () => {
    markPrimerSeen('notifications');
    usePrimerGate.getState().release('notifications');
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (accessToken && !fetchedRef.current) {
        fetchedRef.current = true;
        try {
          const res = await AuthAPI.getMe();
          if (res?.data) {
            const current = useAuthStore.getState().currentUser || {};
            const updated = {
              ...current,
              ...res.data,
              role: res.data.role || current.role || (res.data.storeName ? 'vendor' : 'customer'),
            };
            useAuthStore.getState().updateProfile(updated);
          }
        } catch (err) {
          console.warn("Session profile sync error:", err?.message || err);
          // Do not force logout on profile sync error to keep session saved
        }
      }
    };
    fetchUser();
  }, [accessToken]);

  // Request notification permission and connect real-time sockets when user is authenticated
  useEffect(() => {
    if (!accessToken) return;

    const user = useAuthStore.getState().currentUser;
    const role = user?.role || (user?.storeName ? 'vendor' : 'customer');

    const socket = connectSocket(accessToken);

    const handleNewCashRequest = (data) => {
      // 1. Voice Note for Vendor: "{amount} ka cashback request received"
      playVendorCashRequestVoice(data.amount);

      // 2. High-Visibility Red Banner Toast with highlighted OTP & Bill Amount
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-2xl rounded-2xl pointer-events-auto p-4 border-2 border-red-300 ring-4 ring-red-500/30`}>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-2 mb-2">
              <span className="px-2 py-0.5 bg-white text-red-700 rounded-md text-[10px] font-black uppercase tracking-wider shadow-xs flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                ⚡ Cash Mode • OTP
              </span>
              <span className="text-[14px] font-black text-yellow-300 bg-black/20 px-2 py-0.5 rounded-lg font-mono">
                Bill: ₹{data.amount}
              </span>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-inner flex items-center justify-between gap-2 my-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">Customer OTP Code</p>
                <p className="text-[12px] font-bold text-gray-800">Tell this code to customer</p>
              </div>
              <span className="text-[26px] font-mono font-black tracking-[0.2em] text-red-600 bg-red-50 px-3.5 py-1 rounded-lg border-2 border-red-300 select-all shadow-xs">
                {data.verificationCode}
              </span>
            </div>

            <div className="flex justify-between items-center text-[11px] text-white/95 font-semibold pt-1">
              <span>Customer: <b className="text-white">{data.customerName || 'Customer'}</b></span>
              <span className="bg-white/20 px-2 py-0.5 rounded font-black text-yellow-200">
                Cashback: ₹{data.cashbackAmount}
              </span>
            </div>
          </div>
        </div>
      ), { duration: 12000, id: `cash-req-${data.requestId || data.verificationCode}` });

      // 3. Native Browser Notification (visible even if app is in background or minimized)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(`🔑 OTP: ${data.verificationCode} | Amount: ₹${data.amount}`, {
            body: `Code: ${data.verificationCode} • Share with ${data.customerName || 'customer'} (Cashback ₹${data.cashbackAmount} on ₹${data.amount})`,
            icon: '/Logo (6).png',
            tag: `cash-req-${data.requestId || Date.now()}`,
          });
        } catch (e) {}
      }
    };

    const handleCashRequestVerified = (data) => {
      playNotificationChime('success');
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 text-white shadow-2xl rounded-2xl pointer-events-auto p-4 border-2 border-emerald-300 ring-4 ring-emerald-500/20`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-[22px]">
              ✅
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-black uppercase tracking-wider text-emerald-100">Cashback Verified & Approved</p>
              <p className="text-[13px] font-bold text-white mt-0.5">
                ₹{data.cashbackAmount} cashback paid to {data.customerName || 'customer'} (OTP: {data.verificationCode})
              </p>
            </div>
          </div>
        </div>
      ), { duration: 6000, id: `verified-${data.requestId || Date.now()}` });
    };

    const handleCashbackApproved = (data) => {
      // Voice Note for Customer: "{cashback} cashback credited"
      playCustomerCashbackCreditedVoice(data.cashbackAmount);

      // Refresh live wallet balance
      useAuthStore.getState().fetchWalletBalance();

      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 text-white shadow-2xl rounded-2xl pointer-events-auto p-4 border-2 border-emerald-300 ring-4 ring-emerald-500/20`}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-[24px]">
              🎉
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-black text-white">
                ₹{data.cashbackAmount} Cashback Credited!
              </p>
              <p className="text-[12px] text-emerald-100 mt-0.5">
                From {data.vendorName || 'ZeeBac Partner Store'} has been credited to your wallet!
              </p>
            </div>
          </div>
        </div>
      ), { duration: 8000, id: `approved-${data.requestId || Date.now()}` });

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(`🎉 ₹${data.cashbackAmount} Cashback Credited!`, {
            body: `Cashback from ${data.vendorName || 'ZeeBac Partner'} added to your wallet!`,
            icon: '/Logo (6).png',
            tag: `cb-credit-${data.requestId || Date.now()}`,
          });
        } catch (e) {}
      }
    };

    // Global deduplication cache to ensure a notification never pops up multiple times
    const recentNotifCache = window.__recentNotifCache || (window.__recentNotifCache = new Map());

    // Mobile-style Heads-Up Top Notification Banner (styled like native mobile push notification)
    const showTopMobileNotification = ({ title, body, icon = 'notifications', onClick, id }) => {
      const cleanTitle = (title || '').toLowerCase().trim();
      const cleanBody = (body || '').toLowerCase().trim();
      const contentKey = `${cleanTitle}::${cleanBody}`;
      const now = Date.now();

      // Content-based deduplication: prevent any popup with same title/body within 6 seconds
      if (recentNotifCache.has(contentKey) && (now - recentNotifCache.get(contentKey)) < 6000) {
        return;
      }
      if (id && recentNotifCache.has(String(id)) && (now - recentNotifCache.get(String(id))) < 6000) {
        return;
      }
      recentNotifCache.set(contentKey, now);
      if (id) recentNotifCache.set(String(id), now);

      if (recentNotifCache.size > 50) {
        const oldestKey = recentNotifCache.keys().next().value;
        recentNotifCache.delete(oldestKey);
      }

      // 1. Dismiss any existing toast first so only 1 notification is ever visible on screen!
      toast.dismiss();

      // 2. Audio chime
      playNotificationChime('incoming');

      // 3. Mobile vibration
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([150, 75, 150]); } catch (e) {}
      }

      // 4. Heads-Up Top Banner (drops down smoothly at the top of the mobile screen)
      toast.custom(
        (t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              if (onClick) onClick();
            }}
            className={`${
              t.visible ? 'animate-enter' : 'animate-leave'
            } pointer-events-auto w-full max-w-[390px] mx-auto bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl p-3.5 shadow-2xl border border-white/20 flex items-center gap-3 cursor-pointer active:scale-95 transition-transform hover:bg-slate-800 ring-2 ring-primary/25`}
            style={{
              boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6), 0 0 25px 0 rgba(124,58,237,0.35)',
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-primary flex items-center justify-center text-white shrink-0 shadow-md">
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[13px] font-black text-white truncate leading-tight">{title}</p>
                <span className="text-[10px] text-purple-300 font-bold bg-purple-950/80 px-1.5 py-0.5 rounded-full shrink-0 border border-purple-500/30">Just now</span>
              </div>
              <p className="text-[12px] text-slate-300 truncate mt-0.5 font-medium leading-normal">{body}</p>
            </div>
          </div>
        ),
        { duration: 5500, id: id || `top-notif-${Date.now()}` }
      );

      // 5. Native OS system notification (shows on phone lock screen or status bar)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const nativeNotif = new Notification(title, {
            body,
            icon: '/Logo (6).png',
            badge: '/Logo (6).png',
            tag: id || `sys-notif-${Date.now()}`,
          });
          nativeNotif.onclick = () => {
            window.focus();
            if (onClick) onClick();
          };
        } catch (e) {}
      }
    };

    const handleIncomingChatMessage = (data) => {
      const isVendor = role === 'vendor';
      const chatRoute = isVendor ? '/vendor/chat' : '/chat';

      // Don't ring if user is already actively looking at THIS exact conversation
      if (window.__ACTIVE_CONVERSATION_ID__ && window.__ACTIVE_CONVERSATION_ID__ === String(data.conversationId)) {
        return;
      }

      showTopMobileNotification({
        title: data.senderName ? `💬 ${data.senderName}` : '💬 New Message',
        body: data.text || 'Sent an attachment',
        icon: 'chat',
        id: `chat-${data.conversationId || Date.now()}`,
        onClick: () => {
          window.location.href = chatRoute;
        },
      });
    };

    const handleNewNotification = (notif) => {
      // Avoid duplicate popup if it's a chat message notification and already popped
      if (notif.referenceType === 'conversation') return;

      const isVendor = role === 'vendor';
      // Filter out vendor notifications if customer, and customer notifications if vendor
      if (isVendor && notif.recipientType === 'customer') return;
      if (!isVendor && (notif.recipientType === 'vendor' || notif.title?.includes('by Customer') || notif.title?.includes('Claimed by Customer'))) return;

      const targetUrl = notif.referenceType === 'transaction' || notif.type === 'credit'
        ? (isVendor ? '/vendor/wallet' : '/wallet')
        : (isVendor ? '/vendor/notifications' : '/notifications');

      showTopMobileNotification({
        title: notif.title || '🔔 Notification',
        body: notif.message || '',
        icon: notif.icon || 'notifications',
        id: notif._id ? `notif-${notif._id}` : `notif-${notif.title}_${notif.message}`,
        onClick: () => {
          window.location.href = targetUrl;
        },
      });
    };

    const handleCashRequestSent = (data) => {
      playNotificationChime('incoming');
      speakVoice('Cashback request sent. Ask merchant for OTP code at billing counter.');
    };

    socket.on('new_cash_request', handleNewCashRequest);
    socket.on('cash_request_verified', handleCashRequestVerified);
    socket.on('cashback_approved', handleCashbackApproved);
    socket.on('incomingChatMessage', handleIncomingChatMessage);
    socket.on('new_notification', handleNewNotification);
    socket.on('cash_request_sent', handleCashRequestSent);

    // Listen for foreground push notifications (when app is open)
    const unsubscribe = onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      const notifData = payload.data || {};
      if (title && body) {
        const isVendor = role === 'vendor';
        // Filter out vendor push notifications on customer profile and vice versa
        if (notifData.recipientType && notifData.recipientType !== (isVendor ? 'vendor' : 'customer')) {
          return;
        }
        if (!isVendor && (title.includes('by Customer') || notifData.recipientType === 'vendor')) {
          return;
        }
        if (notifData.recipientId && currentUser?._id && String(notifData.recipientId) !== String(currentUser._id)) {
          return;
        }

        // When the app is in the foreground, socket connection already delivers live cashback notifications.
        // Skip duplicate FCM credit alerts in foreground to prevent duplicate popups!
        if (notifData.type === 'credit' || notifData.type === 'cashback') {
          return;
        }

        if (notifData.isCashMode === 'true' && notifData.amount) {
          playVendorCashRequestVoice(notifData.amount);
        } else if (notifData.isChat === 'true') {
          playNotificationChime('incoming');
        }
        showTopMobileNotification({
          title,
          body,
          icon: notifData.icon || 'notifications',
          id: notifData.notificationId || `fcm-${title}_${body}`,
          onClick: () => {
            if (notifData.isChat === 'true') {
              window.location.href = isVendor ? '/vendor/chat' : '/chat';
            } else {
              window.location.href = isVendor ? '/vendor/notifications' : '/notifications';
            }
          },
        });
      }
    });

    return () => {
      socket.off('new_cash_request', handleNewCashRequest);
      socket.off('cash_request_verified', handleCashRequestVerified);
      socket.off('cashback_approved', handleCashbackApproved);
      socket.off('incomingChatMessage', handleIncomingChatMessage);
      socket.off('new_notification', handleNewNotification);
      socket.off('cash_request_sent', handleCashRequestSent);
      if (unsubscribe) unsubscribe();
    };
  }, [accessToken]);
  return (
    <BrowserRouter>
      <CallProvider>
        <ScrollToTop />
        <RoleRouteSync />
        <PwaInstallManager />
        <div className="app-backdrop" aria-hidden="true" />

        {/* Global UI Overlays */}
        <AppLockScreen />
        <Toaster position="top-center" reverseOrder={false} />
        <GlobalAlertDialog />
        <GlobalSnackbar />
        <IncomingCallModal />
        <MaskedCallModal />
        <DataConsentModal open={showDataConsent} onAgree={handleAgreeDataConsent} />
        <PermissionPrimerModal
          open={showNotifPrimer}
          icon="notifications_active"
          title="Stay in the loop"
          message="Allow notifications to get instant alerts for cashback credits, OTPs, and order updates."
          onAllow={handleAllowNotifications}
          onSkip={handleSkipNotifications}
          isProcessing={isRequestingNotif}
        />

        <Routes>
          {/* ─── Customer App Auth ─── */}
          <Route path="/login" element={<AuthLoginScreen role="customer" />} />
          <Route path="/signup" element={<SignupScreen role="customer" />} />
          <Route path="/verify-otp" element={<AuthOTPScreen />} />
          <Route path="/terms" element={<TermsScreen />} />
          <Route path="/privacy" element={<PrivacyPolicyScreen />} />

          {/* ─── Vendor App Auth (Separate App) ─── */}
          <Route path="/vendor-app" element={<VendorLandingScreen />} />
          <Route path="/vendor-app/login" element={<AuthLoginScreen role="vendor" />} />
          <Route path="/vendor-app/signup" element={<VendorOnboardingWizard mode="register" />} />
          <Route path="/vendor-app/verify-otp" element={<AuthOTPScreen />} />
          <Route path="/application-rejected" element={<Navigate to="/vendor/application" replace />} />

          {/* ─── Admin Login (Public) ─── */}
          <Route path="/admin/login" element={<AdminLoginScreen />} />

          {/* ─── Vendor Dashboard (Protected) ─── */}
          <Route 
            path="/vendor/*" 
            element={
              <ProtectedRoute allowedRole="vendor">
                <VendorRoutes />
              </ProtectedRoute>
            } 
          />

          {/* ─── Admin Dashboard (Protected) ─── */}
          <Route 
            path="/admin/*" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminRoutes />
              </ProtectedRoute>
            } 
          />
          {/* ─── Customer App (Protected & Public) ─── */}
          <Route path="/*" element={<UserRoutes />} />
        </Routes>
      </CallProvider>
    </BrowserRouter>
  );
}

export default App;
