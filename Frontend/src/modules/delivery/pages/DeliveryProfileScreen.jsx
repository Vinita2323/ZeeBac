import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';

export default function DeliveryProfileScreen() {
  const navigate = useNavigate();
  const rider = useDeliveryStore((state) => state.rider);
  const token = useDeliveryStore((state) => state.token);
  const logout = useDeliveryStore((state) => state.logout);
  const updateRider = useDeliveryStore((state) => state.updateRider);

  const [name, setName] = useState(rider?.name || '');
  const [vehicleType, setVehicleType] = useState(rider?.vehicleType || 'Bike');
  const [vehicleNo, setVehicleNo] = useState(rider?.vehicleNo || '');
  const [upiId, setUpiId] = useState(rider?.bankDetails?.upiId || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/delivery/login');
      return;
    }
    DeliveryAPI.getProfile().then((res) => {
      if (res.success && res.data) {
        updateRider(res.data);
        setName(res.data.name || '');
        setVehicleType(res.data.vehicleType || 'Bike');
        setVehicleNo(res.data.vehicleNo || '');
        setUpiId(res.data.bankDetails?.upiId || '');
      }
    }).catch(console.error);
  }, [token, navigate, updateRider]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await DeliveryAPI.updateProfile({
        name,
        vehicleType,
        vehicleNo,
        bankDetails: { upiId },
      });
      if (res.success) {
        updateRider(res.data);
        toast.success('Rider profile updated!');
      }
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/delivery/login');
  };

  return (
    <div className="mesh-gradient min-h-screen flex flex-col font-body-lg pb-24 text-on-surface">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 shadow-xs">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">account_circle</span>
            <h1 className="font-display font-black text-[17px] text-slate-900">
              Rider Partner Profile
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[480px] w-full mx-auto p-4 space-y-4 text-left">
        {/* Rider Badge Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
            <span className="material-symbols-outlined text-[36px]">sports_motorsports</span>
          </div>
          <div>
            <h2 className="font-display font-black text-[18px] text-slate-900 leading-tight">
              {rider?.name || 'Rider'}
            </h2>
            <p className="text-[12px] text-slate-500 font-mono mt-0.5">
              ID: {rider?.riderId} • +91 {rider?.phone}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              <span>Verified Delivery Partner</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deliveries</p>
            <h3 className="font-display font-black text-[22px] text-slate-900">
              {rider?.completedDeliveries || 0}
            </h3>
            <p className="text-[10px] text-slate-500">Orders completed</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rating</p>
            <h3 className="font-display font-black text-[22px] text-amber-500 flex items-center gap-1">
              <span>{rider?.rating || '5.0'}</span>
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
            </h3>
            <p className="text-[10px] text-slate-500">Customer feedback</p>
          </div>
        </div>

        {/* Edit Details Form */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
          <h3 className="font-display font-black text-[15px] text-slate-900">
            Vehicle & Payout Settings
          </h3>

          <form onSubmit={handleSave} className="space-y-3.5">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] font-medium text-slate-900 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-primary"
                >
                  <option value="Bike">Motorcycle</option>
                  <option value="Scooter">Scooter / Scooty</option>
                  <option value="EV">Electric 2W</option>
                  <option value="Cycle">Bicycle</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-800 focus:outline-none focus:border-primary font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                UPI ID for Daily Payouts
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. yourname@oksbi"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono text-slate-900 focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 rounded-xl btn-primary-gradient text-white font-bold text-[13px] shadow-sm shadow-primary/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </div>
      </main>

      <DeliveryBottomNav />
    </div>
  );
}
