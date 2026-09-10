import { Routes, Route, Navigate } from 'react-router-dom';
import VendorLayout from './components/common/VendorLayout';
import useAuthStore from '../../store/useAuthStore';
import VendorApplicationRoutes from './pages/onboarding/VendorApplicationRoutes';

// Pages
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import WalletPage from './pages/WalletPage';
import PassbookPage from './pages/PassbookPage';
import CustomersPage from './pages/CustomersPage';
import ProfilePage from './pages/ProfilePage';
import RatingsPage from './pages/RatingsPage';
import NotificationsPage from './pages/NotificationsPage';
import ChatPage from './pages/ChatPage';
import VendorScanCustomerScreen from './pages/VendorScanCustomerScreen';
import VendorLogTransactionScreen from './pages/VendorLogTransactionScreen';
import StorefrontPage from './pages/StorefrontPage';
import RequestsPage from './pages/RequestsPage';
import SupportPage from './pages/SupportPage';
import VendorSubscriptionPage from './pages/VendorSubscriptionPage';

export default function VendorRoutes() {
  const status = useAuthStore((s) => s.currentUser?.status);

  // A vendor whose application isn't yet approved never reaches the real
  // dashboard — they only see their application status/rejection/resubmit flow.
  // However, they can visit the subscription page when onboarding is approved.
  if (status !== 'Verified') {
    return (
      <Routes>
        <Route path="application/*" element={<VendorApplicationRoutes />} />
        <Route path="subscription" element={<VendorSubscriptionPage />} />
        <Route path="*" element={<Navigate to="application" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Full screen routes outside layout */}
      <Route path="scan-customer" element={<VendorScanCustomerScreen />} />
      
      {/* Routes inside layout */}
      <Route path="*" element={
        <VendorLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="subscription" element={<VendorSubscriptionPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="passbook" element={<PassbookPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="ratings" element={<RatingsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="log-transaction" element={<VendorLogTransactionScreen />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="storefront" element={<StorefrontPage />} />
            <Route path="support" element={<SupportPage />} />
          </Routes>
        </VendorLayout>
      } />
    </Routes>
  );
}
