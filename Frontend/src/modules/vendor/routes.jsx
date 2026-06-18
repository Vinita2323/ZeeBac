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

export default function VendorRoutes() {
  return (
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
      </Routes>
    </VendorLayout>
  );
}
