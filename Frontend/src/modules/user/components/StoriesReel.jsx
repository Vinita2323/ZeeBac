import { useState, useEffect } from 'react';
import { StoryAPI } from '../../../services/api';
import StoryViewerModal from './StoryViewerModal';

export default function StoriesReel({ location }) {
  const [storyGroups, setStoryGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  useEffect(() => {
    fetchActiveStories();
  }, [location?.lat, location?.lng]);

  const fetchActiveStories = async () => {
    try {
      setLoading(true);

      let lat = location?.lat;
      let lng = location?.lng;

      // Fallback to saved localStorage location if not yet in state
      if (!lat || !lng) {
        const stored = localStorage.getItem('zeebac_location');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            lat = parsed.lat;
            lng = parsed.lng;
          } catch (e) {}
        }
      }

      const res = await StoryAPI.getActiveStories(lat, lng, 10000);
      if (res.success) {
        setStoryGroups(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load active stories', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStory = (index) => {
    setSelectedGroupIndex(index);
    setIsViewerOpen(true);
  };

  const handleStoryViewed = (storyId, vendorId) => {
    setStoryGroups((prev) =>
      prev.map((group) => {
        if (group.vendor?._id === vendorId) {
          const updatedStories = group.stories.map((s) =>
            s._id === storyId ? { ...s, isSeen: true } : s
          );
          const allSeen = updatedStories.every((s) => s.isSeen);
          return {
            ...group,
            stories: updatedStories,
            hasUnseen: !allSeen,
          };
        }
        return group;
      })
    );
  };

  // If no active stories and not loading, don't show an empty bar
  if (!loading && storyGroups.length === 0) {
    return null;
  }

  return (
    <>
      <div className="w-full overflow-hidden mb-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
            <h3 className="font-display font-black text-xs uppercase tracking-wider text-on-surface">
             Stories
            </h3>
          </div>
          <span className="text-[10px] text-on-surface-variant font-medium">Daily Deals & Updates</span>
        </div>

        {/* Horizontal Story Reel */}
        <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar py-1 px-0.5">
          {loading ? (
            // Skeleton loaders
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0 animate-pulse">
                <div className="w-16 h-16 rounded-full bg-slate-200 border-2 border-slate-100" />
                <div className="w-12 h-2.5 bg-slate-200 rounded" />
              </div>
            ))
          ) : (
            storyGroups.map((group, idx) => {
              const vendor = group.vendor;
              const hasUnseen = group.hasUnseen;
              const hasOffer = group.stories.some((s) => s.offerTag);

              const avatarUrl = vendor?.profilePic
                ? (vendor.profilePic.startsWith('http') || vendor.profilePic.startsWith('data:')
                    ? vendor.profilePic
                    : `${import.meta.env.VITE_API_URL}${vendor.profilePic}`)
                : null;

              return (
                <div
                  key={vendor?._id || idx}
                  onClick={() => handleOpenStory(idx)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group"
                >
                  {/* Story Ring (Instagram gradient if unseen, subtle slate if seen) */}
                  <div className="relative">
                    <div
                      className={`w-[68px] h-[68px] rounded-full p-[2.5px] transition-transform active:scale-95 group-hover:scale-105 shadow-sm ${
                        hasUnseen
                          ? 'bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] animate-gradient'
                          : 'bg-slate-300'
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-white p-[2px] overflow-hidden flex items-center justify-center">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={vendor?.storeName}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center font-black text-primary text-sm uppercase">
                            {vendor?.storeName?.charAt(0) || 'V'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Offer Tag Badge Indicator */}
                    {hasOffer && (
                      <span className="absolute -top-0.5 -right-0.5 text-[11px] bg-amber-400 border-2 border-white rounded-full p-0.5 shadow-sm" title="Special Offer Inside">
                        🔥
                      </span>
                    )}
                  </div>

                  {/* Store Name Label */}
                  <span className="text-[11px] font-bold text-on-surface truncate w-16 text-center leading-tight">
                    {vendor?.storeName || 'Partner'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Full-Screen Instagram Story Viewer */}
      {isViewerOpen && (
        <StoryViewerModal
          isOpen={isViewerOpen}
          groups={storyGroups}
          initialGroupIndex={selectedGroupIndex || 0}
          onClose={() => setIsViewerOpen(false)}
          onStoryViewed={handleStoryViewed}
        />
      )}
    </>
  );
}
