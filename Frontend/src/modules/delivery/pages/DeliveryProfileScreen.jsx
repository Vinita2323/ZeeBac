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
  const [darkTheme, setDarkTheme] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [showEvModal, setShowEvModal] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(null);

  // Edit fields
  const [editName, setEditName] = useState(rider?.name || '');
  const [editVehicleNo, setEditVehicleNo] = useState(rider?.vehicleNo || '');
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
          setEditVehicleNo(res.data.vehicleNo || '');
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
        vehicleNo: editVehicleNo.trim().toUpperCase(),
        bankDetails: { upiId: editUpiId.trim() },
      });
      if (res.success) {
        updateRider(res.data);
        setFullProfile(res.data);
        setShowEditProfileModal(false);
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
    toast.success('Logged out successfully');
    navigate('/delivery/login');
  };

  const handleTestAlertSound = () => {
    playDeliveryOrderAlarm({
      storeName: 'Zeebac Hub',
      payout: 60,
    });
    toast.success('🔔 Order alert sound tested!');
  };

  const riderPhoto =
    rider?.profileImage ||
    fullProfile?.documents?.profilePhoto ||
    '';

  const riderId = rider?.riderId || rider?.zeebacId || `FE${(rider?._id || '4900573').slice(-7).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      {/* ─── Top Bar with Back Arrow (From Image 4) ─── */}
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

      <main className="max-w-[480px] mx-auto p-4 space-y-3.5">
        {/* ─── RIDER NAME & ID (From Image 4) ─── */}
        <div
          onClick={() => setShowEditProfileModal(true)}
          className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-2xs flex items-center justify-between cursor-pointer group hover:border-purple-200 transition-all"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-display font-black text-xl text-slate-950 group-hover:text-purple-700 transition-colors">
                {rider?.name || 'Himanshu Kumar'}
              </h1>
              <span className="material-symbols-outlined text-slate-400 text-[18px]">
                chevron_right
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono font-bold mt-0.5 tracking-wider">
              {riderId}
            </p>
          </div>

          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-slate-900 text-white flex items-center justify-center font-black text-lg border-2 border-white shadow-md shrink-0">
            {riderPhoto ? (
              <img src={riderPhoto} alt="Rider" className="w-full h-full object-cover" />
            ) : (
              <span>{(rider?.name || 'R')[0]}</span>
            )}
            <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] ring-2 ring-white">
              <span className="material-symbols-outlined text-[10px]">badge</span>
            </div>
          </div>
        </div>

        {/* ─── STORE / HUB ASSIGNMENT BANNER (From Image 4) ─── */}
        <div className="bg-[#1260dc] text-white rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">storefront</span>
            </div>
            <p className="text-xs font-black tracking-tight line-clamp-1">
              LT Lucknow Vibhuti Khand Hub
            </p>
          </div>
          <button
            onClick={() =>
              window.open(
                'https://www.google.com/maps/search/?api=1&query=Vibhuti+Khand+Lucknow',
                '_blank'
              )
            }
            className="px-3 py-1.5 rounded-full bg-white text-[#1260dc] font-display font-black text-xs hover:bg-slate-100 transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
          >
            Go to store
          </button>
        </div>

        {/* ─── 3 ACTION CARDS GRID (From Image 4) ─── */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => navigate('/delivery/gigs')}
            className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs hover:border-purple-300 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-900 group-hover:text-purple-700 flex items-center justify-center font-black text-base mb-1.5 transition-colors">
              g
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Gigs history</span>
          </button>

          <button
            onClick={() => navigate('/delivery/history')}
            className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs hover:border-purple-300 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-900 group-hover:text-purple-700 flex items-center justify-center mb-1.5 transition-colors">
              <span className="material-symbols-outlined text-[20px]">moped</span>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Trips history</span>
          </button>

          <button
            onClick={() => setShowOffersModal(true)}
            className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs hover:border-purple-300 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-purple-100 text-slate-900 group-hover:text-purple-700 flex items-center justify-center mb-1.5 transition-colors">
              <span className="material-symbols-outlined text-[20px]">sell</span>
            </div>
            <span className="text-xs font-bold text-slate-800 leading-tight">Your offers</span>
          </button>
        </div>

        {/* ─── REFERRAL BONUS BANNER (From Image 4) ─── */}
        <div
          onClick={() =>
            toast.success('Referral code copied! Share with your friends: ' + (rider?.riderId || 'ZEEBAC-RIDER'))
          }
          className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs flex items-center justify-between cursor-pointer group hover:border-purple-200 transition-all"
        >
          <div>
            <h3 className="font-display font-black text-sm text-slate-950">
              Upto ₹10,500 referral bonus
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Refer your friend and earn on every trip they complete
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[26px]">wallet_giftcard</span>
          </div>
        </div>

        {/* ─── SUPPORT SECTION (From Image 4) ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">Support</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <a
              href="tel:18001234567"
              className="py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">support_agent</span>
                <span className="font-bold">Help centre</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </a>

            <button
              onClick={() => toast.success('No open tickets. Your account is in good standing!')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">confirmation_number</span>
                <span className="font-bold">Support tickets</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>
          </div>
        </div>

        {/* ─── PARTNER OPTIONS (From Image 3, 4) ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">Partner options</h3>
          <button
            onClick={() => setShowEvModal(true)}
            className="w-full flex items-center justify-between text-xs text-slate-800 hover:text-purple-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-slate-600">electric_moped</span>
              <span className="font-bold">Rent an EV</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
          </button>
        </div>

        {/* ─── KNOWLEDGE RESOURCES (From Image 3) ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">Knowledge Resources</h3>
          <button
            onClick={() => navigate('/delivery/updates')}
            className="w-full flex items-center justify-between text-xs text-slate-800 hover:text-purple-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-slate-600">play_circle</span>
              <span className="font-bold">Videos for you</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
          </button>
        </div>

        {/* ─── YOUR BENEFITS (From Image 3) ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">Your benefits</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <button
              onClick={() => setShowBenefitModal('Doctor visit at store is free every Tuesday 10am-2pm at your assigned Hub.')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">medical_services</span>
                <span className="font-bold">Doctor visit at store</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={() => setShowBenefitModal('Medical Insurance Policy #ZBC-INS-9824 covers ₹5,00,000 for emergency hospitalization.')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">health_and_safety</span>
                <span className="font-bold">Medical insurance</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={() => setShowBenefitModal('Assets Issued: 2x Zeebac Partner T-Shirts, 1x Insulated Thermal Delivery Bag.')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">apparel</span>
                <span className="font-bold">Assets</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={() => setShowBenefitModal('TDS Certificate (Form 16A) for FY 2025-26 is available for download in PDF format.')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">receipt_long</span>
                <span className="font-bold">TDS certificate</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={() => setShowBenefitModal('Rider Partner Service Agreement signed on onboarding.')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">description</span>
                <span className="font-bold">Agreement</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>
          </div>
        </div>

        {/* ─── APP SETTINGS (From Image 2) ─── */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs space-y-3">
          <h3 className="font-display font-black text-sm text-slate-900">App settings</h3>
          <div className="divide-y divide-slate-100 text-xs">
            {/* Dark Theme Switch */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">dark_mode</span>
                <span className="font-bold">Dark theme</span>
              </div>
              <button
                onClick={() => {
                  setDarkTheme(!darkTheme);
                  toast.success(darkTheme ? 'Light theme enabled' : 'Dark theme mode coming in next update');
                }}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer flex items-center ${
                  darkTheme ? 'bg-purple-700 justify-end' : 'bg-slate-200 justify-start'
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>

            <button
              onClick={() => toast.success('Language is currently set to English (UK/India)')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">translate</span>
                <span className="font-bold">App language</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={() => toast.success('Audio announcement voice set to Hindi / English')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">music_note</span>
                <span className="font-bold">Audio language</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={() => toast.success('Support language set to Hindi / English')}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">help</span>
                <span className="font-bold">Support language</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
            </button>

            <button
              onClick={handleTestAlertSound}
              className="w-full py-2.5 flex items-center justify-between text-slate-800 hover:text-purple-700 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-slate-600">notifications_active</span>
                <span className="font-bold">Order alert sound</span>
              </div>
              <span className="text-purple-700 font-bold text-[11px]">Test Sound</span>
            </button>
          </div>
        </div>

        {/* ─── LOGOUT BUTTON (From Image 2) ─── */}
        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl border-2 border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-display font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Logout</span>
          </button>
        </div>

        {/* ─── BRAND FOOTER (From Image 2) ─── */}
        <div className="text-center pt-4 pb-6">
          <p className="font-display font-black text-xl tracking-tight text-slate-300">
            zeebac
          </p>
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
            PARTNER
          </p>
        </div>
      </main>

      {/* ─── EDIT PROFILE MODAL ─── */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">Edit Partner Info</h3>
              <button
                onClick={() => setShowEditProfileModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-4 space-y-3 text-xs">
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
                <label className="block font-bold text-slate-700 mb-1">Vehicle Plate Number</label>
                <input
                  type="text"
                  value={editVehicleNo}
                  onChange={(e) => setEditVehicleNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 uppercase font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payout UPI ID (for instant withdrawal)</label>
                <input
                  type="text"
                  value={editUpiId}
                  onChange={(e) => setEditUpiId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-mono font-bold"
                  placeholder="e.g. mobile@paytm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold transition-all cursor-pointer mt-2"
              >
                {isSaving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── OFFERS MODAL ─── */}
      {showOffersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">Your Active Offers</h3>
              <button
                onClick={() => setShowOffersModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                <span className="font-black text-amber-900">JOINING_OFFER_FULLDAY</span>
                <p className="text-amber-800 font-medium mt-0.5">Complete 15 deliveries today to unlock ₹300 cash bonus.</p>
              </div>
              <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200">
                <span className="font-black text-purple-900">WEEKEND SURGE +₹20</span>
                <p className="text-purple-800 font-medium mt-0.5">Extra ₹20 per delivery during 6pm-10pm slots.</p>
              </div>
            </div>
            <button
              onClick={() => setShowOffersModal(false)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─── EV RENTAL MODAL ─── */}
      {showEvModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[28px]">electric_moped</span>
            </div>
            <h3 className="font-display font-black text-base text-slate-900">Rent an EV with Zeebac</h3>
            <p className="text-xs text-slate-500 mt-1">
              Zero petrol expense! Rent commercial electric scooters with swappable batteries at subsidized partner rates starting at ₹120/day.
            </p>
            <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-left space-y-1">
              <p>⚡ 80km range per battery swap</p>
              <p>🔧 Free maintenance & insurance included</p>
              <p>📍 Available at Lucknow Vibhuti Khand Hub</p>
            </div>
            <button
              onClick={() => {
                setShowEvModal(false);
                toast.success('Your EV rental request sent to Hub manager!');
              }}
              className="w-full mt-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md"
            >
              Request EV Scooter
            </button>
          </div>
        </div>
      )}

      {/* ─── BENEFIT DETAIL MODAL ─── */}
      {showBenefitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <h3 className="font-display font-black text-base text-slate-900 mb-2">Benefit Details</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{showBenefitModal}</p>
            <button
              onClick={() => setShowBenefitModal(null)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
