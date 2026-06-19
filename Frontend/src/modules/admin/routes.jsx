import { Routes, Route } from 'react-router-dom';
import AdminLayout from './components/common/AdminLayout';

import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import VendorsPage from './pages/VendorsPage';
import TransactionsPage from './pages/TransactionsPage';
import CashbackRulesPage from './pages/CashbackRulesPage';
import WalletMonitorPage from './pages/WalletMonitorPage';
import AnalyticsPage from './pages/AnalyticsPage';

export default function AdminRoutes() {
  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/rules" element={<CashbackRulesPage />} />
        <Route path="/wallet" element={<WalletMonitorPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </AdminLayout>
  );
}
