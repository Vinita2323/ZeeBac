import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import { markPrimerSeen } from '../../../utils/permissionPrimer.util';
import PermissionPrimerModal from '../../../components/common/PermissionPrimerModal';

export default function LocationPermissionScreen() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const updateProfile = useAuthStore(state => state.updateProfile);

  const handleEnableLocation = (opts) => {
    setIsProcessing(true);
    markPrimerSeen('location');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await UserAPI.updateLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          if (res.success && res.data) {
            updateProfile(res.data);
          }
        } catch (err) {
          console.error('Location update failed:', err);
        } finally {
          setIsProcessing(false);
          navigate('/home');
        }
      },
      (error) => {
        console.warn('GPS denied:', error.message);
        setIsProcessing(false);
        navigate('/home');
      },
      {
        enableHighAccuracy: opts?.accuracy !== 'approximate',
        timeout: 10000,
      }
    );
  };

  const handleNotNow = () => {
    markPrimerSeen('location');
    navigate('/home');
  };

  return (
    <div className="min-h-screen mesh-gradient relative overflow-hidden select-none font-body-lg flex flex-col">
      {/* Background preview of the app behind the system permission dialog */}
      <div className="flex-1 opacity-40 pointer-events-none p-4 space-y-4 filter blur-[0.5px]">
        <div className="h-14 bg-white/60 rounded-2xl flex items-center px-4 justify-between border border-outline-variant/20">
          <div className="w-24 h-6 bg-primary/20 rounded-md" />
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10" />
            <div className="w-8 h-8 rounded-full bg-primary/10" />
          </div>
        </div>
        <div className="h-40 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-3xl" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-white/40 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Android System Location Permission Dialog matching user screenshot */}
      <PermissionPrimerModal
        open={true}
        type="location"
        appName="Zeebac"
        onAllow={handleEnableLocation}
        onSkip={handleNotNow}
        isProcessing={isProcessing}
      />
    </div>
  );
}
