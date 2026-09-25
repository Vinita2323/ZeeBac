import { useState, useEffect } from 'react';
import { UserAPI, API_BASE_URL, getMediaUrl } from '../../../../services/api';
import MediaLightboxModal from '../MediaLightboxModal';

export default function PhotosTab({ vendorId, vendor }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const fetchMedia = async () => {
      if (!vendorId) {
        setLoading(false);
        return;
      }
      try {
        const res = await UserAPI.getVendorMedia(vendorId);
        if (res.success && res.data && res.data.length > 0) {
          setMedia(res.data);
        } else if (vendor) {
          // If storefront media collection is empty, check vendor document's images
          const fallback = [];
          if (vendor.storeImages && vendor.storeImages.length > 0) {
            vendor.storeImages.forEach((img, i) => {
              if (img) fallback.push({ _id: `v-img-${i}`, type: 'image', url: img, caption: `${vendor.storeName || 'Store'} Photo ${i + 1}` });
            });
          }
          if (vendor.storeCoverImage) {
            fallback.push({ _id: 'v-cover', type: 'image', url: vendor.storeCoverImage, caption: `${vendor.storeName || 'Store'} Cover` });
          }
          if (vendor.storeLogo || vendor.profilePic) {
            fallback.push({ _id: 'v-logo', type: 'image', url: vendor.storeLogo || vendor.profilePic, caption: `${vendor.storeName || 'Store'} Logo` });
          }
          setMedia(fallback);
        }
      } catch (error) {
        console.error("Error fetching vendor media:", error);
        if (vendor) {
          const fallback = [];
          if (vendor.storeImages && vendor.storeImages.length > 0) {
            vendor.storeImages.forEach((img, i) => {
              if (img) fallback.push({ _id: `v-img-${i}`, type: 'image', url: img, caption: `${vendor.storeName || 'Store'} Photo ${i + 1}` });
            });
          }
          if (vendor.storeCoverImage) {
            fallback.push({ _id: 'v-cover', type: 'image', url: vendor.storeCoverImage, caption: `${vendor.storeName || 'Store'} Cover` });
          }
          if (vendor.storeLogo || vendor.profilePic) {
            fallback.push({ _id: 'v-logo', type: 'image', url: vendor.storeLogo || vendor.profilePic, caption: `${vendor.storeName || 'Store'} Logo` });
          }
          setMedia(fallback);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchMedia();
  }, [vendorId, vendor]);

  const handleMediaClick = (index) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-on-surface-variant">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
        <p className="font-bold">Loading media...</p>
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="py-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">image</span>
        <p className="font-bold text-[16px]">No media available</p>
        <p className="text-[14px]">This vendor hasn't uploaded any photos yet.</p>
      </div>
    );
  }

  return (
    <div className="animate-reveal space-y-3">
      <div className="flex items-center justify-between text-xs text-on-surface-variant font-medium px-1">
        <span>{media.length} {media.length === 1 ? 'item' : 'photos & videos'}</span>
        <span className="flex items-center gap-1 opacity-70">
          <span className="material-symbols-outlined text-[14px]">touch_app</span>
          Tap to view full screen
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {media.map((item, index) => {
          const isVideo = item.type === 'video';
          const mediaUrl = getMediaUrl(item.url);

          return (
            <div
              key={item._id || index}
              onClick={() => handleMediaClick(index)}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-surface-container cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 active:scale-[0.98]"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMediaClick(index);
                }
              }}
            >
              {isVideo ? (
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  playsInline
                  muted
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt={item.caption || "Store media"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              )}

              {/* Hover Overlay with Zoom/Play Icon */}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <div className="w-11 h-11 rounded-full bg-white/35 backdrop-blur-md flex items-center justify-center text-white shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-200">
                  <span className="material-symbols-outlined text-[26px]">
                    {isVideo ? 'play_arrow' : 'zoom_in'}
                  </span>
                </div>
              </div>

              {/* Video Badge when not hovering */}
              {isVideo && (
                <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white group-hover:opacity-0 transition-opacity">
                  <span className="material-symbols-outlined text-[16px]">videocam</span>
                </div>
              )}

              {/* Caption Preview at bottom */}
              {item.caption && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none">
                  <p className="text-white text-[11px] font-medium truncate drop-shadow">{item.caption}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Full Screen Interactive Lightbox Modal */}
      <MediaLightboxModal
        isOpen={lightboxOpen}
        mediaItems={media}
        initialIndex={selectedIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
