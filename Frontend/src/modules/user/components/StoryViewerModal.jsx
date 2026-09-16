import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StoryAPI } from '../../../services/api';

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

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const elapsedBeforePauseRef = useRef(0);

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
    if (!dateString) return '';
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60));
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const vendorAvatar = vendor?.profilePic
    ? (vendor.profilePic.startsWith('http') || vendor.profilePic.startsWith('data:')
        ? vendor.profilePic
        : `${import.meta.env.VITE_API_URL}${vendor.profilePic}`)
    : null;

  const handleTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    if (x < width * 0.35) {
      prevStory();
    } else {
      advanceStory();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center select-none animate-fadeIn">
      
      {/* Desktop Backdrop Blur Frame */}
      <div 
        className="relative w-full h-full max-w-[420px] max-h-[100vh] sm:max-h-[92vh] sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between"
        style={{ background: currentStory.backgroundColor || '#0f172a' }}
        onMouseDown={handlePause}
        onMouseUp={handleResume}
        onTouchStart={handlePause}
        onTouchEnd={handleResume}
      >
        {/* Story Background Media */}
        <div 
          className="absolute inset-0 w-full h-full cursor-pointer"
          onClick={handleTap}
        >
          <img
            src={currentStory.mediaUrl}
            alt="story"
            className="w-full h-full object-cover sm:object-contain"
          />
          {/* Subtle gradient vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60 pointer-events-none" />
        </div>

        {/* Top Segmented Progress Bar */}
        <div className="relative z-20 px-3 pt-3 flex gap-1.5 pointer-events-none">
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

        {/* Header: Store Avatar, Name, Time, Close */}
        <div className="relative z-20 px-3.5 pt-2 flex items-center justify-between pointer-events-auto">
          <div 
            onClick={() => {
              onClose();
              navigate(`/vendor/${vendor?._id}`);
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2px] shadow-sm">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden uppercase font-bold text-primary text-xs">
                {vendorAvatar ? (
                  <img src={vendorAvatar} alt={vendor?.storeName} className="w-full h-full object-cover" />
                ) : (
                  vendor?.storeName?.charAt(0) || 'V'
                )}
              </div>
            </div>
            <div className="text-left">
              <p className="text-white font-black text-xs group-hover:underline drop-shadow-md truncate max-w-[170px]">
                {vendor?.storeName || 'Partner Store'}
              </p>
              <span className="text-[10px] text-white/75 font-medium drop-shadow-sm">
                {timeAgo(currentStory.createdAt)} • 24h Story
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pause indicator pill when holding */}
            {isPaused && (
              <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold animate-pulse backdrop-blur-md">
                Paused
              </span>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/20"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Center / Sticky Offer Tag Sticker */}
        {currentStory.offerTag && (
          <div className="relative z-20 self-start px-4 mt-3 pointer-events-none">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 text-slate-900 font-black text-xs shadow-xl border border-white/40 animate-bounce">
              <span className="material-symbols-outlined text-[15px]">local_fire_department</span>
              <span>{currentStory.offerTag}</span>
            </div>
          </div>
        )}

        {/* Bottom Section: Caption & Actions */}
        <div className="relative z-20 p-4 space-y-3 pointer-events-auto">
          {/* Caption */}
          {currentStory.caption && (
            <div className="bg-black/45 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-left">
              <p className="text-white text-xs font-semibold leading-relaxed drop-shadow-sm">
                {currentStory.caption}
              </p>
            </div>
          )}

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                onClose();
                navigate('/chat', { state: { selectedChat: vendor?._id } });
              }}
              className="flex-1 h-11 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-white/25 cursor-pointer shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">chat</span>
              Message Store
            </button>

            <button
              onClick={() => {
                onClose();
                navigate(`/vendor/${vendor?._id}`);
              }}
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary/95 hover:to-purple-600/95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">storefront</span>
              View Store & Deals
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
