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
      shopType: "Chain & Brand",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8"
    },
    {
      id: 2,
      name: "Fresh Foods Organic",
      cashback: "FLAT 8% CASHBACK",
      distance: "1.5 miles away",
      tag: "Organic Groceries",
      shopType: "Independent Store",
      img: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&h=300&q=80"
    }
  ];

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
                  {/* Shop Type Badge */}
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    vendor.shopType === 'Chain & Brand'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    <span className="material-symbols-outlined text-[10px]">
                      {vendor.shopType === 'Chain & Brand' ? 'apartment' : 'storefront'}
                    </span>
                    {vendor.shopType === 'Chain & Brand' ? '🏢 Chain & Brand' : '🏪 Independent Store'}
                  </span>
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
