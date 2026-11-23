import { useNavigate } from 'react-router-dom';
import OnlineOrdersSubView from '../components/OnlineOrdersSubView';
import useLanguageStore from '../../../store/useLanguageStore';
import BottomNavBar from '../components/common/BottomNavBar';
import { safeNavigateBack } from '../../../utils/navigationUtils';

export default function OrdersScreen() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  return (
    <div className="relative min-h-screen">
      <OnlineOrdersSubView
        onBack={() => safeNavigateBack(navigate, '/home')}
        t={t}
      />
      <BottomNavBar />
    </div>
  );
}
