import { Routes, Route } from 'react-router-dom';
import AdminLayout from './components/common/AdminLayout';

import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import VendorsPage from './pages/VendorsPage';
import VendorApplicationDetailPage from './pages/VendorApplicationDetailPage';
import DeliveryPartnersPage from './pages/DeliveryPartnersPage';
import DeliveryOperationsPage from './pages/DeliveryOperationsPage';
import AdminOrdersPage from './pages/AdminOrdersPage';
import RiderSettlementsPage from './pages/RiderSettlementsPage';
import RiderCashLedgerPage from './pages/RiderCashLedgerPage';
import RiderEarningsPage from './pages/RiderEarningsPage';
import TransactionsPage from './pages/TransactionsPage';
import CashbackRulesPage from './pages/CashbackRulesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import WalletMonitorPage from './pages/WalletMonitorPage';
import FraudDetectionPage from './pages/FraudDetectionPage';
import ReferralAnalyticsPage from './pages/ReferralAnalyticsPage';
import SupportPage from './pages/SupportPage';
import RewardsManagerPage from './pages/RewardsManagerPage';
import PayoutsPage from './pages/PayoutsPage';
import AdminNotificationsPage from './pages/AdminNotificationsPage';
import SubscriptionPlansPage from './pages/SubscriptionPlansPage';
import LegalContentManagerPage from './pages/LegalContentManagerPage';
import AdminSupplyChainPage from './pages/AdminSupplyChainPage';
import SellerSettlementsPage from './pages/SellerSettlementsPage';
import CoinsPage from './pages/CoinsPage';
import AdminProfilePage from './pages/AdminProfilePage';

export default function AdminRoutes() {
  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/payouts" element={<PayoutsPage />} />
        <Route path="/seller-settlements" element={<SellerSettlementsPage />} />
        <Route path="/coins" element={<CoinsPage />} />
        <Route path="/profile" element={<AdminProfilePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/vendors/:id" element={<VendorApplicationDetailPage />} />
        <Route path="/delivery-partners" element={<DeliveryPartnersPage />} />
        <Route path="/rider-settlements" element={<RiderSettlementsPage />} />
        <Route path="/rider-cash-ledger" element={<RiderCashLedgerPage />} />
        <Route path="/rider-earnings" element={<RiderEarningsPage />} />
        <Route path="/orders" element={<AdminOrdersPage />} />
        <Route path="/delivery-operations" element={<DeliveryOperationsPage />} />
        <Route path="/subscriptions" element={<SubscriptionPlansPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/rules" element={<CashbackRulesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/wallet" element={<WalletMonitorPage />} />
        <Route path="/fraud" element={<FraudDetectionPage />} />
        <Route path="/referrals" element={<ReferralAnalyticsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/rewards" element={<RewardsManagerPage />} />
        <Route path="/notifications" element={<AdminNotificationsPage />} />
        <Route path="/legal-content" element={<LegalContentManagerPage />} />
        <Route path="/supply-chain" element={<AdminSupplyChainPage />} />
      </Routes>
    </AdminLayout>
  );
}
