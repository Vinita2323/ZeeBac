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
  const [vehicleModel, setVehicleModel] = useState(rider?.vehicleModel || '');
  const [upiId, setUpiId] = useState(rider?.bankDetails?.upiId || '');
  const [fullProfile, setFullProfile] = useState(null);
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
          setName(res.data.name || '');
          setVehicleType(res.data.vehicleType || 'Bike');
          setVehicleNo(res.data.vehicleNo || '');
          setVehicleModel(res.data.vehicleModel || '');
          setUpiId(res.data.bankDetails?.upiId || '');
        }
      })
      .catch(console.error);
  }, [token, navigate, updateRider]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await DeliveryAPI.updateProfile({
        name: name.trim(),
        vehicleType,
        vehicleNo: vehicleNo.trim().toUpperCase(),
        vehicleModel: vehicleModel.trim(),
        bankDetails: { upiId: upiId.trim() },
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

  const docs = fullProfile?.documents || rider?.documents;

  return (
    <div className="mesh-gradient min-h-screen flex flex-col font-body-lg pb-24 text-on-surface">
      {/* Top Header */}
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

      {/* Main Container */}
      <main className="flex-1 max-w-[480px] w-full mx-auto p-4 space-y-4 text-left">
        {/* Rider Badge Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-800 text-white flex items-center justify-center font-black shadow-md shadow-primary/20 shrink-0">
            {fullProfile?.documents?.profilePhoto ? (
              <img
                src={fullProfile.documents.profilePhoto}
                alt="Rider"
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <span className="material-symbols-outlined text-[34px]">sports_motorsports</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-black text-[18px] text-slate-900 leading-tight truncate">
              {rider?.name || 'Rider Partner'}
            </h2>
            <p className="text-[12px] text-slate-500 font-mono mt-0.5">
              ID: {rider?.riderId || 'ZBC-RIDER'} • +91 {rider?.phone}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              <span>{rider?.applicationStatus === 'APPROVED' ? 'Approved Partner' : 'Verification In Progress'}</span>
            </div>
          </div>
        </div>

        {/* KYC Document Badges */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Document Verification Status
          </h3>

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-700 font-medium">Aadhaar Card</span>
              <span className={`text-[11px] font-bold flex items-center gap-0.5 ${docs?.aadhaarNo ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className="material-symbols-outlined text-[13px]">
                  {docs?.aadhaarNo ? 'check_circle' : 'pending'}
                </span>
                <span>{docs?.aadhaarNo ? 'Verified' : 'Pending'}</span>
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-700 font-medium">Driving Licence</span>
              <span className={`text-[11px] font-bold flex items-center gap-0.5 ${docs?.drivingLicenceNo ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className="material-symbols-outlined text-[13px]">
                  {docs?.drivingLicenceNo ? 'check_circle' : 'pending'}
                </span>
                <span>{docs?.drivingLicenceNo ? 'Verified' : 'Pending'}</span>
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-700 font-medium">Vehicle RC</span>
              <span className={`text-[11px] font-bold flex items-center gap-0.5 ${docs?.vehicleRcDoc ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className="material-symbols-outlined text-[13px]">
                  {docs?.vehicleRcDoc ? 'check_circle' : 'remove'}
                </span>
                <span>{docs?.vehicleRcDoc ? 'Uploaded' : 'None'}</span>
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-700 font-medium">Insurance</span>
              <span className={`text-[11px] font-bold flex items-center gap-0.5 ${docs?.insuranceDoc ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className="material-symbols-outlined text-[13px]">
                  {docs?.insuranceDoc ? 'check_circle' : 'remove'}
                </span>
                <span>{docs?.insuranceDoc ? 'Uploaded' : 'None'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Edit Profile Form */}
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Update Operational Details
          </h3>

          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Vehicle Type
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-800"
              >
                <option value="Bike">Motorcycle</option>
                <option value="Scooter">Scooter</option>
                <option value="EV">Electric 2W</option>
                <option value="Cycle">Bicycle</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Vehicle Number
              </label>
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                placeholder="UP32 AB 1234"
                className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-bold uppercase text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Vehicle Model
            </label>
            <input
              type="text"
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              placeholder="e.g. Hero Splendor Plus"
              className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-medium text-slate-900"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Payout UPI ID
            </label>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="username@upi"
              className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-bold text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                <span>Save Profile Changes</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Links */}
        <div className="bg-white rounded-3xl p-2 border border-slate-100 shadow-sm space-y-1">
          <button
            onClick={() => navigate('/delivery/earnings')}
            className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center justify-between text-left cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
              <span className="text-[13px] font-bold text-slate-800">Earnings & Payout Ledger</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
          </button>

          <button
            onClick={() => navigate('/delivery/status')}
            className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center justify-between text-left cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-[20px]">fact_check</span>
              <span className="text-[13px] font-bold text-slate-800">View Application Status</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
          </button>
        </div>
      </main>

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
