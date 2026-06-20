import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

export default function StorefrontPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('catalog');

  const initialProducts = [
    { id: 1, name: "Signature Dress", price: "₹2,499", category: "Bestsellers", isHighlight: true, img: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=300&q=80" },
    { id: 2, name: "Leather Tote", price: "₹3,999", category: "Bestsellers", isHighlight: true, img: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=300&q=80" },
    { id: 3, name: "Classic Blazer", price: "₹4,500", category: "New Arrivals", isHighlight: false, img: "https://images.unsplash.com/photo-1591369822096-bbcdd8dc4500?auto=format&fit=crop&w=300&q=80" },
  ];

  const initialMedia = [
    { id: 1, type: "image", url: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=400&q=80" },
    { id: 2, type: "image", url: "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=400&q=80" },
    { id: 3, type: "video", url: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=400&q=80" },
  ];

  const initialPromotions = [
    { id: 1, title: "Welcome Reward Boost", description: "Extra 5% cashback on your first payment this week.", type: "percent" },
    { id: 2, title: "Spend Bonus", description: "Get flat ₹10 reward when spending over ₹100.", type: "redeem" }
  ];

  const [products, setProducts] = useState(initialProducts);
  const [mediaList, setMediaList] = useState(initialMedia);
  const [promotions, setPromotions] = useState(initialPromotions);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductImg, setNewProductImg] = useState('');

  const [showOfferModal, setShowOfferModal] = useState(false);
  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferDescription, setNewOfferDescription] = useState('');
  const [newOfferType, setNewOfferType] = useState('percent');

  const handleDeleteProduct = (id) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const handleToggleHighlight = (id) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        return { ...p, isHighlight: !p.isHighlight };
      }
      return p;
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProductImg(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProduct = (e) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductPrice) return;

    const newProduct = {
      id: Date.now(),
      name: newProductName,
      price: `₹${Number(newProductPrice).toLocaleString('en-IN')}`,
      category: 'Bestsellers',
      isHighlight: false,
      img: newProductImg || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=300&q=80'
    };

    setProducts([newProduct, ...products]);
    setNewProductName('');
    setNewProductPrice('');
    setNewProductImg('');
    setShowAddModal(false);
  };

  const handleMediaUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newMediaItem = {
          id: Date.now(),
          type: file.type.startsWith('video/') ? 'video' : 'image',
          url: reader.result
        };
        setMediaList([...mediaList, newMediaItem]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteMedia = (id) => {
    setMediaList(mediaList.filter(m => m.id !== id));
  };

  const handleAddOffer = (e) => {
    e.preventDefault();
    if (!newOfferTitle.trim() || !newOfferDescription.trim()) return;

    const newOffer = {
      id: Date.now(),
      title: newOfferTitle,
      description: newOfferDescription,
      type: newOfferType
    };

    setPromotions([newOffer, ...promotions]);
    setNewOfferTitle('');
    setNewOfferDescription('');
    setNewOfferType('percent');
    setShowOfferModal(false);
  };

  const handleDeleteOffer = (id) => {
    setPromotions(promotions.filter(p => p.id !== id));
  };

  return (
    <div className="animate-reveal text-left flex flex-col h-[calc(100vh-100px)] md:h-[calc(100vh-40px)]" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      
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
            <div className="flex justify-between items-center bg-white p-3 rounded-2xl border border-outline-variant/10 shadow-sm">
              <span className="text-[13px] font-bold text-on-surface-variant">Store Catalog ({products.length})</span>
              <button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 bg-primary text-white px-3.5 py-1.5 rounded-xl font-bold text-[12px] hover:bg-primary/95 active:scale-95 transition-all cursor-pointer shadow-sm shadow-primary/25"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span> Add Catalog
              </button>
            </div>
            
            <div className="space-y-3">
              {products.map(product => (
                <div key={product.id} className="flex gap-4 p-3 bg-white rounded-2xl border border-outline-variant/10 shadow-sm relative animate-reveal">
                  <img src={product.img} alt={product.name} className="w-20 h-20 object-cover rounded-xl bg-surface-container" />
                  <div className="flex-1 py-1">
                    <p className="text-[15px] font-bold text-on-surface leading-tight">{product.name}</p>
                    <p className="text-[14px] text-primary font-black mt-1">{product.price}</p>
                    
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-[11px] font-bold text-on-surface-variant">Highlight</span>
                        <div 
                          onClick={() => handleToggleHighlight(product.id)}
                          className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors ${product.isHighlight ? 'bg-primary' : 'bg-surface-variant'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${product.isHighlight ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                      </label>
                      <button 
                        onClick={() => handleDeleteProduct(product.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {products.length === 0 && (
                <div className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">storefront</span>
                  <p className="font-bold text-[16px]">Catalog is empty</p>
                  <p className="text-[14px]">Click 'Add Catalog' to list products.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div className="space-y-4 animate-reveal">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-[18px] font-extrabold text-on-surface">Store Gallery</h3>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <label className="aspect-square rounded-2xl border-2 border-dashed border-primary/30 flex flex-col items-center justify-center text-primary hover:bg-primary/5 transition-colors active:scale-95 cursor-pointer">
                <span className="material-symbols-outlined text-[32px]">add_photo_alternate</span>
                <span className="text-[11px] font-bold mt-1">Upload</span>
                <input 
                  type="file" 
                  accept="image/*,video/*" 
                  onChange={handleMediaUpload} 
                  className="hidden" 
                />
              </label>
              
              {mediaList.map(item => (
                <div key={item.id} className="relative aspect-square rounded-2xl overflow-hidden bg-surface-container group animate-reveal">
                  {item.type === 'video' ? (
                    <video src={item.url} className="w-full h-full object-cover" controls={false} muted loop playsInline />
                  ) : (
                    <img src={item.url} alt="Gallery" className="w-full h-full object-cover" />
                  )}
                  {item.type === 'video' && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                      <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  )}
                  <button 
                    onClick={() => handleDeleteMedia(item.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
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
              <button 
                onClick={() => setShowOfferModal(true)}
                className="flex items-center gap-1.5 bg-primary text-white px-3.5 py-1.5 rounded-xl font-bold text-[12px] shadow-sm hover:shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">campaign</span> Create Offer
              </button>
            </div>

            <div className="space-y-3">
              {promotions.map(promo => {
                const isPercent = promo.type === 'percent';
                return (
                  <div key={promo.id} className="p-4 bg-white border border-outline-variant/10 rounded-2xl flex items-center gap-4 relative animate-reveal">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isPercent ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface'
                    }`}>
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {isPercent ? 'percent' : 'redeem'}
                      </span>
                    </div>
                    <div className="text-left space-y-0.5 flex-1 pr-6">
                      <p className="font-title-md font-extrabold text-[14px] leading-snug">{promo.title}</p>
                      <p className="font-caption text-[11px] text-on-surface-variant leading-tight">{promo.description}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteOffer(promo.id)}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-on-surface-variant cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                );
              })}

              {promotions.length === 0 && (
                <div className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">campaign</span>
                  <p className="font-bold text-[16px]">No active offers</p>
                  <p className="text-[14px]">Click 'Create Offer' to launch promotions.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Add Catalog Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
          <form onSubmit={handleAddProduct} className="bg-white w-full max-w-[320px] rounded-3xl p-6 shadow-2xl relative mx-auto text-left space-y-4">
            <button 
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setNewProductImg('');
              }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            
            <h3 className="font-display font-black text-[20px] text-on-surface">Add Catalog Item</h3>
            
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase">Product Name</label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Silk Scarf"
                  className="w-full h-11 px-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-[13.5px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase">Price (₹)</label>
                <input
                  type="number"
                  required
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full h-11 px-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-[13.5px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase">Product Image</label>
                
                {newProductImg ? (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-outline-variant/10 shadow-sm">
                    <img src={newProductImg} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      type="button" 
                      onClick={() => setNewProductImg('')}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
                    >
                      <span className="material-symbols-outlined text-[12px]">close</span>
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-20 rounded-xl border-2 border-dashed border-primary/20 bg-[#F3F4F6] hover:bg-[#eaecef] transition-colors flex flex-col items-center justify-center cursor-pointer text-primary">
                    <span className="material-symbols-outlined text-[24px]">add_photo_alternate</span>
                    <span className="text-[11px] font-bold mt-1">Choose from Gallery</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                  </label>
                )}
              </div>
            </div>

            <button 
              type="submit"
              className="w-full h-12 bg-primary text-white rounded-xl font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1 shadow-md shadow-primary/25 cursor-pointer mt-4"
            >
              Add to Catalog
            </button>
          </form>
        </div>,
        document.body
      )}

      {/* Create Offer Modal */}
      {showOfferModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
          <form onSubmit={handleAddOffer} className="bg-white w-full max-w-[320px] rounded-3xl p-6 shadow-2xl relative mx-auto text-left space-y-4">
            <button 
              type="button"
              onClick={() => setShowOfferModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            
            <h3 className="font-display font-black text-[20px] text-on-surface">Create Promotion</h3>
            
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase">Offer Title</label>
                <input
                  type="text"
                  required
                  value={newOfferTitle}
                  onChange={(e) => setNewOfferTitle(e.target.value)}
                  placeholder="e.g. Weekend Discount"
                  className="w-full h-11 px-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-[13.5px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase">Offer Description</label>
                <textarea
                  required
                  value={newOfferDescription}
                  onChange={(e) => setNewOfferDescription(e.target.value)}
                  placeholder="e.g. Get 10% cashback on all orders above ₹500"
                  className="w-full min-h-16 p-3 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-[13.5px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase">Offer Type Icon</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setNewOfferType('percent')}
                    className={`flex-1 h-11 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1 border transition-all ${
                      newOfferType === 'percent'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white border-outline-variant/10 text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">percent</span> Cashback
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewOfferType('redeem')}
                    className={`flex-1 h-11 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1 border transition-all ${
                      newOfferType === 'redeem'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white border-outline-variant/10 text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">redeem</span> Gift Box
                  </button>
                </div>
              </div>
            </div>

            <button 
              type="submit"
              className="w-full h-12 bg-primary text-white rounded-xl font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1 shadow-md shadow-primary/25 cursor-pointer mt-4"
            >
              Launch Offer
            </button>
          </form>
        </div>,
        document.body
      )}

    </div>
  );
}
