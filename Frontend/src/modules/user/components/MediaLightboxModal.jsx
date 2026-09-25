import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getMediaUrl } from '../../../services/api';

export default function MediaLightboxModal({
  isOpen,
  mediaItems = [],
  initialIndex = 0,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setIsZoomed(false);
  }, [initialIndex, isOpen]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const total = mediaItems.length;
  const currentItem = mediaItems[currentIndex];

  const handlePrev = useCallback(() => {
    setIsZoomed(false);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  }, [total]);

  const handleNext = useCallback(() => {
    setIsZoomed(false);
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  }, [total]);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // Touch swipe support for mobile
  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    setTouchStartX(null);
  };

  if (!isOpen || !currentItem) return null;

  const rawUrl = currentItem.url || currentItem.image || currentItem.fileUrl || currentItem.src;
  const currentUrl = rawUrl ? getMediaUrl(rawUrl) : '';
  const isVideo = currentItem.type === 'video' || (typeof currentUrl === 'string' && (currentUrl.endsWith('.mp4') || currentUrl.endsWith('.webm') || currentUrl.endsWith('.mov')));

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-between bg-black/95 backdrop-blur-xl select-none animate-fadeIn"
      role="dialog"
      aria-modal="true"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Controls */}
      <div className="flex items-center justify-between p-4 z-30 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          {total > 1 && (
            <span className="px-3 py-1 rounded-full bg-white/10 text-white font-mono text-xs font-bold backdrop-blur-md shadow-sm">
              {currentIndex + 1} / {total}
            </span>
          )}
          {(currentItem.caption || currentItem.name || currentItem.title) && (
            <span className="text-white/90 text-sm font-semibold truncate max-w-[200px] sm:max-w-md drop-shadow">
              {currentItem.caption || currentItem.name || currentItem.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isVideo && (
            <button
              onClick={() => setIsZoomed(!isZoomed)}
              title={isZoomed ? "Zoom out" : "Zoom in"}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isZoomed ? 'zoom_out' : 'zoom_in'}
              </span>
            </button>
          )}

          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              title="Open full size"
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]">open_in_new</span>
            </a>
          )}

          <button
            onClick={onClose}
            title="Close (Esc)"
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>
      </div>

      {/* Main Image/Video Stage */}
      <div
        className="flex-1 relative flex items-center justify-center p-3 sm:p-8 overflow-hidden cursor-default"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Prev Arrow */}
        {total > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-3 sm:left-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-xl cursor-pointer"
            aria-label="Previous image"
          >
            <span className="material-symbols-outlined text-[30px]">chevron_left</span>
          </button>
        )}

        {/* Media Item */}
        <div className="relative max-w-full max-h-full flex items-center justify-center transition-all duration-200">
          {isVideo ? (
            <video
              key={currentUrl}
              src={currentUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[75vh] sm:max-h-[82vh] max-w-[95vw] rounded-2xl shadow-2xl object-contain bg-black/60"
            />
          ) : (
            <img
              key={currentUrl}
              src={currentUrl}
              alt={currentItem.caption || currentItem.name || 'Store media'}
              onClick={() => setIsZoomed(!isZoomed)}
              className={`max-h-[75vh] sm:max-h-[82vh] max-w-[95vw] rounded-2xl shadow-2xl object-contain transition-transform duration-300 ${
                isZoomed ? 'scale-125 sm:scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
              }`}
            />
          )}
        </div>

        {/* Next Arrow */}
        {total > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-3 sm:right-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-xl cursor-pointer"
            aria-label="Next image"
          >
            <span className="material-symbols-outlined text-[30px]">chevron_right</span>
          </button>
        )}
      </div>

      {/* Bottom Information & Thumbnails */}
      <div className="p-4 z-30 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-2">
        {(currentItem.caption || currentItem.description) && (
          <p className="text-white text-[13px] font-medium text-center bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full max-w-md line-clamp-2 shadow-sm">
            {currentItem.caption || currentItem.description}
          </p>
        )}

        {/* Horizontal Mini Thumbnails */}
        {total > 1 && total <= 15 && (
          <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1 hide-scrollbar">
            {mediaItems.map((item, idx) => {
              const thumbRaw = item.thumbnail || item.url || item.image || item.fileUrl || item.src;
              const thumbUrl = thumbRaw ? getMediaUrl(thumbRaw) : '';
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setIsZoomed(false);
                    setCurrentIndex(idx);
                  }}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all cursor-pointer ${
                    currentIndex === idx
                      ? 'border-white scale-105 shadow-lg ring-2 ring-white/50'
                      : 'border-transparent opacity-50 hover:opacity-85'
                  }`}
                >
                  <img
                    src={thumbUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
