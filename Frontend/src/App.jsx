import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import UserRoutes from './modules/user/routes';
import VendorRoutes from './modules/vendor/routes';

// Shared Auth Screens
import AuthLoginScreen from './modules/auth/pages/AuthLoginScreen';
import AuthOTPScreen from './modules/auth/pages/AuthOTPScreen';
import SignupScreen from './modules/auth/pages/SignupScreen';
import ProtectedRoute from './modules/auth/components/ProtectedRoute';
import TermsScreen from './modules/auth/pages/TermsScreen';
import PrivacyPolicyScreen from './modules/auth/pages/PrivacyPolicyScreen';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Shared Auth Routes */}
        <Route path="/login" element={<AuthLoginScreen />} />
        <Route path="/signup" element={<SignupScreen />} />
        <Route path="/verify-otp" element={<AuthOTPScreen />} />
        <Route path="/terms" element={<TermsScreen />} />
        <Route path="/privacy" element={<PrivacyPolicyScreen />} />

        {/* Vendor Module - Protected */}
        <Route 
          path="/vendor/*" 
          element={
            <ProtectedRoute allowedRole="vendor">
              <VendorRoutes />
            </ProtectedRoute>
          } 
        />
      </Routes>
      <UserRoutes />
    </BrowserRouter>
  );
}

export default App;

