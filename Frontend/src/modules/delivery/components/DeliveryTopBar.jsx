import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useDeliveryStore from '../../../store/useDeliveryStore';
import { DeliveryAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

export default function DeliveryTopBar({ onToggleOnline, isTogglingOnline, activeOrder }) {
  const navigate = useNavigate();
  const rider = useDeliveryStore((state) => state.rider);
  const isOnline = useDeliveryStore((state) => state.isOnline);
  const setOnlineStatus = useDeliveryStore((state) => state.setOnlineStatus);

  const [showSosModal, setShowSosModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isTogglingLocal, setIsTogglingLocal] = useState(false);

  const handleToggle = async () => {
    if (onToggleOnline) {
      onToggleOnline();
      return;
    }

    if (isOnline && activeOrder) {
      toast.error('Active delivery chal rahi hai! Delivery complete hone ke baad hi offline ja sakte hain.');
      return;
    }

    setIsTogglingLocal(true);
    const nextStatus = !isOnline;
    try {
      const res = await DeliveryAPI.toggleAvailability({ isOnline: nextStatus });
      if (res.success) {
        setOnlineStatus(nextStatus);
        toast.success(nextStatus ? '🟢 You are now ONLINE & ready to receive orders!' : '⚪ You are now OFFLINE');
      }
    } catch (err) {
      toast.error('Failed to update status');
    } finally {
      setIsTogglingLocal(false);
    }
  };

  const isToggling = isTogglingOnline || isTogglingLocal;

  const riderPhoto =
    rider?.profileImage ||
    rider?.documents?.profilePhoto ||
    '';

  const riderInitials = (rider?.name || 'R')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-2.5 border-b border-slate-100 shadow-2xs">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          {/* Offline / Online Pill Switch */}
          <button
            onClick={handleToggle}
            disabled={isToggling}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 shadow-2xs active:scale-95 cursor-pointer border ${
              isOnline
                ? 'bg-emerald-500 border-emerald-600 text-white'
                : 'bg-slate-200/90 border-slate-300 text-slate-700'
            }`}
          >
            {/* Pill Toggle Knob */}
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-all duration-300 ${
                isOnline ? 'order-last' : 'order-first'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'
                }`}
              />
            </div>
            <span className="text-[12.5px] font-black tracking-tight">
              {isToggling ? 'Updating...' : isOnline ? 'Online' : 'Offline'}
            </span>
          </button>

          {/* Right Action Icons: SOS, Help, Profile Avatar */}
          <div className="flex items-center gap-2.5">
            {/* SOS Emergency Siren Button */}
            <button
              onClick={() => setShowSosModal(true)}
              className="w-9 h-9 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Emergency SOS"
            >
              <span className="material-symbols-outlined text-[20px]">
                crisis_alert
              </span>
            </button>

            {/* Help & Support Button */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Help & Support"
            >
              <span className="material-symbols-outlined text-[20px]">
                help
              </span>
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={() => navigate('/delivery/profile')}
              className="relative w-9 h-9 rounded-full overflow-hidden bg-slate-900 text-white flex items-center justify-center font-black text-xs border border-slate-300 shadow-2xs hover:scale-105 transition-all cursor-pointer"
              title="Rider Profile & Settings"
            >
              {riderPhoto ? (
                <img
                  src={riderPhoto}
                  alt={rider?.name || 'Rider'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{riderInitials}</span>
              )}
              {/* Online status badge */}
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-1 ring-white ${
                  isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ─── SOS EMERGENCY MODAL ─── */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-[32px]">crisis_alert</span>
              </div>
              <h3 className="font-display font-black text-lg text-slate-900">
                Emergency SOS & Rider Safety
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Aapki suraksha sabse pehle hai. Kisi bhi aapatkalin sthiti me niche diye gaye numbers par sampark karein.
              </p>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <a
                href="tel:112"
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">local_police</span>
                  <span>Police Control Room</span>
                </div>
                <span className="font-mono text-sm">112</span>
              </a>

              <a
                href="tel:102"
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">ambulance</span>
                  <span>Ambulance Service</span>
                </div>
                <span className="font-mono text-sm">102</span>
              </a>

              <a
                href="tel:18001234567"
                className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">support_agent</span>
                  <span>Zeebac Rider Helpline</span>
                </div>
                <span className="font-mono text-xs">1800-123-4567</span>
              </a>
            </div>

            <button
              onClick={() => setShowSosModal(false)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─── HELP MODAL ─── */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">help</span>
                </div>
                <h3 className="font-display font-black text-base text-slate-900">
                  Rider Help & Support
                </h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <button
                onClick={() => {
                  setShowHelpModal(false);
                  navigate('/delivery/updates');
                }}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-100 text-left flex items-center justify-between font-bold"
              >
                <span>Delivery Training & Safety Videos</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>

              <button
                onClick={() => {
                  setShowHelpModal(false);
                  navigate('/delivery/earnings');
                }}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-100 text-left flex items-center justify-between font-bold"
              >
                <span>Payout & Wallet Queries</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>

              <a
                href="tel:18001234567"
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-100 flex items-center justify-between font-bold"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-purple-600">call</span>
                  <span>Call Hub Incharge</span>
                </span>
                <span className="text-purple-700 font-mono text-[11px]">Direct Call</span>
              </a>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
