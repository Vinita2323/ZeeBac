import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import { calculateDistance } from '../../../utils/distance';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import PermissionPrimerModal, { LocationPreview } from '../../../components/common/PermissionPrimerModal';
import { hasSeenPrimer, markPrimerSeen, usePrimerGate, usePrimerSlot, PRIMER_PRIORITY } from '../../../utils/permissionPrimer.util';
import useLanguageStore from '../../../store/useLanguageStore';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const demoShops = [
  {
    _id: 'demo-1',
    storeName: 'Sharma General Store',
    cashbackRate: 3,
    distanceDisplay: '0.6 km',
    cityDisplay: 'Lucknow',
    storeLogo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=300&auto=format&fit=crop&q=80',
    category: 'Grocery'
  },
  {
    _id: 'demo-2',
    storeName: 'Gupta Kirana Store',
    cashbackRate: 3,
    distanceDisplay: '1.2 km',
    cityDisplay: 'Lucknow',
    storeLogo: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80',
    category: 'Grocery'
  },
  {
    _id: 'demo-3',
    storeName: 'Ravi Super Mart',
    cashbackRate: 3,
    distanceDisplay: '2.4 km',
    cityDisplay: 'Lucknow',
    storeLogo: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=300&auto=format&fit=crop&q=80',
    category: 'FMCG'
  },
  {
    _id: 'demo-4',
    storeName: 'Modern Grocery',
    cashbackRate: 3,
    distanceDisplay: '3.1 km',
    cityDisplay: 'Lucknow',
    storeLogo: 'https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?w=300&auto=format&fit=crop&q=80',
    category: 'Grocery'
  },
  {
    _id: 'demo-5',
    storeName: 'Zebac Store',
    cashbackRate: 3,
    distanceDisplay: '3.8 km',
    cityDisplay: 'Lucknow',
    storeLogo: 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=300&auto=format&fit=crop&q=80',
    category: 'FMCG'
  }
];

