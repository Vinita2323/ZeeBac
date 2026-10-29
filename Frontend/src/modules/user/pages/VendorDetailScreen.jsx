import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import { calculateDistance } from '../../../utils/distance';
import useCartStore from '../../../store/useCartStore';
import useLanguageStore from '../../../store/useLanguageStore';

// Default realistic shop items when a merchant has no catalog uploaded yet
const DEFAULT_SHOP_PRODUCTS = [
  {
    _id: 'demo_prod_atta',
    name: 'Aashirvaad Atta 5 kg',
    price: 260,
    discountPrice: 295,
    category: 'Grocery',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
    description: '100% whole wheat chakki atta with natural dietary fibers.'
  },
  {
    _id: 'demo_prod_oil',
    name: 'Fortune Oil 1 L',
    price: 145,
    discountPrice: 175,
    category: 'Grocery',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&auto=format&fit=crop&q=80',
    description: 'Refined sunflower cooking oil for healthy heart.'
  },
  {
    _id: 'demo_prod_salt',
    name: 'Tata Salt 1 kg',
    price: 28,
    discountPrice: 32,
    category: 'FMCG',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=400&auto=format&fit=crop&q=80',
    description: 'Desh Ka Namak - Vacuum evaporated iodized salt.'
  },
  {
    _id: 'demo_prod_soap',
    name: 'Dettol Soap',
    price: 40,
    discountPrice: 48,
    category: 'Household',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1607006314605-724e54885834?w=400&auto=format&fit=crop&q=80',
    description: 'Germ protection bath soap for complete skin hygiene.'
  },
  {
    _id: 'demo_prod_butter',
    name: 'Amul Butter 500g',
    price: 275,
    discountPrice: 290,
    category: 'Grocery',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&auto=format&fit=crop&q=80',
    description: 'Pure dairy pasteurized butter with rich taste.'
  },
  {
    _id: 'demo_prod_maggi',
    name: 'Maggi 2-Minute Noodles 280g',
    price: 55,
    discountPrice: 60,
    category: 'FMCG',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=400&auto=format&fit=crop&q=80',
    description: 'Instant noodles with special authentic masala blend.'
  },
  {
    _id: 'demo_prod_surf',
    name: 'Surf Excel Easy Wash 1 kg',
    price: 140,
    discountPrice: 160,
    category: 'Household',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400&auto=format&fit=crop&q=80',
    description: 'Advanced stain removal washing powder.'
  },
  {
    _id: 'demo_prod_colgate',
    name: 'Colgate Strong Teeth 200g',
    price: 110,
    discountPrice: 125,
    category: 'Household',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1559591937-e16e45f65b11?w=400&auto=format&fit=crop&q=80',
    description: 'Dental care toothpaste with calcium and mineral formula.'
  }
];

