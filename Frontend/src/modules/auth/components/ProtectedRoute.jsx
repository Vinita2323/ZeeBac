import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, allowedRole }) {
  const currentUserStr = localStorage.getItem('zeebac_current_user');
  
  if (!currentUserStr) {
    // Not logged in, redirect to login page
    return <Navigate to="/login" replace />;
  }

  const currentUser = JSON.parse(currentUserStr);

  if (allowedRole && currentUser.role !== allowedRole) {
    // Logged in but trying to access the wrong role's pages
    // Redirect them to their own dashboard
    return <Navigate to={currentUser.role === 'vendor' ? '/vendor' : '/home'} replace />;
  }

  return children;
}
