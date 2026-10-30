import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { VendorAPI, API_BASE_URL, getMediaUrl } from '../../../services/api';
import StoreStoriesModal from '../components/StoreStoriesModal';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import useLanguageStore from '../../../store/useLanguageStore';
import useAuthStore from '../../../store/useAuthStore';
import { toast } from 'react-hot-toast';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function StorefrontPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const currentVendor = useAuthStore((s) => s.currentUser) || {};
  const [activeTab, setActiveTab] = useState('catalog');
  const [showStoriesModal, setShowStoriesModal] = useState(false);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mediaList, setMediaList] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Add / Edit Product Modal State (3-Step Wizard matching user workflow)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProductStep, setAddProductStep] = useState(1); // 1: Product Details, 2: Pricing & Stock, 3: Images & Review
  const [editingProductId, setEditingProductId] = useState(null);

  // Barcode Scanner Modal for Add Product
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const barcodeScannerRef = useRef(null);

  const initialFormState = {
    name: '',
    category: 'Instant Food',
    brand: '',
    barcode: '',
    mrp: '',
    wholesalePrice: '',
    price: '',
    discountPrice: '',
    stock: '',
    unit: 'Pcs',
    gst: 5,
    expiryDate: '',
    cashbackPercentage: 10,
    description: '',
    image: null,
    highlight: false,
    isBranded: false,
    brandCompany: '',
    brandLogo: null,
  };

  const [productForm, setProductForm] = useState(initialFormState);

  const updateProductForm = (key, value) => {
    setProductForm((prev) => ({ ...prev, [key]: value }));
  };

  // Offers & Promotions State
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferDescription, setNewOfferDescription] = useState('');
  const [newOfferType, setNewOfferType] = useState('percent');
  // Delivery & Packaging Charges State (Configured by Store Owner)
  const [deliverySettings, setDeliverySettings] = useState({
    deliveryCharge: 30,
    freeDeliveryAbove: 499,
    packagingCharge: 10,
    minOrderAmount: 0,
    isDeliveryAvailable: true,
  });
  const [isSavingDelivery, setIsSavingDelivery] = useState(false);

  const fetchDeliverySettings = async () => {
    try {
      const res = await VendorAPI.getProfile();
      if (res.success && res.data?.deliverySettings) {
        setDeliverySettings({
          deliveryCharge: Number(res.data.deliverySettings.deliveryCharge ?? 30),
          freeDeliveryAbove: Number(res.data.deliverySettings.freeDeliveryAbove ?? 499),
          packagingCharge: Number(res.data.deliverySettings.packagingCharge ?? 10),
          minOrderAmount: Number(res.data.deliverySettings.minOrderAmount ?? 0),
          isDeliveryAvailable: res.data.deliverySettings.isDeliveryAvailable !== false,
        });
      }
    } catch (e) {
      console.warn('Could not load delivery settings', e);
    }
  };

  const handleSaveDeliverySettings = async (e) => {
    if (e) e.preventDefault();
    setIsSavingDelivery(true);
    try {
      const res = await VendorAPI.updateProfile({ deliverySettings });
      if (res.success) {
        toast.success(t('Delivery & packaging settings updated successfully!'));
        if (res.data) {
          useAuthStore.getState().updateProfile(res.data);
        }
      } else {
        toast.error(res.message || t('Failed to save settings'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('Failed to save settings'));
    } finally {
      setIsSavingDelivery(false);
    }
  };


  useEffect(() => {
    fetchProducts();
    fetchMedia();
    fetchPromotions();
    fetchDeliverySettings();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await VendorAPI.getProducts();
      if (res.success) setProducts(res.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMedia = async () => {
    try {
      const res = await VendorAPI.getMedia();
      if (res.success) setMediaList(res.data || []);
    } catch (error) {
      console.error('Error fetching media:', error);
    }
  };

  const fetchPromotions = async () => {
    try {
      const res = await VendorAPI.getPromotions();
      if (res.success) setPromotions(res.data || []);
    } catch (error) {
      console.error('Error fetching promotions:', error);
    }
  };

  // Camera Barcode Scanner for Add Product Form
  useEffect(() => {
    if (showBarcodeScanner) {
      const scanner = new Html5QrcodeScanner('add-product-barcode-reader', {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      });

      scanner.render(
        (decodedText) => {
          updateProductForm('barcode', decodedText);
          setShowBarcodeScanner(false);
          toast.success(`Barcode detected: ${decodedText}`);
          scanner.clear();
        },
        () => {}
      );
      barcodeScannerRef.current = scanner;

      return () => {
        try {
          scanner.clear();
        } catch (_) {}
      };
    }
  }, [showBarcodeScanner]);

  const handleDeleteProduct = async (id) => {
    if (!window.confirm(t('Are you sure you want to delete this product?'))) return;
    try {
      await VendorAPI.deleteProduct(id);
      setProducts(products.filter((p) => p._id !== id));
      toast.success(t('Product deleted'));
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error(t('Failed to delete product'));
    }
  };

  const handleToggleHighlight = async (id) => {
    const product = products.find((p) => p._id === id);
    if (!product) return;

    try {
      const newStatus = !product.isHighlight;
      await VendorAPI.updateProduct(id, { isHighlight: newStatus });
      setProducts(
        products.map((p) => {
          if (p._id === id) return { ...p, isHighlight: newStatus };
          return p;
        })
      );
      toast.success(newStatus ? t('Product highlighted') : t('Highlight removed'));
    } catch (error) {
      console.error('Error updating highlight status:', error);
      toast.error(t('Failed to update status'));
    }
  };

  const handleProductFileChange = (e, key) => {
    const file = e.target.files[0];
    if (file) {
      updateProductForm(key, {
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        mockUrl: URL.createObjectURL(file),
      });
    }
  };

  const handleEditProduct = (product) => {
    setEditingProductId(product._id);
    setProductForm({
      name: product.name || '',
      category: product.category || 'Instant Food',
      brand: product.brand || product.branding?.brandName || '',
      barcode: product.barcode || '',
      mrp: product.mrp ?? product.price ?? '',
      wholesalePrice: product.wholesalePrice ?? product.price ?? '',
      price: product.price ?? '',
      discountPrice: product.discountPrice ?? '',
      stock: product.stock ?? '',
      unit: product.unit || 'Pcs',
      gst: product.gst ?? 5,
      expiryDate: product.expiryDate ? new Date(product.expiryDate).toISOString().split('T')[0] : '',
      cashbackPercentage: product.cashbackPercentage !== undefined ? product.cashbackPercentage : 10,
      description: product.description || '',
      image: product.image ? { mockUrl: getMediaUrl(product.image), name: 'Existing Image' } : null,
      highlight: product.isHighlight || false,
      isBranded: product.branding?.isBranded || false,
      brandCompany: product.branding?.brandCompany || '',
      brandLogo: null,
    });
    setAddProductStep(1);
    setShowAddModal(true);
  };

  const handleAddProduct = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!productForm.name || !productForm.name.trim()) {
      toast.error(t('Product Name is required.'));
      setAddProductStep(1);
      return;
    }
    const finalPrice = productForm.price || productForm.wholesalePrice || productForm.mrp;
    if (!finalPrice) {
      toast.error(t('Pricing details are required.'));
      setAddProductStep(2);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('name', productForm.name.trim());
      formData.append('category', productForm.category || 'Instant Food');
      formData.append('brand', productForm.brand || '');
      formData.append('barcode', (productForm.barcode || '').trim());

      formData.append('mrp', productForm.mrp || finalPrice);
      formData.append('wholesalePrice', productForm.wholesalePrice || finalPrice);
      formData.append('price', finalPrice);
      formData.append('discountPrice', productForm.discountPrice || '');
      formData.append('unit', productForm.unit || 'Pcs');
      formData.append('gst', productForm.gst ?? 0);
      formData.append('expiryDate', productForm.expiryDate || '');
      formData.append('stock', productForm.stock || 0);
      formData.append('cashbackPercentage', productForm.cashbackPercentage || 0);

      formData.append('description', productForm.description || '');
      formData.append('isHighlight', productForm.highlight);

      formData.append('isBranded', Boolean(productForm.brand || productForm.isBranded));
      formData.append('brandName', productForm.brand || '');
      formData.append('brandCompany', productForm.brandCompany || '');

      if (productForm.image && productForm.image.file) {
        formData.append('image', productForm.image.file);
      }
      if (productForm.brandLogo && productForm.brandLogo.file) {
        formData.append('brandLogo', productForm.brandLogo.file);
      }

      if (editingProductId) {
        await VendorAPI.updateProduct(editingProductId, formData);
        toast.success(t('Product updated successfully!'));
      } else {
        await VendorAPI.createProduct(formData);
        toast.success(t('Product created and live in catalog!'));
      }

      await fetchProducts();
      setShowAddModal(false);
      setAddProductStep(1);
      setEditingProductId(null);
      setProductForm(initialFormState);
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error(error.response?.data?.message || t('Failed to save product'));
    }
  };

  const handleMediaUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('File size must be under 5MB'));
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('mediaFile', file);
      const res = await VendorAPI.uploadMedia(formData);
      if (res.success) {
        setMediaList([res.data, ...mediaList]);
        toast.success(t('Media uploaded'));
      }
    } catch (err) {
      console.error('Upload error', err);
      toast.error(t('Failed to upload media'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteMedia = async (id) => {
    try {
      await VendorAPI.deleteMedia(id);
      setMediaList(mediaList.filter((m) => m._id !== id));
      toast.success(t('Media deleted'));
    } catch (err) {
      console.error('Delete media error', err);
      toast.error(t('Failed to delete media'));
    }
  };

  const handleAddOffer = async (e) => {
    e.preventDefault();
    if (!newOfferTitle.trim() || !newOfferDescription.trim()) return;

    try {
      const res = await VendorAPI.createPromotion({
        title: newOfferTitle,
        description: newOfferDescription,
        type: newOfferType,
      });
      if (res.success) {
        setPromotions([res.data, ...promotions]);
        setNewOfferTitle('');
        setNewOfferDescription('');
        setNewOfferType('percent');
        setShowOfferModal(false);
        toast.success(t('Offer created'));
      }
    } catch (err) {
      console.error('Create offer error', err);
      toast.error(t('Failed to create offer'));
    }
  };

  const handleDeleteOffer = async (id) => {
    try {
      await VendorAPI.deletePromotion(id);
      setPromotions(promotions.filter((p) => p._id !== id));
      toast.success(t('Offer deleted'));
    } catch (err) {
      console.error('Delete offer error', err);
      toast.error(t('Failed to delete offer'));
    }
  };

  // Filter products by search and category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p._id && p._id.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'All' ||
      (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  // Calculate live catalog stats
  const totalProductsCount = products.length;
  const activeProductsCount = products.filter((p) => (Number(p.stock) || 0) > 0).length;
  const totalStockUnits = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);

  // Available categories
  const categoryList = [
    'All',
    'Instant Food',
    'Flour & Grains',
    'Edible Oil',
    'Spices & Salt',
    'Snacks',
    'Beverages',
    'Groceries',
    'Dairy & Bakery',
    'Electronics',
    'Beauty & Personal Care',
    'Other',
  ];

  return (
    <div className="animate-reveal text-left flex flex-col min-h-full pb-16" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-sm">
        <button
          onClick={() => safeNavigateBack(navigate, '/vendor')}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-purple-700">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-purple-900 font-bold ml-1">{t('Merchant & Catalog')}</span>
      </header>

      {/* Internal Tabs */}
      <nav className="bg-white border-b border-outline-variant/20 flex overflow-x-auto hide-scrollbar select-none sticky top-[57px] md:top-0 z-30 -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0">
        {[
          { key: 'catalog', label: t('Catalog / Products'), icon: 'inventory_2' },
          { key: 'delivery', label: t('Delivery & Charges'), icon: 'local_shipping' },
          { key: 'media', label: t('Photos & Videos'), icon: 'photo_library' },
          { key: 'promotions', label: t('Promotions'), icon: 'campaign' },
          { key: 'stories', label: t('Store Stories'), icon: 'history_toggle_off' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={`flex-1 py-3 sm:py-3.5 px-2 sm:px-3 font-title-md text-[13px] sm:text-[14px] capitalize cursor-pointer border-b-2 text-center whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
              activeTab === item.key
                ? 'border-purple-700 text-purple-700 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto py-6 space-y-6">
        {activeTab === 'catalog' && (
          <div className="space-y-6 animate-reveal">
            {/* Top Merchant / Manufacturer Header Card (Screen 1 Flow) */}
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 rounded-3xl p-5 md:p-6 text-white shadow-xl shadow-purple-900/20 relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                      {currentVendor.businessType || 'Manufacturer'}
                    </span>
                    <span className="text-white/60 text-[12px]">Zeebac ID: {currentVendor.zeebacId || 'ZB-MERCHANT'}</span>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                    {currentVendor.storeName || currentVendor.name || 'ZeeBac Merchant Hub'}
                  </h1>
                  <p className="text-purple-200 text-xs md:text-sm mt-1">
                    Upload products once • Cashier POS Barcode Billing • Automatic stock transfer to Wholesaler IDs
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm(initialFormState);
                      setAddProductStep(1);
                      setShowAddModal(true);
                    }}
                    className="flex items-center gap-2 bg-white text-purple-900 font-bold px-4 py-2.5 rounded-xl hover:bg-purple-50 active:scale-95 transition-all shadow-md cursor-pointer text-[13px]"
                  >
                    <span className="material-symbols-outlined text-[20px] text-purple-700">add_circle</span>
                    {t('Add / Update Products')}
                  </button>

                  <button
                    onClick={() => navigate('/vendor/b2b-billing')}
                    className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 text-purple-950 font-black px-4 py-2.5 rounded-xl hover:from-amber-300 hover:to-amber-400 active:scale-95 transition-all shadow-md cursor-pointer text-[13px]"
                  >
                    <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
                    {t('B2B Billing POS')}
                  </button>
                </div>
              </div>

              {/* 3 Metric Cards matching user diagram Screen 1 */}
              <div className="grid grid-cols-3 gap-3 md:gap-4 mt-6 pt-5 border-t border-white/10">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 md:p-4 border border-white/10 text-center">
                  <p className="text-[11px] md:text-xs text-purple-200 font-semibold uppercase">{t('Total Products')}</p>
                  <p className="text-xl md:text-2xl font-black text-white mt-1">{totalProductsCount}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 md:p-4 border border-white/10 text-center">
                  <p className="text-[11px] md:text-xs text-emerald-300 font-semibold uppercase">{t('Active Products')}</p>
                  <p className="text-xl md:text-2xl font-black text-emerald-300 mt-1">{activeProductsCount}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 md:p-4 border border-white/10 text-center">
                  <p className="text-[11px] md:text-xs text-amber-200 font-semibold uppercase">{t('Stock Units')}</p>
                  <p className="text-xl md:text-2xl font-black text-amber-300 mt-1">{totalStockUnits.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Quick Action Banner: B2B Wholesaler Transfer Highlights */}
            <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-100/60 p-4 md:p-5 rounded-3xl border border-purple-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-purple-700 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-700/30">
                  <span className="material-symbols-outlined text-[26px]">swap_horizontal_circle</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-[15px] text-purple-950">
                      {t('Wholesaler Automatic Stock Transfer Engine')}
                    </h3>
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Live
                    </span>
                  </div>
                  <p className="text-[12px] text-purple-900/70 mt-0.5 max-w-xl">
                    Sell to wholesalers via barcode billing. Once payment (UPI Intent / Cash) is verified, inventory moves
                    automatically to the buyer's ID without duplicate entries!
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/vendor/b2b-billing')}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-[12.5px] font-bold rounded-xl shadow-md shadow-purple-700/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <span>{t('Launch Cashier Billing')}</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            {/* Search & Category Filter Section (Screen 4 Flow) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('Search by product name, barcode or brand...')}
                    className="w-full h-12 pl-11 pr-10 bg-white border border-gray-200 rounded-2xl text-[14px] font-medium outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10 shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => {
                    setEditingProductId(null);
                    setProductForm(initialFormState);
                    setAddProductStep(1);
                    setShowAddModal(true);
                  }}
                  className="h-12 px-5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm shadow-purple-700/20 active:scale-95 transition-all cursor-pointer text-[13px]"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span>{t('Add New')}</span>
                </button>
              </div>

              {/* Category Pills (Screen 4 Flow) */}
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {categoryList.map((cat) => {
                  const count =
                    cat === 'All'
                      ? products.length
                      : products.filter((p) => p.category && p.category.toLowerCase() === cat.toLowerCase()).length;
                  const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      {cat} {count > 0 && <span className="opacity-80">({count})</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product List View */}
            <div className="space-y-3">
              {loading ? (
                <div className="py-16 text-center text-gray-400">
                  <div className="animate-spin w-8 h-8 border-4 border-purple-700 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="font-bold text-gray-600">{t('Loading product catalog...')}</p>
                </div>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const stockNum = Number(product.stock) || 0;
                  const isOutOfStock = stockNum <= 0;
                  const unitLabel = product.unit || 'Pcs';

                  return (
                    <div
                      key={product._id}
                      className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-3xl border border-gray-100 hover:border-purple-200 shadow-sm hover:shadow-md transition-all animate-reveal"
                    >
                      {/* Thumbnail */}
                      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                        <img
                          src={
                            product.image
                              ? getMediaUrl(product.image)
                              : 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80'
                          }
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-red-600/70 backdrop-blur-[1px] flex items-center justify-center">
                            <span className="text-[10px] font-black text-white uppercase tracking-wider">{t('Out of stock')}</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-[15px] md:text-[16px] font-black text-gray-900 leading-tight">
                                {product.name}
                              </h3>
                              {product.brand && (
                                <p className="text-[12px] text-purple-700 font-bold mt-0.5">
                                  {product.brand}
                                </p>
                              )}
                            </div>

                            {/* Active Badge */}
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                !isOutOfStock ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {!isOutOfStock ? t('Active') : t('Inactive')}
                            </span>
                          </div>

                          {/* Price & Stock Line */}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[13px]">
                            <span className="font-black text-purple-900 text-[15px]">
                              ₹{product.price || product.wholesalePrice || 0}
                            </span>
                            {product.mrp && product.mrp > (product.price || 0) && (
                              <span className="text-gray-400 line-through text-[12px]">
                                MRP ₹{product.mrp}
                              </span>
                            )}
                            {product.wholesalePrice && (
                              <span className="text-amber-800 bg-amber-50 border border-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                                Wholesale: ₹{product.wholesalePrice}
                              </span>
                            )}
                          </div>

                          {/* Chips */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            {/* Stock badge */}
                            <span
                              className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg border ${
                                !isOutOfStock
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              Stock: {stockNum} {unitLabel}
                            </span>

                            {/* Barcode badge */}
                            {product.barcode && (
                              <span className="bg-gray-100 text-gray-700 border border-gray-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
                                {product.barcode}
                              </span>
                            )}

                            {/* Category chip */}
                            <span className="bg-purple-50 text-purple-700 text-[11px] font-bold px-2 py-0.5 rounded-lg">
                              {product.category || 'General'}
                            </span>

                            {/* Product Cashback Points */}
                            <span className="bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-lg">
                              🪙 {product.cashbackPercentage ?? 10}% Points
                            </span>

                            {/* Supplier pill if transferred via B2B */}
                            {product.supplierDetails?.storeName && (
                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">verified</span>
                                Supplied by: {product.supplierDetails.storeName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-between sm:flex-col sm:justify-end sm:items-end gap-3 sm:gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100 sm:min-w-[120px]">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <span className="text-[11px] font-bold text-gray-500 sm:hidden">{t('Highlight')}</span>
                          <div
                            onClick={() => handleToggleHighlight(product._id)}
                            className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors ${
                              product.isHighlight ? 'bg-purple-700' : 'bg-gray-200'
                            }`}
                            title={t('Highlight Product')}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                product.isHighlight ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </div>
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors cursor-pointer"
                            title={t('Edit Product')}
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product._id)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                            title={t('Delete Product')}
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-16 text-center text-gray-400 bg-white rounded-3xl border border-gray-100">
                  <span className="material-symbols-outlined text-[48px] opacity-40 mb-2 text-purple-700">inventory_2</span>
                  <p className="font-bold text-[16px] text-gray-700">{t('No products found')}</p>
                  <p className="text-[13px] text-gray-500 mt-0.5">
                    {searchQuery ? t('Try clearing search filter') : t("Click 'Add / Update Products' to upload items.")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}


        {/* Delivery & Charges Tab (Zomato-style Store Owner Controls) */}
        {activeTab === 'delivery' && (
          <div className="space-y-6 animate-reveal max-w-4xl mx-auto">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-purple-200 text-xs font-bold mb-2">
                  <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                  <span>Store Delivery Settings</span>
                </div>
                <h2 className="text-2xl font-black text-white">Delivery & Packaging Charges</h2>
                <p className="text-xs text-purple-200 mt-1 max-w-lg leading-relaxed">
                  Decide your store's customer delivery fee, free delivery threshold, and packaging charges. These will be added to the customer's bill at checkout.
                </p>
              </div>

              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15">
                <div>
                  <p className="text-xs text-purple-200 font-medium">Home Delivery</p>
                  <p className="text-sm font-black text-white">
                    {deliverySettings.isDeliveryAvailable ? 'Active' : 'Disabled'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deliverySettings.isDeliveryAvailable}
                    onChange={(e) => setDeliverySettings({ ...deliverySettings, isDeliveryAvailable: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* Charges Configuration Cards */}
            <form onSubmit={handleSaveDeliverySettings} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6 text-left">
              <h3 className="font-display font-black text-lg text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700">payments</span>
                <span>Configure Fees & Thresholds</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Standard Delivery Fee */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                    Standard Delivery Fee (₹)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Base fee charged for delivering an order to customer's address.
                  </p>
                  <div className="relative mt-2">
                    <span className="absolute left-3.5 top-3 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliverySettings.deliveryCharge}
                      onChange={(e) => setDeliverySettings({ ...deliverySettings, deliveryCharge: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-slate-900 focus:outline-none focus:border-purple-600 text-base"
                      placeholder="e.g. 30"
                    />
                  </div>
                </div>

                {/* 2. Free Delivery Above Threshold */}
                <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 space-y-1.5">
                  <label className="block text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                    <span>Free Delivery Threshold (₹)</span>
                    <span className="material-symbols-outlined text-emerald-600 text-[16px]">verified</span>
                  </label>
                  <p className="text-[11px] text-emerald-700">
                    Orders above this amount qualify for 100% Free Delivery for customers.
                  </p>
                  <div className="relative mt-2">
                    <span className="absolute left-3.5 top-3 text-emerald-600 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliverySettings.freeDeliveryAbove}
                      onChange={(e) => setDeliverySettings({ ...deliverySettings, freeDeliveryAbove: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full pl-8 pr-4 py-2.5 bg-white border border-emerald-200 rounded-xl font-black text-emerald-900 focus:outline-none focus:border-emerald-600 text-base"
                      placeholder="e.g. 499"
                    />
                  </div>
                </div>

                {/* 3. Packaging & Handling Fee */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                    Packaging & Handling Charge (₹)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Cost of packaging material, bags, or handling added to customer bill.
                  </p>
                  <div className="relative mt-2">
                    <span className="absolute left-3.5 top-3 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliverySettings.packagingCharge}
                      onChange={(e) => setDeliverySettings({ ...deliverySettings, packagingCharge: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-slate-900 focus:outline-none focus:border-purple-600 text-base"
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>

                {/* 4. Minimum Order Amount */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                    Minimum Order Amount (₹)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Minimum cart value required before delivery is allowed (0 for no limit).
                  </p>
                  <div className="relative mt-2">
                    <span className="absolute left-3.5 top-3 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliverySettings.minOrderAmount}
                      onChange={(e) => setDeliverySettings({ ...deliverySettings, minOrderAmount: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-slate-900 focus:outline-none focus:border-purple-600 text-base"
                      placeholder="e.g. 0"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Checkout Preview Box */}
              <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-100 space-y-2">
                <p className="text-xs font-extrabold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  <span>How Customer Sees Your Store at Checkout</span>
                </p>
                <div className="bg-white p-3.5 rounded-xl border border-purple-100 text-[12px] space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>Delivery Charge:</span>
                    <span className="font-bold text-slate-900">
                      ₹{deliverySettings.deliveryCharge} (Free above ₹{deliverySettings.freeDeliveryAbove})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Packaging Fee:</span>
                    <span className="font-bold text-slate-900">₹{deliverySettings.packagingCharge}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Delivery Status:</span>
                    <span>{deliverySettings.isDeliveryAvailable ? '🟢 Accepting Home Delivery Orders' : '🔴 Delivery Temporarily Disabled'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingDelivery}
                  className="px-6 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm shadow-md shadow-purple-700/25 active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingDelivery ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving Settings...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Save Delivery Settings</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Media / Photos & Videos Tab */}
        {activeTab === 'media' && (
          <div className="space-y-4 animate-reveal">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-[18px] font-extrabold text-gray-900">{t('Store Gallery')}</h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="aspect-square rounded-2xl border-2 border-dashed border-purple-300 flex flex-col items-center justify-center text-purple-700 hover:bg-purple-50 transition-colors active:scale-95 cursor-pointer">
                <span className="material-symbols-outlined text-[32px]">add_photo_alternate</span>
                <span className="text-[11px] font-bold mt-1">{t('Upload')}</span>
                <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" />
              </label>

              {isUploading && (
                <div className="aspect-square rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center">
                  <div className="animate-spin w-6 h-6 border-2 border-purple-700 border-t-transparent rounded-full mb-2" />
                  <span className="text-[11px] font-bold text-gray-500">{t('Uploading...')}</span>
                </div>
              )}
              {mediaList.map((item) => (
                <div key={item._id} className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 group animate-reveal">
                  {item.type === 'video' ? (
                    <video src={getMediaUrl(item.url)} className="w-full h-full object-cover" controls={false} muted loop playsInline />
                  ) : (
                    <img src={getMediaUrl(item.url)} alt="Gallery" className="w-full h-full object-cover" />
                  )}
                  {item.type === 'video' && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                      <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                        play_arrow
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => handleDeleteMedia(item._id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Promotions Tab */}
        {activeTab === 'promotions' && (
          <div className="space-y-4 animate-reveal">
            <div className="flex justify-between items-center bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="font-display text-[16px] font-black text-gray-900">{t('Active Promotions')}</h3>
              <button
                onClick={() => setShowOfferModal(true)}
                className="flex items-center gap-1.5 bg-purple-700 text-white px-3.5 py-1.5 rounded-xl font-bold text-[12px] hover:bg-purple-800 active:scale-95 transition-all cursor-pointer shadow-sm shadow-purple-700/25"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                {t('Create Offer')}
              </button>
            </div>

            <div className="space-y-3">
              {promotions.map((promo) => (
                <div key={promo._id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-[15px] text-gray-900">{promo.title}</h4>
                    <p className="text-[12px] text-gray-500 mt-0.5">{promo.description}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteOffer(promo._id)}
                    className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}
              {promotions.length === 0 && (
                <div className="py-12 text-center text-gray-400">
                  <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">campaign</span>
                  <p className="font-bold text-[16px] text-gray-600">{t('No active offers')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 24-Hour Stories Tab */}
        {activeTab === 'stories' && (
          <div className="space-y-4 animate-reveal">
            <div className="flex justify-between items-center bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2px] flex items-center justify-center">
                  <div className="w-full h-full bg-white rounded-full flex items-center justify-center text-pink-600">
                    <span className="material-symbols-outlined text-[18px]">history_toggle_off</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-gray-900 leading-tight">{t('24-Hour Stories (Instagram Style)')}</h3>
                  <p className="text-[11px] text-gray-500">{t('Temporary daily deals & updates visible on customer Home feed')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowStoriesModal(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white px-3.5 py-2 rounded-xl font-bold text-[12px] hover:shadow active:scale-95 transition-all cursor-pointer shadow-sm flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                {t('Add Story')}
              </button>
            </div>
          </div>
        )}
      </main>

      <StoreStoriesModal isOpen={showStoriesModal} onClose={() => setShowStoriesModal(false)} />

      {/* 3-Step Add / Update Product Wizard Modal (Screens 2 & 3 in Reference Flow) */}
      {showAddModal &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-gray-50 animate-reveal m-0 overflow-hidden text-left">
            {/* Header */}
            <header className="flex-shrink-0 sticky top-0 z-30 bg-white border-b border-gray-100 flex items-center px-4 h-16 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  if (addProductStep > 1) {
                    setAddProductStep((s) => s - 1);
                  } else {
                    setShowAddModal(false);
                    setAddProductStep(1);
                    setEditingProductId(null);
                  }
                }}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-purple-700">
                  {addProductStep > 1 ? 'arrow_back' : 'close'}
                </span>
              </button>
              <div className="ml-2">
                <span className="font-display text-[17px] font-black text-gray-900">
                  {editingProductId ? t('Update Product') : t('Add / Update Products')}
                </span>
                <p className="text-[11px] text-gray-500">
                  {addProductStep === 1
                    ? 'Step 1: Product Details (नाम, श्रेणी, बारकोड)'
                    : addProductStep === 2
                    ? 'Step 2: Pricing & Stock (मूल्य एवं स्टॉक)'
                    : 'Step 3: Review & Upload (फोटो, विवरण एवं सबमिट)'}
                </p>
              </div>

              {/* Step indicator bubbles */}
              <div className="ml-auto flex items-center gap-1.5">
                {[1, 2, 3].map((stepNum) => (
                  <div
                    key={stepNum}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${
                      addProductStep === stepNum
                        ? 'bg-purple-700 text-white scale-110 shadow-sm'
                        : addProductStep > stepNum
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {addProductStep > stepNum ? '✓' : stepNum}
                  </div>
                ))}
              </div>
            </header>

            {/* Stepper Navigation bar */}
            <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between text-[12px] font-bold">
              <button
                onClick={() => setAddProductStep(1)}
                className={`flex-1 text-center py-1 border-b-2 transition-all ${
                  addProductStep === 1 ? 'border-purple-700 text-purple-700' : 'border-transparent text-gray-400'
                }`}
              >
                1. Product Details
              </button>
              <button
                onClick={() => setAddProductStep(2)}
                className={`flex-1 text-center py-1 border-b-2 transition-all ${
                  addProductStep === 2 ? 'border-purple-700 text-purple-700' : 'border-transparent text-gray-400'
                }`}
              >
                2. Pricing & Stock
              </button>
              <button
                onClick={() => setAddProductStep(3)}
                className={`flex-1 text-center py-1 border-b-2 transition-all ${
                  addProductStep === 3 ? 'border-purple-700 text-purple-700' : 'border-transparent text-gray-400'
                }`}
              >
                3. Review & Upload
              </button>
            </div>

            <main className="flex-1 overflow-y-auto w-full">
              <div className="max-w-[640px] mx-auto w-full p-4 md:p-6 pb-28 space-y-6">
                {/* STEP 1: Product Details (Screen 2 Flow) */}
                {addProductStep === 1 && (
                  <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-100 space-y-5 animate-reveal">
                    <div>
                      <h2 className="text-[18px] font-black text-gray-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-purple-700">info</span>
                        {t('Product Details')}
                      </h2>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {t('Enter product name, category, brand and barcode.')}
                      </p>
                    </div>

                    {/* Product Name */}
                    <div className="space-y-1">
                      <label className="text-[12px] font-bold text-gray-700 uppercase">
                        {t('Product Name')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={productForm.name}
                        onChange={(e) => updateProductForm('name', e.target.value)}
                        placeholder="e.g. Maggi 2 Minute Noodles (70g)"
                        className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] transition-all"
                      />
                    </div>

                    {/* Category Dropdown */}
                    <div className="space-y-1">
                      <label className="text-[12px] font-bold text-gray-700 uppercase">
                        {t('Category')} *
                      </label>
                      <select
                        value={productForm.category}
                        onChange={(e) => updateProductForm('category', e.target.value)}
                        className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] text-gray-800 transition-all cursor-pointer"
                      >
                        {categoryList
                          .filter((c) => c !== 'All')
                          .map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Brand */}
                    <div className="space-y-1">
                      <label className="text-[12px] font-bold text-gray-700 uppercase">
                        {t('Brand Name')} *
                      </label>
                      <input
                        type="text"
                        value={productForm.brand}
                        onChange={(e) => updateProductForm('brand', e.target.value)}
                        placeholder="e.g. Nestlé Maggi / Aashirvaad / Fortune"
                        className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] transition-all"
                      />
                    </div>

                    {/* Barcode / QR Code with camera scan trigger */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('Barcode / QR Code')} *
                        </label>
                        <span className="text-[11px] text-purple-700 font-bold">
                          {t('Scan via camera or type')}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={productForm.barcode}
                          onChange={(e) => updateProductForm('barcode', e.target.value)}
                          placeholder="e.g. 8901008310247"
                          className="flex-1 h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-mono font-bold text-[14px] transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBarcodeScanner(true)}
                          className="h-12 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm shadow-purple-700/25"
                          title="Scan with Camera"
                        >
                          <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                          <span className="hidden sm:inline text-[12px]">{t('Scan')}</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {t('This barcode enables Cashier POS scanning for instant billing and wholesaler transfers.')}
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!productForm.name.trim()) {
                            toast.error(t('Please enter a product name'));
                            return;
                          }
                          setAddProductStep(2);
                        }}
                        className="w-full h-12 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 shadow-md shadow-purple-700/25 active:scale-98 transition-all cursor-pointer"
                      >
                        <span>{t('Next: Pricing & Stock')}</span>
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: Pricing & Stock (Screens 2 & 3 Flow) */}
                {addProductStep === 2 && (
                  <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-100 space-y-5 animate-reveal">
                    <div>
                      <h2 className="text-[18px] font-black text-gray-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-purple-700">payments</span>
                        {t('Pricing & Stock Management')}
                      </h2>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {t('Configure MRP, Wholesale rate, retail price, inventory quantity and GST.')}
                      </p>
                    </div>

                    {/* MRP & Wholesale Price */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('MRP (₹)')} *
                        </label>
                        <input
                          type="number"
                          value={productForm.mrp}
                          onChange={(e) => updateProductForm('mrp', e.target.value)}
                          placeholder="e.g. 20"
                          className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('Wholesale Price (₹)')} *
                        </label>
                        <input
                          type="number"
                          value={productForm.wholesalePrice}
                          onChange={(e) => updateProductForm('wholesalePrice', e.target.value)}
                          placeholder="e.g. 12"
                          className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] transition-all"
                        />
                      </div>
                    </div>

                    {/* Retail / Selling Price */}
                    <div className="space-y-1">
                      <label className="text-[12px] font-bold text-gray-700 uppercase">
                        {t('Customer / Selling Price (₹)')} *
                      </label>
                      <input
                        type="number"
                        value={productForm.price}
                        onChange={(e) => updateProductForm('price', e.target.value)}
                        placeholder="e.g. 18"
                        className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] transition-all"
                      />
                    </div>

                    {/* Quantity & Unit */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('Quantity / Stock')} *
                        </label>
                        <input
                          type="number"
                          value={productForm.stock}
                          onChange={(e) => updateProductForm('stock', e.target.value)}
                          placeholder="e.g. 5000"
                          className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14.5px] transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('Unit')}
                        </label>
                        <select
                          value={productForm.unit}
                          onChange={(e) => updateProductForm('unit', e.target.value)}
                          className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14px] text-gray-800 transition-all cursor-pointer"
                        >
                          <option value="Pcs">Pcs</option>
                          <option value="Kg">Kg</option>
                          <option value="Gram">Gram</option>
                          <option value="Box">Box</option>
                          <option value="Pack">Pack</option>
                          <option value="Liter">Liter</option>
                          <option value="Meter">Meter</option>
                        </select>
                      </div>
                    </div>

                    {/* GST & Expiry Date */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('GST (%)')}
                        </label>
                        <select
                          value={productForm.gst}
                          onChange={(e) => updateProductForm('gst', Number(e.target.value))}
                          className="w-full h-12 px-4 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-bold text-[14px] text-gray-800 transition-all cursor-pointer"
                        >
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-gray-700 uppercase">
                          {t('Expiry Date')}
                        </label>
                        <input
                          type="date"
                          value={productForm.expiryDate}
                          onChange={(e) => updateProductForm('expiryDate', e.target.value)}
                          className="w-full h-12 px-3 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-medium text-[13.5px] transition-all"
                        />
                      </div>
                    </div>

                    {/* Decided Product Cashback (Zeebac Points 1 Pt = 1 Rs) */}
                    <div className="bg-purple-50/70 rounded-2xl p-4 border border-purple-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-purple-700">stars</span>
                          <span className="text-[13px] font-black text-purple-950">
                            {t('Customer Product Cashback Rate')}
                          </span>
                        </div>
                        <span className="text-[14px] font-black text-purple-900 bg-white px-2.5 py-0.5 rounded-lg border border-purple-200">
                          {productForm.cashbackPercentage}% Points
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={productForm.cashbackPercentage}
                        onChange={(e) => updateProductForm('cashbackPercentage', Number(e.target.value))}
                        className="w-full accent-purple-700 h-2 bg-purple-200 rounded-lg cursor-pointer"
                      />
                      <p className="text-[11px] text-purple-900/70">
                        Customers earn {productForm.cashbackPercentage}% cashback as ZeeBac Points (1 Point = ₹1) redeemable at any registered merchant!
                      </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setAddProductStep(1)}
                        className="flex-1 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-[14px] flex items-center justify-center gap-1 active:scale-98 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        <span>{t('Back')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddProductStep(3)}
                        className="flex-[2] h-12 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 shadow-md shadow-purple-700/25 active:scale-98 transition-all cursor-pointer"
                      >
                        <span>{t('Next: Images & Review')}</span>
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Images & Review (Screen 3 Flow) */}
                {addProductStep === 3 && (
                  <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-100 space-y-5 animate-reveal">
                    <div>
                      <h2 className="text-[18px] font-black text-gray-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-purple-700">photo_library</span>
                        {t('Product Images & Review')}
                      </h2>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {t('Upload product photo, description and publish live to store.')}
                      </p>
                    </div>

                    {/* Image Upload Card */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-bold text-gray-700 uppercase">
                        {t('Product Image')} *
                      </label>
                      <div className="border-2 border-dashed border-gray-200 hover:border-purple-400 rounded-2xl p-4 text-center transition-all bg-gray-50/50">
                        {productForm.image?.mockUrl ? (
                          <div className="relative inline-block">
                            <img
                              src={productForm.image.mockUrl}
                              alt="Preview"
                              className="w-36 h-36 object-cover rounded-xl shadow-md border border-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => updateProductForm('image', null)}
                              className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-700 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center py-6 cursor-pointer">
                            <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mb-2">
                              <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
                            </div>
                            <span className="text-[14px] font-black text-gray-800">{t('Upload Product Image')}</span>
                            <span className="text-[11px] text-gray-500 mt-0.5">{t('PNG, JPG or WEBP up to 5MB')}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleProductFileChange(e, 'image')}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Product Description */}
                    <div className="space-y-1">
                      <label className="text-[12px] font-bold text-gray-700 uppercase">
                        {t('Product Description')}
                      </label>
                      <textarea
                        rows={3}
                        value={productForm.description}
                        onChange={(e) => updateProductForm('description', e.target.value)}
                        placeholder="e.g. Maggi 2 Minute Noodles, 70g. Best before 6 months from packaging."
                        className="w-full p-3 bg-gray-50 focus:bg-white border-2 border-gray-200 focus:border-purple-600 rounded-xl outline-none font-medium text-[13.5px] transition-all resize-none"
                      />
                    </div>

                    {/* Highlight switch */}
                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                      <div>
                        <p className="text-[13px] font-bold text-gray-900">{t('Highlight Product')}</p>
                        <p className="text-[11px] text-gray-500">{t('Feature this product prominently on store feed')}</p>
                      </div>
                      <div
                        onClick={() => updateProductForm('highlight', !productForm.highlight)}
                        className={`w-11 h-6 rounded-full p-1 flex items-center cursor-pointer transition-colors ${
                          productForm.highlight ? 'bg-purple-700' : 'bg-gray-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            productForm.highlight ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Review Summary Card */}
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 space-y-2 text-[12.5px]">
                      <h4 className="font-black text-gray-900 uppercase text-[11px] tracking-wider mb-2">
                        {t('Listing Summary')}
                      </h4>
                      <div className="flex justify-between text-gray-600">
                        <span>{t('Product Name')}:</span>
                        <span className="font-bold text-gray-900">{productForm.name || '-'}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>{t('Barcode')}:</span>
                        <span className="font-mono font-bold text-gray-900">{productForm.barcode || '-'}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>{t('Stock & Unit')}:</span>
                        <span className="font-bold text-emerald-700">
                          {productForm.stock || '0'} {productForm.unit}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>{t('Wholesale Price / MRP')}:</span>
                        <span className="font-bold text-purple-900">
                          ₹{productForm.wholesalePrice || productForm.price || '0'} / ₹{productForm.mrp || productForm.price || '0'}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>{t('Customer Cashback Points')}:</span>
                        <span className="font-bold text-amber-700">
                          🪙 {productForm.cashbackPercentage}% Points
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setAddProductStep(2)}
                        className="flex-1 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-[14px] flex items-center justify-center gap-1 active:scale-98 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        <span>{t('Back')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddProduct}
                        className="flex-[2] h-12 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white rounded-xl font-black text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-purple-700/30 active:scale-98 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[20px]">check_circle</span>
                        <span>{editingProductId ? t('Save Changes') : t('Save Product & Go Live')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </main>
          </div>,
          document.body
        )}

      {/* Camera Barcode Scanner Modal */}
      {showBarcodeScanner &&
        createPortal(
          <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl relative animate-scale-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-700">barcode_scanner</span>
                  <h3 className="font-black text-gray-900 text-lg">Scan Barcode / QR</h3>
                </div>
                <button
                  onClick={() => setShowBarcodeScanner(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl bg-black border-2 border-purple-600/50">
                <div id="add-product-barcode-reader" className="w-full" />
              </div>

              <p className="text-xs text-center text-gray-500">
                Align the product barcode within the camera viewfinder to automatically capture it.
              </p>
            </div>
          </div>,
          document.body
        )}

      {/* Create Promotion Offer Modal */}
      {showOfferModal &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
            <form
              onSubmit={handleAddOffer}
              className="bg-white w-full max-w-[320px] rounded-3xl p-6 shadow-2xl relative mx-auto text-left space-y-4"
            >
              <button
                type="button"
                onClick={() => setShowOfferModal(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>

              <h3 className="font-display font-black text-[20px] text-gray-900">{t('Create Promotion')}</h3>

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-500 uppercase">{t('Offer Title')}</label>
                  <input
                    type="text"
                    required
                    value={newOfferTitle}
                    onChange={(e) => setNewOfferTitle(e.target.value)}
                    placeholder="e.g. Weekend Discount"
                    className="w-full h-11 px-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-purple-600 focus:bg-white text-[13.5px] font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-500 uppercase">{t('Offer Description')}</label>
                  <textarea
                    required
                    value={newOfferDescription}
                    onChange={(e) => setNewOfferDescription(e.target.value)}
                    placeholder="e.g. Get 10% cashback on all orders above ₹500"
                    className="w-full min-h-16 p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-purple-600 focus:bg-white text-[13.5px] font-medium resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-500 uppercase">{t('Offer Type Icon')}</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewOfferType('percent')}
                      className={`flex-1 h-11 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1 border transition-all ${
                        newOfferType === 'percent'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">percent</span> {t('Cashback')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewOfferType('redeem')}
                      className={`flex-1 h-11 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1 border transition-all ${
                        newOfferType === 'redeem'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">redeem</span> {t('Gift Box')}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-12 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-700/25 cursor-pointer mt-4"
              >
                {t('Launch Offer')}
              </button>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}
