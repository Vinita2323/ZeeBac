import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import { calculateDistance } from '../../../utils/distance';
import { getStoreTimingStatus } from '../../../utils/storeTiming';
import useCartStore from '../../../store/useCartStore';
import useLanguageStore from '../../../store/useLanguageStore';
import { getStoreTypeConfig, getCategoryFallbackImage } from '../data/storeCategoryConfigs';
import ReviewsTab from '../components/vendor-detail/ReviewsTab';

// Blinkit / Zepto Style Visual Category Hierarchy matching user reference interface
const BLINKIT_CATEGORY_SECTIONS = [
  {
    groupTitle: 'Grocery & Kitchen',
    department: 'Grocery & Kitchen',
    icon: 'local_mall',
    categories: [
      {
        id: 'vegetables-fruits',
        name: 'Vegetables & Fruits',
        image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'atta-rice-dal',
        name: 'Atta, Rice & Dal',
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'oil-ghee-masala',
        name: 'Oil, Ghee & Masala',
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'dairy-bread-eggs',
        name: 'Dairy, Bread & Eggs',
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'bakery-biscuits',
        name: 'Bakery & Biscuits',
        image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'dry-fruits-cereals',
        name: 'Dry Fruits & Cereals',
        image: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'chicken-meat-fish',
        name: 'Chicken, Meat & Fish',
        image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'kitchenware-appliances',
        name: 'Kitchenware & Appliances',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      }
    ]
  },
  {
    groupTitle: 'Snacks & Drinks',
    department: 'Snacks & Drinks',
    icon: 'fastfood',
    categories: [
      {
        id: 'chips-namkeen',
        name: 'Chips & Namkeen',
        image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'sweets-chocolates',
        name: 'Sweets & Chocolates',
        image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'drinks-juices',
        name: 'Drinks & Juices',
        image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'tea-coffee-drinks',
        name: 'Tea, Coffee & Drinks',
        image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'instant-food',
        name: 'Instant Food',
        image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'sauces-spreads',
        name: 'Sauces & Spreads',
        image: 'https://images.unsplash.com/photo-1528750997573-59b89d56f4f7?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'paan-corner',
        name: 'Paan Corner',
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'ice-creams-more',
        name: 'Ice Creams & More',
        image: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      }
    ]
  },
  {
    groupTitle: 'Personal Care & Household',
    department: 'Personal Care & Household',
    icon: 'spa',
    categories: [
      {
        id: 'bath-body',
        name: 'Bath & Body',
        image: 'https://images.unsplash.com/photo-1607006314605-724e54885834?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'cleaning-detergents',
        name: 'Cleaning & Detergents',
        image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'oral-dental-care',
        name: 'Oral & Dental Care',
        image: 'https://images.unsplash.com/photo-1559591937-e16e45f65b11?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'pooja-needs',
        name: 'Pooja Needs',
        image: 'https://images.unsplash.com/photo-1609137144822-446757d5eeea?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      }
    ]
  }
];

// Department quick filters across the top
const DEPARTMENT_TABS = [
  { id: 'all', label: 'All', icon: 'grid_view' },
  { id: 'grocery', label: 'Grocery & Kitchen', icon: 'shopping_basket', department: 'Grocery & Kitchen' },
  { id: 'snacks', label: 'Snacks & Drinks', icon: 'lunch_dining', department: 'Snacks & Drinks' },
  { id: 'personal', label: 'Personal & Care', icon: 'sanitizer', department: 'Personal Care & Household' }
];

// Products are strictly loaded from vendor uploaded catalog

export default function VendorDetailScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguageStore();

  const passedVendor = location.state?.vendor;
  const queryParams = new URLSearchParams(location.search);
  const queryId = queryParams.get('id') || queryParams.get('zeebacId');

  const defaultVendor = {
    _id: 'sharma_gen_store',
    zeebacId: queryId || 'ZBV-1001',
    storeName: "Partner Store",
    cashbackRate: 3,
    category: "Store",
    address: "Partner Store Address",
    city: "Indore",
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
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showShopDetailsModal, setShowShopDetailsModal] = useState(false);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Dynamic store configuration based on shop's actual business category
  const storeConfig = useMemo(() => {
    return getStoreTypeConfig(vendor?.category || vendor?.shopType) || getStoreTypeConfig('grocery');
  }, [vendor?.category, vendor?.shopType]);

  const searchPlaceholder = useMemo(() => {
    return storeConfig?.searchPlaceholder || `Search products in ${vendor?.storeName || 'store'}...`;
  }, [storeConfig, vendor?.storeName]);

  const dynamicDepartmentTabs = useMemo(() => {
    if (products.length === 0) {
      return [];
    }
    return storeConfig?.departmentTabs || [
      { id: 'all', label: 'All', icon: 'grid_view' },
    ];
  }, [storeConfig, products.length]);

  // Product Lightbox Modal State
  const [lightboxProduct, setLightboxProduct] = useState(null);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  // Lock body scroll when Product Lightbox is open
  useEffect(() => {
    if (lightboxProduct) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [lightboxProduct]);

  const activeProductImages = useMemo(() => {
    if (!lightboxProduct) return [];
    if (lightboxProduct.images && Array.isArray(lightboxProduct.images) && lightboxProduct.images.length > 0) {
      return lightboxProduct.images.map(img => img.startsWith('http') || img.startsWith('data:') ? img : `${API_BASE_URL}${img}`);
    }
    const single = lightboxProduct.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80';
    return [single.startsWith('http') || single.startsWith('data:') ? single : `${API_BASE_URL}${single}`];
  }, [lightboxProduct]);

  const handleOpenProductLightbox = (product) => {
    setLightboxProduct(product);
    setLightboxImageIndex(0);
    setIsLightboxZoomed(false);
  };

  const handleCloseProductLightbox = () => {
    setLightboxProduct(null);
    setIsLightboxZoomed(false);
  };

  const handlePrevImage = useCallback(() => {
    setIsLightboxZoomed(false);
    setLightboxImageIndex(prev => (prev > 0 ? prev - 1 : activeProductImages.length - 1));
  }, [activeProductImages.length]);

  const handleNextImage = useCallback(() => {
    setIsLightboxZoomed(false);
    setLightboxImageIndex(prev => (prev < activeProductImages.length - 1 ? prev + 1 : 0));
  }, [activeProductImages.length]);

  // Keyboard navigation for Product Lightbox
  useEffect(() => {
    if (!lightboxProduct) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseProductLightbox();
      else if (e.key === 'ArrowLeft') handlePrevImage();
      else if (e.key === 'ArrowRight') handleNextImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxProduct, handlePrevImage, handleNextImage]);

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
      const targetId = queryId || passedVendor?._id || passedVendor?.zeebacId || vendor?._id || vendor?.zeebacId;
      if (!targetId || targetId === 'sharma_gen_store' || targetId === 'ZBV-1001') return;
      try {
        const res = await UserAPI.getVendorDetails(targetId);
        if (res.success && res.data) {
          setVendor(prev => ({ ...prev, ...res.data }));
        }
      } catch (err) {
        console.warn('Could not load extra vendor details', err);
      }
    };
    fetchVendorData();
  }, [queryId, passedVendor?._id, passedVendor?.zeebacId]);

  // Store Open / Closed Status based on operatingHours or businessHours
  const storeTimingInfo = useMemo(() => {
    return getStoreTimingStatus(vendor);
  }, [vendor]);

  // Fetch Products from Backend - strictly real products uploaded by the vendor
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const targetVendorId = vendor?._id || passedVendor?._id || vendor?.zeebacId || passedVendor?.zeebacId || queryId;
        if (targetVendorId && targetVendorId !== 'sharma_gen_store' && targetVendorId !== 'ZBV-1001') {
          const res = await UserAPI.getVendorProducts(targetVendorId);
          if (res.success && Array.isArray(res.data)) {
            setProducts(res.data);
            setIsLoadingProducts(false);
            return;
          }
        }
        // Do NOT inject fake demo products for registered merchants.
        // If the merchant has not added products yet, catalog stays empty.
        setProducts([]);
      } catch (err) {
        console.warn('Failed to load vendor products:', err);
        setProducts([]);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    loadProducts();
  }, [vendor?._id, vendor?.zeebacId, passedVendor?._id, passedVendor?.zeebacId, queryId]);

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

  // Category Matching Helper to support both exact categories and broad merchant categories
  const matchesCategory = (productCategory, targetCategory) => {
    if (targetCategory === 'All') return true;
    const p = (productCategory || '').toLowerCase();
    const t = targetCategory.toLowerCase();

    if (p === t) return true;
    if (p.includes(t) || t.includes(p)) return true;

    if (t.includes('vegetables') || t.includes('fruits')) {
      return p.includes('vegetables') || p.includes('fruits') || p.includes('produce') || p === 'grocery';
    }
    if (t.includes('atta') || t.includes('rice') || t.includes('dal')) {
      return p.includes('atta') || p.includes('rice') || p.includes('dal') || p === 'grocery';
    }
    if (t.includes('oil') || t.includes('ghee') || t.includes('masala')) {
      return p.includes('oil') || p.includes('ghee') || p.includes('masala') || p.includes('salt');
    }
    if (t.includes('dairy') || t.includes('bread') || t.includes('eggs')) {
      return p.includes('dairy') || p.includes('milk') || p.includes('butter') || p.includes('bread') || p.includes('egg');
    }
    if (t.includes('bakery') || t.includes('biscuits')) {
      return p.includes('bakery') || p.includes('biscuit') || p.includes('cookie');
    }
    if (t.includes('dry fruits') || t.includes('cereals')) {
      return p.includes('dry fruits') || p.includes('cereal') || p.includes('almond') || p.includes('kaju');
    }
    if (t.includes('chicken') || t.includes('meat') || t.includes('fish')) {
      return p.includes('chicken') || p.includes('meat') || p.includes('fish') || p.includes('egg');
    }
    if (t.includes('kitchenware') || t.includes('appliances')) {
      return p.includes('kitchen') || p.includes('bottle') || p.includes('pan') || p.includes('appliance');
    }
    if (t.includes('chips') || t.includes('namkeen')) {
      return p.includes('chip') || p.includes('namkeen') || p.includes('snack') || p === 'fmcg';
    }
    if (t.includes('sweets') || t.includes('chocolates')) {
      return p.includes('sweet') || p.includes('chocolate') || p.includes('mithai');
    }
    if (t.includes('drinks') || t.includes('juices')) {
      return p.includes('drink') || p.includes('juice') || p.includes('coke') || p.includes('beverage') || p === 'fmcg';
    }
    if (t.includes('tea') || t.includes('coffee')) {
      return p.includes('tea') || p.includes('coffee') || p.includes('chai');
    }
    if (t.includes('instant food')) {
      return p.includes('instant') || p.includes('noodle') || p.includes('maggi') || p === 'fmcg';
    }
    if (t.includes('sauces') || t.includes('spreads')) {
      return p.includes('sauce') || p.includes('ketchup') || p.includes('spread') || p.includes('jam');
    }
    if (t.includes('bath') || t.includes('body')) {
      return p.includes('bath') || p.includes('body') || p.includes('soap') || p === 'household';
    }
    if (t.includes('cleaning') || t.includes('detergents')) {
      return p.includes('clean') || p.includes('detergent') || p.includes('wash') || p === 'household';
    }
    if (t.includes('oral') || t.includes('dental')) {
      return p.includes('oral') || p.includes('dental') || p.includes('tooth');
    }
    if (t.includes('pooja')) {
      return p.includes('pooja') || p.includes('incense') || p.includes('agarbatti');
    }

    return false;
  };

  // Filtered products list based on active category and live search
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = searchQuery.trim() === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (product.category && product.category.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat = activeCategory === 'All' || (product.category && product.category.toLowerCase().trim() === activeCategory.toLowerCase().trim()) || matchesCategory(product.category, activeCategory);
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, activeCategory]);

  // Voice Search Handler via Web Speech API
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice search is not supported in this browser. Please type in the search bar.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setActiveCategory('All');
        productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      recognition.start();
    } catch (e) {
      console.warn('Voice recognition error:', e);
      setIsListening(false);
    }
  };

  // Tapping a category card from the Blinkit visual grid

  // Dynamic Category Sections derived from vendor's real products & customCategories
  const dynamicCategorySections = useMemo(() => {
    const catSet = new Set();
    (vendor?.customCategories || []).forEach(c => c && catSet.add(c.trim()));
    products.forEach(p => {
      if (p.category && p.category.trim() && p.category !== 'All') catSet.add(p.category.trim());
    });

    if (catSet.size > 0) {
      const catList = Array.from(catSet).map((catName) => {
        const matchingProds = products.filter(p => (p.category || '').toLowerCase() === catName.toLowerCase());
        const prodWithImg = matchingProds.find(p => p.image);
        const imgUrl = prodWithImg?.image
          ? (prodWithImg.image.startsWith('http') || prodWithImg.image.startsWith('data:') ? prodWithImg.image : `${API_BASE_URL}${prodWithImg.image}`)
          : getCategoryFallbackImage(catName);

        return {
          id: catName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: catName,
          image: imgUrl,
          itemCount: matchingProds.length,
          bgColor: 'bg-slate-50',
        };
      });

      return [
        {
          groupTitle: `${vendor?.category || vendor?.storeName || 'Store'} Categories`,
          department: vendor?.category || 'Store',
          icon: 'category',
          categories: catList,
        }
      ];
    }

    // When a store has no products yet, do NOT render fake categories
    return [];
  }, [products, vendor?.customCategories, vendor?.category, vendor?.storeName]);

  const handleSelectCategory = (categoryName) => {
    setActiveCategory(categoryName);
    setSearchQuery('');
    setTimeout(() => {
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleGetDirections = () => {
    const query = encodeURIComponent(`${vendor.storeName}, ${displayCity}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const handleShopAtStore = () => {
    if (cartItemsCount > 0) {
      navigate('/cart');
    } else {
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const vendorImageSrc = vendor.storeLogo || vendor.profilePic || vendor.storeCoverImage || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&auto=format&fit=crop&q=80';

  return (
    <div className="mesh-gradient text-on-surface font-body-lg min-h-screen flex flex-col pb-36">

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => safeNavigateBack(navigate, '/explore')}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer transition-colors shrink-0"
            title={t('Back')}
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-black text-[17px] sm:text-[19px] text-slate-900 truncate leading-tight">
              {vendor.storeName || 'Sharma General Store'}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              {vendor.category || 'Grocery'} • {displayDistance} • {displayCity}
            </p>
          </div>
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
      <main className="flex-1 app-container px-3.5 sm:px-4 py-3.5 space-y-4 text-left">

        {/* ── 1. STORE OVERVIEW CARD ── */}
        <div className="bg-white rounded-3xl p-3.5 sm:p-4 md:p-6 border border-slate-100 shadow-sm flex items-center gap-3.5 md:gap-6 relative overflow-hidden">
          <div className="w-22 h-22 sm:w-24 sm:h-24 md:w-36 md:h-36 lg:w-40 lg:h-40 rounded-2xl overflow-hidden bg-purple-50 border border-purple-100 shrink-0 relative group">
            <img
              src={vendorImageSrc.startsWith('http') || vendorImageSrc.startsWith('data:') ? vendorImageSrc : `${API_BASE_URL}${vendorImageSrc}`}
              alt={vendor.storeName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded-md bg-black/65 backdrop-blur-xs text-white text-[9px] font-bold">
              {vendor.category || 'Store'}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-primary text-[11px] font-extrabold">
              <span className="material-symbols-outlined text-[15px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <span className="truncate">Verified Zeebac Store</span>
            </div>

            <p className="text-[11.5px] text-slate-500 font-medium flex items-center gap-1 truncate">
              <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
              <span className="truncate">{displayDistance} • {displayCity}</span>
            </p>

            <div className="flex items-center gap-2 pt-0.5">
              {storeTimingInfo.isOpen ? (
                <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t('Open now')} • Closes {storeTimingInfo.closeTimeStr}
                </span>
              ) : (
                <span className="text-[10.5px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {t('Closed now')} • Opens {storeTimingInfo.openTimeStr}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowReviewsModal(true)}
                className="text-[11px] font-extrabold text-slate-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
                title="View Customer Ratings & Reviews"
              >
                <span className="material-symbols-outlined text-amber-500 text-[14px] align-middle" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span>{vendor.stats?.totalReviews > 0 ? vendor.stats.avgRating : (vendor.rating || '4.5')}</span>
                <span className="text-slate-400 font-normal text-[10px]">
                  ({vendor.stats?.totalReviews > 0 ? `${vendor.stats.totalReviews}` : 'Reviews'})
                </span>
              </button>
            </div>

            <button
              onClick={() => navigate('/pay-vendor', { state: { vendor } })}
              className="mt-1 w-full md:w-auto md:px-6 md:py-2 py-1.5 px-3 rounded-xl btn-primary-gradient text-white flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <span className="font-display font-black text-[12px] tracking-wide">
                {vendor.cashbackRate ? `${vendor.cashbackRate}%+ Cashback` : '3%+ Cashback'}
              </span>
            </button>

            {/* Store Points Redemption Capacity Indicator */}
            {vendor.redemptionCapacity && (
              <div className="mt-2 md:max-w-sm px-2.5 py-1.5 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1 text-slate-700">
                  <span className="material-symbols-outlined text-purple-700 text-[14px]">stars</span>
                  <span className="font-semibold">Redemption:</span>
                </div>
                {vendor.redemptionCapacity.canRedeemPoints ? (
                  <span className="font-mono font-bold text-purple-900 bg-purple-100/80 px-1.5 py-0.2 rounded">
                    ₹{vendor.redemptionCapacity.remainingCapacity} Limit
                  </span>
                ) : (
                  <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded text-[10px]">
                    Limit Reached
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Closed Store Scheduled Delivery Notice Banner */}
        {!storeTimingInfo.isOpen && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2.5 text-amber-900 animate-reveal">
            <span className="material-symbols-outlined text-amber-600 text-[20px] shrink-0 mt-0.5">schedule</span>
            <div className="min-w-0 text-[12px]">
              <p className="font-black text-amber-950">Store is Currently Closed</p>
              <p className="text-[11px] text-amber-800 leading-snug">
                Store timings: {storeTimingInfo.timingDisplay}. You can browse products and place a <strong>Scheduled Order</strong> for delivery when the store opens!
              </p>
            </div>
          </div>
        )}

        {/* ── 2. BLINKIT-STYLE QUICK SEARCH BAR WITH VOICE INPUT ── */}
        {(products.length > 0 || searchQuery) && (
          <div className="relative flex items-center gap-2 md:max-w-2xl">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-11 pl-11 pr-10 bg-white rounded-2xl border border-slate-200/90 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-[13px] text-slate-800 placeholder:text-slate-400 shadow-2xs transition-all"
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

            <button
              type="button"
              onClick={handleVoiceSearch}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse border-red-500 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-2xs'
              }`}
              title="Voice Search"
            >
              <span className="material-symbols-outlined text-[20px]">mic</span>
            </button>
          </div>
        )}

        {/* ── 3. TOP DEPARTMENT QUICK TABS (HORIZONTAL CAROUSEL) ── */}
        {products.length > 0 && dynamicDepartmentTabs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {dynamicDepartmentTabs.map((tab) => {
              const isSelected = selectedDepartment === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setSelectedDepartment(tab.id);
                    if (tab.id === 'all') {
                      setActiveCategory('All');
                    }
                  }}
                  className={`px-3.5 py-2 rounded-2xl text-[12px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-900 text-white font-extrabold shadow-sm'
                      : 'bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-50 font-bold'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── 4. BLINKIT / ZEPTO STYLE GROUPED CATEGORIES GRID (AS PER REFERENCE IMAGE) ── */}
        {products.length > 0 && activeCategory === 'All' && !searchQuery && dynamicCategorySections.length > 0 && (
          <div className="space-y-5 pt-1">
            {dynamicCategorySections.filter((section) =>
              selectedDepartment === 'all' || (section.department && section.department.toLowerCase().includes(selectedDepartment.toLowerCase()))
            ).map((section) => (
              <section key={section.groupTitle} className="space-y-3">
                {/* Section Header */}
                <div className="flex items-center justify-between pl-0.5">
                  <h2 className="font-display font-black text-[16px] sm:text-[17px] text-slate-900 tracking-tight">
                    {section.groupTitle}
                  </h2>
                  <span className="text-[11px] font-bold text-primary">
                    {section.categories.length} Categories
                  </span>
                </div>

                {/* 4-Column Category Grid matching reference image */}
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-3 lg:gap-4">
                  {section.categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat.name)}
                      className="flex flex-col items-center group cursor-pointer text-center transition-transform active:scale-95"
                    >
                      {/* Pastel Rounded Square Card */}
                      <div className={`w-full aspect-square rounded-2xl ${cat.bgColor || 'bg-slate-100'} flex items-center justify-center border border-slate-200/60 shadow-2xs group-hover:scale-105 group-hover:shadow-xs transition-all overflow-hidden relative`}>
                        <img
                          src={cat.image}
                          alt={cat.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          loading="lazy"
                        />
                      </div>
                      {/* 2-line Category Title below card */}
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-800 text-center leading-tight mt-1.5 line-clamp-2 h-[28px] flex items-center justify-center">
                        {cat.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ── 5. ACTIVE CATEGORY FILTER BADGE (WHEN A CATEGORY IS TAPPED) ── */}
        {activeCategory !== 'All' && (
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50/60 to-purple-50 border border-purple-200/80 rounded-2xl p-3 flex items-center justify-between shadow-2xs animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">category</span>
              <div>
                <p className="font-display font-black text-[13.5px] text-slate-900 leading-tight">
                  {activeCategory}
                </p>
                <p className="text-[10.5px] font-bold text-slate-500">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'item available' : 'items available'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveCategory('All')}
              className="px-3 py-1.5 rounded-xl bg-white border border-purple-200 text-primary hover:bg-purple-50 text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              <span>All Categories</span>
            </button>
          </div>
        )}

        {/* ── 6. PRODUCTS LISTING GRID ── */}
        <section ref={productSectionRef} className="space-y-2.5 pt-1">
          {products.length > 0 && (
            <div className="flex items-center justify-between pl-0.5">
              <h2 className="font-display font-black text-[15px] sm:text-[16px] text-slate-900">
                {searchQuery
                  ? `Search: "${searchQuery}"`
                  : activeCategory === 'All'
                  ? t('Popular Products')
                  : `${activeCategory}`}
              </h2>
              <span className="text-[11.5px] font-bold text-slate-500">
                {filteredProducts.length} {t('Items')}
              </span>
            </div>
          )}

          {isLoadingProducts ? (
            <div className="py-16 flex justify-center">
              <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-10 px-5 text-center space-y-4 bg-white rounded-3xl border border-slate-100 shadow-2xs my-2">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-purple-50 border border-purple-100 flex items-center justify-center text-primary shadow-xs">
                <span className="material-symbols-outlined text-[32px]">storefront</span>
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="font-display font-black text-[16px] text-slate-900">
                  {t('No Products Listed Yet')}
                </h3>
                <p className="text-[12.5px] text-slate-500 leading-relaxed">
                  <strong>{vendor.storeName || 'This store'}</strong> {t('has not added products to their online catalog yet. You can still pay at their store counter to earn instant cashback!')}
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center max-w-xs mx-auto">
                <button
                  onClick={() => navigate('/pay-vendor', { state: { vendor } })}
                  className="w-full py-2.5 px-4 rounded-xl btn-primary-gradient text-white text-[12.5px] font-black inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                  <span>Pay Counter with Cashback</span>
                </button>
                <button
                  onClick={() => navigate('/shops')}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">store</span>
                  <span>Explore Other Stores</span>
                </button>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center space-y-2.5 bg-white rounded-3xl border border-slate-100 p-6">
              <span className="material-symbols-outlined text-slate-400 text-[42px]">inventory_2</span>
              <p className="font-bold text-[14px] text-slate-800">{t('No products matched in this category')}</p>
              <p className="text-[11.5px] text-slate-500">Try browsing other categories or clear search.</p>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
                className="mt-1 px-4 py-2 rounded-xl btn-primary-gradient text-white text-xs font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>{t('View All Categories & Products')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 lg:gap-4">
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
                    {/* Product Image Card (Full Ratio + Tap to Open Fullscreen Lightbox) */}
                    <div
                      onClick={() => handleOpenProductLightbox(product)}
                      className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/70 flex items-center justify-center mb-2.5 cursor-pointer group/img"
                      title={t('Click to preview product photos')}
                    >
                      <img
                        src={(product.image || (product.images && product.images[0]) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80')}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      {product.discountPrice && product.discountPrice > product.price && (
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-amber-400 text-purple-950 font-black text-[9.5px] uppercase tracking-wider shadow-xs">
                          SAVE ₹{product.discountPrice - product.price}
                        </span>
                      )}
                      {/* Multiple photos count indicator */}
                      {product.images && product.images.length > 1 && (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-xs text-white text-[9.5px] font-bold flex items-center gap-1 shadow-xs">
                          <span className="material-symbols-outlined text-[12px]">photo_library</span>
                          <span>{product.images.length}</span>
                        </span>
                      )}
                      {/* Zoom hint on hover/touch */}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center text-white shadow-sm">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                        </div>
                      </div>
                    </div>

                    {/* Product Details */}
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

      {/* ── 7. PRODUCT IMAGE LIGHTBOX & DETAIL MODAL (FULLSCREEN VIEWER) ── */}
      {lightboxProduct && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-between bg-black/95 backdrop-blur-xl select-none animate-fadeIn"
          role="dialog"
          aria-modal="true"
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
              if (diff > 0) handleNextImage();
              else handlePrevImage();
            }
            setTouchStartX(null);
          }}
        >
          {/* Top Bar Controls */}
          <div className="flex items-center justify-between p-4 z-30 bg-gradient-to-b from-black/85 via-black/40 to-transparent">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              {activeProductImages.length > 1 && (
                <span className="px-2.5 py-1 rounded-full bg-white/15 text-white font-mono text-[11px] font-bold backdrop-blur-md shrink-0">
                  {lightboxImageIndex + 1} / {activeProductImages.length}
                </span>
              )}
              <h3 className="text-white/95 text-[14px] font-bold truncate drop-shadow">
                {lightboxProduct.name}
              </h3>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsLightboxZoomed(!isLightboxZoomed)}
                title={isLightboxZoomed ? "Zoom out" : "Zoom in"}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isLightboxZoomed ? 'zoom_out' : 'zoom_in'}
                </span>
              </button>

              <button
                onClick={handleCloseProductLightbox}
                title="Close (Esc)"
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>
          </div>

          {/* Main Stage: Full Aspect Ratio Image */}
          <div
            className="flex-1 relative flex items-center justify-center p-3 sm:p-6 overflow-hidden cursor-default"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseProductLightbox();
            }}
          >
            {/* Prev Image Arrow */}
            {activeProductImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                className="absolute left-3 sm:left-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-xl cursor-pointer"
                aria-label="Previous image"
              >
                <span className="material-symbols-outlined text-[28px]">chevron_left</span>
              </button>
            )}

            {/* Product Image Stage */}
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              <img
                key={activeProductImages[lightboxImageIndex]}
                src={activeProductImages[lightboxImageIndex]}
                alt={lightboxProduct.name}
                onClick={() => setIsLightboxZoomed(!isLightboxZoomed)}
                className={`max-h-[58vh] sm:max-h-[68vh] max-w-[94vw] rounded-2xl shadow-2xl object-contain transition-transform duration-300 ${
                  isLightboxZoomed ? 'scale-125 sm:scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                }`}
              />
            </div>

            {/* Next Image Arrow */}
            {activeProductImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                className="absolute right-3 sm:right-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-xl cursor-pointer"
                aria-label="Next image"
              >
                <span className="material-symbols-outlined text-[28px]">chevron_right</span>
              </button>
            )}
          </div>

          {/* Bottom Card: Mini Thumbnails + Product Info + Add to Cart */}
          <div className="p-4 sm:p-5 z-30 bg-gradient-to-t from-black/95 via-black/85 to-transparent space-y-3">
            {/* Thumbnail Navigation Row */}
            {activeProductImages.length > 1 && (
              <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
                {activeProductImages.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setIsLightboxZoomed(false);
                      setLightboxImageIndex(idx);
                    }}
                    className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all cursor-pointer ${
                      lightboxImageIndex === idx
                        ? 'border-purple-400 scale-105 ring-2 ring-purple-400/60 shadow-lg'
                        : 'border-white/20 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Info Card with Price and Add to Cart */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 backdrop-blur-md max-w-lg mx-auto shadow-xl flex items-center justify-between gap-3 text-left">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block truncate">
                  {lightboxProduct.category || 'Product'}
                </span>
                <h4 className="font-bold text-[14px] sm:text-[15px] text-white truncate leading-snug">
                  {lightboxProduct.name}
                </h4>
                <div className="flex items-baseline gap-2 pt-0.5">
                  <span className="font-black text-[17px] text-white">
                    ₹{lightboxProduct.price}
                  </span>
                  {lightboxProduct.discountPrice && lightboxProduct.discountPrice > lightboxProduct.price && (
                    <span className="text-[12px] text-slate-400 line-through">
                      ₹{lightboxProduct.discountPrice}
                    </span>
                  )}
                  {(() => {
                    const r = Math.max(0, Math.min(100, Number(lightboxProduct.cashbackPercentage ?? lightboxProduct.branding?.cashbackPercentage ?? vendor.cashbackRate ?? 0)));
                    const pts = Math.round(lightboxProduct.price * (r / 100) * 100) / 100;
                    return (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                        +{pts} Pts Cashback
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Add to Cart Stepper */}
              <div className="shrink-0 w-32">
                {(() => {
                  const qty = getItemQuantity(lightboxProduct._id || lightboxProduct.id);
                  return qty === 0 ? (
                    <button
                      onClick={() => addItem(lightboxProduct, vendor)}
                      className="w-full py-2.5 rounded-xl btn-primary-gradient text-white font-black text-[12px] flex items-center justify-center gap-1 shadow-md shadow-primary/30 active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                      <span>{t('Add')}</span>
                    </button>
                  ) : (
                    <div className="w-full h-10 rounded-xl btn-primary-gradient text-white flex items-center justify-between px-2.5 shadow-md shadow-primary/30 font-black text-[13px]">
                      <button
                        onClick={() => updateQuantity(lightboxProduct._id || lightboxProduct.id, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                        title="Decrease"
                      >
                        <span className="material-symbols-outlined text-[18px]">remove</span>
                      </button>
                      <span className="font-mono font-bold text-[14px]">{qty}</span>
                      <button
                        onClick={() => updateQuantity(lightboxProduct._id || lightboxProduct.id, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                        title="Increase"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Quick-Commerce Cart Bar (like Blinkit / Zepto) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-20 inset-x-0 z-40 px-3 max-w-[480px] mx-auto lg:max-w-[1120px] lg:px-4 lg:flex lg:justify-end animate-bounce-short">
          <div
            onClick={() => navigate('/cart')}
            className="w-full lg:w-[440px] bg-slate-900 text-white rounded-2xl p-3 shadow-xl flex items-center justify-between cursor-pointer border border-purple-500/30 hover:bg-slate-850 active:scale-98 transition-all"
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
                  {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'} • ₹{Math.round((Number(cartTotalAmount) || 0) * 100) / 100}
                </p>
                <p className="text-[11px] font-bold text-amber-300 mt-0.5 flex items-center gap-1">
                  <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[14px] align-middle">celebration</span> Earn ₹{Math.round((Number(cartTotalCashback) || 0) * 100) / 100} Cashback</span>
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

      {/* Bottom Action Buttons (Get Directions | Shop at Store) */}
      <footer className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-100 p-3 max-w-[480px] mx-auto md:max-w-none">
        <div className="grid grid-cols-2 gap-2.5 md:max-w-[720px] lg:max-w-[1120px] md:mx-auto lg:flex lg:justify-end lg:gap-3 lg:px-4">
          <button
            onClick={handleGetDirections}
            className="h-11 lg:w-[210px] rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-[13px] flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[18px]">near_me</span>
            <span>{t('Get Directions')}</span>
          </button>

          <button
            onClick={products.length === 0 && cartItemsCount === 0 ? () => navigate('/pay-vendor', { state: { vendor } }) : handleShopAtStore}
            className="h-11 lg:w-[210px] rounded-full btn-primary-gradient text-white font-black text-[13px] flex items-center justify-center gap-1.5 shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {cartItemsCount > 0 ? 'shopping_bag' : products.length === 0 ? 'qr_code_scanner' : 'storefront'}
            </span>
            <span>{cartItemsCount > 0 ? `${t('Cart')} (${cartItemsCount})` : products.length === 0 ? t('Pay Counter') : t('Shop at Store')}</span>
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
                  <p className="text-slate-600 mt-0.5">
                    {typeof vendor.address === 'object'
                      ? [vendor.address.fullAddress, vendor.address.landmark, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(', ') || 'Hazratganj, Lucknow'
                      : (vendor.address || 'Hazratganj, Lucknow')}
                  </p>
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

      {/* Customer Reviews & Ratings Modal */}
      {showReviewsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[88vh] overflow-y-auto animate-scale-up text-left">
            <ReviewsTab
              vendorId={vendor._id || vendor.zeebacId}
              vendor={vendor}
              onClose={() => setShowReviewsModal(false)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
