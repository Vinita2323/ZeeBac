import { createPortal } from 'react-dom';
import { useCall } from '../../context/CallContext';

export default function IncomingCallModal() {
  const { incomingCall, acceptCall, rejectCall } = useCall();

  if (!incomingCall) return null;

  const { callerInfo } = incomingCall;
  const callerName = callerInfo?.name || 'Zeebac Contact';
  const callerAvatar = callerInfo?.avatar;
  const callerRole = callerInfo?.role || 'Zeebac User';

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-slate-950/92 backdrop-blur-xl flex flex-col justify-between p-6 text-white animate-reveal">
      {/* Top Banner */}
      <div className="flex flex-col items-center pt-8 space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold tracking-wide backdrop-blur-md">
          <span className="material-symbols-outlined text-[15px] text-emerald-400">lock</span>
          <span>Encrypted In-App Call</span>
        </div>
        <p className="text-xs text-slate-400 font-medium">Your phone number is completely masked & private</p>
      </div>

      {/* Center Avatar & Info */}
      <div className="flex flex-col items-center justify-center my-auto space-y-6">
        {/* Pulsing Avatar */}
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-emerald-500/20 animate-ping"></div>
          <div className="absolute -inset-8 rounded-full bg-emerald-500/10 animate-pulse"></div>

          <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-emerald-500/50 shadow-2xl bg-slate-900 flex items-center justify-center text-4xl font-extrabold uppercase text-emerald-200">
            {callerAvatar ? (
              <img src={callerAvatar} alt={callerName} className="w-full h-full object-cover" />
            ) : (
              callerName?.charAt(0) || 'Z'
            )}
          </div>
        </div>

        {/* Caller Info */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black tracking-tight">{callerName}</h2>
          <p className="text-sm font-semibold text-emerald-400">{callerRole}</p>
          <div className="pt-2 flex items-center justify-center gap-2 text-slate-300 font-medium text-sm animate-pulse">
            <span className="material-symbols-outlined text-[18px] text-emerald-400">call</span>
            <span>Incoming voice call...</span>
          </div>
        </div>
      </div>

      {/* Actions: Decline / Accept */}
      <div className="pb-10 max-w-sm mx-auto w-full flex justify-around items-center px-6">
        {/* Decline Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => rejectCall('declined')}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-90 transition-all flex items-center justify-center shadow-lg shadow-rose-600/50 cursor-pointer"
            title="Decline"
          >
            <span className="material-symbols-outlined text-3xl">call_end</span>
          </button>
          <span className="text-xs font-semibold text-slate-400">Decline</span>
        </div>

        {/* Accept Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={acceptCall}
            className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-90 transition-all flex items-center justify-center shadow-lg shadow-emerald-500/50 cursor-pointer animate-bounce"
            title="Accept"
          >
            <span className="material-symbols-outlined text-3xl">call</span>
          </button>
          <span className="text-xs font-semibold text-emerald-400">Accept</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
