import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserAPI, API_BASE_URL } from '../../../services/api';
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
    _id: 1,
    storeName: "Noir Concept Store",
    cashbackRate: 15,
    category: "Fashion",
    address: "42nd Luxury Blvd, Metro City",
    storeLogo: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8",
    zeebacId: "ZBV-0000"
  };

  const [vendor, setVendor] = useState(location.state?.vendor || defaultVendor);

  useEffect(() => {
    const fetchFullVendor = async () => {
      const zeebacId = location.state?.vendor?.zeebacId || defaultVendor.zeebacId;
      if (!zeebacId) return;
      try {
        const res = await UserAPI.getVendorDetails(zeebacId);
        if (res.success) {
          setVendor(res.data);
        }
      } catch (err) {
        console.error('Failed to load full vendor details');
      }
    };
    fetchFullVendor();
  }, [location.state]);
  // Check if it's already a favorite
  useEffect(() => {
    const checkFavoriteStatus = async () => {
      try {
        const res = await UserAPI.getFavorites();
        if (res.success && vendor._id) {
          const favIds = res.data.map(v => v._id.toString());
          setIsFavorite(favIds.includes(vendor._id.toString()));
        }
      } catch (err) {
        console.error('Failed to load favorites');
      }
    };
    checkFavoriteStatus();
  }, [vendor._id]);

  const handleFavoriteToggle = async () => {
    try {
      const res = await UserAPI.toggleFavorite(vendor._id);
      setIsFavorite(res.isFavorite);
    } catch (err) {
      console.error('Failed to toggle favorite');
      // Optimistic fallback
      setIsFavorite(!isFavorite);
    }
  };

  const handlePay = () => {
    navigate('/create-transaction', { state: { vendor } });
  };

  return (
    <div className="mesh-gradient text-on-surface font-body-lg min-h-screen pb-12">

      {/* Hero Banner Section */}
      <header className="relative h-[280px] w-full overflow-hidden bg-surface-container-high flex items-center justify-center">
        {vendor.storeLogo || vendor.profilePic ? (
          <img
            alt={vendor.storeName}
            className="w-full h-full object-cover"
            src={(vendor.storeLogo || vendor.profilePic).startsWith('http') || (vendor.storeLogo || vendor.profilePic).startsWith('data:') ? (vendor.storeLogo || vendor.profilePic) : `${API_BASE_URL}${vendor.storeLogo || vendor.profilePic}`}
          />
        ) : (
          <span className="material-symbols-outlined text-6xl text-on-surface-variant">store</span>
        )}
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
            onClick={handleFavoriteToggle}
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
          <span className="bg-primary text-white font-label-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">FLAT {vendor.cashbackRate}% CASHBACK</span>
          <h1 className="font-display text-headline-lg font-black tracking-tight">{vendor.storeName}</h1>
          <div className="flex items-center gap-xs text-[13px] text-white/80">
            <span className="material-symbols-outlined text-[14px]">distance</span>
            0.8 miles away
            <span>•</span>
            {vendor.category}
          </div>
        </div>
      </header>

      {/* Tabs Menu Navigation */}
      <nav className="bg-white border-b border-outline-variant/20 flex overflow-x-auto select-none sticky top-0 z-30 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {['overview', 'shop', 'photos', 'reviews'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3.5 font-title-md text-[14px] capitalize cursor-pointer border-b-2 text-center whitespace-nowrap transition-all ${activeTab === tab
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest'
              }`}
          >
            {tab === 'photos' ? 'Photos & Videos' : tab}
          </button>
        ))}
      </nav>

      {/* Tab Pages content */}
      <main className="app-container px-container-margin py-lg text-left space-y-4">
        {/* Inactive Store / Cashback Blocked Warning Banner */}
        {vendor.isStoreInactive && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600 text-[22px] flex-shrink-0">storefront</span>
            <div>
              <h4 className="text-[13px] font-bold text-red-900">Store is currently inactive/hidden</h4>
              <p className="text-[12px] text-red-700 mt-0.5">
                This store is currently not active on ZeeBac. Cashback claims and online payments are temporarily unavailable.
              </p>
            </div>
          </div>
        )}

        {!vendor.isStoreInactive && vendor.cashbackBlocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[22px] flex-shrink-0">warning</span>
            <div>
              <h4 className="text-[13px] font-bold text-amber-900">Cashback Temporarily Unavailable</h4>
              <p className="text-[12px] text-amber-700 mt-0.5">
                {vendor.cashbackBlockedReason || 'Cashback is temporarily paused for this store. Please check back later.'}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'overview' && <OverviewTab vendor={vendor} />}
        {activeTab === 'shop' && <ShopTab vendor={vendor} />}
        {activeTab === 'photos' && <PhotosTab vendorId={vendor._id} />}
        {activeTab === 'reviews' && <ReviewsTab vendorId={vendor._id} vendor={vendor} />}
      </main>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-outline-variant/10 p-3 shadow-lg">
        <div className="app-container flex gap-3">
          <button
            onClick={() => {
              if (vendor.isStoreInactive) {
                alert('This store is currently inactive and not accepting payments.');
                return;
              }
              if (vendor.cashbackBlocked) {
                alert(vendor.cashbackBlockedReason || 'Cashback is temporarily unavailable for this store.');
              }
              navigate('/pay-vendor', { state: { vendor } });
            }}
            disabled={vendor.isStoreInactive}
            className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-2 font-title-md font-extrabold transition-all ${
              vendor.isStoreInactive
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#16082f] via-[#3b0764] to-[#6000da] text-white hover:from-[#16082f] hover:to-[#4c00b0] active:scale-[0.98] shadow-md shadow-[#6000da]/25 cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">payments</span>
            Pay Online
          </button>
          <button
            onClick={() => {
              if (vendor.isStoreInactive) {
                alert('This store is currently inactive and not accepting cashback claims.');
                return;
              }
              if (vendor.cashbackBlocked) {
                alert(vendor.cashbackBlockedReason || 'Cashback is temporarily unavailable for this store.');
                return;
              }
              navigate('/request-cashback', { state: { vendor } });
            }}
            disabled={vendor.isStoreInactive || vendor.cashbackBlocked}
            className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-2 font-title-md font-extrabold transition-colors ${
              vendor.isStoreInactive || vendor.cashbackBlocked
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-secondary text-white hover:bg-secondary/90 active:scale-[0.98] shadow-md cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            Upload Bill
          </button>
        </div>
      </div>

    </div>
  );
}
