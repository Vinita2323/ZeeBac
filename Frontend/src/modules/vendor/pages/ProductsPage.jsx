import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { VendorAPI, getMediaUrl } from '../../../services/api';
import useLanguageStore from '../../../store/useLanguageStore';
import useAuthStore from '../../../store/useAuthStore';
import { toast } from 'react-hot-toast';
import ProductBarcodeScannerModal from '../../../components/common/ProductBarcodeScannerModal';
import { getStoreTypeConfig } from '../../user/data/storeCategoryConfigs';

export default function ProductsPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const currentVendor = useAuthStore((s) => s.currentUser) || {};

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Custom Category State
  const storePreset = getStoreTypeConfig(currentVendor?.category);
  const defaultCategoryList = (storePreset?.categorySections?.[0]?.categories || []).map(c => c.name);
  const fallbackDefaults = defaultCategoryList.length > 0
    ? defaultCategoryList
    : ['Bestsellers', 'Featured', 'New Arrivals', 'Daily Essentials', 'Others'];

  const [storeCategories, setStoreCategories] = useState([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isCustomCategoryInput, setIsCustomCategoryInput] = useState(false);
  const [customCategoryInputText, setCustomCategoryInputText] = useState('');

  // Add / Edit Product Modal State (3-Step Wizard)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProductStep, setAddProductStep] = useState(1);
  const [editingProductId, setEditingProductId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Barcode Scanner Modal
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // Direct Image Upload State
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef(null);

  const initialFormState = {
    productId: '',
    name: '',
    category: fallbackDefaults[0] || 'General',
    brand: '',
    barcode: '',
    batchNumber: '',
    expiryDate: '',
    mrp: '',
    wholesalePrice: '',
    price: '',
    discountPrice: '',
    stock: '',
    unit: 'Pcs',
    gst: 5,
    cashbackPercentage: currentVendor?.cashbackRate || 5,
    description: '',
    image: null,
    images: [],
  };

  const [productForm, setProductForm] = useState(initialFormState);

  const updateProductForm = (key, value) => {
    setProductForm((prev) => ({ ...prev, [key]: value }));
  };

  // Fetch Products
  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await VendorAPI.getProducts();
      if (res.success) {
        setProducts(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load products', err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await VendorAPI.getCategories();
      if (res.success && res.data?.categories) {
        setStoreCategories(res.data.categories.filter(c => c !== 'All'));
      }
    } catch (_) {
      setStoreCategories(fallbackDefaults);
    }
  };

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [currentVendor?.category]);

  // Combined Unique Categories
  const allCategories = Array.from(new Set([
    'All',
    ...fallbackDefaults,
    ...storeCategories,
    ...products.map(p => p.category).filter(Boolean)
  ]));

  const handleAddCategory = async (catName) => {
    const trimmed = String(catName || '').trim();
    if (!trimmed) return;
    try {
      setIsAddingCategory(true);
      await VendorAPI.addCategory(trimmed);
      setStoreCategories(prev => Array.from(new Set([...prev, trimmed])));
      setSelectedCategory(trimmed);
      updateProductForm('category', trimmed);
      toast.success(`Category "${trimmed}" added!`);
      setShowAddCategoryModal(false);
      setNewCategoryName('');
      return trimmed;
    } catch (err) {
      setStoreCategories(prev => Array.from(new Set([...prev, trimmed])));
      setSelectedCategory(trimmed);
      updateProductForm('category', trimmed);
      toast.success(`Category "${trimmed}" added!`);
      setShowAddCategoryModal(false);
      setNewCategoryName('');
      return trimmed;
    } finally {
      setIsAddingCategory(false);
    }
  };

  // Filter Products by Search & Category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.productId?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'All' ||
      p.category?.toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  // Open Edit Modal
  const handleEditProduct = (p) => {
    setEditingProductId(p._id);
    setImageFile(null);
    setImagePreview(p.image ? getMediaUrl(p.image) : (p.images && p.images[0] ? getMediaUrl(p.images[0]) : ''));
    setShowUrlInput(false);
    setProductForm({
      productId: p.productId || '',
      name: p.name || '',
      category: p.category || 'Snacks',
      brand: p.brand || '',
      barcode: p.barcode || '',
      batchNumber: p.batchNumber || '',
      expiryDate: p.expiryDate ? p.expiryDate.split('T')[0] : '',
      mrp: p.mrp || p.price || '',
      wholesalePrice: p.wholesalePrice || '',
      price: p.price || '',
      discountPrice: p.discountPrice || '',
      stock: p.stock ?? '',
      unit: p.unit || 'Pcs',
      gst: p.gst || 5,
      cashbackPercentage: p.cashbackPercentage || currentVendor?.cashbackRate || 5,
      description: p.description || '',
      image: p.image || null,
      images: p.images || [],
    });
    setAddProductStep(1);
    setShowAddModal(true);
  };

  // Image Selection & Upload Handlers
  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WEBP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    updateProductForm('image', '');
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    updateProductForm('image', '');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUrlChange = (url) => {
    updateProductForm('image', url);
    setImageFile(null);
    setImagePreview(url);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Toggle In Stock / Out of Stock
  const handleToggleStock = async (product) => {
    const newStock = product.stock > 0 ? 0 : 50;
    try {
      const res = await VendorAPI.updateProduct(product._id, { stock: newStock });
      if (res.success) {
        setProducts((prev) =>
          prev.map((item) => (item._id === product._id ? { ...item, stock: newStock } : item))
        );
        toast.success(newStock > 0 ? 'Product marked In Stock' : 'Product marked Out of Stock');
      }
    } catch {
      toast.error('Failed to update stock status');
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id, name) => {
    if (!window.confirm(`Delete product "${name}"?`)) return;
    try {
      const res = await VendorAPI.deleteProduct(id);
      if (res.success) {
        setProducts((prev) => prev.filter((p) => p._id !== id));
        toast.success(`"${name}" deleted!`);
      }
    } catch {
      toast.error('Failed to delete product');
    }
  };

  // Submit Product (Create / Update)
  const handleSubmitProduct = async (e) => {
    if (e) e.preventDefault();
    if (!productForm.name.trim()) return toast.error('Product name is required');
    if (!productForm.price || Number(productForm.price) <= 0) return toast.error('Enter valid selling price');

    setIsSubmitting(true);
    try {
      let res;
      if (imageFile) {
        // Send multipart form-data when a new direct photo is uploaded
        const formData = new FormData();
        formData.append('name', productForm.name.trim());
        formData.append('category', productForm.category || 'General');
        formData.append('brand', productForm.brand || '');
        formData.append('barcode', (productForm.barcode || '').trim());
        formData.append('price', Number(productForm.price));
        formData.append('mrp', productForm.mrp ? Number(productForm.mrp) : Number(productForm.price));
        formData.append('wholesalePrice', productForm.wholesalePrice ? Number(productForm.wholesalePrice) : Number(productForm.price));
        formData.append('discountPrice', productForm.discountPrice || '');
        formData.append('stock', productForm.stock !== '' ? Number(productForm.stock) : 50);
        formData.append('unit', productForm.unit || 'Pcs');
        formData.append('gst', productForm.gst ?? 5);
        formData.append('cashbackPercentage', Number(productForm.cashbackPercentage || 5));
        formData.append('description', productForm.description || '');
        if (productForm.productId) formData.append('productId', productForm.productId);
        if (productForm.batchNumber) formData.append('batchNumber', productForm.batchNumber.trim());
        if (productForm.expiryDate) formData.append('expiryDate', productForm.expiryDate);

        formData.append('image', imageFile);

        if (editingProductId) {
          res = await VendorAPI.updateProduct(editingProductId, formData);
        } else {
          res = await VendorAPI.createProduct(formData);
        }
      } else {
        // Plain JSON object when existing image or URL is used
        const payload = {
          ...productForm,
          batchNumber: productForm.batchNumber ? productForm.batchNumber.trim() : undefined,
          expiryDate: productForm.expiryDate || undefined,
          price: Number(productForm.price),
          mrp: productForm.mrp ? Number(productForm.mrp) : Number(productForm.price),
          stock: productForm.stock !== '' ? Number(productForm.stock) : 50,
          cashbackPercentage: Number(productForm.cashbackPercentage || 5),
        };

        if (editingProductId) {
          res = await VendorAPI.updateProduct(editingProductId, payload);
        } else {
          res = await VendorAPI.createProduct(payload);
        }
      }

      if (res.success) {
        toast.success(editingProductId ? 'Product updated successfully!' : 'Product added to catalog!');
        setShowAddModal(false);
        setEditingProductId(null);
        setProductForm(initialFormState);
        setImageFile(null);
        setImagePreview('');
        setShowUrlInput(false);
        setAddProductStep(1);
        loadProducts();
      } else {
        toast.error(res.message || 'Operation failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#f8f9fc] pb-24 text-left">
      {/* ── TOP HEADER (Matching Reference Screen 2) ── */}
      <header className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 border-b border-slate-100 shadow-xs">
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight">
              Products
            </h1>
            <button
              onClick={() => {
                setEditingProductId(null);
                setProductForm(initialFormState);
                setImageFile(null);
                setImagePreview('');
                setShowUrlInput(false);
                setAddProductStep(1);
                setShowAddModal(true);
              }}
              className="px-3.5 py-1.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Add Product</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-11 pl-10 pr-4 bg-slate-100/80 border border-slate-200/80 rounded-2xl text-[13.5px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>

          {/* Category Filter Pills (Horizontal Scroll) */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pt-1 pb-0.5">
            <button
              type="button"
              onClick={() => setShowAddCategoryModal(true)}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 flex items-center gap-1 shrink-0"
              title="Add a new product category"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span>+ Add Category</span>
            </button>
            {allCategories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── PRODUCTS LIST CONTAINER ── */}
      <main className="w-full px-4 py-4 space-y-3">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-bold">Loading catalog...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-slate-100 p-6 shadow-2xs space-y-3">
            <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[32px]">inventory_2</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-[15px]">No products found</h3>
              <p className="text-slate-500 text-[12px] max-w-xs mx-auto mt-0.5">
                {searchQuery || selectedCategory !== 'All'
                  ? 'Try clearing the search or category filters.'
                  : 'Add products to your catalog to start selling and issuing cashback!'}
              </p>
            </div>
            <button
              onClick={() => {
                setEditingProductId(null);
                setProductForm(initialFormState);
                setImageFile(null);
                setImagePreview('');
                setShowUrlInput(false);
                setAddProductStep(1);
                setShowAddModal(true);
              }}
              className="px-5 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Add Your First Product</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 2xl:grid-cols-3 md:gap-3 md:items-start">
            {filteredProducts.map((product) => {
              const isOutOfStock = product.stock <= 0;
              const cashbackPercent = product.cashbackPercentage || currentVendor?.cashbackRate || 5;

              return (
                <div
                  key={product._id}
                  className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-100 shadow-2xs hover:border-purple-200 transition-all flex items-center gap-3.5 group"
                >
                  {/* Left: Product Image in rounded container */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                    {product.image ? (
                      <img
                        src={getMediaUrl(product.image)}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-purple-700 text-[26px]">
                        shopping_basket
                      </span>
                    )}
                  </div>

                  {/* Middle: Details (Matching Reference Screen 2) */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[14px] text-slate-900 truncate">
                      {product.name}
                    </h3>

                    {/* Price • Cashback % */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-black text-[14px] text-slate-900 font-mono">
                        ₹{product.price}
                      </span>
                      <span className="text-[12px] text-slate-400">•</span>
                      <span className="text-[12px] font-bold text-emerald-600">
                        {cashbackPercent}% Cashback
                      </span>
                    </div>

                    {/* Stock & Expiry Status Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          isOutOfStock
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : product.stock < 10
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isOutOfStock ? 'Out of Stock' : `${product.stock} ${product.unit || 'Pcs'} In Stock`}
                      </span>
                      {product.batchNumber && (
                        <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          Batch: {product.batchNumber}
                        </span>
                      )}
                      {product.expiryDate && (
                        <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                          Exp: {product.expiryDate.split('T')[0]}
                        </span>
                      )}
                      {product.barcode && (
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                          Code: {product.barcode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions: Quick Edit & Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleStock(product)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                        isOutOfStock ? 'text-slate-300 hover:text-emerald-600' : 'text-emerald-600 hover:text-rose-600'
                      }`}
                      title={isOutOfStock ? 'Mark In Stock' : 'Mark Out of Stock'}
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        {isOutOfStock ? 'toggle_off' : 'toggle_on'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleEditProduct(product)}
                      className="w-8 h-8 rounded-xl hover:bg-purple-50 text-slate-500 hover:text-purple-700 flex items-center justify-center transition-colors cursor-pointer"
                      title="Edit Product"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>

                    <button
                      onClick={() => handleDeleteProduct(product._id, product.name)}
                      className="w-8 h-8 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                      title="Delete Product"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── MODAL: ADD NEW CATEGORY ── */}
      {showAddCategoryModal && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4 animate-scale-up text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">category</span>
                </div>
                <h3 className="font-bold text-slate-900 text-[15px]">Add Store Category</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName('');
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Create a custom category for your shop products (e.g. Smartwatches, Audio, Winter Collection, Organic Cereals).
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Category Name *
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Smartwatches, Casual Shirts..."
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[13.5px] font-bold text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    handleAddCategory(newCategoryName);
                  }
                }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddCategory(newCategoryName)}
                disabled={!newCategoryName.trim() || isAddingCategory}
                className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm shadow-purple-200"
              >
                {isAddingCategory ? 'Adding...' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL: 3-STEP ADD / EDIT PRODUCT WIZARD ── */}
      {showAddModal &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-slate-50 animate-reveal text-left overflow-hidden">
            {/* Modal Header */}
            <header className="sticky top-0 z-30 bg-white border-b border-slate-100 flex items-center px-4 h-16 shadow-xs justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (addProductStep > 1) {
                      setAddProductStep((s) => s - 1);
                    } else {
                      setShowAddModal(false);
                      setEditingProductId(null);
                    }
                  }}
                  className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-purple-700">
                    {addProductStep > 1 ? 'arrow_back' : 'close'}
                  </span>
                </button>
                <div>
                  <h3 className="font-display text-[16px] font-black text-slate-900 leading-tight">
                    {editingProductId ? 'Update Product' : 'Add New Product'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Step {addProductStep} of 3 • {addProductStep === 1 ? 'Details' : addProductStep === 2 ? 'Price & Stock' : 'Photos & Review'}
                  </p>
                </div>
              </div>

              {/* Step Pills */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10.5px] font-bold ${
                      addProductStep === step
                        ? 'bg-purple-700 text-white'
                        : addProductStep > step
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {addProductStep > step ? '✓' : step}
                  </div>
                ))}
              </div>
            </header>

            {/* Modal Body Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-xl mx-auto w-full">
              {/* STEP 1: Basic Details */}
              {addProductStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      value={productForm.name}
                      onChange={(e) => updateProductForm('name', e.target.value)}
                      placeholder="e.g. Lay's Classic Chips, Patanjali Atta 5kg..."
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Category *
                      </label>
<div>
                        <select
                          value={isCustomCategoryInput ? '__custom__' : productForm.category}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomCategoryInput(true);
                              setCustomCategoryInputText('');
                            } else {
                              setIsCustomCategoryInput(false);
                              updateProductForm('category', e.target.value);
                            }
                          }}
                          className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600 cursor-pointer"
                        >
                          {allCategories.filter((c) => c !== 'All').map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value="__custom__">+ Add New Category...</option>
                        </select>

                        {isCustomCategoryInput && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={customCategoryInputText}
                              onChange={(e) => setCustomCategoryInputText(e.target.value)}
                              placeholder="Type new category..."
                              className="flex-1 h-10 px-3 bg-slate-50 border border-purple-300 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customCategoryInputText.trim()) {
                                  const c = customCategoryInputText.trim();
                                  handleAddCategory(c);
                                  updateProductForm('category', c);
                                  setIsCustomCategoryInput(false);
                                }
                              }}
                              disabled={!customCategoryInputText.trim()}
                              className="h-10 px-3 bg-purple-700 text-white rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Brand / Company
                      </label>
                      <input
                        type="text"
                        value={productForm.brand}
                        onChange={(e) => updateProductForm('brand', e.target.value)}
                        placeholder="e.g. Lay's, Amul, Nestle"
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  {/* Barcode with Camera Scan button */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Barcode / EAN (Optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                          barcode
                        </span>
                        <input
                          type="text"
                          value={productForm.barcode}
                          onChange={(e) => updateProductForm('barcode', e.target.value)}
                          placeholder="8901008310247"
                          className="w-full h-11 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBarcodeScanner(true)}
                        className="h-11 px-3.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                        <span>Scan</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Description
                    </label>
                    <textarea
                      value={productForm.description}
                      onChange={(e) => updateProductForm('description', e.target.value)}
                      placeholder="Product details, weight, ingredients..."
                      className="w-full h-20 p-3 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-900 focus:outline-none focus:border-purple-600 resize-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!productForm.name.trim()) return toast.error('Product name is required');
                      setAddProductStep(2);
                    }}
                    className="w-full py-3.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[14px] shadow-sm active:scale-95 transition-all cursor-pointer mt-4"
                  >
                    Next: Pricing & Stock →
                  </button>
                </div>
              )}

              {/* STEP 2: Pricing & Stock */}
              {addProductStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Retail Selling Price (₹) *
                      </label>
                      <input
                        type="number"
                        value={productForm.price}
                        onChange={(e) => updateProductForm('price', e.target.value)}
                        placeholder="20"
                        className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Printed MRP (₹)
                      </label>
                      <input
                        type="number"
                        value={productForm.mrp}
                        onChange={(e) => updateProductForm('mrp', e.target.value)}
                        placeholder="25"
                        className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Initial Stock Quantity
                      </label>
                      <input
                        type="number"
                        value={productForm.stock}
                        onChange={(e) => updateProductForm('stock', e.target.value)}
                        placeholder="50"
                        className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Unit
                      </label>
                      <select
                        value={productForm.unit}
                        onChange={(e) => updateProductForm('unit', e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                      >
                        <option value="Pcs">Pcs</option>
                        <option value="Pack">Pack</option>
                        <option value="Kg">Kg</option>
                        <option value="Gram">Gram</option>
                        <option value="Ltr">Ltr</option>
                        <option value="Bottle">Bottle</option>
                      </select>
                    </div>
                  </div>

                  {/* Batch & Expiry Fields */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/50 rounded-2xl border border-purple-100/80">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Batch / Lot No.
                      </label>
                      <input
                        type="text"
                        value={productForm.batchNumber}
                        onChange={(e) => updateProductForm('batchNumber', e.target.value)}
                        placeholder="e.g. BATCH-001"
                        className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Expiry Date
                      </label>
                      <input
                        type="date"
                        value={productForm.expiryDate}
                        onChange={(e) => updateProductForm('expiryDate', e.target.value)}
                        className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Customer Cashback Percentage (%)
                    </label>
                    <input
                      type="number"
                      value={productForm.cashbackPercentage}
                      onChange={(e) => updateProductForm('cashbackPercentage', e.target.value)}
                      placeholder="5"
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Customer gets this % in cashback points on every purchase of this product.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setAddProductStep(1)}
                      className="w-1/3 py-3.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[13px] cursor-pointer"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!productForm.price || Number(productForm.price) <= 0) {
                          return toast.error('Enter valid selling price');
                        }
                        setAddProductStep(3);
                      }}
                      className="w-2/3 py-3.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[14px] shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      Next: Image & Review →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Image & Submit */}
              {addProductStep === 3 && (
                <div className="space-y-4">
                  {/* Photo Upload Card */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Product Photo
                      </label>
                      <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                        Gallery / Camera
                      </span>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />

                    {imagePreview ? (
                      /* Preview & Change/Remove Box */
                      <div className="p-3 bg-white rounded-2xl border border-purple-200 shadow-xs flex items-center gap-3">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                          <img
                            src={imagePreview}
                            alt="Product Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://placehold.co/100x100?text=No+Photo';
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold mb-0.5">
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            <span>Photo Selected</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {imageFile ? imageFile.name : (productForm.image ? 'Custom Image URL' : 'Product Photo')}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                              <span>Change</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleRemoveImage}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Tap to Upload Dropzone */
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-5 sm:p-6 rounded-2xl border-2 border-dashed border-purple-300 hover:border-purple-600 bg-purple-50/40 hover:bg-purple-50/80 transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-2xs">
                          <span className="material-symbols-outlined text-[28px]">add_a_photo</span>
                        </div>
                        <p className="text-[13px] font-black text-purple-950">
                          Tap to Upload Product Photo
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Directly take photo with camera or choose from gallery
                        </p>
                        <span className="inline-block mt-2 px-3 py-1 bg-white border border-purple-200 text-purple-700 font-bold text-[11px] rounded-xl shadow-2xs">
                          Choose File (JPG, PNG, WEBP)
                        </span>
                      </div>
                    )}

                    {/* Or Paste URL Toggle */}
                    <div className="mt-2.5">
                      {!showUrlInput && !productForm.image ? (
                        <button
                          type="button"
                          onClick={() => setShowUrlInput(true)}
                          className="text-[11px] text-purple-700 hover:text-purple-800 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">link</span>
                          <span>Or paste image URL instead</span>
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-600">
                              Image Web Link (URL)
                            </label>
                            {showUrlInput && !productForm.image && (
                              <button
                                type="button"
                                onClick={() => setShowUrlInput(false)}
                                className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                Hide
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={productForm.image || ''}
                            onChange={(e) => handleImageUrlChange(e.target.value)}
                            placeholder="Paste image URL (e.g. https://...)"
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12px] text-slate-900 focus:outline-none focus:border-purple-600"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary Review Card */}
                  <div className="p-3.5 bg-gradient-to-br from-purple-50/80 to-indigo-50/40 rounded-2xl border border-purple-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10.5px] font-black uppercase tracking-wider text-purple-900 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">preview</span>
                        <span>Product Review Summary</span>
                      </p>
                      <span className="text-[10px] font-bold text-purple-700 bg-white/80 px-2 py-0.5 rounded-md border border-purple-200">
                        {productForm.category || 'General'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt={productForm.name}
                          className="w-14 h-14 rounded-xl object-cover border border-purple-200 bg-white shrink-0"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://placehold.co/60x60?text=Item';
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200">
                          <span className="material-symbols-outlined text-[24px]">inventory_2</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[14px] text-slate-900 truncate">
                          {productForm.name || 'Untitled Product'}
                        </p>
                        {productForm.brand && (
                          <p className="text-[11px] text-slate-500 font-medium">Brand: {productForm.brand}</p>
                        )}
                        <p className="text-[10.5px] text-slate-400 font-mono">
                          Barcode: {productForm.barcode || 'Auto-generated'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[12px] pt-1 border-t border-purple-100">
                      <div>Selling Price: <strong className="text-slate-900 font-bold">₹{productForm.price || '0'}</strong></div>
                      <div>MRP: <strong className="text-slate-900 font-bold">₹{productForm.mrp || productForm.price || '0'}</strong></div>
                      <div>Stock: <strong className="text-slate-900 font-bold">{productForm.stock || 50} {productForm.unit || 'Pcs'}</strong></div>
                      <div>Cashback: <strong className="text-emerald-600 font-bold">{productForm.cashbackPercentage || 5}%</strong></div>
                      {productForm.batchNumber && (
                        <div>Batch: <strong className="text-slate-800 font-mono font-bold">{productForm.batchNumber}</strong></div>
                      )}
                      {productForm.expiryDate && (
                        <div>Expiry: <strong className="text-purple-700 font-bold">{productForm.expiryDate}</strong></div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setAddProductStep(2)}
                      className="w-1/3 py-3.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[13px] cursor-pointer"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitProduct}
                      disabled={isSubmitting}
                      className="w-2/3 py-3.5 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-800 text-white font-bold text-[14px] shadow-lg shadow-purple-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">check</span>
                          <span>{editingProductId ? 'Update Product' : 'Add to Catalog'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ── MODAL: CAMERA BARCODE SCANNER ── */}
      <ProductBarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        title="Scan Product Barcode"
        subtitle="Hold product barcode inside the viewfinder to fill automatically"
        onScan={(decodedText) => {
          updateProductForm('barcode', decodedText);
          toast.success(`Barcode scanned: ${decodedText}`);
        }}
      />
    </div>
  );
}
