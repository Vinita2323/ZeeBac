import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import { toast } from 'react-hot-toast';
import { playDeliveryOrderAlarm } from '../../../utils/voiceUtils';

export default function DeliveryProfileScreen() {
  const navigate = useNavigate();
  const rider = useDeliveryStore((state) => state.rider);
  const token = useDeliveryStore((state) => state.token);
  const logout = useDeliveryStore((state) => state.logout);
  const updateRider = useDeliveryStore((state) => state.updateRider);

  const [fullProfile, setFullProfile] = useState(null);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState(rider?.name || '');
  const [editVehicleType, setEditVehicleType] = useState(rider?.vehicleType || 'Bike');
  const [editVehicleNo, setEditVehicleNo] = useState(rider?.vehicleNo || '');
  const [editVehicleModel, setEditVehicleModel] = useState(rider?.vehicleModel || '');
  const [editUpiId, setEditUpiId] = useState(rider?.bankDetails?.upiId || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/delivery/login');
      return;
    }
    DeliveryAPI.getProfile()
      .then((res) => {
        if (res.success && res.data) {
          setFullProfile(res.data);
          updateRider(res.data);
          setEditName(res.data.name || '');
          setEditVehicleType(res.data.vehicleType || 'Bike');
          setEditVehicleNo(res.data.vehicleNo || '');
          setEditVehicleModel(res.data.vehicleModel || '');
          setEditUpiId(res.data.bankDetails?.upiId || '');
        }
      })
      .catch(console.error);
  }, [token, navigate, updateRider]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await DeliveryAPI.updateProfile({
        name: editName.trim(),
        vehicleType: editVehicleType,
        vehicleNo: editVehicleNo.trim().toUpperCase(),
        vehicleModel: editVehicleModel.trim(),
        bankDetails: { upiId: editUpiId.trim() },
      });
      if (res.success) {
        updateRider(res.data);
        setFullProfile(res.data);
        setShowEditProfileModal(false);
        toast.success('Profile & Vehicle details updated!');
      }
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/delivery/login');
  };

  const handleTestAlertSound = () => {
    playDeliveryOrderAlarm({
      storeName: 'Zeebac Partner Store',
      payout: 60,
    });
    toast.success('🔔 Order alert sound tested!');
  };

  const riderPhoto =
    rider?.profileImage ||
    fullProfile?.documents?.profilePhoto ||
    '';

  const riderId = rider?.riderId || rider?.zeebacId || `ZBD-${(rider?._id || '1001').slice(-6).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      {/* ─── Top Bar with Back Arrow ─── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center justify-between shadow-2xs">
        <button
          onClick={() => navigate('/delivery/dashboard')}
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-800 transition-all active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>
        <h2 className="font-display font-black text-sm text-slate-900">Partner Profile</h2>
        <div className="w-9" />
      </header>

      <main className="max-w-[480px] mx-auto p-4 space-y-3.5 text-left">
        {/* ─── 1. RIDER PROFILE CARD ─── */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {/* Avatar */}
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-slate-900 text-white flex items-center justify-center font-black text-lg border-2 border-slate-100 shadow-sm shrink-0">
              {riderPhoto ? (
                <img src={riderPhoto} alt="Rider" className="w-full h-full object-cover" />
              ) : (
                <span>{(rider?.name || 'R')[0]}</span>
              )}
              <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] ring-2 ring-white">
                <span className="material-symbols-outlined text-[10px]">check</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-display font-black text-base sm:text-lg text-slate-950">
                  {rider?.name || 'Rider Partner'}
                </h1>
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono font-bold mt-0.5">
                ID: {riderId}
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                +91 {rider?.phone || '9999999999'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowEditProfileModal(true)}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="Edit Profile"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
        </div>

        {/* ─── 2. QUICK ACTION GRID ─── */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => navigate('/delivery/history')}
            className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs hover:border-purple-300 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-900 group-hover:text-purple-700 flex items-center justify-center mb-1.5 transition-colors">
              <span className="material-symbols-outlined text-[20px]">moped</span>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Trips History</span>
          </button>

          <button
            onClick={() => navigate('/delivery/earnings')}
            className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs hover:border-purple-300 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-900 group-hover:text-purple-700 flex items-center justify-center mb-1.5 transition-colors">
              <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Pocket & Cash</span>
          </button>

          <button
            onClick={() => navigate('/delivery/gigs')}
            className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs hover:border-purple-300 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-900 group-hover:text-purple-700 flex items-center justify-center mb-1.5 transition-colors">
              <span className="material-symbols-outlined text-[20px]">event_available</span>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Shift Gigs</span>
          </button>
        </div>

        {/* ─── 3. VEHICLE & KYC DETAILS CARD ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-700 text-[18px]">two_wheeler</span>
              <span>Vehicle & KYC Details</span>
            </h3>
            <button
              onClick={() => setShowEditProfileModal(true)}
              className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
            >
              Update
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Vehicle Type</span>
              <span className="font-bold text-slate-900">{rider?.vehicleType || 'Bike'}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Plate Number</span>
              <span className="font-mono font-bold text-slate-900 uppercase">
                {rider?.vehicleNo || 'UP32 AB 1234'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Vehicle Model</span>
              <span className="font-bold text-slate-900">{rider?.vehicleModel || 'Standard'}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">KYC Verification</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">verified</span>
                <span>Docs Approved</span>
              </span>
            </div>
          </div>
        </div>

        {/* ─── 4. PAYOUT BANK & UPI DETAILS ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-700 text-[18px]">account_balance</span>
              <span>Payout & Bank Account</span>
            </h3>
            <button
              onClick={() => setShowEditProfileModal(true)}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Change
            </button>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Linked UPI ID</p>
              <p className="font-mono font-bold text-slate-900 mt-0.5">
                {rider?.bankDetails?.upiId || fullProfile?.bankDetails?.upiId || 'Not linked yet'}
              </p>
            </div>
            <button
              onClick={() => navigate('/delivery/earnings')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-[11px] cursor-pointer"
            >
              Pocket
            </button>
          </div>
        </div>

        {/* ─── 5. APP SETTINGS & SOUND ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">App Settings</h3>
          <div className="divide-y divide-slate-100 text-xs">
            {/* Test Sound */}
            <button
              onClick={handleTestAlertSound}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-purple-600">notifications_active</span>
                <span className="font-bold">Order alert chime sound</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-[11px]">
                Test Sound 🔊
              </span>
            </button>

            {/* Language */}
            <div className="py-2.5 flex items-center justify-between text-slate-800">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">translate</span>
                <span className="font-bold">App Language</span>
              </div>
              <span className="text-slate-500 font-medium">English (India)</span>
            </div>

            {/* Terms / Agreement */}
            <button
              onClick={() => setShowAgreementModal(true)}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">description</span>
                <span className="font-bold">Partner Service Agreement</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>
          </div>
        </div>

        {/* ─── 6. HELPLINE & SUPPORT ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">Support & Emergency</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <a
              href="tel:18001234567"
              className="py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-purple-600">support_agent</span>
                <div>
                  <p className="font-bold">Zeebac Rider Helpline</p>
                  <p className="text-[10px] text-slate-400 font-medium">Call 1800-123-4567</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-purple-700">call</span>
            </a>

            <a
              href="tel:112"
              className="py-2.5 flex items-center justify-between text-slate-800 hover:text-red-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-red-600">crisis_alert</span>
                <div>
                  <p className="font-bold">Police Emergency SOS</p>
                  <p className="text-[10px] text-slate-400 font-medium">Dial 112</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-red-600">call</span>
            </a>
          </div>
        </div>

        {/* ─── 7. LOGOUT BUTTON ─── */}
        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl border-2 border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-display font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Logout Partner Account</span>
          </button>
        </div>

        {/* ─── 8. BRAND FOOTER ─── */}
        <div className="text-center pt-3 pb-6">
          <p className="font-display font-black text-lg tracking-tight text-slate-300">
            zeebac
          </p>
          <p className="text-[9.5px] font-bold tracking-widest uppercase text-slate-400">
            PARTNER APP • V1.0.4
          </p>
        </div>
      </main>

      {/* ─── EDIT PROFILE MODAL ─── */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">Update Profile Details</h3>
              <button
                onClick={() => setShowEditProfileModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-4 space-y-3 text-xs text-left">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Rider Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Type</label>
                <select
                  value={editVehicleType}
                  onChange={(e) => setEditVehicleType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-bold bg-white"
                >
                  <option value="Bike">Motorcycle / Bike</option>
                  <option value="Scooter">Scooter / Activa</option>
                  <option value="EV">Electric Vehicle (EV)</option>
                  <option value="Cycle">Bicycle</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Plate Number</label>
                <input
                  type="text"
                  value={editVehicleNo}
                  onChange={(e) => setEditVehicleNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 uppercase font-mono font-bold"
                  placeholder="e.g. UP32 AB 1234"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Model</label>
                <input
                  type="text"
                  value={editVehicleModel}
                  onChange={(e) => setEditVehicleModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-bold"
                  placeholder="e.g. Hero Splendor / Honda Activa"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payout UPI ID (Instant Payouts)</label>
                <input
                  type="text"
                  value={editUpiId}
                  onChange={(e) => setEditUpiId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-mono font-bold"
                  placeholder="e.g. 9876543210@paytm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold transition-all cursor-pointer mt-2"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── AGREEMENT MODAL ─── */}
      {showAgreementModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 text-left">
            <h3 className="font-display font-black text-base text-slate-900 mb-2">Partner Service Agreement</h3>
            <div className="text-xs text-slate-600 space-y-2 max-h-60 overflow-y-auto pr-1">
              <p>1. As an authorized Zeebac delivery partner, you agree to safely transport order packages from merchant partner stores directly to customers.</p>
              <p>2. Mandatory bill upload and customer 4-digit OTP verification must be performed on every completed drop.</p>
              <p>3. Payouts are calculated based on base fare plus distance per km, deposited directly to your linked UPI/Bank account.</p>
            </div>
            <button
              onClick={() => setShowAgreementModal(false)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
