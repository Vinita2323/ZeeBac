import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [selectedStockStatus, setSelectedStockStatus] = useState(null); // 'in_stock' | 'low_stock' | 'out_of_stock' | null

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

  // Compute Inventory Metrics dynamically
  const totalStockUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const inStockProducts = products.filter((p) => Number(p.stock) > 10);
  const lowStockProducts = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 10);
  const outOfStockProducts = products.filter((p) => !p.stock || Number(p.stock) <= 0);

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
    const matchesSearch =
      !searchQuery.trim() ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      !selectedCategory ||
      (selectedCategory === 'Others'
        ? !['FMCG', 'Snacks', 'Dairy', 'Home Care'].includes(p.category)
        : p.category?.toLowerCase() === selectedCategory.toLowerCase());

    const matchesStatus =
      !selectedStockStatus ||
      (selectedStockStatus === 'in_stock' && Number(p.stock) > 10) ||
      (selectedStockStatus === 'low_stock' && Number(p.stock) > 0 && Number(p.stock) <= 10) ||
      (selectedStockStatus === 'out_of_stock' && (!p.stock || Number(p.stock) <= 0));

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

  return (
    <div className="min-h-screen bg-[#f8f9fc] pb-24 text-left">
      {/* ── TOP HEADER (Screen 3 Design) ── */}
      <header className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 border-b border-slate-100 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight">
            Inventory
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedCategory(null);
                setSelectedStockStatus(null);
                setSearchQuery('');
              }}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              title="Reset Filters"
            >
              <span className="material-symbols-outlined text-[19px]">filter_alt</span>
            </button>
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
          <div>
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
              Total Stock
            </p>
            <h2 className="font-display font-black text-[28px] sm:text-[32px] text-slate-900 leading-none my-1">
              {totalStockUnits.toLocaleString()}
            </h2>
            <p className="text-[12px] text-slate-500 font-medium">
              Products ({products.length} Items)
            </p>
          </div>
        </div>

        {/* 2. Three Status Summary Cards in a Row (Matching Screen 3) */}
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

        {/* 3. Search Box (Matching Screen 3) */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search product..."
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

        {/* 4. Stock by Category Section (Matching Screen 3) */}
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

        {/* 5. Filtered Products List with Quick Stock Updaters */}
        {(selectedCategory || selectedStockStatus || searchQuery) && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-[14px] text-slate-900">
                  {selectedCategory ? `${selectedCategory} Products` : 'Matching Products'} ({filteredProducts.length})
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedStockStatus(null);
                  setSearchQuery('');
                }}
                className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
              >
                Clear Filter
              </button>
            </div>

            {filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-400 font-bold">No products match this filter.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => (
                  <div key={p._id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0">
                        {p.image ? (
                          <img src={getMediaUrl(p.image)} alt={p.name} className="w-full h-full object-contain" />
                        ) : (
                          <span className="material-symbols-outlined text-purple-700 text-[18px]">inventory_2</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[13px] text-slate-900 truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          ₹{p.price} • {p.category}
                        </p>
                      </div>
                    </div>

                    {/* Stock Stepper */}
                    <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                      <button
                        onClick={() => handleUpdateStock(p, -1)}
                        className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-[13px]">
                        {p.stock ?? 0}
                      </span>
                      <button
                        onClick={() => handleUpdateStock(p, 1)}
                        className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. Prominent Bottom Action Button (Matching Screen 3) */}
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
    </div>
  );
}
