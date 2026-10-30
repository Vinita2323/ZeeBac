import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import { toast } from 'react-hot-toast';

export default function DeliveryLoginScreen() {
  const navigate = useNavigate();
  const setAuth = useDeliveryStore((state) => state.setAuth);

  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otp, setOtp] = useState('1234');
  const [notRegisteredError, setNotRegisteredError] = useState(false);

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }
    setNotRegisteredError(false);
    setShowOtpStep(true);
  };

  const handleVerifyAndLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setNotRegisteredError(false);

    try {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const res = await DeliveryAPI.login({ phone: cleanPhone });

      if (res.success && res.data) {
        const { rider, token, applicationStatus } = res.data;
        setAuth(rider, token);

        if (applicationStatus === 'APPROVED') {
          toast.success(`Welcome back, ${rider.name}!`);
          navigate('/delivery/dashboard');
        } else {
          toast.success('Login successful. Checking application status...');
          navigate('/delivery/status');
        }
      } else {
        toast.error(res.message || 'Login failed');
      }
    } catch (err) {
      console.error('Rider login failed', err);
      if (err.response?.status === 404) {
        setNotRegisteredError(true);
        toast.error('No partner account found with this number. Please register first.');
      } else {
        toast.error(err.response?.data?.message || 'Login failed, please try again');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mesh-gradient min-h-screen flex flex-col justify-between p-4 sm:p-6 text-on-surface">
      {/* Top Brand Header */}
      <div className="pt-8 text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-purple-700 to-indigo-800 text-white flex items-center justify-center mx-auto shadow-lg shadow-primary/25">
          <span className="material-symbols-outlined text-[32px]">two_wheeler</span>
        </div>
        <h1 className="font-display font-black text-[24px] text-slate-900 tracking-tight">
          Zeebac Delivery Partner
        </h1>
        <p className="text-[13px] text-slate-500 font-medium">
          Deliver orders, earn instant payouts, and track routes
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-xl max-w-[420px] w-full mx-auto space-y-5">
        {!showOtpStep ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-4 text-left">
            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                Registered Mobile Number *
              </label>
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-3 rounded-2xl bg-slate-100 text-[13px] font-bold text-slate-700 select-none">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, ''));
                    setNotRegisteredError(false);
                  }}
                  placeholder="98765 43210"
                  className="flex-1 py-3 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-[15px] font-bold text-slate-900 focus:outline-none focus:border-primary transition-all font-mono"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={phone.length < 10}
              className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>Get OTP to Login</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>

            {/* Registration Banner */}
            <div className="pt-2 border-t border-slate-100 text-center space-y-2">
              <p className="text-[12px] text-slate-500">Want to earn as a ZeeBac Delivery Partner?</p>
              <Link
                to="/delivery/onboarding"
                className="w-full py-3 px-4 rounded-2xl bg-purple-50 text-primary border border-purple-200 font-bold text-[13px] hover:bg-purple-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                <span>Register as Delivery Partner</span>
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndLogin} className="space-y-4 text-left">
            <div className="text-center space-y-1">
              <p className="text-[13px] font-bold text-slate-800">Verify OTP sent to +91 {phone}</p>
              <p className="text-[11.5px] text-slate-500">Auto-filled demo OTP: <strong>1234</strong></p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5 text-center">
                Enter 4-Digit OTP
              </label>
              <input
                type="text"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-full py-3 text-center text-[22px] tracking-[1em] font-black rounded-2xl bg-slate-50 border-2 border-primary/40 focus:border-primary outline-none font-mono"
                autoFocus
              />
            </div>

            {notRegisteredError && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-left space-y-2">
                <p className="text-[12px] text-amber-800 font-medium">
                  We could not find an account with +91 {phone}. Please register to become a partner.
                </p>
                <Link
                  to="/delivery/onboarding"
                  className="w-full py-2.5 rounded-xl btn-primary-gradient text-white text-center font-bold text-[12px] shadow-sm flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">app_registration</span>
                  <span>Register Now</span>
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || otp.length < 4}
              className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>Verify & Login</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowOtpStep(false);
                setNotRegisteredError(false);
              }}
              className="w-full py-2 text-center text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Change Mobile Number
            </button>
          </form>
        )}
      </div>

      {/* Footer Switcher */}
      <div className="text-center py-4 space-y-2">
        <p className="text-[12px] text-slate-500">Are you a merchant or store owner?</p>
        <button
          onClick={() => navigate('/vendor/dashboard')}
          className="text-[12.5px] font-bold text-primary hover:underline cursor-pointer"
        >
          Switch to Merchant Panel
        </button>
      </div>
    </div>
  );
}
