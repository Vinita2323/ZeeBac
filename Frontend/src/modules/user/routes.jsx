import { Routes, Route } from 'react-router-dom';
import SplashScreen from './pages/SplashScreen';
import LoginScreen from './pages/LoginScreen';
import VerifyOTPScreen from './pages/VerifyOTPScreen';
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

export default function UserRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/verify-otp" element={<VerifyOTPScreen />} />
      <Route path="/location-permission" element={<LocationPermissionScreen />} />
      <Route path="/home" element={<HomeScreen />} />
      <Route path="/explore" element={<ExploreScreen />} />
      <Route path="/vendor-detail" element={<VendorDetailScreen />} />
      <Route path="/create-transaction" element={<CreateTransactionScreen />} />
      <Route path="/transaction-success" element={<TransactionSuccessScreen />} />
      <Route path="/wallet" element={<WalletScreen />} />
      <Route path="/passbook" element={<WalletPassbookScreen />} />
      <Route path="/request-cashback" element={<RequestCashbackScreen />} />
      <Route path="/request-history" element={<RequestHistoryScreen />} />
      <Route path="/request/:id" element={<RequestDetailsScreen />} />
    </Routes>
  );
}
