import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { VendorAPI, getMediaUrl } from '../../../services/api';
import useLanguageStore from '../../../store/useLanguageStore';
import { toast } from 'react-hot-toast';

export default function InventoryPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedStockStatus, setSelectedStockStatus] = useState(null); // 'in_stock' | 'low_stock' | 'out_of_stock' | 'near_expiry' | 'expired' | null

  // Quick Batch & Expiry Edit Modal State
  const [editingBatchProduct, setEditingBatchProduct] = useState(null);
  const [batchModalForm, setBatchModalForm] = useState({ batchNumber: '', expiryDate: '' });
  const [savingBatch, setSavingBatch] = useState(false);

  // Fetch all products
  const loadInventory = async () => {
    try {
      setLoading(true);
      const res = await VendorAPI.getProducts();
      if (res.success) {
        setProducts(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load inventory', err);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // Expiry calculation helper
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getExpiryStatus = (product) => {
    if (!product.expiryDate) {
      return { status: 'none', label: 'No Expiry Set', daysRemaining: null, dateStr: '' };
    }
    const expDate = new Date(product.expiryDate);
    if (isNaN(expDate.getTime())) {
      return { status: 'none', label: product.expiryDate, daysRemaining: null, dateStr: product.expiryDate };
    }
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const formattedDate = expDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    if (diffDays < 0) {
      return {
        status: 'expired',
        label: `Expired on ${formattedDate}`,
        daysRemaining: diffDays,
        daysAgo: Math.abs(diffDays),
        dateStr: formattedDate,
      };
    } else if (diffDays <= 30) {
      return {
        status: 'near_expiry',
        label: diffDays === 0 ? 'Expires Today!' : `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
        daysRemaining: diffDays,
        dateStr: formattedDate,
      };
    } else {
      return {
        status: 'good',
        label: `Exp: ${formattedDate}`,
        daysRemaining: diffDays,
        dateStr: formattedDate,
      };
    }
  };

  // Compute Inventory Metrics dynamically
  const totalStockUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const inStockProducts = products.filter((p) => Number(p.stock) > 10);
  const lowStockProducts = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 10);
  const outOfStockProducts = products.filter((p) => !p.stock || Number(p.stock) <= 0);

  // Expiry Metrics
  const expiredProducts = products.filter((p) => getExpiryStatus(p).status === 'expired');
  const nearExpiryProducts = products.filter((p) => getExpiryStatus(p).status === 'near_expiry');

  // Categories Breakdown
  const CATEGORY_ICONS = {
    FMCG: { icon: 'shopping_bag', color: 'bg-purple-100 text-purple-700' },
    Snacks: { icon: 'cookie', color: 'bg-amber-100 text-amber-700' },
    Dairy: { icon: 'local_drink', color: 'bg-orange-100 text-orange-700' },
    'Home Care': { icon: 'cleaning_services', color: 'bg-purple-100 text-purple-700' },
    'Instant Food': { icon: 'ramen_dining', color: 'bg-red-100 text-red-700' },
    Beverages: { icon: 'water_drop', color: 'bg-blue-100 text-blue-700' },
    Others: { icon: 'inventory_2', color: 'bg-slate-100 text-slate-700' },
  };

  // Group products by category
  const categoriesList = ['FMCG', 'Snacks', 'Dairy', 'Home Care', 'Others'];
  const categoryCounts = categoriesList.map((cat) => {
    const matching = products.filter((p) => {
      if (cat === 'Others') {
        return !['FMCG', 'Snacks', 'Dairy', 'Home Care'].includes(p.category);
      }
      return p.category?.toLowerCase() === cat.toLowerCase();
    });
    const totalUnits = matching.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    return {
      name: cat,
      units: totalUnits,
      productCount: matching.length,
      iconInfo: CATEGORY_ICONS[cat] || CATEGORY_ICONS.Others,
    };
  });

  // Filtered Products for Detail View
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.batchNumber?.toLowerCase().includes(q);

    const matchesCategory =
      !selectedCategory ||
      (selectedCategory === 'Others'
        ? !['FMCG', 'Snacks', 'Dairy', 'Home Care'].includes(p.category)
        : p.category?.toLowerCase() === selectedCategory.toLowerCase());

    const expInfo = getExpiryStatus(p);

    const matchesStatus =
      !selectedStockStatus ||
      (selectedStockStatus === 'in_stock' && Number(p.stock) > 10) ||
      (selectedStockStatus === 'low_stock' && Number(p.stock) > 0 && Number(p.stock) <= 10) ||
      (selectedStockStatus === 'out_of_stock' && (!p.stock || Number(p.stock) <= 0)) ||
      (selectedStockStatus === 'near_expiry' && expInfo.status === 'near_expiry') ||
      (selectedStockStatus === 'expired' && expInfo.status === 'expired');

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Update Stock Delta (+ / -)
  const handleUpdateStock = async (product, delta) => {
    const nextStock = Math.max(0, (Number(product.stock) || 0) + delta);
    try {
      const res = await VendorAPI.updateProduct(product._id, { stock: nextStock });
      if (res.success) {
        setProducts((prev) =>
          prev.map((item) => (item._id === product._id ? { ...item, stock: nextStock } : item))
        );
        toast.success(`Updated "${product.name}" stock: ${nextStock}`);
      }
    } catch {
      toast.error('Failed to update stock');
    }
  };

  // Open Quick Edit Batch & Expiry Modal
  const handleOpenBatchModal = (p) => {
    setEditingBatchProduct(p);
    setBatchModalForm({
      batchNumber: p.batchNumber || '',
      expiryDate: p.expiryDate ? p.expiryDate.split('T')[0] : '',
    });
  };

  // Save Quick Batch & Expiry
  const handleSaveBatchModal = async (e) => {
    if (e) e.preventDefault();
    if (!editingBatchProduct) return;
    setSavingBatch(true);
    try {
      const updates = {
        batchNumber: batchModalForm.batchNumber.trim(),
        expiryDate: batchModalForm.expiryDate || undefined,
      };
      const res = await VendorAPI.updateProduct(editingBatchProduct._id, updates);
      if (res.success) {
        setProducts((prev) =>
          prev.map((item) =>
            item._id === editingBatchProduct._id
              ? {
                  ...item,
                  batchNumber: updates.batchNumber,
                  expiryDate: updates.expiryDate,
                }
              : item
          )
        );
        toast.success(`Updated Batch & Expiry for "${editingBatchProduct.name}"!`);
        setEditingBatchProduct(null);
      } else {
        toast.error(res.message || 'Failed to update details');
      }
    } catch {
      toast.error('Failed to update batch details');
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] pb-24 text-left">
      {/* ── TOP HEADER (Screen 3 Design) ── */}
      <header className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 border-b border-slate-100 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight">
              Inventory & Batches
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Stock Levels, Batch Nos & Expiry Alerts</p>
          </div>
          <div className="flex items-center gap-2">
            {(selectedCategory || selectedStockStatus || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedStockStatus(null);
                  setSearchQuery('');
                }}
                className="px-2.5 py-1.5 rounded-full bg-purple-50 text-purple-700 font-bold text-[11px] flex items-center gap-1 hover:bg-purple-100 transition-colors cursor-pointer"
                title="Reset Filters"
              >
                <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN INVENTORY CONTENT ── */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* 1. Total Stock Hero Card (Matching Screen 3) */}
        <div className="bg-gradient-to-r from-purple-50 via-white to-purple-50/40 rounded-3xl p-5 border border-purple-100 shadow-xs flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-800 text-white flex items-center justify-center shrink-0 shadow-md">
            <span className="material-symbols-outlined text-[36px]">package_2</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
              Total Stock
            </p>
            <h2 className="font-display font-black text-[28px] sm:text-[32px] text-slate-900 leading-none my-1">
              {totalStockUnits.toLocaleString()}
            </h2>
            <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium flex-wrap">
              <span>Products ({products.length} Items)</span>
              {(nearExpiryProducts.length > 0 || expiredProducts.length > 0) && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {nearExpiryProducts.length} near expiry • {expiredProducts.length} expired
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2. Stock Status Summary Cards (Matching Screen 3) */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {/* In Stock */}
          <div
            onClick={() => setSelectedStockStatus(selectedStockStatus === 'in_stock' ? null : 'in_stock')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
              selectedStockStatus === 'in_stock'
                ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200 shadow-xs'
                : 'bg-white border-slate-100 shadow-2xs hover:border-emerald-200'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1.5">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                check
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-600">In Stock</p>
            <p className="font-display font-black text-[18px] text-slate-900 leading-tight mt-0.5">
              {inStockProducts.length}
            </p>
          </div>

          {/* Low Stock */}
          <div
            onClick={() => setSelectedStockStatus(selectedStockStatus === 'low_stock' ? null : 'low_stock')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
              selectedStockStatus === 'low_stock'
                ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200 shadow-xs'
                : 'bg-white border-slate-100 shadow-2xs hover:border-amber-200'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-1.5">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                egg
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-600">Low Stock</p>
            <p className="font-display font-black text-[18px] text-slate-900 leading-tight mt-0.5">
              {lowStockProducts.length}
            </p>
          </div>

          {/* Out of Stock */}
          <div
            onClick={() => setSelectedStockStatus(selectedStockStatus === 'out_of_stock' ? null : 'out_of_stock')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
              selectedStockStatus === 'out_of_stock'
                ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200 shadow-xs'
                : 'bg-white border-slate-100 shadow-2xs hover:border-rose-200'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mb-1.5">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                close
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-600">Out of Stock</p>
            <p className="font-display font-black text-[18px] text-slate-900 leading-tight mt-0.5">
              {outOfStockProducts.length}
            </p>
          </div>
        </div>

        {/* 3. Expiry Date & Batch Tracking Row (Requested Feature) */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Near Expiry / Expiring Soon */}
          <div
            onClick={() => setSelectedStockStatus(selectedStockStatus === 'near_expiry' ? null : 'near_expiry')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
              selectedStockStatus === 'near_expiry'
                ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200 shadow-xs'
                : 'bg-white border-slate-100 shadow-2xs hover:border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-1.5">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
              </div>
              {nearExpiryProducts.length > 0 && (
                <span className="text-[9.5px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  Action Needed
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold text-slate-600">Expiring Soon (≤30 Days)</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display font-black text-[18px] text-amber-700 leading-tight">
                {nearExpiryProducts.length}
              </span>
              <span className="text-[10px] text-slate-400">Items near expiry</span>
            </div>
          </div>

          {/* Expired Products */}
          <div
            onClick={() => setSelectedStockStatus(selectedStockStatus === 'expired' ? null : 'expired')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
              selectedStockStatus === 'expired'
                ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200 shadow-xs'
                : 'bg-white border-slate-100 shadow-2xs hover:border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mb-1.5">
                <span className="material-symbols-outlined text-[16px]">event_busy</span>
              </div>
              {expiredProducts.length > 0 && (
                <span className="text-[9.5px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full animate-pulse">
                  Expired!
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold text-slate-600">Expired Products</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display font-black text-[18px] text-rose-700 leading-tight">
                {expiredProducts.length}
              </span>
              <span className="text-[10px] text-slate-400">Past expiry date</span>
            </div>
          </div>
        </div>

        {/* 4. Search Box with Batch & Product support */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search product name, barcode, or batch no..."
            className="w-full h-11 pl-10 pr-10 bg-slate-100/80 border border-slate-200/80 rounded-2xl text-[13.5px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">cancel</span>
            </button>
          )}
        </div>

        {/* 5. Stock by Category Section */}
        {!selectedCategory && !selectedStockStatus && !searchQuery && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs space-y-3">
            <h3 className="font-display font-black text-[15px] text-slate-900">
              Stock by Category
            </h3>

            <div className="divide-y divide-slate-100">
              {categoryCounts.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.iconInfo.color}`}>
                      <span className="material-symbols-outlined text-[20px]">{cat.iconInfo.icon}</span>
                    </div>
                    <div>
                      <p className="font-bold text-[13.5px] text-slate-900 group-hover:text-purple-700 transition-colors">
                        {cat.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {cat.productCount} Items in Catalog
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[14px] text-slate-800">
                      {cat.units}
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-purple-700 group-hover:translate-x-0.5 transition-all">
                      chevron_right
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Filtered Products List with Batch Number & Expiry Date Management */}
        {(selectedCategory || selectedStockStatus || searchQuery) && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-display font-black text-[14px] text-slate-900">
                  {selectedStockStatus === 'near_expiry'
                    ? `Expiring Soon (≤30 Days)`
                    : selectedStockStatus === 'expired'
                    ? `Expired Products`
                    : selectedStockStatus === 'in_stock'
                    ? `In Stock Products`
                    : selectedStockStatus === 'low_stock'
                    ? `Low Stock Products`
                    : selectedStockStatus === 'out_of_stock'
                    ? `Out of Stock Products`
                    : selectedCategory
                    ? `${selectedCategory} Products`
                    : 'Matching Products'}{' '}
                  ({filteredProducts.length})
                </h3>
                {selectedStockStatus === 'near_expiry' && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    ⚠️ Items expiring soon. Consider clearance discounts or vendor return.
                  </p>
                )}
                {selectedStockStatus === 'expired' && (
                  <p className="text-[11px] text-rose-700 font-medium">
                    ⛔ Expired inventory. Remove these items from retail display shelves.
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedStockStatus(null);
                  setSearchQuery('');
                }}
                className="text-xs font-bold text-purple-700 hover:underline cursor-pointer shrink-0"
              >
                Clear Filter
              </button>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <span className="material-symbols-outlined text-[36px] text-slate-300">
                  {selectedStockStatus === 'expired' ? 'verified' : 'inventory_2'}
                </span>
                <p className="text-xs text-slate-500 font-bold">
                  {selectedStockStatus === 'expired'
                    ? 'Great! No expired products in inventory.'
                    : selectedStockStatus === 'near_expiry'
                    ? 'No products expiring in the next 30 days.'
                    : 'No products match this filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const expInfo = getExpiryStatus(p);
                  return (
                    <div key={p._id} className="py-3 flex items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0 overflow-hidden mt-0.5 sm:mt-0">
                          {p.image ? (
                            <img src={getMediaUrl(p.image)} alt={p.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-purple-700 text-[20px]">inventory_2</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[13.5px] text-slate-900 truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            ₹{p.price} • {p.category}
                          </p>

                          {/* Batch & Expiry Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {/* Batch No Badge */}
                            <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                              {p.batchNumber ? `Batch: ${p.batchNumber}` : 'No Batch'}
                            </span>

                            {/* Expiry Badge */}
                            {expInfo.status === 'expired' ? (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">cancel</span>
                                <span>{expInfo.label}</span>
                              </span>
                            ) : expInfo.status === 'near_expiry' ? (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">alarm</span>
                                <span>{expInfo.label}</span>
                              </span>
                            ) : expInfo.status === 'good' ? (
                              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                {expInfo.label}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                                No Expiry Date
                              </span>
                            )}

                            {/* Quick Edit Batch / Expiry Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenBatchModal(p)}
                              className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200 flex items-center gap-0.5 cursor-pointer transition-colors"
                              title="Edit Batch / Expiry"
                            >
                              <span className="material-symbols-outlined text-[12px]">edit_calendar</span>
                              <span>Edit Batch</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Stock Stepper */}
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 shrink-0">
                        <button
                          onClick={() => handleUpdateStock(p, -1)}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                          title="Decrease Stock"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-[13px]">
                          {p.stock ?? 0}
                        </span>
                        <button
                          onClick={() => handleUpdateStock(p, 1)}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                          title="Increase Stock"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 7. Prominent Bottom Action Button */}
        <div className="pt-2">
          <button
            onClick={() => navigate('/vendor/products')}
            className="w-full py-4 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-display font-black text-[15px] shadow-lg shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>+ Add Products</span>
          </button>
        </div>
      </main>

      {/* ── MODAL: QUICK UPDATE BATCH NUMBER & EXPIRY DATE ── */}
      {editingBatchProduct && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4 animate-scale-up text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">edit_calendar</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-[15px]">Batch & Expiry Date</h3>
                  <p className="text-[11px] text-slate-400">Update inventory tracking details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBatchProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Product Quick Snapshot */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                {editingBatchProduct.image ? (
                  <img
                    src={getMediaUrl(editingBatchProduct.image)}
                    alt={editingBatchProduct.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="material-symbols-outlined text-purple-700 text-[18px]">inventory_2</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[13px] text-slate-900 truncate">{editingBatchProduct.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">
                  Stock: {editingBatchProduct.stock ?? 0} {editingBatchProduct.unit || 'Pcs'} • ₹{editingBatchProduct.price}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveBatchModal} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Batch / Lot Number
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]">
                    tag
                  </span>
                  <input
                    type="text"
                    value={batchModalForm.batchNumber}
                    onChange={(e) => setBatchModalForm((prev) => ({ ...prev, batchNumber: e.target.value }))}
                    placeholder="e.g. BATCH-2026-X"
                    className="w-full h-11 pl-9 pr-3.5 bg-white border border-slate-200 rounded-xl text-[13.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Useful for batch-wise audits and quality control.</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Expiry Date
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]">
                    calendar_today
                  </span>
                  <input
                    type="date"
                    value={batchModalForm.expiryDate}
                    onChange={(e) => setBatchModalForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    className="w-full h-11 pl-9 pr-3.5 bg-white border border-slate-200 rounded-xl text-[13.5px] font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Products near this date will alert in your inventory dashboard.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBatchProduct(null)}
                  className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="w-2/3 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-[13px] shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {savingBatch ? (
                    <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">save</span>
                  )}
                  <span>Save Batch Details</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
