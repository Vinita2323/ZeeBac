import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StorefrontPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('catalog');

  const products = [
    { id: 1, name: "Signature Dress", price: "₹2,499", category: "Bestsellers", isHighlight: true, img: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=300&q=80" },
    { id: 2, name: "Leather Tote", price: "₹3,999", category: "Bestsellers", isHighlight: true, img: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=300&q=80" },
    { id: 3, name: "Classic Blazer", price: "₹4,500", category: "New Arrivals", isHighlight: false, img: "https://images.unsplash.com/photo-1591369822096-bbcdd8dc4500?auto=format&fit=crop&w=300&q=80" },
  ];

  const media = [
    { id: 1, type: "image", url: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=400&q=80" },
    { id: 2, type: "image", url: "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=400&q=80" },
    { id: 3, type: "video", url: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=400&q=80" },
  ];

  return (
    <div className="animate-reveal text-left flex flex-col h-[calc(100vh-100px)] md:h-[calc(100vh-40px)]">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Storefront</span>
      </header>

      {/* Internal Tabs */}
      <nav className="bg-white border-b border-outline-variant/20 flex overflow-x-auto hide-scrollbar select-none sticky top-[72px] md:top-0 z-30 -mx-container-margin px-container-margin md:mx-0 md:px-0">
        {['catalog', 'media', 'promotions'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3.5 font-title-md text-[14px] capitalize cursor-pointer border-b-2 text-center whitespace-nowrap transition-all ${
              activeTab === tab 
                ? 'border-primary text-primary font-bold' 
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto py-6 space-y-6">
        
        {activeTab === 'catalog' && (
          <div className="space-y-4 animate-reveal">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-[18px] font-extrabold text-on-surface">Manage Products</h3>
              <button className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-bold text-[13px] hover:bg-primary/20 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[16px]">add</span> Add Item
              </button>
            </div>
            
            <div className="space-y-3">
              {products.map(product => (
                <div key={product.id} className="flex gap-4 p-3 bg-white rounded-2xl border border-outline-variant/10 shadow-sm relative">
                  <img src={product.img} alt={product.name} className="w-20 h-20 object-cover rounded-xl bg-surface-container" />
                  <div className="flex-1 py-1">
                    <p className="text-[15px] font-bold text-on-surface leading-tight">{product.name}</p>
                    <p className="text-[14px] text-primary font-black mt-1">{product.price}</p>
                    
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-[11px] font-bold text-on-surface-variant">Highlight</span>
                        <div className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors ${product.isHighlight ? 'bg-primary' : 'bg-surface-variant'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${product.isHighlight ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                      </label>
                      <button className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-red-50 hover:text-red-600 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div className="space-y-4 animate-reveal">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-[18px] font-extrabold text-on-surface">Store Gallery</h3>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <button className="aspect-square rounded-2xl border-2 border-dashed border-primary/30 flex flex-col items-center justify-center text-primary hover:bg-primary/5 transition-colors active:scale-95 cursor-pointer">
                <span className="material-symbols-outlined text-[32px]">add_photo_alternate</span>
                <span className="text-[11px] font-bold mt-1">Upload</span>
              </button>
              
              {media.map(item => (
                <div key={item.id} className="relative aspect-square rounded-2xl overflow-hidden bg-surface-container group">
                  <img src={item.url} alt="Gallery" className="w-full h-full object-cover" />
                  {item.type === 'video' && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  )}
                  <button className="absolute top-1 right-1 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'promotions' && (
          <div className="space-y-4 animate-reveal">
             <div className="flex justify-between items-center">
              <h3 className="font-display text-[18px] font-extrabold text-on-surface">Active Offers</h3>
              <button className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-lg font-bold text-[13px] shadow-sm hover:shadow-md active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[16px]">campaign</span> Create Offer
              </button>
            </div>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-md">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>percent</span>
              </div>
              <div className="text-left space-y-0.5 flex-1">
                <p className="font-title-md font-extrabold text-primary text-[14px]">Welcome Reward Boost</p>
                <p className="font-caption text-[11px] text-on-surface-variant">Extra 5% cashback on your first payment this week.</p>
              </div>
              <button className="w-8 h-8 rounded-full hover:bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            
            <div className="p-4 bg-white border border-outline-variant/20 rounded-2xl flex items-center gap-md">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>redeem</span>
              </div>
              <div className="text-left space-y-0.5 flex-1">
                <p className="font-title-md font-extrabold text-on-surface text-[14px]">Spend Bonus</p>
                <p className="font-caption text-[11px] text-on-surface-variant">Get flat ₹10 reward when spending over ₹100.</p>
              </div>
               <button className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
