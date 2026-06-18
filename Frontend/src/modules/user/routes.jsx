import { Routes, Route } from 'react-router-dom';
import SplashScreen from './pages/SplashScreen';
import LocationPermissionScreen from './pages/LocationPermissionScreen';
import HomeScreen from './pages/HomeScreen';
import ExploreScreen from './pages/ExploreScreen';
import VendorDetailScreen from './pages/VendorDetailScreen';
import CreateTransactionScreen from './pages/CreateTransactionScreen';
import TransactionSuccessScreen from './pages/TransactionSuccessScreen';
import WalletScreen from './pages/WalletScreen';
import WalletPassbookScreen from './pages/WalletPassbookScreen';
import RequestCashbackScreen from './pages/RequestCashbackScreen';
import RequestHistoryScreen from './pages/RequestHistoryScreen';
import RequestDetailsScreen from './pages/RequestDetailsScreen';
import ProfileScreen from './pages/ProfileScreen';
import ScanQRScreen from './pages/ScanQRScreen';
import ChatScreen from './pages/ChatScreen';
import ProtectedRoute from '../auth/components/ProtectedRoute';

export default function UserRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<SplashScreen />} />
      <Route path="/location-permission" element={<LocationPermissionScreen />} />

      {/* Protected Customer Routes */}
      <Route element={<ProtectedRoute allowedRole="customer"><RouteWrapper /></ProtectedRoute>}>
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/explore" element={<ExploreScreen />} />
        <Route path="/vendor-detail" element={<VendorDetailScreen />} />
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/create-transaction" element={<CreateTransactionScreen />} />
        <Route path="/transaction-success" element={<TransactionSuccessScreen />} />
        <Route path="/wallet" element={<WalletScreen />} />
        <Route path="/passbook" element={<WalletPassbookScreen />} />
        <Route path="/request-cashback" element={<RequestCashbackScreen />} />
        <Route path="/request-history" element={<RequestHistoryScreen />} />
        <Route path="/request/:id" element={<RequestDetailsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/scan" element={<ScanQRScreen />} />
      </Route>
    </Routes>
  );
}

// Simple wrapper to render nested routes
import { Outlet } from 'react-router-dom';
function RouteWrapper() {
  return <Outlet />;
}