export default function VendorDetailScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguageStore();

  const passedVendor = location.state?.vendor;
  const defaultVendor = {
    _id: 'sharma_gen_store',
    storeName: "Sharma General Store",
    cashbackRate: 3,
    category: "Grocery",
    address: "Kirana • FMCG • Household, Hazratganj, Lucknow",
    city: "Lucknow",
    storeLogo: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400&auto=format&fit=crop&q=80",
    phone: "9876543210",
    openingHours: "9:00 AM – 10:00 PM",
    rating: 4.5,
    reviewCount: 128,
    isVerified: true,
  };

  const [vendor, setVendor] = useState(passedVendor || defaultVendor);
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showShopDetailsModal, setShowShopDetailsModal] = useState(false);

  // Cart store hooks
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const getItemQuantity = useCartStore((state) => state.getItemQuantity);
  const cartItemsCount = useCartStore((state) => state.getTotalItemsCount());
  const cartTotalAmount = useCartStore((state) => state.getTotalAmount());
  const cartTotalCashback = useCartStore((state) => state.getTotalCashback());

  const productSectionRef = useRef(null);

  // Location handling for real-time distance
  const [userCoords] = useState(() => {
    try {
      const stored = localStorage.getItem('zeebac_location');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Fetch full vendor details if available
  useEffect(() => {
    const fetchVendorData = async () => {
      const zeebacId = vendor.zeebacId;
      if (!zeebacId) return;
      try {
        const res = await UserAPI.getVendorDetails(zeebacId);
        if (res.success && res.data) {
          setVendor(prev => ({ ...prev, ...res.data }));
        }
      } catch (err) {
        console.warn('Could not load extra vendor details', err);
      }
    };
    fetchVendorData();
  }, [vendor.zeebacId]);

  // Fetch Products from Backend or load fallback
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        if (vendor?._id && typeof vendor._id === 'string' && vendor._id.length === 24) {
          const res = await UserAPI.getVendorProducts(vendor._id);
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setProducts(res.data);
            setIsLoadingProducts(false);
            return;
          }
        }
        // Fallback demo products tailored to this store
        const storeCashback = vendor.cashbackRate || 3;
        const mappedDemo = DEFAULT_SHOP_PRODUCTS.map(p => ({
          ...p,
          cashbackRate: storeCashback
        }));
        setProducts(mappedDemo);
      } catch (err) {
        console.warn('Failed to load products, using fallback:', err);
        setProducts(DEFAULT_SHOP_PRODUCTS);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    loadProducts();
  }, [vendor]);

  // Check favorite status
  useEffect(() => {
    const checkFav = async () => {
      if (!vendor?._id) return;
      try {
        const res = await UserAPI.getFavorites();
        if (res.success && Array.isArray(res.data)) {
          const ids = res.data.map(v => String(v._id));
          setIsFavorite(ids.includes(String(vendor._id)));
        }
      } catch (e) {
        console.warn('Failed to check favorite status', e);
      }
    };
    checkFav();
  }, [vendor._id]);

  const handleFavoriteToggle = async () => {
    try {
      if (vendor?._id) {
        const res = await UserAPI.toggleFavorite(vendor._id);
        setIsFavorite(res.isFavorite);
      } else {
        setIsFavorite(!isFavorite);
      }
    } catch {
      setIsFavorite(!isFavorite);
    }
  };

  // Helper distance calculator
  const displayDistance = useMemo(() => {
    if (vendor.distanceDisplay) return vendor.distanceDisplay;
    if (userCoords?.lat && userCoords?.lng && vendor.location?.coordinates?.length === 2) {
      const d = calculateDistance(
        userCoords.lat,
        userCoords.lng,
        vendor.location.coordinates[1],
        vendor.location.coordinates[0]
      );
      return `${d} km`;
    }
    return '0.6 km';
  }, [vendor, userCoords]);

  const displayCity = useMemo(() => {
    if (vendor.city) return vendor.city;
    if (vendor.address?.city) return vendor.address.city;
    if (typeof vendor.address === 'string' && vendor.address.includes('Lucknow')) return 'Lucknow';
    return 'Lucknow';
  }, [vendor]);

  // Categories list derived from current products
  const categories = useMemo(() => {
    const cats = new Set(['All']);
    products.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    // Ensure standard categories exist
    cats.add('Grocery');
    cats.add('FMCG');
    cats.add('Household');
    return Array.from(cats);
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = searchQuery.trim() === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = activeCategory === 'All' ||
        product.category?.toLowerCase() === activeCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, activeCategory]);

  const handleGetDirections = () => {
    const query = encodeURIComponent(`${vendor.storeName}, ${displayCity}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const handleShopAtStore = () => {
    if (cartItemsCount > 0) {
      navigate('/cart');
    } else {
      // Smooth scroll to product selection
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const vendorImageSrc = vendor.storeLogo || vendor.profilePic || vendor.storeCoverImage || DEFAULT_SHOP_PRODUCTS[0].image;

  return (
    <div className="mesh-gradient text-on-surface font-body-lg min-h-screen flex flex-col pb-36">

      {/* Top Header Bar matching Phone Mockup */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => safeNavigateBack(navigate, '/explore')}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer transition-colors shrink-0"
            title={t('Back')}
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <h1 className="font-display font-black text-[18px] sm:text-[20px] text-slate-900 truncate leading-tight">
            {vendor.storeName || 'Sharma General Store'}
          </h1>
        </div>

        <button
          onClick={handleFavoriteToggle}
          className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer transition-colors shrink-0"
          title={isFavorite ? t('Remove from Favorites') : t('Add to Favorites')}
        >
          <span
            className={`material-symbols-outlined text-[24px] ${isFavorite ? 'text-red-500' : 'text-slate-700'}`}
            style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}
          >
            favorite
          </span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 app-container px-4 py-3.5 space-y-3.5 text-left">

        {/* Store Summary Card matching Mockup Top Section */}
        <div className="bg-white rounded-3xl p-3 sm:p-4 border border-slate-100 shadow-sm flex items-center gap-3 sm:gap-4 relative overflow-hidden">
          {/* Store Front Photo */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-purple-50 border border-purple-100 shrink-0 relative group">
            <img
              src={vendorImageSrc.startsWith('http') || vendorImageSrc.startsWith('data:') ? vendorImageSrc : `${API_BASE_URL}${vendorImageSrc}`}
              alt={vendor.storeName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {/* Store Type Badge */}
            <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold">
              {vendor.category || 'Kirana'}
            </span>
          </div>

          {/* Store Info & Cashback Pill */}
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Verified Merchant Badge */}
            <div className="flex items-center gap-1.5 text-primary text-[11px] sm:text-[11.5px] font-extrabold">
              <span className="material-symbols-outlined text-[15px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <span className="truncate">Verified Zeebac Merchant</span>
            </div>

            {/* Distance & City */}
            <p className="text-[12px] text-slate-500 font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-slate-400">location_on</span>
              <span className="truncate">{displayDistance} • {displayCity}</span>
            </p>

            {/* Open Status Indicator */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-700">{t('Open now')}</span>
            </div>

            {/* Large Cashback Banner / Pill matching brand theme */}
            <button
              onClick={() => navigate('/pay-vendor', { state: { vendor } })}
              className="w-full py-2 px-3 rounded-xl btn-primary-gradient text-white flex items-center justify-center gap-2 shadow-md shadow-primary/20 active:scale-95 transition-all cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-amber-400 text-purple-950 flex items-center justify-center font-black text-[11px]">
                ₹
              </div>
              <span className="font-display font-black text-[13px] tracking-wide">
                {vendor.cashbackRate ? `${vendor.cashbackRate}%+ Cashback` : '3%+ Cashback'}
              </span>
            </button>
          </div>
        </div>

        {/* Quick Details Row matching Mockup */}
        <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs grid grid-cols-3 divide-x divide-slate-100 text-center">
          {/* Shop Details */}
          <button
            onClick={() => setShowShopDetailsModal(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-1 hover:bg-slate-50 rounded-xl py-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-primary text-[20px]">storefront</span>
            <span className="text-[11px] font-bold text-slate-800 flex items-center gap-0.5">
              <span>{t('Shop Details')}</span>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            </span>
          </button>

          {/* Opening Hours */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-1">
            <span className="material-symbols-outlined text-slate-500 text-[19px]">schedule</span>
            <span className="text-[10px] font-bold text-slate-700 leading-tight">
              {vendor.openingHours || '9:00 AM – 10:00 PM'}
            </span>
          </div>

          {/* Rating & Reviews */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-1">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-amber-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
              <span className="text-[12px] font-black text-slate-800">{vendor.rating || '4.5'}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">({vendor.reviewCount || '128'} reviews)</span>
          </div>
        </div>

        {/* In-Shop Product Search Bar matching Mockup */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Search products in this shop...')}
            className="w-full h-11 pl-11 pr-10 bg-white rounded-2xl border border-slate-200/90 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-[13.5px] text-slate-800 placeholder:text-slate-400 shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Category Pills matching Mockup (All | Grocery | FMCG | Household) */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => {
            const isSelected = activeCategory === cat;
            const getCatIcon = () => {
              switch (cat.toLowerCase()) {
                case 'all': return 'grid_view';
                case 'grocery': return 'shopping_bag';
                case 'fmcg': return 'local_drink';
                case 'household': return 'home';
                case 'personal care': return 'spa';
                default: return 'category';
              }
            };

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'btn-primary-gradient text-white font-bold shadow-md shadow-primary/20'
                    : 'bg-[#F3F4F6] text-slate-700 hover:bg-slate-200 font-semibold'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">
                  {getCatIcon()}
                </span>
                <span>{cat === 'All' ? t('All') : cat}</span>
              </button>
            );
          })}
        </div>

        {/* 2-Column Product Grid Section */}
        <section ref={productSectionRef} className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-black text-[15px] text-slate-900">
              {activeCategory === 'All' ? t('Popular Products') : `${activeCategory} Items`}
            </h2>
            <span className="text-[11.5px] font-bold text-slate-500">
              {filteredProducts.length} {t('Items')}
            </span>
          </div>

          {isLoadingProducts ? (
            <div className="py-16 flex justify-center">
              <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-white rounded-2xl border border-slate-100">
              <span className="material-symbols-outlined text-slate-400 text-[40px]">inventory_2</span>
              <p className="font-bold text-[14px] text-slate-800">{t('No products matched your search')}</p>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
                className="text-xs font-bold text-primary hover:underline"
              >
                {t('View all items')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {filteredProducts.map((product) => {
                const qty = getItemQuantity(product._id || product.id);
                const rawRate = product.cashbackPercentage ?? product.branding?.cashbackPercentage ?? product.cashbackRate ?? vendor.cashbackRate ?? 0;
                const rate = Math.max(0, Math.min(100, Number(rawRate) || 0));
                const cashbackPoints = Math.round(product.price * (rate / 100) * 100) / 100;

                return (
                  <div
                    key={product._id || product.id}
                    className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    {/* Product Image Card */}
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-2 mb-2">
                      <img
                        src={product.image || DEFAULT_SHOP_PRODUCTS[0].image}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      {product.discountPrice && product.discountPrice > product.price && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-amber-400 text-purple-950 font-black text-[9px] uppercase tracking-wider">
                          SAVE ₹{product.discountPrice - product.price}
                        </span>
                      )}
                    </div>

                    {/* Product Details matching Mockup */}
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-bold text-[13px] sm:text-[13.5px] text-slate-900 leading-snug line-clamp-2 h-[36px]">
                        {product.name}
                      </h3>

                      {/* Price row */}
                      <div className="flex items-baseline gap-1.5 pt-0.5">
                        <span className="font-black text-[16px] text-slate-900">
                          ₹{product.price}
                        </span>
                        {product.discountPrice && product.discountPrice > product.price && (
                          <span className="text-[11.5px] text-slate-400 line-through font-medium">
                            ₹{product.discountPrice}
                          </span>
                        )}
                      </div>

                      {/* Per-Product Cashback Badge in Brand Purple Theme */}
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-primary border border-purple-100 font-extrabold text-[10px] sm:text-[10.5px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span>{rate}% Cashback (+{cashbackPoints} Pts)</span>
                      </div>
                    </div>

                    {/* Quick-Commerce Add / Quantity Stepper Button */}
                    <div className="pt-2.5">
                      {qty === 0 ? (
                        <button
                          onClick={() => addItem(product, vendor)}
                          className="w-full py-2 rounded-xl btn-primary-gradient text-white font-black text-[12px] flex items-center justify-center gap-1.5 shadow-sm shadow-primary/20 active:scale-95 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                          <span>{t('Add')}</span>
                        </button>
                      ) : (
                        <div className="w-full h-8 rounded-xl btn-primary-gradient text-white flex items-center justify-between px-2 shadow-sm shadow-primary/25 font-black text-[13px]">
                          <button
                            onClick={() => updateQuantity(product._id || product.id, -1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                            title="Decrease quantity"
                          >
                            <span className="material-symbols-outlined text-[16px]">remove</span>
                          </button>
                          <span className="font-mono font-bold text-[13px]">{qty}</span>
                          <button
                            onClick={() => updateQuantity(product._id || product.id, 1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                            title="Increase quantity"
                          >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Floating Quick-Commerce Cart Bar (like Blinkit / Zepto) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-20 inset-x-0 z-40 px-3 max-w-[480px] mx-auto animate-bounce-short">
          <div
            onClick={() => navigate('/cart')}
            className="w-full bg-slate-900 text-white rounded-2xl p-3 shadow-xl flex items-center justify-between cursor-pointer border border-purple-500/30 hover:bg-slate-850 active:scale-98 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black relative shrink-0">
                <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-purple-950 font-black text-[9px] flex items-center justify-center">
                  {cartItemsCount}
                </span>
              </div>
              <div className="text-left">
                <p className="font-extrabold text-[13px] leading-tight text-white">
                  {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'} • ₹{cartTotalAmount}
                </p>
                <p className="text-[11px] font-bold text-amber-300 mt-0.5 flex items-center gap-1">
                  <span>🎉 Earn ₹{cartTotalCashback} Cashback</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-primary text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-xs shrink-0">
              <span>{t('View Cart')}</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons matching Mockup (Get Directions | Shop at Store) */}
      <footer className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-100 p-3 max-w-[480px] mx-auto">
        <div className="grid grid-cols-2 gap-2.5">
          {/* Get Directions Button */}
          <button
            onClick={handleGetDirections}
            className="h-11 rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-[13px] flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[18px]">near_me</span>
            <span>{t('Get Directions')}</span>
          </button>

          {/* Shop at Store / View Cart Button */}
          <button
            onClick={handleShopAtStore}
            className="h-11 rounded-full btn-primary-gradient text-white font-black text-[13px] flex items-center justify-center gap-1.5 shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {cartItemsCount > 0 ? 'shopping_bag' : 'storefront'}
            </span>
            <span>{cartItemsCount > 0 ? `${t('Cart')} (${cartItemsCount})` : t('Shop at Store')}</span>
          </button>
        </div>
      </footer>

      {/* Shop Details Modal */}
      {showShopDetailsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">store</span>
                <h3 className="font-display font-black text-[16px] text-slate-900">{vendor.storeName}</h3>
              </div>
              <button
                onClick={() => setShowShopDetailsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-3 text-[12px] text-slate-700">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">location_on</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Address')}</p>
                  <p className="text-slate-600 mt-0.5">{vendor.address || 'Hazratganj, Lucknow'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">schedule</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Timings')}</p>
                  <p className="text-slate-600 mt-0.5">{vendor.openingHours || '9:00 AM – 10:00 PM (All Days)'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">call</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Contact')}</p>
                  <p className="text-slate-600 mt-0.5">+91 {vendor.phone || '9876543210'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">savings</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Cashback Offered')}</p>
                  <p className="text-primary font-extrabold mt-0.5">{vendor.cashbackRate || 3}%+ Guaranteed on all products</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  setShowShopDetailsModal(false);
                  navigate('/pay-vendor', { state: { vendor } });
                }}
                className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-xs shadow-xs"
              >
                {t('Pay Directly')}
              </button>
              <button
                onClick={() => setShowShopDetailsModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