export default function ExploreScreen() {
  const navigate = useNavigate();
  const locationState = useLocation();
  const { t } = useLanguageStore();

  const [activeCategory, setActiveCategory] = useState(locationState.state?.category || 'Near Me');
  const [searchQuery, setSearchQuery] = useState(locationState.state?.searchQuery || '');
  const [showMap, setShowMap] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState(null);

  const [categories, setCategories] = useState(['Near Me', 'Grocery', 'FMCG', 'All']);

  useEffect(() => {
    if (locationState.state?.category) {
      setActiveCategory(locationState.state.category);
    }
    if (locationState.state?.searchQuery) {
      setSearchQuery(locationState.state.searchQuery);
    }
  }, [locationState.state]);

  // Fetch dynamic categories and prepend mockup categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await UserAPI.getCategories();
        if (res.success && Array.isArray(res.data)) {
          const core = ['Near Me', 'Grocery', 'FMCG', 'All'];
          const set = new Set([...core, ...res.data.filter(c => c !== 'All')]);
          setCategories(Array.from(set));
        }
      } catch (err) {
        console.warn('Failed to fetch categories', err);
      }
    };
    fetchCategories();
  }, []);

  // Fetch vendors by category or Near Me
  useEffect(() => {
    const fetchVendors = async () => {
      setIsLoading(true);
      try {
        let lat = null, lng = null;
        const locationAlreadyPrimed = hasSeenPrimer('location');

        if (navigator.geolocation && locationAlreadyPrimed) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3500 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            localStorage.setItem('zeebac_location', JSON.stringify({ lat, lng }));
            setLocation({ lat, lng });
          } catch (geoErr) {
            const stored = localStorage.getItem('zeebac_location');
            if (stored) {
              const parsed = JSON.parse(stored);
              lat = parsed.lat;
              lng = parsed.lng;
              setLocation({ lat, lng });
            }
          }
        } else {
          const stored = localStorage.getItem('zeebac_location');
          if (stored) {
            const parsed = JSON.parse(stored);
            lat = parsed.lat;
            lng = parsed.lng;
            setLocation({ lat, lng });
          }
        }

        const catParam = (activeCategory === 'Near Me' || activeCategory === 'All') ? 'All' : activeCategory;
        const res = await UserAPI.getVendorsByCategory(catParam, lat, lng);
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          let sorted = res.data;
          if (lat && lng) {
            sorted = [...res.data].sort((a, b) => {
              const distA = a.location?.coordinates ? calculateDistance(lat, lng, a.location.coordinates[1], a.location.coordinates[0]) : 999;
              const distB = b.location?.coordinates ? calculateDistance(lat, lng, b.location.coordinates[1], b.location.coordinates[0]) : 999;
              return distA - distB;
            });
          }
          setVendors(sorted);
        } else {
          setVendors([]);
        }
      } catch (err) {
        console.warn('Failed to fetch vendors by category', err);
        setVendors([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (!searchQuery) fetchVendors();
  }, [activeCategory, searchQuery]);

  // Primer for location
  const showLocationPrimer = usePrimerSlot(
    'location',
    PRIMER_PRIORITY.location,
    !!navigator.geolocation && !hasSeenPrimer('location')
  );

  const handleAllowLocation = () => {
    markPrimerSeen('location');
    usePrimerGate.getState().release('location');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        localStorage.setItem('zeebac_location', JSON.stringify(coords));
        setLocation(coords);
        UserAPI.getVendorsByCategory('All', coords.lat, coords.lng).then((res) => {
          if (res.success && res.data) setVendors(res.data);
        });
      },
      (err) => console.warn('Location permission declined:', err.message),
      { timeout: 5000 }
    );
  };

  const handleSkipLocation = () => {
    markPrimerSeen('location');
    usePrimerGate.getState().release('location');
  };

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
        if (res.success && Array.isArray(res.data)) {
          setVendors(res.data);
        }
      } catch (err) {
        console.warn('Failed to search vendors', err);
      } finally {
        setIsLoading(false);
      }
    }, 450);
    return () => clearTimeout(timeout);
  }, [searchQuery, location]);

  const handleVendorClick = (vendor) => {
    navigate('/vendor-detail', { state: { vendor } });
  };

  const getVendorImage = (vendor) => {
    const img = vendor.storeLogo || vendor.profilePic || vendor.storeCoverImage || (vendor.storeImages && vendor.storeImages[0]);
    if (!img) return null;
    if (img.startsWith('http') || img.startsWith('data:')) return img;
    return `${API_BASE_URL}${img}`;
  };

  const getVendorDistance = (vendor) => {
    if (vendor.distanceDisplay) return vendor.distanceDisplay;
    if (location && vendor.location?.coordinates && vendor.location.coordinates.length === 2) {
      const d = calculateDistance(
        location.lat,
        location.lng,
        vendor.location.coordinates[1],
        vendor.location.coordinates[0]
      );
      return `${d} km`;
    }
    return '0.6 km';
  };

  const getVendorCity = (vendor) => {
    if (vendor.cityDisplay) return vendor.cityDisplay;
    if (vendor.city) return vendor.city;
    if (vendor.address?.city) return vendor.address.city;
    if (typeof vendor.address === 'string' && vendor.address.trim()) {
      const parts = vendor.address.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) return parts[parts.length - 1];
      return parts[0];
    }
    return 'Lucknow';
  };

  // Determine shops to show: use database vendors, or demo mockup shops if none found
  const displayedShops = vendors.length > 0
    ? vendors
    : (!searchQuery ? demoShops : []);

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      <PermissionPrimerModal
        open={showLocationPrimer}
        visual={<LocationPreview />}
        title={t('Find deals near you')}
        message={t('Allow location access to see the best cashback offers from stores around you.')}
        onAllow={handleAllowLocation}
        onSkip={handleSkipLocation}
      />

      {/* Top Header matching Mockup Phone 3 */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md px-4 pt-3 pb-2.5 border-b border-slate-100 shadow-xs space-y-3">
        <div className="app-container space-y-3">
          {/* Header Title Bar with Back Arrow */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => navigate('/home')}
                className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer transition-colors"
                title={t('Back')}
              >
                <span className="material-symbols-outlined text-[24px]">arrow_back</span>
              </button>
              <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight leading-none">
                {t('Zeebac Shops')}
              </h1>
            </div>

            {/* Map Toggle Button (clean minimal icon) */}
            <button
              onClick={() => setShowMap(!showMap)}
              className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
              title={showMap ? t('List View') : t('Map View')}
            >
              <span className="material-symbols-outlined text-[20px]">
                {showMap ? 'format_list_bulleted' : 'map'}
              </span>
            </button>
          </div>

          {/* Search by shop name or location Bar */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by shop name or locatio...."
              className="w-full h-11 pl-11 pr-10 bg-white rounded-2xl border border-slate-200/90 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-[13.5px] text-slate-800 placeholder:text-slate-400 shadow-xs transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Pills matching Mockup layout with Brand Theme: Near Me | Grocery | FMCG | All */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => {
              const isSelected = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap cursor-pointer transition-all ${
                    isSelected
                      ? 'btn-primary-gradient text-white font-bold shadow-md shadow-primary/20'
                      : 'bg-[#F3F4F6] text-on-surface-variant hover:bg-slate-200 font-semibold'
                  }`}
                >
                  {cat === 'All' ? t('All') : cat}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow app-container px-4 py-4 relative text-left">
        {showMap ? (
          /* Map View */
          <div className="w-full h-[450px] rounded-3xl overflow-hidden relative shadow-lg animate-reveal border border-slate-200">
            <MapContainer
              center={location ? [location.lat, location.lng] : [26.8467, 80.9462]}
              zoom={location ? 13 : 11}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {displayedShops.map((vendor) => {
                const coords = vendor.location?.coordinates;
                const pos = coords && coords.length === 2 ? [coords[1], coords[0]] : null;
                if (!pos) return null;
                return (
                  <Marker key={vendor._id} position={pos}>
                    <Popup>
                      <div className="p-1 text-left cursor-pointer" onClick={() => handleVendorClick(vendor)}>
                        <h4 className="font-bold text-sm text-primary">{vendor.storeName}</h4>
                        <p className="text-xs text-slate-600">{getVendorCity(vendor)} • {vendor.cashbackRate || 3}%+ Cashback</p>
                        <p className="text-[11px] font-bold text-primary mt-1">{t('Tap to Visit')}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        ) : (
          /* List View: Shop Cards matching Mockup Phone 3 with Brand Theme */
          <div className="space-y-2.5">
            {isLoading ? (
              <div className="flex justify-center items-center py-16">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : displayedShops.length === 0 ? (
              <div className="py-20 text-center space-y-2">
                <span className="material-symbols-outlined text-slate-400 text-[44px]">storefront</span>
                <p className="font-bold text-[15px] text-slate-800">{t('No shops found')}</p>
                <p className="text-[12px] text-slate-500">{t('Try searching with a different name or category')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {displayedShops.map((vendor) => (
                  <div
                    key={vendor._id}
                    onClick={() => handleVendorClick(vendor)}
                    className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-100 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Storefront Image */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-purple-50 border border-purple-100 shrink-0 flex items-center justify-center">
                        {getVendorImage(vendor) ? (
                          <img
                            alt={vendor.storeName}
                            src={getVendorImage(vendor)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-purple-50 flex items-center justify-center text-primary font-black text-xl">
                            <span className="material-symbols-outlined text-[26px]">storefront</span>
                          </div>
                        )}
                      </div>

                      {/* Store Details matching Mockup */}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-[14.5px] sm:text-[15px] text-slate-900 truncate leading-tight">
                          {vendor.storeName}
                        </h3>
                        <p className="text-[11.5px] sm:text-[12px] text-slate-500 font-medium flex items-center gap-1 mt-1 truncate">
                          <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
                          <span>{getVendorDistance(vendor)} • {getVendorCity(vendor)}</span>
                        </p>
                        <p className="text-[12.5px] font-extrabold text-primary mt-0.5">
                          {vendor.cashbackRate ? `${vendor.cashbackRate}%+ Cashback` : '3%+ Cashback'}
                        </p>
                      </div>
                    </div>

                    {/* Visit Button matching Brand Theme */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVendorClick(vendor);
                      }}
                      className="btn-primary-gradient text-white font-bold text-[12.5px] sm:text-[13px] px-5 py-2 rounded-full shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      {t('Visit')}
                    </button>
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
