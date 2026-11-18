import { useNavigate } from 'react-router-dom';
import OnlineOrdersSubView from '../components/OnlineOrdersSubView';
import useLanguageStore from '../../../store/useLanguageStore';
import BottomNavBar from '../components/common/BottomNavBar';

export default function OrdersScreen() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  return (
    <div className="relative min-h-screen">
      <OnlineOrdersSubView
        onBack={() => navigate('/profile')}
        t={t}
      />
      <BottomNavBar />
    </div>
  );
}
