import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Customer signup is now completely unified and instant!
 * No long forms or multi-step questions. Users enter mobile number,
 * verify with OTP, auto-detect location, and directly open the app.
 */
export default function SignupScreen() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate('/login' + location.search, { replace: true, state: location.state });
  }, [navigate, location]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950/20 mesh-gradient text-slate-900 p-4">
      <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
