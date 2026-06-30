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
  const [addProductStep, setAddProductStep] = useState(1);
  const [productForm, setProductForm] = useState({
    isBranded: null,
    brandLogo: null,
    brandName: '',
    brandCompany: '',
    brandWebsite: '',
    brandDescription: '',
    brandEmail: '',
    brandContact: '',
    cashbackPercentage: 10,
    image: null,
    name: '',
    category: '',
    sku: '',
    price: '',
    discountPrice: '',
    stock: '',
    description: '',
    highlight: false,
  });

  const updateProductForm = (key, value) => {
    setProductForm(prev => ({ ...prev, [key]: value }));
  };

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

  const handleProductFileChange = (e, key) => {
    const file = e.target.files[0];
    if (file) {
      updateProductForm(key, { name: file.name, type: file.type, size: file.size, mockUrl: URL.createObjectURL(file) });
    }
  };

  const handleAddProduct = (e) => {
    e.preventDefault();
    if (productForm.isBranded) {
      if (!productForm.brandName || !productForm.brandCompany) {
        alert("Brand Name and Company are required.");
        return;
      }
    }
    if (!productForm.name || !productForm.price) {
       alert("Product Name and Price are required.");
       return;
    }

    const newProduct = {
      id: Date.now(),
      name: productForm.name,
      price: `₹${Number(productForm.price).toLocaleString('en-IN')}`,
      category: productForm.category || 'Bestsellers',
      isHighlight: productForm.highlight,
      img: productForm.image ? productForm.image.mockUrl : 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=300&q=80'
    };

    setProducts([newProduct, ...products]);
    setShowAddModal(false);
    setAddProductStep(1);
    setProductForm({
      isBranded: null, brandLogo: null, brandName: '', brandCompany: '', brandWebsite: '', brandDescription: '', brandEmail: '', brandContact: '', cashbackPercentage: 10, image: null, name: '', category: '', sku: '', price: '', discountPrice: '', stock: '', description: '', highlight: false,
    });
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

      {/* Full-Screen Add Catalog Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col bg-gray-50 animate-reveal m-0 overflow-hidden">
          {/* Header */}
          <header className="flex-shrink-0 sticky top-0 z-30 bg-white border-b border-gray-100 flex items-center px-4 h-16 shadow-sm">
            <button 
              type="button"
              onClick={() => {
                if (addProductStep === 2) {
                  setAddProductStep(1);
                } else {
                  setShowAddModal(false);
                  setAddProductStep(1);
                }
              }}
              className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[#5B21B6]">{addProductStep === 2 ? 'arrow_back' : 'close'}</span>
            </button>
            <span className="font-display text-[18px] font-black ml-2 text-gray-900">Add Product</span>
            <span className="ml-auto text-[13px] font-bold text-[#5B21B6] bg-[#5B21B6]/10 px-3 py-1 rounded-full">
              Step {addProductStep}/2
            </span>
          </header>

          <main className="flex-1 overflow-y-auto w-full">
            <div className="max-w-[600px] mx-auto w-full pb-24">
              
              {addProductStep === 1 && (
                <div className="p-6 animate-reveal">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center mb-6">
                    <h2 className="text-[22px] font-black tracking-tight text-gray-900 mb-2">Is this a branded product?</h2>
                    <p className="text-[14px] text-gray-500">Select whether this product belongs to an existing or registered brand.</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div 
                      onClick={() => { updateProductForm('isBranded', true); setAddProductStep(2); }}
                      className="bg-white rounded-2xl p-6 shadow-sm border-2 border-transparent hover:border-[#5B21B6]/30 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-5 group"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-[28px]">sell</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-black text-[16px] text-gray-900 mb-1">Yes, this is a branded product</h3>
                        <p className="text-[13px] text-gray-500">This product belongs to a brand.</p>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 group-hover:text-[#5B21B6] transition-colors">chevron_right</span>
                    </div>

                    <div 
                      onClick={() => { updateProductForm('isBranded', false); setAddProductStep(2); }}
                      className="bg-white rounded-2xl p-6 shadow-sm border-2 border-transparent hover:border-[#5B21B6]/30 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-5 group"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-600 group-hover:scale-110 transition-transform group-hover:bg-[#5B21B6]/10 group-hover:text-[#5B21B6]">
                        <span className="material-symbols-outlined text-[28px]">inventory_2</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-black text-[16px] text-gray-900 mb-1">No, this is my own/local product</h3>
                        <p className="text-[13px] text-gray-500">This product is not associated with any brand.</p>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 group-hover:text-[#5B21B6] transition-colors">chevron_right</span>
                    </div>
                  </div>
                </div>
              )}

              {addProductStep === 2 && (
                <div className="p-4 md:p-6 space-y-6 animate-reveal">
                  
                  {productForm.isBranded && (
                    <>
                      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                        <h2 className="text-[18px] font-black text-gray-900 flex items-center gap-2 mb-4">
                          <span className="material-symbols-outlined text-[#5B21B6]">verified</span> Brand Information
                        </h2>
                        <StorefrontUploadCard label="Brand Logo *" file={productForm.brandLogo} onUpload={e => handleProductFileChange(e, 'brandLogo')} onRemove={() => updateProductForm('brandLogo', null)} />
                        <StorefrontFloatingInput label="Brand Name *" value={productForm.brandName} onChange={e => updateProductForm('brandName', e.target.value)} />
                        <StorefrontFloatingInput label="Brand Owner / Company Name *" value={productForm.brandCompany} onChange={e => updateProductForm('brandCompany', e.target.value)} />
                        <StorefrontFloatingInput label="Brand Website (Optional)" type="url" value={productForm.brandWebsite} onChange={e => updateProductForm('brandWebsite', e.target.value)} />
                        <StorefrontFloatingInput label="Brand Description" multiline value={productForm.brandDescription} onChange={e => updateProductForm('brandDescription', e.target.value)} />
                        <StorefrontFloatingInput label="Brand Email" type="email" value={productForm.brandEmail} onChange={e => updateProductForm('brandEmail', e.target.value)} />
                        <StorefrontFloatingInput label="Brand Contact Number" type="tel" value={productForm.brandContact} onChange={e => updateProductForm('brandContact', e.target.value.replace(/[^0-9]/g, ''))} />
                      </div>

                      <div className="bg-[#5B21B6]/5 rounded-2xl p-5 shadow-sm border border-[#5B21B6]/10 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6]">
                            <span className="material-symbols-outlined">payments</span>
                          </div>
                          <div>
                            <h2 className="text-[16px] font-black text-gray-900">Brand Cashback</h2>
                            <p className="text-[12px] text-gray-600">Choose the cashback % for customers.</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <input type="range" min="0" max="100" value={productForm.cashbackPercentage} onChange={e => updateProductForm('cashbackPercentage', e.target.value)} className="flex-1 accent-[#5B21B6] h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                          <div className="w-16 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-bold text-[#5B21B6]">
                            {productForm.cashbackPercentage}%
                          </div>
                        </div>
                        
                        <div className="bg-white rounded-xl p-3 flex justify-between items-center shadow-sm border border-[#5B21B6]/20">
                          <span className="text-[13px] font-bold text-gray-700">Live Preview: Customer Cashback</span>
                          <span className="text-[16px] font-black text-green-600">+{productForm.cashbackPercentage}%</span>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                    <h2 className="text-[18px] font-black text-gray-900 flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-[#5B21B6]">inventory_2</span> Product Details
                    </h2>
                    <StorefrontUploadCard label="Product Image *" file={productForm.image} onUpload={e => handleProductFileChange(e, 'image')} onRemove={() => updateProductForm('image', null)} />
                    <StorefrontFloatingInput label="Product Name *" value={productForm.name} onChange={e => updateProductForm('name', e.target.value)} />
                    
                    <div className="relative">
                      <select value={productForm.category} onChange={e => updateProductForm('category', e.target.value)} className="w-full h-14 px-4 bg-white border-2 rounded-lg outline-none appearance-none font-medium transition-all text-[15px] border-gray-200 text-gray-800 focus:border-[#5B21B6]">
                        <option value="" disabled>Select Category</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Fashion & Apparel">Fashion & Apparel</option>
                        <option value="Groceries">Groceries</option>
                        <option value="Home & Furniture">Home & Furniture</option>
                        <option value="Beauty & Personal Care">Beauty & Personal Care</option>
                        <option value="Other">Other</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">expand_more</span>
                    </div>

                    <StorefrontFloatingInput label="SKU (Optional)" value={productForm.sku} onChange={e => updateProductForm('sku', e.target.value)} />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <StorefrontFloatingInput label="Price (₹) *" type="number" value={productForm.price} onChange={e => updateProductForm('price', e.target.value)} />
                      <StorefrontFloatingInput label="Discount Price (₹)" type="number" value={productForm.discountPrice} onChange={e => updateProductForm('discountPrice', e.target.value)} />
                    </div>
                    
                    <StorefrontFloatingInput label="Stock Quantity" type="number" value={productForm.stock} onChange={e => updateProductForm('stock', e.target.value)} />
                    <StorefrontFloatingInput label="Product Description" multiline value={productForm.description} onChange={e => updateProductForm('description', e.target.value)} />
                    
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div>
                        <p className="text-[14px] font-bold text-gray-900">Highlight Product</p>
                        <p className="text-[12px] text-gray-500">Feature this product in your store.</p>
                      </div>
                      <div onClick={() => updateProductForm('highlight', !productForm.highlight)} className={`w-12 h-6 rounded-full p-1 flex items-center cursor-pointer transition-colors ${productForm.highlight ? 'bg-[#5B21B6]' : 'bg-gray-200'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform ${productForm.highlight ? 'translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>
                  
                </div>
              )}
              
            </div>
          </main>

          {/* Sticky Footer */}
          {addProductStep === 2 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
              <div className="max-w-[600px] mx-auto">
                <button 
                  onClick={handleAddProduct}
                  className="w-full h-12 bg-[#5B21B6] text-white rounded-xl font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1 shadow-md shadow-[#5B21B6]/30 cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </div>
          )}
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

// ─── Shared Components ──────────────────────────────────────────────

function StorefrontFloatingInput({ label, type = 'text', value, onChange, readOnly, placeholder, multiline }) {
  const [focused, setFocused] = useState(false);
  const isFilled = value && value.toString().length > 0;
  const InputEl = multiline ? 'textarea' : 'input';

  return (
    <div className={`relative flex ${multiline ? 'items-start pt-4' : 'items-center'} bg-white border-2 rounded-lg transition-all duration-300 ${
      focused ? 'border-[#5B21B6] shadow-[0_0_0_4px_rgba(91,33,182,0.08)]' : 'border-gray-200 hover:border-gray-300'
    } ${readOnly ? 'bg-gray-50 border-gray-200' : ''}`}>
      <InputEl
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused || readOnly ? placeholder : ''}
        rows={multiline ? 3 : undefined}
        className={`w-full bg-transparent outline-none px-4 pt-[18px] pb-[10px] text-[15px] font-bold text-gray-900 ${multiline ? 'resize-none' : ''}`}
      />
      <label className={`absolute transition-all duration-200 pointer-events-none left-4 ${
        focused || isFilled || placeholder 
          ? 'top-2 text-[11px] font-bold text-[#5B21B6]' 
          : `text-[15px] text-gray-500 ${multiline ? 'top-5' : 'top-1/2 -translate-y-1/2'}`
      }`}>
        {label}
      </label>
    </div>
  );
}

function StorefrontUploadCard({ label, file, onUpload, onRemove }) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  
  return (
    <div className="relative overflow-hidden bg-white border-2 border-dashed border-gray-200 rounded-lg p-4 hover:border-[#5B21B6]/50 transition-colors">
      <input type="file" id={id} className="hidden" onChange={onUpload} accept="image/*,.pdf" />
      
      {!file ? (
        <div onClick={() => document.getElementById(id).click()} className="flex items-center gap-3 cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-[#5B21B6]/5 flex items-center justify-center text-[#5B21B6]">
            <span className="material-symbols-outlined">cloud_upload</span>
          </div>
          <div>
            <h4 className="font-bold text-[14px] text-gray-900">{label}</h4>
            <p className="text-[12px] text-gray-500">Tap to upload file</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <span className="material-symbols-outlined">task</span>
            </div>
            <div>
              <h4 className="font-bold text-[14px] text-gray-900 truncate max-w-[180px]">{file.name}</h4>
              <p className="text-[12px] text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button onClick={onRemove} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      )}
    </div>
  );
}
