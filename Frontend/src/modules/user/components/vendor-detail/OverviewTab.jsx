import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI, API_BASE_URL, ChatAPI } from '../../../../services/api';

export default function OverviewTab({ vendor }) {
  const navigate = useNavigate();
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    const fetchHighlights = async () => {
      if (!vendor?._id) return;
      try {
        const res = await UserAPI.getVendorProducts(vendor._id);
        if (res.success) {
          const highlighted = res.data.filter(p => p.isHighlight);
          setHighlights(highlighted.length > 0 ? highlighted.slice(0, 5) : res.data.slice(0, 5));
        }
      } catch (err) {
        console.error('Failed to load highlights', err);
      }
    };
    fetchHighlights();
  }, [vendor?._id]);

  const handleMessageVendor = async () => {
    try {
      const res = await ChatAPI.getOrCreateConversation({ vendorId: vendor._id });
      if (res.success && res.data) {
        navigate('/chat', { state: { selectedChat: res.data._id, vendorData: vendor } });
      }
    } catch (err) {
      console.error('Failed to create or get conversation', err);
      // Fallback
      navigate('/chat', { state: { selectedChat: null, vendorData: vendor } });
    }
  };

  return (
    <div className="space-y-lg animate-reveal">
      <div className="space-y-xs">
        <h3 className="font-display text-title-md font-extrabold text-on-surface">About</h3>
        <p className="text-body-sm text-on-surface-variant leading-relaxed">
          {vendor.description ? vendor.description : `Experience high-end design form factor and exclusive curation. Enjoy modern checkout convenience, premium customer support, and the highest rewards rates at ${vendor.storeName || vendor.name} through Zeebac.`}
        </p>
      </div>
      
      <div className="space-y-xs">
        <h3 className="font-display text-title-md font-extrabold text-on-surface">Store Information</h3>
        <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-outline">location_on</span>
          <span>{typeof vendor.address === 'object' ? `${vendor.address?.fullAddress || ''}, ${vendor.address?.city || ''}` : (vendor.address || "42nd Luxury Blvd, Metro City")}</span>
        </div>
        <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-outline">schedule</span>
          <span>{vendor.operatingHours || "Open Daily: 09:00 AM - 10:00 PM"}</span>
        </div>
      </div>

      {/* Highlights Carousel */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-display text-title-md font-extrabold text-on-surface">Store Highlights</h3>
        </div>
        <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2 -mx-container-margin px-container-margin">
          {highlights.length > 0 ? highlights.map(item => (
            <div key={item._id} className="min-w-[140px] bg-white rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm flex-shrink-0">
              {item.image ? (
                <img src={item.image.startsWith('http') ? item.image : `${API_BASE_URL}${item.image}`} alt={item.name} className="w-full h-[140px] object-cover" />
              ) : (
                <div className="w-full h-[140px] bg-surface-variant flex items-center justify-center">
                  <span className="material-symbols-outlined text-outline text-[40px]">inventory_2</span>
                </div>
              )}
              <div className="p-3">
                <p className="text-[13px] font-bold text-on-surface truncate">{item.name}</p>
                <p className="text-[12px] text-primary font-black mt-1">₹{item.price}</p>
              </div>
            </div>
          )) : (
            <div className="w-full py-4 text-center opacity-60 text-sm">No highlights added yet.</div>
          )}
        </div>
      </div>

      <button 
        onClick={handleMessageVendor} 
        className="w-full h-[52px] bg-primary/10 text-primary font-title-md font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-primary/20 transition-colors active:scale-[0.98]"
      >
        <span className="material-symbols-outlined text-[20px]">chat</span>
        Message Shop
      </button>
    </div>
  );
}
