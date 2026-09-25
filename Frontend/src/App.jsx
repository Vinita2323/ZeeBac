import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
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
import { playVendorCashRequestVoice, playCustomerCashbackCreditedVoice, playNotificationChime } from './utils/voiceUtils';

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

function App() {
  const { accessToken, logout } = useAuthStore();
  const fetchedRef = useRef(false);

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
          // Only log out if the backend explicitly returned 401/403 (token genuinely revoked)
          if (err.response?.status === 401 || err.response?.status === 403) {
            logout();
          }
        }
      }
    };
    fetchUser();
  }, [accessToken, logout]);

  // Request notification permission and connect real-time sockets when user is authenticated
  useEffect(() => {
    if (!accessToken) return;

    const user = useAuthStore.getState().currentUser;
    const role = user?.role || (user?.storeName ? 'vendor' : 'customer');
    requestNotificationPermission(role).catch(console.error);

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
                <p className="text-[12px] font-bold text-gray-800">Tell this 3-digit code to customer</p>
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

    socket.on('new_cash_request', handleNewCashRequest);
    socket.on('cash_request_verified', handleCashRequestVerified);
    socket.on('cashback_approved', handleCashbackApproved);

    // Listen for foreground notifications (when app is open)
    const unsubscribe = onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      const notifData = payload.data || {};
      if (title && body) {
        if (notifData.isCashMode === 'true' && notifData.amount) {
          playVendorCashRequestVoice(notifData.amount);
        } else if (notifData.cashbackAmount && role === 'customer') {
          playCustomerCashbackCreditedVoice(notifData.cashbackAmount);
        }
        useUIStore.getState().showSnackbar(`🔔 ${title}: ${body}`, 'info');
      }
    });

    return () => {
      socket.off('new_cash_request', handleNewCashRequest);
      socket.off('cash_request_verified', handleCashRequestVerified);
      socket.off('cashback_approved', handleCashbackApproved);
      if (unsubscribe) unsubscribe();
    };
  }, [accessToken]);
  return (
    <BrowserRouter>
      <CallProvider>
        <ScrollToTop />
        <div className="app-backdrop" aria-hidden="true" />

        {/* Global UI Overlays */}
        <Toaster position="top-center" reverseOrder={false} />
        <GlobalAlertDialog />
        <GlobalSnackbar />
        <IncomingCallModal />
        <MaskedCallModal />

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
