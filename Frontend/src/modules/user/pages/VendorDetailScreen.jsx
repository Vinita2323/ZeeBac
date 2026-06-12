import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function VendorDetailScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isFavorite, setIsFavorite] = useState(false);

  const defaultVendor = {
    id: 1,
    name: "Noir Concept Store",
    cashback: "UP TO 15% CASHBACK",
    rating: "4.9 (1.2k)",
    distance: "0.8 miles away",
    tag: "Premium Fashion",
    address: "42nd Luxury Blvd, Metro City",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8"
  };

  const vendor = location.state?.vendor || defaultVendor;

  const handlePay = () => {
    navigate('/create-transaction', { state: { vendor } });
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface font-body-lg min-h-screen pb-12">
      
      {/* Hero Banner Section */}
      <header className="relative h-[280px] w-full overflow-hidden">
        <img 
          alt={vendor.name} 
          className="w-full h-full object-cover" 
          src={vendor.img}
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20"></div>
        
        {/* Navigation Bar inside Header */}
        <div className="absolute top-0 left-0 right-0 p-container-margin flex justify-between items-center z-20">
          <button 
            onClick={() => navigate(-1)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <button 
            onClick={() => setIsFavorite(!isFavorite)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white transition-transform active:scale-95 cursor-pointer"
          >
            <span 
              className={`material-symbols-outlined ${isFavorite ? 'text-red-500' : ''}`}
              style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
          </button>
        </div>

        {/* Vendor Name Text */}
        <div className="absolute bottom-6 left-6 right-6 text-left text-white space-y-xs">
          <span className="bg-primary text-white font-label-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">{vendor.cashback}</span>
          <h1 className="font-display text-headline-lg font-black tracking-tight">{vendor.name}</h1>
          <div className="flex items-center gap-xs text-[13px] text-white/80">
            <span className="material-symbols-outlined text-[14px]">distance</span>
            {vendor.distance}
            <span>•</span>
            {vendor.tag}
          </div>
        </div>
      </header>

      {/* Tabs Menu Navigation */}
      <nav className="bg-white border-b border-outline-variant/20 flex justify-around select-none">
        {['overview', 'offers', 'reviews'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-grow py-3 font-title-md text-[14px] capitalize cursor-pointer border-b-2 text-center transition-all ${
              activeTab === tab 
                ? 'border-primary text-primary font-bold' 
                : 'border-transparent text-on-surface-variant'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Tab Pages content */}
      <main className="max-w-[440px] mx-auto w-full px-container-margin py-lg text-left">
        {activeTab === 'overview' && (
          <div className="space-y-md animate-reveal">
            <div className="space-y-xs">
              <h3 className="font-display text-title-md font-extrabold text-on-surface">About</h3>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">
                Experience high-end design form factor and exclusive curation. Enjoy modern checkout convenience, premium customer support, and the highest rewards rates at {vendor.name} through Zeebac.
              </p>
            </div>
            
            <div className="space-y-xs pt-sm">
              <h3 className="font-display text-title-md font-extrabold text-on-surface">Store Information</h3>
              <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-outline">location_on</span>
                <span>{vendor.address || "42nd Luxury Blvd, Metro City"}</span>
              </div>
              <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-outline">schedule</span>
                <span>Open Daily: 09:00 AM - 10:00 PM</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'offers' && (
          <div className="space-y-md animate-reveal">
            <div className="p-md bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-md">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>percent</span>
              </div>
              <div className="text-left space-y-0.5">
                <p className="font-title-md font-extrabold text-primary text-body-sm">Welcome Reward Boost</p>
                <p className="font-caption text-[11px] text-on-surface-variant">Extra 5% cashback on your first payment this week.</p>
              </div>
            </div>

            <div className="p-md bg-secondary/5 border border-secondary/20 rounded-2xl flex items-center gap-md">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>redeem</span>
              </div>
              <div className="text-left space-y-0.5">
                <p className="font-title-md font-extrabold text-secondary text-body-sm">Spend Bonus</p>
                <p className="font-caption text-[11px] text-on-surface-variant">Get flat ₹10 reward when spending over ₹100.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-md animate-reveal">
            <div className="flex items-center gap-lg border-b border-outline-variant/10 pb-md">
              <div className="text-left">
                <h4 className="text-[36px] font-display font-black text-on-surface leading-none">{vendor.rating.split(' ')[0]}</h4>
                <p className="text-caption text-outline font-semibold tracking-wider">OUT OF 5</p>
              </div>
              <div className="flex-grow space-y-1">
                {[5, 4, 3, 2, 1].map((star, idx) => (
                  <div key={star} className="flex items-center gap-xs">
                    <span className="text-[10px] text-on-surface-variant w-2 font-bold">{star}</span>
                    <div className="flex-grow h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: idx === 0 ? '75%' : idx === 1 ? '18%' : '3%' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Individual Review item */}
            <div className="space-y-md">
              <div className="text-left space-y-xs border-b border-outline-variant/10 pb-sm">
                <div className="flex items-center justify-between">
                  <span className="font-title-md font-bold text-body-sm text-on-surface">Sophia Mitchell</span>
                  <span className="text-caption text-outline">Yesterday</span>
                </div>
                <div className="flex text-amber-400">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                </div>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  Beautiful curation! Paying via Zeebac was incredibly fast, and I instantly got my rewards credited. Highly recommend!
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
