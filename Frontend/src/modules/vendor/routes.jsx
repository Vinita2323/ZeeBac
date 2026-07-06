import { Routes, Route } from 'react-router-dom';
import VendorLayout from './components/common/VendorLayout';

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

export default function VendorRoutes() {
  return (
    <Routes>
      {/* Full screen routes outside layout */}
      <Route path="scan-customer" element={<VendorScanCustomerScreen />} />
      
      {/* Routes inside layout */}
      <Route path="*" element={
        <VendorLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
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
          </Routes>
        </VendorLayout>
      } />
    </Routes>
  );
}
