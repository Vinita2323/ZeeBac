import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { VendorAPI, getMediaUrl } from '../../../services/api';
import useLanguageStore from '../../../store/useLanguageStore';
import useAuthStore from '../../../store/useAuthStore';
import { toast } from 'react-hot-toast';
import ProductBarcodeScannerModal from '../../../components/common/ProductBarcodeScannerModal';

const CATEGORIES = ['All', 'FMCG', 'Snacks', 'Dairy', 'Home Care', 'Instant Food', 'Beverages', 'Others'];

export default function ProductsPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const currentVendor = useAuthStore((s) => s.currentUser) || {};

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Add / Edit Product Modal State (3-Step Wizard)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addProductStep, setAddProductStep] = useState(1);
  const [editingProductId, setEditingProductId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Barcode Scanner Modal
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const initialFormState = {
    productId: '',
    name: '',
    category: 'Snacks',
    brand: '',
    barcode: '',
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

  useEffect(() => {
    loadProducts();
  }, []);

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
    setProductForm({
      productId: p.productId || '',
      name: p.name || '',
      category: p.category || 'Snacks',
      brand: p.brand || '',
      barcode: p.barcode || '',
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
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        mrp: productForm.mrp ? Number(productForm.mrp) : Number(productForm.price),
        stock: productForm.stock !== '' ? Number(productForm.stock) : 50,
        cashbackPercentage: Number(productForm.cashbackPercentage || 5),
      };

      let res;
      if (editingProductId) {
        res = await VendorAPI.updateProduct(editingProductId, payload);
      } else {
        res = await VendorAPI.createProduct(payload);
      }

      if (res.success) {
        toast.success(editingProductId ? 'Product updated successfully!' : 'Product added to catalog!');
        setShowAddModal(false);
        setEditingProductId(null);
        setProductForm(initialFormState);
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
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight">
              Products
            </h1>
            <button
              onClick={() => {
                setEditingProductId(null);
                setProductForm(initialFormState);
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
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
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
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
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
                setShowAddModal(true);
              }}
              className="px-5 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Add Your First Product</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
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

                    {/* Stock Status Badge */}
                    <div className="flex items-center gap-2 mt-1">
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
                      <select
                        value={productForm.category}
                        onChange={(e) => updateProductForm('category', e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                      >
                        {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
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
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Product Photo URL or Upload
                    </label>
                    <input
                      type="text"
                      value={productForm.image || ''}
                      onChange={(e) => updateProductForm('image', e.target.value)}
                      placeholder="Paste image URL (e.g. https://...)"
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-900 focus:outline-none focus:border-purple-600"
                    />
                  </div>

                  {/* Summary Review Card */}
                  <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                      Product Review Summary
                    </p>
                    <p className="font-bold text-[15px] text-slate-900">{productForm.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-600">
                      <div>Selling Price: <strong className="text-slate-900">₹{productForm.price}</strong></div>
                      <div>MRP: <strong className="text-slate-900">₹{productForm.mrp || productForm.price}</strong></div>
                      <div>Stock: <strong className="text-slate-900">{productForm.stock || 50} {productForm.unit}</strong></div>
                      <div>Cashback: <strong className="text-emerald-600">{productForm.cashbackPercentage}%</strong></div>
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
