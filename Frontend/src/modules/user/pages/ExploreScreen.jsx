import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';

export default function ExploreScreen() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMap, setShowMap] = useState(false);

  const categories = ['All', 'Fashion', 'Groceries', 'Dining', 'Tech', 'Travel'];

  const vendors = [
    {
      id: 1,
      name: "Noir Concept Store",
      cashback: "UP TO 15% CASHBACK",
      rating: "4.9 (1.2k)",
      distance: "0.8 miles away",
      tag: "Premium Fashion",
      category: "Fashion",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAB0zwhnN-NjCJ7KBgLqBPBtZYKaQG19lm2DTBcnju7jVqU0FDx8tif4eFXUN-wuULWNus63OxRjxkqdPrtimsYDbHvQ5USEJzCDtUS1e-7mkikEbTzR_U9kb2s2o6UOr9etrYYr2-N5lnGk_T1BePpvGKXr8OZrc_xGZz-_JukPTCrwDPb5ZKLeyy6PjE2nwXVTBH5l-wBC6_ZMf0f9MgDNgEYpBYKN39M0d-u-oyilHFf-xEgjHRisFUN3iTUlUiNZulEamwbsU8"
    },
    {
      id: 2,
      name: "Fresh Foods Organic",
      cashback: "FLAT 8% CASHBACK",
      rating: "4.8 (2.4k)",
      distance: "1.5 miles away",
      tag: "Organic Groceries",
      category: "Groceries",
      img: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&h=300&q=80"
    },
    {
      id: 3,
      name: "L'Artusi Restaurant",
      cashback: "FLAT 10% CASHBACK",
      rating: "5.0 (980)",
      distance: "2.1 miles away",
      tag: "Italian Dining",
      category: "Dining",
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDL3ZuesRdA3RCqE0U3TVWBMU61p_gIF_-C-AHDy1Wqjcb0X1v1oZLY8FMc4HH2xYcQwh-Re_Dv95-zNxQqVOB_wSNgJb1QLYR6Q2uqKRTlts9Z8OC0IPFxlaty2NWDFsajBnaRpGg1z5ABbEQrSMmOPBtWJRBziIHfa2b05nQIcc7Yo_TcQXqmftq9knshKOcTTmIDmzbgg4yUcfbAaFqM4v0iD0eWdrCOi8LWPlf0UDoIoQpACJGX9eo6jKrUNV1-iWwcqOwpS1g"
    }
  ];

  // Filtering logic
  const filteredVendors = vendors.filter(vendor => {
    const matchesCategory = activeCategory === 'All' || vendor.category === activeCategory;
    const matchesSearch = vendor.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          vendor.tag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleVendorClick = (vendor) => {
    navigate('/vendor-detail', { state: { vendor } });
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Top Search bar Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-4 py-2 border-b border-outline-variant/10 shadow-sm space-y-2">
        <div className="flex items-center gap-xs">
          <div className="flex-grow relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
            <input 
              className="w-full h-11 pl-10 pr-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-body-lg font-body-lg placeholder:text-outline transition-all"
              placeholder="Search local shops and brands..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowMap(!showMap)}
            className="w-11 h-11 bg-primary text-white rounded-xl flex items-center justify-center shadow-md cursor-pointer hover:opacity-95"
          >
            <span className="material-symbols-outlined text-[20px]">{showMap ? 'list' : 'map'}</span>
          </button>
        </div>

        {/* Categories Carousel */}
        <div className="flex gap-sm overflow-x-auto pb-1 scroll-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full font-title-md text-[13px] whitespace-nowrap cursor-pointer transition-colors ${
                activeCategory === cat 
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content body */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg relative text-left">
        
        {showMap ? (
          /* Mock Map representation */
          <div className="w-full h-[450px] glass-card rounded-3xl overflow-hidden relative shadow-lg flex items-center justify-center animate-reveal">
            <img 
              alt="Map view" 
              className="w-full h-full object-cover" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDR6lU_paT8suC7Y0iuxSdd3IQutJ4oAMJoxi8Hld2bUHqknZu3WDUqoyqEhC_MFk9jyqJul5eZn7HsXPkmdKlzf3x8Z2DukeQBh76A8_-OOA2OyZt3qLNpgMzq_0k2UMiu9tLuKY9MY6ExlYAdno7W8RHZhbnfr0GPMITMoi2zCDxNinsgiECCW1KltHrs5rEK5lS1Q03EqFYvjyg5hlIIJA9TqONZtt7_wYzQ4JLOYhP_ZDOt_1wtkpmouL4orX0YGmaEoaCoUhZb"
            />
            {filteredVendors.map((vendor, idx) => (
              <div 
                key={vendor.id} 
                onClick={() => handleVendorClick(vendor)}
                className={`absolute w-8 h-8 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform ${
                  idx === 0 ? 'top-1/4 left-1/3' : idx === 1 ? 'bottom-1/3 right-1/4' : 'top-1/2 right-1/3'
                }`}
              >
                <span className="material-symbols-outlined text-primary text-3xl animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
              </div>
            ))}
          </div>
        ) : (
          /* List View Representation */
          <div className="space-y-md">
            {filteredVendors.length > 0 ? (
              filteredVendors.map((vendor) => (
                <div 
                  key={vendor.id}
                  onClick={() => handleVendorClick(vendor)}
                  className="glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-shadow border border-outline-variant/30 flex flex-col"
                >
                  <img 
                    alt={vendor.name} 
                    className="w-full h-44 object-cover" 
                    src={vendor.img}
                  />
                  <div className="p-md space-y-xs">
                    <div className="flex items-center justify-between">
                      <span className="bg-primary/10 text-primary font-label-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">{vendor.cashback}</span>
                      <div className="flex items-center gap-[2px] text-amber-500 font-bold text-body-sm">
                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        {vendor.rating}
                      </div>
                    </div>
                    <h3 className="font-display text-title-md text-on-surface font-extrabold pt-1">{vendor.name}</h3>
                    <div className="flex items-center justify-between text-caption text-on-surface-variant text-[12px]">
                      <div className="flex items-center gap-xs">
                        <span className="material-symbols-outlined text-[14px]">distance</span>
                        {vendor.distance}
                      </div>
                      <span>{vendor.tag}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 text-center space-y-xs">
                <span className="material-symbols-outlined text-outline text-[48px]">storefront</span>
                <p className="font-title-md text-on-surface font-bold">No vendors found</p>
                <p className="text-body-sm text-on-surface-variant">Try searching for other categories or names</p>
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
