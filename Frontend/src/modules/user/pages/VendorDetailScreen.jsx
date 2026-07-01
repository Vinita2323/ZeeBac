import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import OverviewTab from '../components/vendor-detail/OverviewTab';
import ShopTab from '../components/vendor-detail/ShopTab';
import PhotosTab from '../components/vendor-detail/PhotosTab';
import ReviewsTab from '../components/vendor-detail/ReviewsTab';

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
    shopType: "Chain & Brand",
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
          {/* Shop Type Badge */}
          {vendor.shopType && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm ${
              vendor.shopType === 'Chain & Brand'
                ? 'bg-blue-500/30 text-blue-100 border border-blue-300/40'
                : 'bg-green-500/30 text-green-100 border border-green-300/40'
            }`}>
              <span className="material-symbols-outlined text-[11px]">
                {vendor.shopType === 'Chain & Brand' ? 'apartment' : 'storefront'}
              </span>
              {vendor.shopType === 'Chain & Brand' ? '🏢 Chain & Brand' : '🏪 Independent Store'}
            </span>
          )}
        </div>
      </header>

      {/* Tabs Menu Navigation */}
      <nav className="bg-white border-b border-outline-variant/20 flex overflow-x-auto select-none sticky top-0 z-30 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {['overview', 'shop', 'photos', 'reviews'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3.5 font-title-md text-[14px] capitalize cursor-pointer border-b-2 text-center whitespace-nowrap transition-all ${
              activeTab === tab 
                ? 'border-primary text-primary font-bold' 
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest'
            }`}
          >
            {tab === 'photos' ? 'Photos & Videos' : tab}
          </button>
        ))}
      </nav>

      {/* Tab Pages content */}
      <main className="max-w-[440px] mx-auto w-full px-container-margin py-lg text-left">
        {activeTab === 'overview' && <OverviewTab vendor={vendor} />}
        {activeTab === 'shop' && <ShopTab />}
        {activeTab === 'photos' && <PhotosTab />}
        {activeTab === 'reviews' && <ReviewsTab />}
      </main>

    </div>
  );
}
