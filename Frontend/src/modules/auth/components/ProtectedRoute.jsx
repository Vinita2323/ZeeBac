import { Navigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';

export default function ProtectedRoute({ children, allowedRole }) {
  const currentUser = useAuthStore((state) => state.currentUser);
  
  if (!currentUser) {
    // Not logged in — redirect to the appropriate login page based on the allowedRole
    if (allowedRole === 'vendor') return <Navigate to="/vendor-app/login" replace />;
    if (allowedRole === 'admin') return <Navigate to="/admin/login" replace />;
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && currentUser.role !== allowedRole) {
    // Logged in but trying to access the wrong role's pages
    // Redirect them to their own dashboard
    if (currentUser.role === 'vendor') return <Navigate to="/vendor" replace />;
    if (currentUser.role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/home" replace />;
  }

  return children;
}
