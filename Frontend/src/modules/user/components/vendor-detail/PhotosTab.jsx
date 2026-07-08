import { useState, useEffect } from 'react';
import { UserAPI, API_BASE_URL } from '../../../../services/api';

export default function PhotosTab({ vendorId }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedia = async () => {
      if (!vendorId) return;
      try {
        const res = await UserAPI.getVendorMedia(vendorId);
        if (res.success) {
          setMedia(res.data);
        }
      } catch (error) {
        console.error("Error fetching vendor media:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMedia();
  }, [vendorId]);

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
    <div className="animate-reveal">
      <div className="grid grid-cols-2 gap-2">
        {media.map(item => (
          <div key={item._id} className="relative aspect-square rounded-2xl overflow-hidden bg-surface-container">
            {item.type === 'video' ? (
              <video src={`${API_BASE_URL}${item.url}`} className="w-full h-full object-cover" controls={true} playsInline />
            ) : (
              <img src={`${API_BASE_URL}${item.url}`} alt="Store media" className="w-full h-full object-cover" />
            )}
            
            {item.type === 'video' && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center">
                  <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
