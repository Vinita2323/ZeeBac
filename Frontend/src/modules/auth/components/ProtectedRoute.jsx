import { Navigate } from 'react-router-dom';
import useAuthStore, { ROLE_STORAGE } from '../../../store/useAuthStore';

export default function ProtectedRoute({ children, allowedRole }) {
  const { vendorToken, customerToken, adminToken, syncRoleForRoute } = useAuthStore();

  // Check both store and localStorage to prevent flicker during hydration
  const hasVendor = Boolean(
    vendorToken ||
    localStorage.getItem(ROLE_STORAGE.vendor.token) ||
    (localStorage.getItem('zeebac_current_user')?.includes('"vendor"') && localStorage.getItem('zeebac_access_token'))
  );

  const hasCustomer = Boolean(
    customerToken ||
    localStorage.getItem(ROLE_STORAGE.customer.token) ||
    (localStorage.getItem('zeebac_current_user')?.includes('"customer"') && localStorage.getItem('zeebac_access_token'))
  );

  const hasAdmin = Boolean(
    adminToken ||
    localStorage.getItem(ROLE_STORAGE.admin.token) ||
    (localStorage.getItem('zeebac_current_user')?.includes('"admin"') && localStorage.getItem('zeebac_access_token'))
  );

  if (allowedRole === 'vendor') {
    if (!hasVendor) {
      return <Navigate to="/vendor-app/login" replace />;
    }
    syncRoleForRoute('/vendor');
    return children;
  }

  if (allowedRole === 'admin') {
    if (!hasAdmin) {
      return <Navigate to="/admin/login" replace />;
    }
    syncRoleForRoute('/admin');
    return children;
  }

  // Customer protection (default)
  if (allowedRole === 'customer' || !allowedRole) {
    if (!hasCustomer) {
      return <Navigate to="/login" replace />;
    }
    syncRoleForRoute('/home');
    return children;
  }

  return children;
}
