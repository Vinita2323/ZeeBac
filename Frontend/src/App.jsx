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

// Global State & UI
import useAuthStore from './store/useAuthStore';
import GlobalAlertDialog from './components/GlobalAlertDialog';
import GlobalSnackbar from './components/GlobalSnackbar';
import { AuthAPI } from './services/api';
import { requestNotificationPermission, onForegroundMessage } from './utils/notificationUtils';

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
          if (res.data) {
            useAuthStore.setState({ currentUser: res.data });
          }
        } catch (err) {
          console.error("Session expired or invalid", err);
          logout();
        }
      }
    };
    fetchUser();
  }, [accessToken, logout]);

  // Request notification permission when user logs in
  useEffect(() => {
    if (accessToken) {
      const user = useAuthStore.getState().currentUser;
      const role = user?.role || 'customer';
      requestNotificationPermission(role).catch(console.error);

      // Listen for foreground notifications (when app is open)
      const unsubscribe = onForegroundMessage((payload) => {
        const { title, body } = payload.notification || {};
        if (title && body) {
          // Show as a toast/snackbar (non-intrusive)
          console.log('Notification:', title, body);
        }
      });
      return () => unsubscribe && unsubscribe();
    }
  }, [accessToken]);
  return (
    <BrowserRouter>
      <ScrollToTop />

      {/* Global UI Overlays */}
      <GlobalAlertDialog />
      <GlobalSnackbar />

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
        <Route path="/vendor-app/signup" element={<SignupScreen role="vendor" />} />
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
    </BrowserRouter>
  );
}

export default App;
