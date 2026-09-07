import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../../../../store/useAuthStore';
import ApplicationStatusScreen from './ApplicationStatusScreen';
import ApplicationRejectedScreen from './ApplicationRejectedScreen';
import VendorOnboardingWizard from './VendorOnboardingWizard';

// Reached by any authenticated vendor whose account isn't yet Verified (see
// VendorRoutes in ../../routes.jsx). Branches purely on applicationStatus.
export default function VendorApplicationRoutes() {
  const applicationStatus = useAuthStore((s) => s.currentUser?.applicationStatus);

  return (
    <Routes>
      <Route path="resubmit" element={<VendorOnboardingWizard mode="resubmit" />} />
      <Route
        path="/"
        element={
          applicationStatus === 'REJECTED' ? <ApplicationRejectedScreen /> : <ApplicationStatusScreen />
        }
      />
      <Route path="*" element={<Navigate to="/vendor/application" replace />} />
    </Routes>
  );
}
