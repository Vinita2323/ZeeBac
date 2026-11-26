import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { VendorAPI, getMediaUrl } from '../../../services/api';
import useLanguageStore from '../../../store/useLanguageStore';
import { toast } from 'react-hot-toast';
import { playNotificationChime } from '../../../utils/voiceUtils';

export default function InventoryPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  // 'in_stock' | 'low_stock' | 'out_of_stock' | 'expired' | 'critical' | 'near_expiry' | 'all_at_risk' | null
  const [selectedStockStatus, setSelectedStockStatus] = useState(null);

  // Quick Batch & Expiry Edit Modal State
  const [editingBatchProduct, setEditingBatchProduct] = useState(null);
  const [batchModalForm, setBatchModalForm] = useState({ batchNumber: '', expiryDate: '' });
  const [savingBatch, setSavingBatch] = useState(false);

  // Clearance Discount Modal State
  const [clearanceProduct, setClearanceProduct] = useState(null);
  const [clearancePrice, setClearancePrice] = useState('');
  const [applyingClearance, setApplyingClearance] = useState(false);

  // Discard Expired Stock Modal State
  const [discardProduct, setDiscardProduct] = useState(null);
  const [discardingStock, setDiscardingStock] = useState(false);

  const hasPlayedAlertRef = useRef(false);

  // Expiry calculation helper
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getExpiryStatus = (product) => {
    if (!product.expiryDate) {
      return {
        status: 'none',
        label: 'No Expiry Set',
        daysRemaining: null,
        daysAgo: null,
        dateStr: '',
        atRiskValue: 0,
      };
    }
    const expDate = new Date(product.expiryDate);
    if (isNaN(expDate.getTime())) {
      return {
        status: 'none',
        label: String(product.expiryDate),
        daysRemaining: null,
        daysAgo: null,
        dateStr: String(product.expiryDate),
        atRiskValue: 0,
      };
    }
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const formattedDate = expDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const stock = Number(product.stock) || 0;
    const price = Number(product.price) || 0;
    const atRiskValue = stock * price;

    if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      return {
        status: 'expired',
        label: `Expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago (${formattedDate})`,
        daysRemaining: diffDays,
        daysAgo,
        dateStr: formattedDate,
        atRiskValue,
      };
    } else if (diffDays === 0) {
      return {
        status: 'critical',
        label: `Expires TODAY! (${formattedDate})`,
        daysRemaining: 0,
        daysAgo: 0,
        dateStr: formattedDate,
        atRiskValue,
      };
    } else if (diffDays <= 7) {
      return {
        status: 'critical',
        label: `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'} (Critical)`,
        daysRemaining: diffDays,
        daysAgo: 0,
        dateStr: formattedDate,
        atRiskValue,
      };
    } else if (diffDays <= 30) {
      return {
        status: 'near_expiry',
        label: `Expires in ${diffDays} days (${formattedDate})`,
        daysRemaining: diffDays,
        daysAgo: 0,
        dateStr: formattedDate,
        atRiskValue,
      };
    } else {
      return {
        status: 'good',
        label: `Exp: ${formattedDate}`,
        daysRemaining: diffDays,
        daysAgo: 0,
        dateStr: formattedDate,
        atRiskValue: 0,
      };
    }
  };

  // Fetch all products
  const loadInventory = async () => {
    try {
      setLoading(true);
      const res = await VendorAPI.getProducts();
      if (res.success) {
        const prodList = res.data || [];
        setProducts(prodList);

        // Check if there are expired or near-expiry items and play chime once
        const hasAlerts = prodList.some((p) => {
          const exp = getExpiryStatus(p);
          return ['expired', 'critical', 'near_expiry'].includes(exp.status) && Number(p.stock) > 0;
        });

        if (hasAlerts && !hasPlayedAlertRef.current) {
          hasPlayedAlertRef.current = true;
          try {
            playNotificationChime('incoming');
          } catch (_) {}
        }
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

  // Compute Inventory Metrics dynamically
  const totalStockUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const inStockProducts = products.filter((p) => Number(p.stock) > 10);
  const lowStockProducts = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 10);
  const outOfStockProducts = products.filter((p) => !p.stock || Number(p.stock) <= 0);

  // Expiry Metrics
  const expiredProducts = products.filter((p) => getExpiryStatus(p).status === 'expired' && Number(p.stock) > 0);
  const criticalExpiryProducts = products.filter((p) => getExpiryStatus(p).status === 'critical' && Number(p.stock) > 0);
  const nearExpiryProducts = products.filter(
    (p) => ['critical', 'near_expiry'].includes(getExpiryStatus(p).status) && Number(p.stock) > 0
  );
  const allAtRiskProducts = products.filter(
    (p) => ['expired', 'critical', 'near_expiry'].includes(getExpiryStatus(p).status) && Number(p.stock) > 0
  );

  const totalAtRiskUnits = allAtRiskProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalAtRiskValue = allAtRiskProducts.reduce((sum, p) => sum + getExpiryStatus(p).atRiskValue, 0);

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
      (selectedStockStatus === 'expired' && expInfo.status === 'expired') ||
      (selectedStockStatus === 'critical' && expInfo.status === 'critical') ||
      (selectedStockStatus === 'near_expiry' && ['critical', 'near_expiry'].includes(expInfo.status)) ||
      (selectedStockStatus === 'all_at_risk' && ['expired', 'critical', 'near_expiry'].includes(expInfo.status));

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

  // Open Clearance Sale Modal
  const handleOpenClearanceModal = (p) => {
    setClearanceProduct(p);
    // Suggest 30% discount by default
    const regular = Number(p.price) || 0;
    const suggested = Math.max(1, Math.round(regular * 0.7));
    setClearancePrice(p.discountPrice ? String(p.discountPrice) : String(suggested));
  };

  // Apply Clearance Price
  const handleApplyClearance = async (e) => {
    if (e) e.preventDefault();
    if (!clearanceProduct) return;
    const priceNum = Number(clearancePrice);
    const regular = Number(clearanceProduct.price) || 0;

    if (!priceNum || priceNum <= 0 || priceNum >= regular) {
      toast.error(`Clearance price must be less than regular price (₹${regular})`);
      return;
    }

    setApplyingClearance(true);
    try {
      const res = await VendorAPI.applyClearanceDiscount(clearanceProduct._id, { discountPrice: priceNum });
      if (res.success) {
        setProducts((prev) =>
          prev.map((item) =>
            item._id === clearanceProduct._id ? { ...item, discountPrice: priceNum } : item
          )
        );
        toast.success(`🏷️ Clearance price ₹${priceNum} applied to "${clearanceProduct.name}"!`);
        setClearanceProduct(null);
      } else {
        toast.error(res.message || 'Failed to apply clearance discount');
      }
    } catch {
      toast.error('Failed to apply discount');
    } finally {
      setApplyingClearance(false);
    }
  };

  // Open Discard Expired Stock Confirmation Modal
  const handleOpenDiscardModal = (p) => {
    setDiscardProduct(p);
  };

  // Confirm Discard Expired Stock
  const handleConfirmDiscard = async () => {
    if (!discardProduct) return;
    setDiscardingStock(true);
    try {
      const res = await VendorAPI.discardExpiredStock(discardProduct._id);
      if (res.success) {
        setProducts((prev) =>
          prev.map((item) => (item._id === discardProduct._id ? { ...item, stock: 0 } : item))
        );
        toast.success(`🗑️ Successfully discarded expired stock for "${discardProduct.name}"`);
        setDiscardProduct(null);
      } else {
        toast.error(res.message || 'Failed to discard stock');
      }
    } catch {
      toast.error('Failed to write off expired stock');
    } finally {
      setDiscardingStock(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] pb-24 text-left">
      {/* ── TOP HEADER (Screen 3 Design) ── */}
      <header className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 border-b border-slate-100 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight">
              Inventory
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Stock Levels, Expiry Alerts & Batch Details</p>
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
            <button
              onClick={() => {
                setSelectedStockStatus((prev) => (prev === 'all_at_risk' ? null : 'all_at_risk'));
              }}
              className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all cursor-pointer border ${
                allAtRiskProducts.length > 0
                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
              title="Filter by Expiry Alerts"
            >
              <span className="material-symbols-outlined text-[20px]">
                {allAtRiskProducts.length > 0 ? 'notifications_active' : 'filter_list'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN INVENTORY CONTENT ── */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Dark Store Putaway Flow Banner */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-3xl p-4 shadow-sm border border-purple-800/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white shrink-0">
              <span className="material-symbols-outlined text-[24px]">shelves</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-slate-950 px-2 py-0.2 rounded-full">
                  Dark Store WMS
                </span>
                <span className="text-xs font-bold text-purple-200">Putaway Station</span>
              </div>
              <h4 className="font-display font-black text-sm text-white truncate mt-0.5">
                Scan & Place Inbound Stock into Racks & Bins
              </h4>
              <p className="text-[11px] text-slate-300 truncate">
                Zepto-style barcode inwarding, location verification & printable labels
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/vendor/putaway')}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-purple-900 text-xs font-display font-black shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            Launch Putaway →
          </button>
        </div>

        {/* ── REAL-TIME EXPIRY NOTIFICATION BANNER (Requested Feature) ── */}
        {(expiredProducts.length > 0 || nearExpiryProducts.length > 0) && (
          <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 border-2 border-amber-300/90 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in text-left">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${
                  expiredProducts.length > 0 ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">notifications_active</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white ${
                      expiredProducts.length > 0 ? 'bg-rose-600' : 'bg-amber-600'
                    }`}
                  >
                    {expiredProducts.length > 0 ? 'URGENT EXPIRY ALERT' : 'EXPIRY WARNING'}
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">Immediate Action Recommended</span>
                </div>
                <h4 className="font-display font-black text-sm text-slate-900 mt-1 leading-snug">
                  {expiredProducts.length > 0
                    ? `${expiredProducts.length} Product(s) EXPIRED & ${nearExpiryProducts.length} Expiring Soon!`
                    : `${nearExpiryProducts.length} Product(s) Expiring Within 30 Days!`}
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  At-risk inventory:{' '}
                  <strong className="text-rose-700 font-bold">{totalAtRiskUnits} units</strong> worth{' '}
                  <strong className="text-rose-700 font-bold">₹{totalAtRiskValue.toLocaleString()}</strong>. Apply
                  clearance discounts or discard expired stock to prevent store losses.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStockStatus('all_at_risk')}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-display font-black shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm w-full sm:w-auto text-center"
            >
              Review Items →
            </button>
          </div>
        )}

        {/* 1. Total Stock Hero Card (Matching Screen 3) */}
        <div className="bg-gradient-to-r from-purple-50 via-white to-purple-50/40 rounded-3xl p-5 border border-purple-100 shadow-xs flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-800 text-white flex items-center justify-center shrink-0 shadow-md">
            <span className="material-symbols-outlined text-[36px]">package_2</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Total Stock</p>
            <h2 className="font-display font-black text-[28px] sm:text-[32px] text-slate-900 leading-none my-1">
              {totalStockUnits.toLocaleString()}
            </h2>
            <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium flex-wrap">
              <span>Products ({products.length} Items)</span>
              {(nearExpiryProducts.length > 0 || expiredProducts.length > 0) && (
                <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
                  {expiredProducts.length} Expired • {nearExpiryProducts.length} Near Expiry
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. STOCK STATUS & EXPIRY SUMMARY CARDS (Exact Green Box Area from User Image) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Card 1: In Stock */}
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

          {/* Card 2: Low Stock */}
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

          {/* Card 3: Out of Stock */}
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

          {/* Card 4: Expired & Near Expiry (REQUESTED BY USER) */}
          <div
            onClick={() =>
              setSelectedStockStatus(
                selectedStockStatus === 'all_at_risk' ||
                  selectedStockStatus === 'expired' ||
                  selectedStockStatus === 'near_expiry'
                  ? null
                  : 'all_at_risk'
              )
            }
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden ${
              ['all_at_risk', 'expired', 'near_expiry', 'critical'].includes(selectedStockStatus)
                ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200 shadow-xs'
                : 'bg-white border-slate-100 shadow-2xs hover:border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  expiredProducts.length > 0
                    ? 'bg-rose-100 text-rose-700'
                    : nearExpiryProducts.length > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {expiredProducts.length > 0 ? 'event_busy' : 'alarm'}
                </span>
              </div>
              {expiredProducts.length > 0 ? (
                <span className="text-[9px] font-black uppercase text-white bg-rose-600 px-1.5 py-0.5 rounded-full animate-pulse">
                  ! {expiredProducts.length} Exp
                </span>
              ) : nearExpiryProducts.length > 0 ? (
                <span className="text-[9px] font-bold uppercase text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded-full">
                  {nearExpiryProducts.length} Soon
                </span>
              ) : (
                <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                  0 at risk
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold text-slate-700">Expired / Near</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className={`font-display font-black text-[18px] leading-tight ${
                  expiredProducts.length > 0
                    ? 'text-rose-700'
                    : nearExpiryProducts.length > 0
                    ? 'text-amber-700'
                    : 'text-slate-900'
                }`}
              >
                {expiredProducts.length + nearExpiryProducts.length}
              </span>
              <span className="text-[10px] text-slate-400">
                {expiredProducts.length > 0 ? `(${expiredProducts.length} exp)` : 'items'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. QUICK SUB-FILTER CHIPS FOR EXPIRY MANAGEMENT ── */}
        {(expiredProducts.length > 0 || nearExpiryProducts.length > 0) && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Expiry Filters:
            </span>
            <button
              type="button"
              onClick={() => setSelectedStockStatus('all_at_risk')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedStockStatus === 'all_at_risk'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All At-Risk ({expiredProducts.length + nearExpiryProducts.length})
            </button>
            {expiredProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStockStatus('expired')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  selectedStockStatus === 'expired'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                <span>Expired ({expiredProducts.length})</span>
              </button>
            )}
            {criticalExpiryProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStockStatus('critical')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  selectedStockStatus === 'critical'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
                <span>Critical ≤7 Days ({criticalExpiryProducts.length})</span>
              </button>
            )}
            {nearExpiryProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStockStatus('near_expiry')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  selectedStockStatus === 'near_expiry'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>Expiring Soon ({nearExpiryProducts.length})</span>
              </button>
            )}
          </div>
        )}

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
            <h3 className="font-display font-black text-[15px] text-slate-900">Stock by Category</h3>

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
                      <p className="text-[11px] text-slate-400">{cat.productCount} Items in Catalog</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[14px] text-slate-800">{cat.units}</span>
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
                  {selectedStockStatus === 'all_at_risk'
                    ? `All At-Risk Expiry Items`
                    : selectedStockStatus === 'critical'
                    ? `Critical Expiring Items (≤7 Days)`
                    : selectedStockStatus === 'near_expiry'
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
                {['all_at_risk', 'expired', 'critical', 'near_expiry'].includes(selectedStockStatus) && (
                  <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                    💡 Apply clearance discount to liquidate near-expiry stock, or discard expired units to keep catalog
                    fresh.
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
                  {['all_at_risk', 'expired', 'critical', 'near_expiry'].includes(selectedStockStatus)
                    ? 'verified'
                    : 'inventory_2'}
                </span>
                <p className="text-xs text-slate-500 font-bold">
                  {['all_at_risk', 'expired', 'critical', 'near_expiry'].includes(selectedStockStatus)
                    ? 'Great! No products matching this expiry criteria.'
                    : 'No products match this filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const expInfo = getExpiryStatus(p);
                  return (
                    <div key={p._id} className="py-3.5 space-y-2.5">
                      <div className="flex items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0 overflow-hidden mt-0.5 sm:mt-0">
                            {p.image ? (
                              <img src={getMediaUrl(p.image)} alt={p.name} className="w-full h-full object-contain" />
                            ) : (
                              <span className="material-symbols-outlined text-purple-700 text-[20px]">
                                inventory_2
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[13.5px] text-slate-900 truncate">{p.name}</p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono flex-wrap">
                              <span>
                                Price:{' '}
                                {p.discountPrice ? (
                                  <>
                                    <span className="line-through text-slate-400">₹{p.price}</span>{' '}
                                    <span className="font-bold text-emerald-600">₹{p.discountPrice}</span>
                                  </>
                                ) : (
                                  `₹${p.price}`
                                )}
                              </span>
                              <span>•</span>
                              <span>{p.category}</span>
                              {expInfo.atRiskValue > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="font-bold text-rose-700">
                                    Risk Value: ₹{expInfo.atRiskValue.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Batch & Expiry Badges */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {/* Batch No Badge */}
                              <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                {p.batchNumber ? `Batch: ${p.batchNumber}` : 'No Batch'}
                              </span>

                              {/* Expiry Badge with Days Remaining */}
                              {expInfo.status === 'expired' ? (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-300 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[13px] text-rose-600">cancel</span>
                                  <span>{expInfo.label}</span>
                                </span>
                              ) : expInfo.status === 'critical' ? (
                                <span className="text-[10px] font-bold text-red-800 bg-red-100 px-2 py-0.5 rounded-md border border-red-300 flex items-center gap-1 animate-pulse">
                                  <span className="material-symbols-outlined text-[13px] text-red-600">
                                    warning
                                  </span>
                                  <span>{expInfo.label}</span>
                                </span>
                              ) : expInfo.status === 'near_expiry' ? (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[13px] text-amber-600">alarm</span>
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

                              {/* Dark Store Shelf / Bin Badge */}
                              {p.warehouseLocation?.binCode && (
                                <span
                                  onClick={() => navigate('/vendor/putaway')}
                                  className="text-[10px] font-mono font-black text-purple-900 bg-purple-100/90 hover:bg-purple-200 px-2 py-0.5 rounded-md border border-purple-300 flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Click to open Putaway Station"
                                >
                                  <span className="material-symbols-outlined text-[12px] text-purple-700">shelves</span>
                                  <span>{p.warehouseLocation.binCode}</span>
                                </span>
                              )}
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
                          <span className="w-8 text-center font-mono font-bold text-[13px]">{p.stock ?? 0}</span>
                          <button
                            onClick={() => handleUpdateStock(p, 1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                            title="Increase Stock"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Action Bar for Expiry, Clearance & Discard */}
                      <div className="flex items-center gap-2 pl-14 flex-wrap">
                        {/* 1. Clearance Sale Discount Button */}
                        {Number(p.stock) > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenClearanceModal(p)}
                            className="text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px] text-amber-600">sell</span>
                            <span>{p.discountPrice ? `Clearance: ₹${p.discountPrice}` : 'Clearance Discount'}</span>
                          </button>
                        )}

                        {/* 2. Quick Edit Batch & Expiry */}
                        <button
                          type="button"
                          onClick={() => handleOpenBatchModal(p)}
                          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit_calendar</span>
                          <span>Edit Batch & Date</span>
                        </button>

                        {/* 3. Discard Expired Stock Button */}
                        {expInfo.status === 'expired' && Number(p.stock) > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenDiscardModal(p)}
                            className="text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px] text-rose-600">delete_sweep</span>
                            <span>Discard Expired Stock</span>
                          </button>
                        )}
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

      {/* ── MODAL 1: QUICK UPDATE BATCH NUMBER & EXPIRY DATE ── */}
      {editingBatchProduct &&
        createPortal(
          <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4 animate-scale-up text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
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
                    Stock: {editingBatchProduct.stock ?? 0} {editingBatchProduct.unit || 'Pcs'} • ₹
                    {editingBatchProduct.price}
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                      Expiry Date
                    </label>
                    {/* Quick date helpers */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setMonth(d.getMonth() + 3);
                          setBatchModalForm((prev) => ({ ...prev, expiryDate: d.toISOString().split('T')[0] }));
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                      >
                        +3M
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setMonth(d.getMonth() + 6);
                          setBatchModalForm((prev) => ({ ...prev, expiryDate: d.toISOString().split('T')[0] }));
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                      >
                        +6M
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setFullYear(d.getFullYear() + 1);
                          setBatchModalForm((prev) => ({ ...prev, expiryDate: d.toISOString().split('T')[0] }));
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                      >
                        +1Y
                      </button>
                    </div>
                  </div>
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
                  <p className="text-[10px] text-slate-400 mt-1">
                    Products near this date will trigger real-time expiry alerts in your inventory dashboard.
                  </p>
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

      {/* ── MODAL 2: CLEARANCE DISCOUNT SALE MODAL ── */}
      {clearanceProduct &&
        createPortal(
          <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4 animate-scale-up text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">sell</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-[15px]">Clearance Sale Discount</h3>
                    <p className="text-[11px] text-slate-400">Sell near-expiry stock fast</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClearanceProduct(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Product Info */}
              <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white border border-amber-200 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                  {clearanceProduct.image ? (
                    <img
                      src={getMediaUrl(clearanceProduct.image)}
                      alt={clearanceProduct.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-amber-700 text-[20px]">inventory_2</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[13px] text-slate-900 truncate">{clearanceProduct.name}</p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Regular: <strong className="text-slate-900 font-bold">₹{clearanceProduct.price}</strong> • Stock:{' '}
                    {clearanceProduct.stock} {clearanceProduct.unit || 'Pcs'}
                  </p>
                  {clearanceProduct.expiryDate && (
                    <p className="text-[10px] text-rose-700 font-bold mt-0.5">
                      {getExpiryStatus(clearanceProduct).label}
                    </p>
                  )}
                </div>
              </div>

              {/* Discount Preset Buttons */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Quick Discount Presets
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[20, 30, 50, 70].map((pct) => {
                    const regular = Number(clearanceProduct.price) || 0;
                    const calculated = Math.max(1, Math.round(regular * (1 - pct / 100)));
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setClearancePrice(String(calculated))}
                        className={`py-2 px-1 rounded-xl text-center border font-bold text-xs transition-all cursor-pointer ${
                          clearancePrice === String(calculated)
                            ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-amber-50'
                        }`}
                      >
                        <div>{pct}% OFF</div>
                        <div className="text-[10px] opacity-90">₹{calculated}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleApplyClearance} className="space-y-3.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Clearance Selling Price (₹)
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]">
                      currency_rupee
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max={Number(clearanceProduct.price) - 1}
                      value={clearancePrice}
                      onChange={(e) => setClearancePrice(e.target.value)}
                      placeholder="Enter discounted price"
                      className="w-full h-11 pl-9 pr-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-emerald-700 focus:outline-none focus:border-amber-500"
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Discount price will be highlighted on the customer shopping app to boost sales.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setClearanceProduct(null)}
                    className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={applyingClearance}
                    className="w-2/3 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-[13px] shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {applyingClearance ? (
                      <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                    )}
                    <span>Apply Clearance Price</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ── MODAL 3: DISCARD EXPIRED STOCK MODAL ── */}
      {discardProduct &&
        createPortal(
          <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4 animate-scale-up text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-[15px]">Discard Expired Stock</h3>
                    <p className="text-[11px] text-slate-400">Write-off expired inventory</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscardProduct(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 space-y-1.5">
                <p className="font-bold text-[13px] text-slate-900">{discardProduct.name}</p>
                <p className="text-[11.5px] text-rose-800 font-medium">
                  {getExpiryStatus(discardProduct).label}
                </p>
                <p className="text-[11px] text-slate-600 font-mono">
                  Current Stock: <strong className="text-slate-900 font-bold">{discardProduct.stock} units</strong>
                </p>
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <p className="text-[11.5px] text-amber-900">
                  ⚠️ This action will set stock to <strong>0</strong> and prevent this expired product from being ordered
                  by customers.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDiscardProduct(null)}
                  className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  disabled={discardingStock}
                  className="w-2/3 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-[13px] shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {discardingStock ? (
                    <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                  )}
                  <span>Discard & Write Off</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
