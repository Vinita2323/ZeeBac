import { Routes, Route } from 'react-router-dom';
import AdminLayout from './components/common/AdminLayout';

import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import VendorsPage from './pages/VendorsPage';
import TransactionsPage from './pages/TransactionsPage';
import CashbackRulesPage from './pages/CashbackRulesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import WalletMonitorPage from './pages/WalletMonitorPage';
import FraudDetectionPage from './pages/FraudDetectionPage';
import ReferralAnalyticsPage from './pages/ReferralAnalyticsPage';
import SupportPage from './pages/SupportPage';
import RewardsManagerPage from './pages/RewardsManagerPage';

export default function AdminRoutes() {
  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/rules" element={<CashbackRulesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/wallet" element={<WalletMonitorPage />} />
        <Route path="/fraud" element={<FraudDetectionPage />} />
        <Route path="/referrals" element={<ReferralAnalyticsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/rewards" element={<RewardsManagerPage />} />
      </Routes>
    </AdminLayout>
  );
}
