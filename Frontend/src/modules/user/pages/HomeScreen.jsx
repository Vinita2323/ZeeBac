import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import BottomNavBar from '../components/common/BottomNavBar';
import { calculateDistance } from '../../../utils/distance';
import NotificationPanel from '../components/common/NotificationPanel';
import useNotifications from '../../../hooks/useNotifications';
import PermissionPrimerModal, { LocationPreview } from '../../../components/common/PermissionPrimerModal';
import { hasSeenPrimer, markPrimerSeen, usePrimerGate, usePrimerSlot, PRIMER_PRIORITY } from '../../../utils/permissionPrimer.util';
import useLanguageStore from '../../../store/useLanguageStore';

export default function HomeScreen() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguageStore();
  const bellRef = useRef(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { unreadCount } = useNotifications();


  const handleVendorClick = (vendor) => {
    navigate('/vendor-detail', { state: { vendor } });
  };

  const currentUser = useAuthStore((state) => state.currentUser);
  const [vendors, setVendors] = useState([]);
  const [recentVendors, setRecentVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [homeSearchQuery, setHomeSearchQuery] = useState('');

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('Good Morning!');
    if (hour < 17) return t('Good Afternoon!');
    return t('Good Evening!');
  };

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (homeSearchQuery.trim()) {
      navigate('/explore', { state: { searchQuery: homeSearchQuery.trim() } });
    } else {
      navigate('/explore');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Recent Vendors
        const recentRes = await UserAPI.getRecentVendors();
        if (recentRes.success) setRecentVendors(recentRes.data || []);

        let lat = null, lng = null;
        const locationAlreadyPrimed = hasSeenPrimer('location');

        // Try getting live location
        if (navigator.geolocation && locationAlreadyPrimed) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            localStorage.setItem('zeebac_location', JSON.stringify({ lat, lng }));
          } catch (geoErr) {
            console.warn("Could not get live location on home, using fallback.");
            const stored = localStorage.getItem('zeebac_location');
            if (stored) {
              const parsed = JSON.parse(stored);
              lat = parsed.lat;
              lng = parsed.lng;
            }
          }
        } else if (!locationAlreadyPrimed) {
          // Primer is showing — use any previously cached location meanwhile
          const stored = localStorage.getItem('zeebac_location');
          if (stored) {
            const parsed = JSON.parse(stored);
            lat = parsed.lat;
            lng = parsed.lng;
          }
        }

        let vendorRes;
        if (lat && lng) {
          setLocation({ lat, lng });
          vendorRes = await UserAPI.getNearbyVendors(lat, lng);
        } else {
          vendorRes = await UserAPI.getVendorsByCategory('All');
        }

        if (vendorRes.success) setVendors(vendorRes.data || []);

      } catch (err) {
        console.error('Failed to load home screen data', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  // Explain why we need location before the native prompt ever fires, the
  // very first time — queued behind any higher-priority primer (e.g. the
  // data-usage consent) via the shared gate instead of stacking on top of it.
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
        UserAPI.getNearbyVendors(coords.lat, coords.lng).then((res) => {
          if (res.success) setVendors(res.data || []);
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
  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32">

      {/* Notification Panel (slide-in from right) */}
      <NotificationPanel
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        triggerRef={bellRef}
      />

      <PermissionPrimerModal
        open={showLocationPrimer}
        visual={<LocationPreview />}
        title="Find deals near you"
        message="Allow location access to see the best cashback offers from stores around you."
        onAllow={handleAllowLocation}
        onSkip={handleSkipLocation}
      />

      <header className="sticky top-0 z-50 glass-header px-4 py-2 border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <img
            alt="Zeebac Logo"
            className="h-[60px] object-contain cursor-pointer"
            src="/Logo (6).png"
            onClick={() => navigate('/home')}
          />
          <div className="flex items-center gap-1.5">
            {/* Language Switcher */}
            <button 
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              className="flex items-center justify-center px-2.5 py-1 rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary text-[12px] font-bold cursor-pointer transition-all active:scale-95 shadow-xs"
              title={language === 'en' ? 'Switch to Hindi / हिन्दी में बदलें' : 'Switch to English / अंग्रेज़ी में बदलें'}
            >
              <span className="leading-none flex items-center tracking-tight">
                <span className={language === 'en' ? 'text-primary font-black' : 'text-on-surface-variant/50 font-medium'}>Eng</span>
                <span className="text-outline-variant/60 font-normal">/</span>
                <span className={language === 'hi' ? 'text-primary font-black' : 'text-on-surface-variant/50 font-medium'}>हि</span>
              </span>
            </button>

            <button onClick={() => navigate('/chat')} className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-9 h-9 rounded-full hover:bg-primary/5">
              <span className="material-symbols-outlined text-[24px]">chat_bubble</span>
            </button>
            {/* 🔔 Notification Bell */}
            <button
              ref={bellRef}
              onClick={() => navigate('/notifications')}
              className="relative text-[#7c3aed] hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-9 h-9 rounded-full hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[24px]">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-black px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 app-container px-container-margin py-md space-y-5 text-left">

        {/* Greeting matching Mockup Phone 2 */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="font-display text-[20px] font-black text-on-surface leading-tight">
              {t('Hello,')} {(currentUser?.name || 'Himanshu').split(' ')[0]} 👋
            </h1>
            <p className="text-[12.5px] text-on-surface-variant font-medium mt-0.5">
              {getTimeGreeting()}
            </p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-container border border-outline-variant/30 flex items-center justify-center text-primary cursor-pointer transition-all active:scale-95 shadow-xs overflow-hidden"
            title="Profile"
          >
            {currentUser?.profileImage ? (
              <img src={currentUser.profileImage} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[24px]">account_circle</span>
            )}
          </button>
        </div>


        {/* Search Product Card matching Brand Purple Theme */}
        <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-[#16082f] via-[#2d0554] to-[#6000da] text-white shadow-lg relative overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />

          {/* Search Product Bar */}
          <form onSubmit={handleSearchSubmit} className="relative z-10">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={homeSearchQuery}
              onChange={(e) => setHomeSearchQuery(e.target.value)}
              placeholder={t('Search product')}
              className="w-full h-11 pl-11 pr-10 bg-white text-slate-900 rounded-full font-medium text-[13.5px] placeholder:text-slate-400 italic shadow-sm outline-none border-2 border-transparent focus:border-purple-300 transition-all"
            />
            {homeSearchQuery ? (
              <button
                type="button"
                onClick={() => setHomeSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            ) : (
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            )}
          </form>

          {/* Zeebac Points Balance Quick Link */}
          <div
            onClick={() => navigate('/wallet')}
            className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between cursor-pointer group relative z-10"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-300 text-[18px]">stars</span>
              <span className="text-[11px] text-purple-100 font-bold">Zeebac Points (1 Pt = ₹1)</span>
            </div>
            <div className="flex items-center gap-1 text-white text-[11.5px] font-bold group-hover:text-purple-200 transition-colors">
              <span className="text-amber-300">⭐ Redeem Points</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-black text-on-surface">
              {t('Quick Actions')}
            </h2>
          </div>

          {/* Primary 4 Actions: Scan & Pay | My QR | Wallet | History */}
          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            {[
              { label: t('Scan & Pay'), icon: 'qr_code_scanner', onClick: () => navigate('/scan'), bg: 'from-[#16082f] via-[#3b0764] to-[#6000da]' },
              { label: t('My QR'), icon: 'qr_code_2', onClick: () => navigate('/profile', { state: { subView: 'qr-code' } }), bg: 'from-[#16082f] via-[#3b0764] to-[#6000da]' },
              { label: t('Wallet'), icon: 'account_balance_wallet', onClick: () => navigate('/wallet'), bg: 'from-[#16082f] via-[#3b0764] to-[#6000da]' },
              { label: t('History'), icon: 'history', onClick: () => navigate('/passbook'), bg: 'from-[#16082f] via-[#3b0764] to-[#6000da]' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="relative flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-2xl bg-white/90 hover:bg-white border border-outline-variant/15 shadow-xs hover:shadow-sm transition-all active:scale-[0.94] cursor-pointer"
              >
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${action.bg} flex items-center justify-center text-white shadow-xs`}>
                  <span className="material-symbols-outlined text-[20px]">{action.icon}</span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-on-surface-variant text-center leading-[1.15] h-[24px] flex items-center justify-center px-0.5">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Cashback Banner matching Brand Theme */}
        <div className="rounded-3xl p-4 bg-gradient-to-r from-purple-50 via-indigo-50/70 to-purple-100/60 border border-purple-200/60 shadow-xs flex items-center justify-between gap-3 relative overflow-hidden">
          <div className="min-w-0 space-y-1.5 z-10">
            <div>
              <p className="font-display font-black text-[17px] text-slate-900 leading-tight">
                {t('Get 3%+ Cashback')}
              </p>
              <p className="text-[12px] text-slate-600 font-medium">
                {t('at Zeebac Merchants')}
              </p>
            </div>
            <button
              onClick={() => navigate('/explore')}
              className="px-4 py-2 btn-primary-gradient text-white rounded-full font-black text-[11px] shadow-sm shadow-primary/20 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1"
            >
              <span>{t('Shop Now')}</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </button>
          </div>

          {/* Friendly Zeebac Cashback Mascot SVG */}
          <div className="shrink-0 relative z-10 w-24 h-24 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
              {/* Leaves */}
              <path d="M 65 30 C 80 15, 85 40, 68 45 Z" fill="#9333ea" />
              <path d="M 25 35 C 10 20, 15 45, 30 50 Z" fill="#7c3aed" />
              {/* Antenna */}
              <circle cx="50" cy="18" r="4" fill="#a855f7" />
              <path d="M 50 18 L 50 26" stroke="#6000da" strokeWidth="2.5" strokeLinecap="round" />
              {/* Head / Monitor */}
              <rect x="22" y="26" width="56" height="46" rx="14" fill="#fb923c" stroke="#ea580c" strokeWidth="2" />
              {/* Inner Screen */}
              <rect x="28" y="32" width="44" height="34" rx="8" fill="#ffffff" />
              {/* Eyes */}
              <circle cx="41" cy="46" r="3.5" fill="#1e293b" />
              <circle cx="59" cy="46" r="3.5" fill="#1e293b" />
              <circle cx="42" cy="44.5" r="1.2" fill="#ffffff" />
              <circle cx="60" cy="44.5" r="1.2" fill="#ffffff" />
              {/* Rosy Cheeks */}
              <circle cx="36" cy="51" r="2.5" fill="#f472b6" opacity="0.6" />
              <circle cx="64" cy="51" r="2.5" fill="#f472b6" opacity="0.6" />
              {/* Smile */}
              <path d="M 46 52 Q 50 56 54 52" fill="none" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
              {/* Body */}
              <path d="M 36 72 L 64 72 L 68 88 L 32 88 Z" fill="#6000da" />
              {/* Coin / Cash Badge */}
              <circle cx="50" cy="80" r="6" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
              <text x="50" y="83" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#78350f">₹</text>
            </svg>
          </div>
        </div>

        {/* Popular Categories matching Brand Theme */}
        <div className="space-y-2.5">
          <h2 className="font-display text-[15px] font-black text-on-surface">
            {t('Popular Categories')}
          </h2>

          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            {[
              { label: t('Groceries'), catName: 'Grocery', icon: 'shopping_basket', bg: 'bg-purple-50 text-primary border-purple-100' },
              { label: t('FMCG'), catName: 'FMCG', icon: 'local_drink', bg: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
              { label: t('Household'), catName: 'Household', icon: 'home', bg: 'bg-purple-50 text-purple-800 border-purple-100' },
              { label: t('Personal Care'), catName: 'Personal Care', icon: 'sanitizer', bg: 'bg-purple-50 text-[#7c3aed] border-purple-100' },
            ].map((cat) => (
              <button
                key={cat.catName}
                onClick={() => navigate('/explore', { state: { category: cat.catName } })}
                className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl bg-white border border-outline-variant/15 hover:border-primary/30 shadow-xs hover:shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${cat.bg}`}>
                  <span className="material-symbols-outlined text-[22px]">{cat.icon}</span>
                </div>
                <span className="text-[10px] sm:text-[10.5px] font-bold text-on-surface text-center truncate max-w-full">
                  {cat.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Upload Bill Banner (Flow 1 Banner) */}
        {/* <div 
          onClick={() => navigate('/request-cashback')}
          className="bg-gradient-to-r from-[#16082f] via-[#3b0764] to-[#6000da] rounded-2xl p-4 text-white shadow-md cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">receipt_long</span>
            </div>
            <div className="text-left">
              <p className="text-[13px] font-extrabold text-white leading-tight">Claim Cashback on Cash Bills</p>
              <p className="text-[10px] text-white/80 font-medium mt-0.5">Upload receipt photo & earn instant rewards</p>
            </div>
          </div>
          <button className="px-3.5 py-2 bg-white text-[#6000da] rounded-xl font-extrabold text-[11px] shadow-sm hover:bg-white/90 whitespace-nowrap">
            Upload
          </button>
        </div> */}

        {/* Recently Visited */}
        {recentVendors.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-display text-headline-sm text-on-surface font-black tracking-tight">{t('Recently Visited')}</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
              {recentVendors.map((vendor) => (
                <div
                  key={vendor._id}
                  onClick={() => handleVendorClick(vendor)}
                  className="snap-start flex flex-col items-center gap-1 cursor-pointer min-w-[72px]"
                >
                  <div className="w-16 h-16 rounded-full bg-surface-container-high border-2 border-primary/20 overflow-hidden shadow-sm">
                    {vendor.storeLogo || vendor.profilePic ? (
                      <img alt={vendor.storeName} className="w-full h-full object-cover" src={(vendor.storeLogo || vendor.profilePic).startsWith('http') || (vendor.storeLogo || vendor.profilePic).startsWith('data:') ? (vendor.storeLogo || vendor.profilePic) : `${API_BASE_URL}${vendor.storeLogo || vendor.profilePic}`} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-xl text-primary">
                        {vendor.storeName?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-center leading-tight line-clamp-1 w-16">{vendor.storeName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nearby Vendors List */}
        <div className="space-y-md">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-headline-sm text-on-surface font-black tracking-tight">{t('Nearby Partner Vendors')}</h3>
            <button
              onClick={() => navigate('/explore')}
              className="text-body-sm text-primary font-bold hover:underline cursor-pointer"
            >
              {t('See All')}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-sm">
            {isLoading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary/20 border-t-primary"></div>
              </div>
            ) : vendors.length === 0 ? (
              <div className="glass-card rounded-2xl py-8 px-4 flex flex-col items-center text-center gap-1.5">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                  <span className="material-symbols-outlined text-primary text-[24px]">storefront</span>
                </div>
                <p className="font-bold text-on-surface text-[13.5px]">{t('No nearby vendors yet')}</p>
                <p className="text-on-surface-variant text-[12px] max-w-[220px]">{t('Explore the full directory to find partner stores near you')}</p>
                <button
                  onClick={() => navigate('/explore')}
                  className="mt-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-[12px] font-bold hover:bg-primary/15 transition-colors cursor-pointer"
                >
                  {t('Browse Explore')}
                </button>
              </div>
            ) : (
              vendors.map((vendor) => (
                <div
                  key={vendor._id}
                  onClick={() => handleVendorClick(vendor)}
                  className="glass-card rounded-xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-shadow flex items-center p-2 border border-outline-variant/30 gap-3"
                >
                  <div className="w-14 h-14 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                    {vendor.storeLogo || vendor.profilePic ? (
                      <img alt={vendor.storeName} className="w-full h-full object-cover" src={(vendor.storeLogo || vendor.profilePic).startsWith('http') || (vendor.storeLogo || vendor.profilePic).startsWith('data:') ? (vendor.storeLogo || vendor.profilePic) : `${API_BASE_URL}${vendor.storeLogo || vendor.profilePic}`} />
                    ) : (
                      <span className="text-on-surface font-black text-xl">{vendor.storeName?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-grow text-left space-y-0.5">
                    <span className="bg-primary/10 text-primary font-label-mono text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase">{t('FLAT')} {vendor.cashbackRate}% {t('CASHBACK')}</span>
                    <h4 className="font-title-md text-on-surface font-bold text-[14px] pt-0.5 leading-tight">{vendor.storeName}</h4>
                    <div className="flex items-center gap-xs text-caption text-on-surface-variant text-[11px]">
                      <span className="material-symbols-outlined text-[12px]">distance</span>
                      {location && vendor.location?.coordinates ?
                        `${calculateDistance(location.lat, location.lng, vendor.location.coordinates[1], vendor.location.coordinates[0])} ${t('km away')}`
                        : t('Nearby')}
                      <span>•</span>
                      {vendor.category}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
                </div>
              ))
            )}
          </div>
        </div>

      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}
