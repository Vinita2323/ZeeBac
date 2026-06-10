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
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAvcE1GSOY93nQcWNrKv_i4LjarvfisOzTMM0s4I1rj4yr2GdHDGpD62jU3EqvDDmgT9g3MbEIzdoeWRu73EkctS86m6I"
    }
  ];

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm">
        <img 
          alt="Zeebac Logo" 
          className="h-[40px] object-contain" 
          src="/Logo (6).png"
        />
        <button className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-low">
          <span className="material-symbols-outlined text-[24px]">notifications</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
        {/* Wallet Balance Card */}
        <div className="btn-primary-gradient text-white rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 font-display text-[120px] translate-x-8 -translate-y-6 pointer-events-none select-none font-black">
            $
          </div>
          <div className="relative z-10 flex flex-col space-y-3">
            <div className="flex justify-between items-center">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">Reward Balance</p>
                <h2 className="text-[30px] font-display font-black leading-none tracking-tight">$1,284.50</h2>
              </div>
              <div className="flex items-center gap-[2px] text-[11px] text-green-300 font-bold bg-white/10 rounded-full py-1 px-2.5">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                +$45.20 today
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
              <button 
                onClick={() => navigate('/wallet')}
                className="bg-white text-primary rounded-lg py-1.5 text-[13px] font-bold text-center hover:bg-white/95 active:scale-[0.97] transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                Wallet
              </button>
              <button 
                onClick={() => navigate('/passbook')}
                className="bg-white/20 text-white rounded-lg py-1.5 text-[13px] font-bold text-center hover:bg-white/25 active:scale-[0.97] transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                Passbook
              </button>
            </div>
          </div>
        </div>

        {/* Request Cashback Quick CTA */}
        <div 
          onClick={() => navigate('/request-cashback')}
          className="w-full bg-white border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.98] cursor-pointer group"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[24px]">add_shopping_cart</span>
            </div>
            <div className="text-left">
              <p className="font-title-md text-on-surface font-extrabold text-body-sm leading-none">Request Cashback</p>
              <p className="font-caption text-[11px] text-on-surface-variant mt-1.5">Submit bill receipt to claim your cashback rewards</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline group-hover:translate-x-0.5 transition-transform text-body-lg">arrow_forward_ios</span>
        </div>

        {/* Promo Referral Widget Banner */}
        <div className="bg-secondary-fixed/30 border border-secondary/20 rounded-2xl p-md flex items-center gap-md relative overflow-hidden">
          <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>card_giftcard</span>
          </div>
          <div className="flex-grow space-y-0.5">
            <p className="font-title-md text-on-surface font-extrabold text-body-sm">Refer Friends, Get $25</p>
            <p className="font-caption text-[11px] text-on-surface-variant">Earn cash reward when your friends transact</p>
          </div>
          <span className="material-symbols-outlined text-secondary hover:translate-x-0.5 transition-transform cursor-pointer">arrow_forward_ios</span>
        </div>

        {/* Nearby Vendors List */}
        <div className="space-y-md">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-title-md text-on-surface font-extrabold">Nearby Partner Vendors</h3>
            <button 
              onClick={() => navigate('/explore')}
              className="text-body-sm text-primary font-bold hover:underline cursor-pointer"
            >
              See All
            </button>
          </div>

          <div className="grid grid-cols-1 gap-md">
            {vendors.map((vendor) => (
              <div 
                key={vendor.id}
                onClick={() => handleVendorClick(vendor)}
                className="glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-shadow flex items-center p-sm border border-outline-variant/30 gap-md"
              >
                <img 
                  alt={vendor.name} 
                  className="w-20 h-20 rounded-xl object-cover" 
                  src={vendor.img}
                />
                <div className="flex-grow text-left space-y-0.5">
                  <span className="bg-primary/10 text-primary font-label-mono text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">{vendor.cashback}</span>
                  <h4 className="font-title-md text-on-surface font-bold text-body-lg pt-1">{vendor.name}</h4>
                  <div className="flex items-center gap-xs text-caption text-on-surface-variant text-[12px]">
                    <span className="material-symbols-outlined text-[14px]">distance</span>
                    {vendor.distance}
                    <span>•</span>
                    {vendor.tag}
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline">chevron_right</span>
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
