import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import BottomNavBar from '../components/common/BottomNavBar';
import { calculateDistance } from '../../../utils/distance';

export default function HomeScreen() {
  const navigate = useNavigate();

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
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      <header className="sticky top-0 z-50 bg-white px-5 py-2 flex items-center justify-between border-b border-outline-variant/10 shadow-sm">
        <img 
          alt="Zeebac Logo" 
          className="h-[68px] object-contain cursor-pointer" 
          src="/Logo (6).png"
          onClick={() => navigate('/home')}
        />
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/chat')} className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[24px]">chat_bubble</span>
          </button>
          <button className="relative text-[#420093] hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[24px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div 
            onClick={() => navigate('/wallet')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#D4E9FC] hover:bg-[#C2E0FB] text-[#0F4C81] shadow-sm transition-all active:scale-[0.97] cursor-pointer h-22"
          >
            <span className="material-symbols-outlined text-[26px] mb-1">account_balance_wallet</span>
            <span className="text-[12px] font-extrabold text-center leading-tight text-[#0F4C81]">Rewards<br/>Wallet</span>
          </div>

          <div 
            onClick={() => navigate('/create-transaction')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#D1F2D9] hover:bg-[#BEEBCA] text-[#1B5E20] shadow-sm transition-all active:scale-[0.97] cursor-pointer h-22"
          >
            <span className="material-symbols-outlined text-[26px] mb-1">swap_horiz</span>
            <span className="text-[12px] font-extrabold text-center leading-tight text-[#1B5E20]">Withdraw /<br/>Transfer Money</span>
          </div>
        </div>

        {/* Scan & Request Section */}
        <div className="flex flex-col items-center justify-center py-2 space-y-3">
          <button 
            onClick={() => navigate('/scan')}
            className="relative w-full max-w-[180px] aspect-square rounded-[24px] bg-white flex flex-col items-center justify-center shadow-lg hover:shadow-xl active:scale-[0.98] transition-all duration-200 cursor-pointer border border-outline-variant/20 group mx-auto"
          >
            {/* Soft Glowing Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-[24px] pointer-events-none"></div>

            {/* Scanner Reticle Corners */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-[#420093] rounded-tl-[10px] transition-all duration-300 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 pointer-events-none"></div>
            <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-[#420093] rounded-tr-[10px] transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 pointer-events-none"></div>
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-[#420093] rounded-bl-[10px] transition-all duration-300 group-hover:-translate-x-0.5 group-hover:translate-y-0.5 pointer-events-none"></div>
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-[#420093] rounded-br-[10px] transition-all duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5 pointer-events-none"></div>

            {/* Huge Central Icon & Text */}
            <div className="relative z-10 flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300">
               <div className="w-18 h-18 rounded-full bg-[#420093]/10 flex items-center justify-center mb-2">
                 <span className="material-symbols-outlined text-[40px] text-[#420093]">qr_code_scanner</span>
               </div>
               <span className="text-[#420093] font-display font-black text-[14px] tracking-wide uppercase">Scan & Pay</span>
            </div>
          </button>
          
          <div className="text-on-surface-variant font-bold text-body-sm">Or</div>

          <button 
            onClick={() => navigate('/find-vendor')}
            className="w-full h-12 rounded-xl border border-[#420093] text-[#420093] bg-white flex items-center justify-center gap-2 hover:bg-[#420093]/5 active:scale-[0.98] transition-all cursor-pointer font-bold text-body-md"
          >
            <span className="material-symbols-outlined text-[#420093] text-[20px]">contact_phone</span>
            Enter mobile/ID
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
              <p className="text-center text-on-surface-variant py-4 text-sm font-medium">Loading vendors...</p>
            ) : vendors.length === 0 ? (
              <p className="text-center text-on-surface-variant py-4 text-sm font-medium">No nearby vendors found</p>
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
