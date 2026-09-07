import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import BottomNavBar from '../components/common/BottomNavBar';
import { calculateDistance } from '../../../utils/distance';
import NotificationPanel from '../components/common/NotificationPanel';
import useNotifications from '../../../hooks/useNotifications';

export default function HomeScreen() {
  const navigate = useNavigate();
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Recent Vendors
        const recentRes = await UserAPI.getRecentVendors();
        if (recentRes.success) setRecentVendors(recentRes.data || []);

        let lat = null, lng = null;

        // Try getting live location
        if (navigator.geolocation) {
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
  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32">

      {/* Notification Panel (slide-in from right) */}
      <NotificationPanel
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        triggerRef={bellRef}
      />

      <header className="sticky top-0 z-50 glass-header px-4 py-2 border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <img
            alt="Zeebac Logo"
            className="h-[60px] object-contain cursor-pointer"
            src="/Logo (6).png"
            onClick={() => navigate('/home')}
          />
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/chat')} className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-9 h-9 rounded-full hover:bg-primary/5">
              <span className="material-symbols-outlined text-[24px]">chat_bubble</span>
            </button>
            {/* 🔔 Notification Bell */}
            <button
              ref={bellRef}
              onClick={() => setIsNotifOpen((prev) => !prev)}
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

        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[19px] font-black text-on-surface leading-tight">
              Hi, {(currentUser?.name || 'there').split(' ')[0]} 👋
            </h1>
            <p className="text-[12px] text-on-surface-variant font-medium mt-0.5">Let's find you some cashback today</p>
          </div>
        </div>

        {/* Balance chip */}
        <div
          onClick={() => navigate('/wallet')}
          className="btn-primary-gradient rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-lg shadow-primary/25 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px]">account_balance_wallet</span>
            </div>
            <div>
              <p className="text-[10px] text-white/75 font-bold uppercase tracking-wider leading-none">Rewards Wallet</p>
              <p className="text-white font-display font-black text-[18px] mt-1 leading-none">View Balance</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-white/80 text-[20px]">chevron_right</span>
        </div>

        {/* Quick Actions Row */}
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { label: 'Scan & Pay', icon: 'qr_code_scanner', path: '/scan', bg: 'from-[#16082f] via-[#3b0764] to-[#6000da]', iconColor: 'text-white' },
            { label: 'Upload Bill', icon: 'receipt_long', path: '/request-cashback', bg: 'from-[#260060] to-[#7000ff]', iconColor: 'text-white' },
            { label: 'Find Vendor', icon: 'storefront', path: '/find-vendor', bg: 'from-[#16082f] to-[#4c00b0]', iconColor: 'text-white' },
            { label: 'History', icon: 'history', path: '/passbook', bg: 'from-[#3b0764] to-[#6000da]', iconColor: 'text-white' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-white/80 hover:bg-white border border-white/80 shadow-sm hover:shadow-md transition-all active:scale-[0.94] cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${action.bg} flex items-center justify-center shadow-sm`}>
                <span className={`material-symbols-outlined text-[19px] ${action.iconColor}`}>{action.icon}</span>
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant text-center leading-tight">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Upload Bill Banner (Flow 1 Banner) */}
        <div 
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
        </div>

        {/* Recently Visited */}
        {recentVendors.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-display text-headline-sm text-on-surface font-black tracking-tight">Recently Visited</h3>
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
            <h3 className="font-display text-headline-sm text-on-surface font-black tracking-tight">Nearby Partner Vendors</h3>
            <button
              onClick={() => navigate('/explore')}
              className="text-body-sm text-primary font-bold hover:underline cursor-pointer"
            >
              See All
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
                <p className="font-bold text-on-surface text-[13.5px]">No nearby vendors yet</p>
                <p className="text-on-surface-variant text-[12px] max-w-[220px]">Explore the full directory to find partner stores near you</p>
                <button
                  onClick={() => navigate('/explore')}
                  className="mt-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-[12px] font-bold hover:bg-primary/15 transition-colors cursor-pointer"
                >
                  Browse Explore
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
                    <span className="bg-primary/10 text-primary font-label-mono text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase">FLAT {vendor.cashbackRate}% CASHBACK</span>
                    <h4 className="font-title-md text-on-surface font-bold text-[14px] pt-0.5 leading-tight">{vendor.storeName}</h4>
                    <div className="flex items-center gap-xs text-caption text-on-surface-variant text-[11px]">
                      <span className="material-symbols-outlined text-[12px]">distance</span>
                      {location && vendor.location?.coordinates ?
                        `${calculateDistance(location.lat, location.lng, vendor.location.coordinates[1], vendor.location.coordinates[0])} km away`
                        : 'Nearby'}
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
