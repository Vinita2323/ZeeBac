import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import { calculateDistance } from '../../../utils/distance';

export default function ExploreScreen() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState(null);

  const [categories, setCategories] = useState(['All']);

  // Fetch dynamic categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await UserAPI.getCategories();
        if (res.success && res.data) {
          setCategories(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch categories', err);
      }
    };
    fetchCategories();
  }, []);

  // Fetch favorites on mount
  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const res = await UserAPI.getFavorites();
        if (res.success) {
          setFavoriteIds(new Set(res.data.map(v => v._id)));
        }
      } catch (err) {
        console.error('Failed to fetch favorites', err);
      }
    };
    fetchFavorites();
  }, []);

  // Fetch vendors by category
  useEffect(() => {
    const fetchByCategory = async () => {
      setIsLoading(true);
      try {
        let lat = null, lng = null;
        
        // Try getting latest live location
        if (navigator.geolocation) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            // Update local storage
            localStorage.setItem('zeebac_location', JSON.stringify({ lat, lng }));
            setLocation({ lat, lng });
          } catch (geoErr) {
            console.warn("Could not get live location, using fallback:", geoErr.message);
            // Fallback to local storage
            const stored = localStorage.getItem('zeebac_location');
            if (stored) {
              const parsed = JSON.parse(stored);
              lat = parsed.lat;
              lng = parsed.lng;
              setLocation({ lat, lng });
            }
          }
        }

        const res = await UserAPI.getVendorsByCategory(activeCategory, lat, lng);
        if (res.success) setVendors(res.data);
      } catch (err) {
        console.error('Failed to fetch vendors by category', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (!searchQuery) fetchByCategory();
  }, [activeCategory, searchQuery]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        let lat = location?.lat;
        let lng = location?.lng;
        if (!lat || !lng) {
          const stored = localStorage.getItem('zeebac_location');
          if (stored) {
            const parsed = JSON.parse(stored);
            lat = parsed.lat;
            lng = parsed.lng;
          }
        }
        
        const res = await UserAPI.searchVendors(searchQuery, lat, lng);
        if (res.success) setVendors(res.data);
      } catch (err) {
        console.error('Failed to search vendors', err);
      } finally {
        setIsLoading(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery, location]);

  const handleVendorClick = (vendor) => {
    navigate('/vendor-detail', { state: { vendor } });
  };

  const handleToggleFavorite = async (e, vendorId) => {
    e.stopPropagation(); // prevent clicking the card
    try {
      const res = await UserAPI.toggleFavorite(vendorId);
      if (res.success) {
        setFavoriteIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(vendorId)) newSet.delete(vendorId);
          else newSet.add(vendorId);
          return newSet;
        });
      }
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Top Search bar Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-4 py-2 border-b border-outline-variant/10 shadow-sm space-y-2">
        <div className="flex items-center gap-xs">
          <div className="flex-grow relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
            <input 
              className="w-full h-11 pl-10 pr-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-body-lg font-body-lg placeholder:text-outline transition-all"
              placeholder="Search local shops and brands..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowMap(!showMap)}
            className="w-11 h-11 bg-primary text-white rounded-xl flex items-center justify-center shadow-md cursor-pointer hover:opacity-95"
          >
            <span className="material-symbols-outlined text-[20px]">{showMap ? 'list' : 'map'}</span>
          </button>
        </div>

        {/* Categories Carousel */}
        <div className="flex gap-sm overflow-x-auto pb-1 scroll-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full font-title-md text-[13px] whitespace-nowrap cursor-pointer transition-colors ${
                activeCategory === cat 
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content body */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg relative text-left">
        
        {showMap ? (
          /* Mock Map representation */
          <div className="w-full h-[450px] glass-card rounded-3xl overflow-hidden relative shadow-lg flex items-center justify-center animate-reveal">
            <img 
              alt="Map view" 
              className="w-full h-full object-cover" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDR6lU_paT8suC7Y0iuxSdd3IQutJ4oAMJoxi8Hld2bUHqknZu3WDUqoyqEhC_MFk9jyqJul5eZn7HsXPkmdKlzf3x8Z2DukeQBh76A8_-OOA2OyZt3qLNpgMzq_0k2UMiu9tLuKY9MY6ExlYAdno7W8RHZhbnfr0GPMITMoi2zCDxNinsgiECCW1KltHrs5rEK5lS1Q03EqFYvjyg5hlIIJA9TqONZtt7_wYzQ4JLOYhP_ZDOt_1wtkpmouL4orX0YGmaEoaCoUhZb"
            />
            {vendors.map((vendor, idx) => (
              <div 
                key={vendor._id} 
                onClick={() => handleVendorClick(vendor)}
                className={`absolute w-8 h-8 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform ${
                  idx === 0 ? 'top-1/4 left-1/3' : idx === 1 ? 'bottom-1/3 right-1/4' : 'top-1/2 right-1/3'
                }`}
              >
                <span className="material-symbols-outlined text-primary text-3xl animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
              </div>
            ))}
          </div>
        ) : (
          /* List View Representation */
          <div className="space-y-md">
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : vendors.length === 0 ? (
              <div className="py-20 text-center space-y-xs">
                <span className="material-symbols-outlined text-outline text-[48px]">storefront</span>
                <p className="font-title-md text-on-surface font-bold">No vendors found</p>
                <p className="text-body-sm text-on-surface-variant">Try searching for other categories or names</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-md">
                {vendors.map((vendor) => (
                  <div 
                    key={vendor._id}
                    onClick={() => handleVendorClick(vendor)}
                    className="bg-white rounded-[20px] overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-all border border-outline-variant/20 flex flex-col group"
                  >
                    {/* Hero Image */}
                    <div className="relative h-[160px] w-full overflow-hidden bg-surface-container-high flex items-center justify-center">
                      {vendor.storeLogo || vendor.profilePic ? (
                        <img 
                          alt={vendor.storeName} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          src={(vendor.storeLogo || vendor.profilePic).startsWith('http') || (vendor.storeLogo || vendor.profilePic).startsWith('data:') ? (vendor.storeLogo || vendor.profilePic) : `${API_BASE_URL}${vendor.storeLogo || vendor.profilePic}`}
                        />
                      ) : (
                        <span className="material-symbols-outlined text-4xl text-on-surface-variant">store</span>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                      
                      {/* Floating Badges */}
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[12px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        <span className="text-[11px] font-bold text-on-surface">4.8 (100+)</span>
                      </div>
                      <button 
                        onClick={(e) => handleToggleFavorite(e, vendor._id)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-colors z-10 cursor-pointer"
                      >
                        <span 
                          className={`material-symbols-outlined text-[18px] transition-colors ${favoriteIds.has(vendor._id) ? 'text-red-500' : ''}`}
                          style={favoriteIds.has(vendor._id) ? { fontVariationSettings: "'FILL' 1" } : {}}
                        >
                          favorite
                        </span>
                      </button>
                      
                      {/* Bottom Info inside image */}
                      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                        <div className="bg-primary text-white text-[10px] font-black px-2 py-1 rounded-md shadow-sm uppercase tracking-wide">
                          FLAT {vendor.cashbackRate}% CASHBACK
                        </div>
                        <div className="bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">directions_walk</span>
                          {location && vendor.location?.coordinates ? 
                            `${calculateDistance(location.lat, location.lng, vendor.location.coordinates[1], vendor.location.coordinates[0])} km` 
                            : 'Nearby'}
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="p-4 flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <h3 className="font-display font-black text-[18px] text-on-surface leading-tight group-hover:text-primary transition-colors">{vendor.storeName}</h3>
                      </div>
                      <p className="text-on-surface-variant text-[13px] font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                        {vendor.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}
