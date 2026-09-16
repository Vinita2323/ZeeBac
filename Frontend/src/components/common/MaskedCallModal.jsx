import { createPortal } from 'react-dom';
import { useCall } from '../../context/CallContext';

export default function MaskedCallModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  recipientName: propName,
  recipientAvatar: propAvatar,
  recipientRole: propRole = 'Partner',
}) {
  const {
    callStatus,
    activePartner,
    callDuration,
    isMuted,
    isSpeakerOn,
    toggleMute,
    toggleSpeaker,
    endCall,
  } = useCall();

  // Active if global callStatus is not idle OR if explicitly forced open by prop
  const isCallActive = callStatus !== 'idle';
  const showModal = isCallActive || propIsOpen;

  if (!showModal) return null;

  const displayName = activePartner?.name || propName || 'Zeebac Partner';
  const displayAvatar = activePartner?.avatar || propAvatar;
  const displayRole = activePartner?.roleLabel || propRole || 'Partner';

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnd = () => {
    endCall();
    if (propOnClose) propOnClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-slate-950/92 backdrop-blur-xl flex flex-col justify-between p-6 text-white animate-reveal">
      {/* Top Header */}
      <div className="flex flex-col items-center pt-8 space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold tracking-wide border border-white/15 backdrop-blur-md">
          <span className="material-symbols-outlined text-[14px] text-emerald-400">lock</span>
          <span>Encrypted Masked Call</span>
        </div>
        <p className="text-xs text-slate-400 font-medium">Your phone number is 100% hidden & private</p>
      </div>

      {/* Center Avatar & Info */}
      <div className="flex flex-col items-center justify-center my-auto space-y-5">
        {/* Avatar Ring Animation */}
        <div className="relative">
          {(callStatus === 'ringing' || callStatus === 'calling') && (
            <>
              <div className="absolute inset-0 rounded-full bg-purple-600/30 animate-ping"></div>
              <div className="absolute -inset-4 rounded-full bg-purple-500/20 animate-pulse"></div>
            </>
          )}

          <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-purple-500/40 shadow-2xl bg-purple-950 flex items-center justify-center text-4xl font-extrabold uppercase text-purple-200">
            {displayAvatar ? (
              <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName?.charAt(0) || 'Z'
            )}
          </div>
        </div>

        {/* Recipient Details */}
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black tracking-tight">{displayName}</h2>
          <p className="text-sm font-semibold text-purple-300">{displayRole}</p>

          <div className="pt-2">
            {callStatus === 'calling' && (
              <span className="text-sm font-bold text-slate-400 animate-pulse">Connecting secure line...</span>
            )}
            {callStatus === 'ringing' && (
              <span className="text-sm font-bold text-purple-400 animate-pulse">Ringing...</span>
            )}
            {callStatus === 'connected' && (
              <span className="text-base font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                {formatDuration(callDuration)}
              </span>
            )}
            {callStatus === 'declined' && (
              <span className="text-sm font-bold text-rose-400">Call Declined</span>
            )}
            {callStatus === 'unavailable' && (
              <span className="text-sm font-bold text-amber-400">User is Offline</span>
            )}
            {callStatus === 'ended' && (
              <span className="text-sm font-bold text-rose-400">Call Ended</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="pb-8 max-w-sm mx-auto w-full space-y-6">
        <div className="flex justify-around items-center px-4">
          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all active:scale-90 cursor-pointer ${
              isMuted ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/40' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <span className="material-symbols-outlined text-2xl">
              {isMuted ? 'mic_off' : 'mic'}
            </span>
          </button>

          {/* Speaker Button */}
          <button
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all active:scale-90 cursor-pointer ${
              isSpeakerOn ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
          >
            <span className="material-symbols-outlined text-2xl">
              {isSpeakerOn ? 'volume_up' : 'volume_off'}
            </span>
          </button>
        </div>

        {/* End Call Button */}
        <div className="flex justify-center">
          <button
            onClick={handleEnd}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-90 transition-all flex items-center justify-center shadow-lg shadow-rose-600/50 cursor-pointer"
            title="End Call"
          >
            <span className="material-symbols-outlined text-3xl">call_end</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
