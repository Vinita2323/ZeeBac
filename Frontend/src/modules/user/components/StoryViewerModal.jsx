import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { StoryAPI, ChatAPI } from '../../../services/api';

const STORY_DURATION = 5000; // 5 seconds per story

export default function StoryViewerModal({
  isOpen,
  groups = [],
  initialGroupIndex = 0,
  onClose,
  onStoryViewed,
}) {
  const navigate = useNavigate();
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 100%
  const [isPaused, setIsPaused] = useState(false);
  const [isFit, setIsFit] = useState(true); // Toggle: default to contain (fit full image without cutting) & cover (full immersion)

  const startTimeRef = useRef(null);
  const elapsedBeforePauseRef = useRef(0);

  // Prevent background scrolling while story modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Sync initialGroupIndex when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentGroupIndex(initialGroupIndex);
      setCurrentStoryIndex(0);
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
    }
  }, [isOpen, initialGroupIndex]);

  const currentGroup = groups[currentGroupIndex] || null;
  const currentStories = currentGroup?.stories || [];
  const currentStory = currentStories[currentStoryIndex] || null;
  const vendor = currentGroup?.vendor || null;

  // Record story view
  useEffect(() => {
    if (isOpen && currentStory?._id) {
      StoryAPI.recordStoryView(currentStory._id).catch(() => {});
      if (onStoryViewed) {
        onStoryViewed(currentStory._id, currentGroup?.vendor?._id);
      }
    }
  }, [isOpen, currentStory?._id]);

  // Story progress timer
  const advanceStory = useCallback(() => {
    if (currentStoryIndex < currentStories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
    } else if (currentGroupIndex < groups.length - 1) {
      setCurrentGroupIndex((prev) => prev + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
    } else {
      onClose();
    }
  }, [currentStoryIndex, currentStories.length, currentGroupIndex, groups.length, onClose]);

  const prevStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
    } else if (currentGroupIndex > 0) {
      const prevGroup = groups[currentGroupIndex - 1];
      setCurrentGroupIndex((prev) => prev - 1);
      setCurrentStoryIndex(Math.max(0, (prevGroup?.stories?.length || 1) - 1));
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
    }
  }, [currentStoryIndex, currentGroupIndex, groups]);

  useEffect(() => {
    if (!isOpen || !currentStory || isPaused) return;

    startTimeRef.current = Date.now() - elapsedBeforePauseRef.current;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / STORY_DURATION) * 100);
      setProgress(pct);

      if (elapsed >= STORY_DURATION) {
        clearInterval(interval);
        advanceStory();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isOpen, currentStoryIndex, currentGroupIndex, isPaused, advanceStory, currentStory]);

  const handlePause = () => {
    setIsPaused(true);
    if (startTimeRef.current) {
      elapsedBeforePauseRef.current = Date.now() - startTimeRef.current;
    }
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') advanceStory();
      if (e.key === 'ArrowLeft') prevStory();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, advanceStory, prevStory, onClose]);

  if (!isOpen || !currentGroup || !currentStory) return null;

  const timeAgo = (dateString) => {
    if (!dateString) return 'Just now';
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60));
    if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const avatar = vendor?.profilePic || vendor?.storeLogo;
  const vendorAvatar = avatar
    ? (avatar.startsWith('http') || avatar.startsWith('data:')
        ? avatar
        : `${import.meta.env.VITE_API_URL}${avatar}`)
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] w-screen h-screen bg-black/95 sm:bg-black/90 sm:backdrop-blur-xl flex items-center justify-center p-0 select-none overflow-hidden animate-fadeIn">
      
      {/* Click outside to close (desktop) */}
      <div className="absolute inset-0 w-full h-full" onClick={onClose} />

      {/* Main Story Container (Full bleed on mobile, sleek phone frame on desktop) */}
      <div 
        className="relative z-10 w-full h-full h-[100dvh] sm:h-[92vh] sm:max-h-[840px] sm:max-w-[420px] bg-slate-950 sm:rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden border-0 sm:border sm:border-white/15"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handlePause}
        onMouseUp={handleResume}
        onTouchStart={handlePause}
        onTouchEnd={handleResume}
      >
        {/* ================= FULL-BLEED STORY PHOTO / VIDEO & AMBIENT BACKDROP ================= */}
        <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center">
          {/* Ambient blurred backdrop for seamless color glow */}
          {currentStory.mediaType === 'video' || currentStory.mediaUrl?.match(/\.(mp4|webm|mov)(\?.*)?$/i) ? (
            <video
              src={currentStory.mediaUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-70 brightness-75 select-none pointer-events-none"
            />
          ) : (
            <img
              src={currentStory.mediaUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-70 brightness-75 select-none pointer-events-none"
            />
          )}

          {/* Main Story Image or Video */}
          {currentStory.mediaType === 'video' || currentStory.mediaUrl?.match(/\.(mp4|webm|mov)(\?.*)?$/i) ? (
            <video
              src={currentStory.mediaUrl}
              autoPlay
              muted
              loop
              playsInline
              className={`relative z-10 w-full h-full select-none transition-all duration-300 pointer-events-none ${
                isFit ? 'object-contain' : 'object-cover'
              }`}
            />
          ) : (
            <img
              src={currentStory.mediaUrl}
              alt={vendor?.storeName || 'Story Image'}
              className={`relative z-10 w-full h-full select-none transition-all duration-300 pointer-events-none ${
                isFit ? 'object-contain' : 'object-cover'
              }`}
            />
          )}

          {/* Cinematic Vignettes so top header and bottom controls remain 100% legible */}
          <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/85 via-transparent to-black/90 pointer-events-none" />
        </div>

        {/* Tap zones for story navigation */}
        <div 
          onClick={prevStory}
          className="absolute inset-y-0 left-0 w-[35%] z-20 cursor-pointer"
          title="Previous Story"
        />
        <div 
          onClick={advanceStory}
          className="absolute inset-y-0 right-0 w-[65%] z-20 cursor-pointer"
          title="Next Story"
        />

        {/* ================= 1. TOP HEADER (Profile img & Name UPAR) ================= */}
        <div className="relative z-30 pt-3 px-3.5 pb-2 space-y-2.5 pointer-events-auto">
          {/* Top Segmented Progress Bar */}
          <div className="flex gap-1.5 pointer-events-none">
            {currentStories.map((s, idx) => {
              let widthPct = 0;
              if (idx < currentStoryIndex) widthPct = 100;
              else if (idx === currentStoryIndex) widthPct = progress;

              return (
                <div
                  key={s._id || idx}
                  className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-xs"
                >
                  <div
                    className="h-full bg-white transition-all duration-75"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Header Row: Profile Avatar, Store Name, Time, Close */}
          <div className="flex items-center justify-between pointer-events-auto">
            <div 
              onClick={() => {
                onClose();
                navigate('/vendor-detail', { state: { vendor } });
              }}
              className="flex items-center gap-2.5 cursor-pointer group text-left min-w-0"
              title="View Store"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px] shadow-sm flex-shrink-0">
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden uppercase font-bold text-primary text-xs">
                  {vendorAvatar ? (
                    <img src={vendorAvatar} alt={vendor?.storeName} className="w-full h-full object-cover" />
                  ) : (
                    vendor?.storeName?.charAt(0) || 'V'
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-black text-[14.5px] group-hover:text-amber-300 transition-colors truncate max-w-[190px] sm:max-w-[220px] drop-shadow-md leading-tight">
                    {vendor?.storeName || 'Partner Store'}
                  </p>
                  <span className="material-symbols-outlined text-[16px] text-sky-400 flex-shrink-0" title="Verified Store">
                    verified
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-white/80 font-medium truncate drop-shadow-sm">
                  <span>{vendor?.category || 'Store'}</span>
                  <span>•</span>
                  <span>{timeAgo(currentStory.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Aspect Ratio Toggle (Fit / Fill) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFit(!isFit);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md ${
                  isFit ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-black/40 hover:bg-black/60 text-white/90 border border-white/20'
                }`}
                title={isFit ? 'Switch to Full Screen Fill' : 'Switch to Fit Image'}
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isFit ? 'fullscreen' : 'fit_screen'}
                </span>
              </button>

              {isPaused && (
                <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-md border border-white/20 animate-pulse">
                  Paused
                </span>
              )}
              
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/20 backdrop-blur-md"
                title="Close"
              >
                <span className="material-symbols-outlined text-[19px]">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= 2. DESKTOP NAVIGATION CHEVRONS ================= */}
        <div 
          onClick={prevStory}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/80 hidden sm:flex items-center justify-center transition-all opacity-0 hover:opacity-100 cursor-pointer z-30 border border-white/20 backdrop-blur-sm"
          title="Previous"
        >
          <span className="material-symbols-outlined text-[22px]">chevron_left</span>
        </div>
        <div 
          onClick={advanceStory}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/80 hidden sm:flex items-center justify-center transition-all opacity-0 hover:opacity-100 cursor-pointer z-30 border border-white/20 backdrop-blur-sm"
          title="Next"
        >
          <span className="material-symbols-outlined text-[22px]">chevron_right</span>
        </div>

        {/* ================= 3. BOTTOM SECTION (USKE NEECHE DESCRIPTION PROPER) ================= */}
        <div className="relative z-30 px-4 pt-4 pb-6 sm:pb-5 space-y-2.5 text-left pointer-events-auto">
          {/* Offer Tag Badge (if present) */}
          {currentStory.offerTag && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 text-slate-950 font-black text-[11px] shadow-lg">
              <span className="material-symbols-outlined text-[14px]">local_fire_department</span>
              <span>{currentStory.offerTag}</span>
            </div>
          )}

          {/* Story Caption / Description */}
          {currentStory.caption && (
            <div className="bg-black/45 backdrop-blur-md p-3 rounded-2xl border border-white/15 shadow-sm">
              <p className="text-white text-[13px] font-medium leading-relaxed max-h-20 overflow-y-auto no-scrollbar drop-shadow-sm">
                {currentStory.caption}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => {
                onClose();
                navigate('/vendor-detail', { state: { vendor } });
              }}
              className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-[#16082f] via-[#3b0764] to-[#6000da] hover:opacity-95 text-white text-[13px] font-extrabold transition-all flex items-center justify-center gap-2 shadow-xl shadow-[#6000da]/30 active:scale-95 cursor-pointer border border-white/10"
            >
              <span className="material-symbols-outlined text-[19px]">storefront</span>
              <span>View Store & Offers</span>
              {vendor?.cashbackRate && (
                <span className="bg-white/20 text-white text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider ml-0.5">
                  FLAT {vendor.cashbackRate}%
                </span>
              )}
            </button>

            <button
              onClick={async () => {
                onClose();
                // Resolve/create the real conversation first — ChatScreen
                // expects a conversation id in `selectedChat`, not a raw
                // vendor object, or it just falls back to the chat list.
                try {
                  const res = await ChatAPI.getOrCreateConversation({ vendorId: vendor._id });
                  navigate('/chat', { state: { selectedChat: res?.data?._id || null, vendorData: vendor } });
                } catch (err) {
                  console.error('Failed to create or get conversation', err);
                  navigate('/chat', { state: { selectedChat: null, vendorData: vendor } });
                }
              }}
              className="w-12 h-12 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur-md text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0 border border-white/20 shadow-md"
              title="Message Store"
            >
              <span className="material-symbols-outlined text-[20px]">chat</span>
            </button>
          </div>
        </div>

      </div>

    </div>,
    document.body
  );
}
