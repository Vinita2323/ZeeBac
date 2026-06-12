import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';

export default function HomeScreen() {
  const navigate = useNavigate();

  const handleVendorClick = (vendor) => {
    navigate('/vendor-detail', { state: { vendor } });
  };

  const vendors = [
    {
      id: 1,
      name: "Noir Concept Store",
      cashback: "UP TO 15% CASHBACK",
      distance: "0.8 miles away",
      tag: "Premium Fashion",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8"
    },
    {
      id: 2,
      name: "Fresh Foods Organic",
      cashback: "FLAT 8% CASHBACK",
      distance: "1.5 miles away",
      tag: "Organic Groceries",
      img: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&h=300&q=80"
    }
  ];

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-2 flex items-center justify-between border-b border-outline-variant/10 shadow-sm">
        <img 
          alt="Zeebac Logo" 
          className="h-[56px] object-contain" 
          src="/Logo (6).png"
        />
        <button className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-low">
          <span className="material-symbols-outlined text-[24px]">notifications</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div 
            onClick={() => navigate('/wallet')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#D4E9FC] hover:bg-[#C2E0FB] text-[#0F4C81] shadow-sm transition-all active:scale-[0.97] cursor-pointer h-22"
          >
            <span className="material-symbols-outlined text-[26px] mb-1">balance</span>
            <span className="text-[12px] font-extrabold text-center leading-tight text-[#0F4C81]">Check<br/>Balance</span>
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
            className="relative w-30 h-30 rounded-full bg-gradient-to-b from-[#5c10bd] to-[#2c006b] flex items-center justify-center shadow-lg hover:shadow-xl active:scale-[0.95] transition-all duration-150 cursor-pointer overflow-hidden border border-white/10 group"
          >
            {/* Glass Highlight Sheen */}
            <div className="absolute top-0 left-0 w-full h-[50%] bg-gradient-to-b from-white/20 to-transparent rounded-t-full pointer-events-none" />
            
            {/* Glossy radial gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />

            {/* Inner Blob Shape */}
            <div 
              className="w-[86px] h-[86px] bg-gradient-to-br from-[#a67cff] to-[#7c4dff] shadow-md flex items-center justify-center p-2.5 rotate-[-8deg] transition-transform duration-300 group-hover:scale-105" 
              style={{ borderRadius: '42% 58% 70% 30% / 45% 45% 55% 55%' }}
            >
              <span className="font-display text-[13px] font-black text-white leading-tight tracking-tight text-center select-none">
                Scan &<br/>Request
              </span>
            </div>
          </button>
          
          <div className="text-on-surface-variant font-bold text-body-sm">Or</div>

          <button 
            onClick={() => navigate('/create-transaction')}
            className="w-full h-12 rounded-xl border border-[#420093] text-[#420093] bg-white flex items-center justify-center gap-2 hover:bg-[#420093]/5 active:scale-[0.98] transition-all cursor-pointer font-bold text-body-md"
          >
            <span className="material-symbols-outlined text-[#420093] text-[20px]">contact_phone</span>
            Enter mobile/ID
          </button>
        </div>

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
            {vendors.map((vendor) => (
              <div 
                key={vendor.id}
                onClick={() => handleVendorClick(vendor)}
                className="glass-card rounded-xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-shadow flex items-center p-2 border border-outline-variant/30 gap-3"
              >
                <img 
                  alt={vendor.name} 
                  className="w-14 h-14 rounded-lg object-cover" 
                  src={vendor.img}
                />
                <div className="flex-grow text-left space-y-0.5">
                  <span className="bg-primary/10 text-primary font-label-mono text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase">{vendor.cashback}</span>
                  <h4 className="font-title-md text-on-surface font-bold text-[14px] pt-0.5 leading-tight">{vendor.name}</h4>
                  <div className="flex items-center gap-xs text-caption text-on-surface-variant text-[11px]">
                    <span className="material-symbols-outlined text-[12px]">distance</span>
                    {vendor.distance}
                    <span>•</span>
                    {vendor.tag}
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}
