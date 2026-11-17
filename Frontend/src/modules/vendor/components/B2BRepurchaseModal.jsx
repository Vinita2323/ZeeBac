import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { B2BAPI, getMediaUrl } from '../../../services/api';
import { toast } from 'react-hot-toast';

export default function B2BRepurchaseModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [quantities, setQuantities] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const fetchRepurchaseItems = async () => {
      try {
        setLoading(true);
        const res = await B2BAPI.getRepurchaseProducts();
        if (res.success && Array.isArray(res.data)) {
          setProducts(res.data);
          // Initialize default re-order quantity of 10 for each item
          const initialQty = {};
          res.data.forEach((p) => {
            initialQty[p.key] = 10;
          });
          setQuantities(initialQty);
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.warn('Failed to load repurchase items:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRepurchaseItems();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleQtyChange = (key, delta) => {
    setQuantities((prev) => {
      const current = prev[key] || 10;
      const next = Math.max(1, current + delta);
      return { ...prev, [key]: next };
    });
  };

  const handleCustomQtyInput = (key, val) => {
    const parsed = parseInt(val, 10);
    setQuantities((prev) => ({
      ...prev,
      [key]: isNaN(parsed) || parsed < 1 ? 1 : parsed,
    }));
  };

  const handleProceedRepurchase = (product) => {
    const qty = quantities[product.key] || 10;
    const totalAmount = Math.max(1, Math.round(product.lastPurchasedRate * qty));
    const supplierId = product.supplierDetails?.zeebacId || '';

    if (!supplierId) {
      toast.error('Supplier Zeebac ID not found for this product. Please enter supplier ID manually.');
      navigate('/vendor/merchant-payment', {
        state: {
          amount: totalAmount,
          note: `B2B Re-Purchase: ${qty}x ${product.name}`,
        },
      });
      onClose();
      return;
    }

    toast.success(`Opening Re-Purchase for ${qty}x ${product.name}`);
    navigate('/vendor/merchant-payment', {
      state: {
        recipientZeebacId: supplierId,
        amount: totalAmount,
        note: `B2B Re-Purchase: ${qty}x ${product.name}`,
      },
    });
    onClose();
  };

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.supplierDetails?.storeName?.toLowerCase().includes(q) ||
      p.supplierDetails?.zeebacId?.toLowerCase().includes(q)
    );
  });

  return createPortal(
    <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-left">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-800 text-white flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[22px]">repeat</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-[16px] text-slate-900 leading-tight">
                  B2B Re-Purchase
                </h2>
                <span className="text-[9.5px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                  Merchant B2B
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Reorder products directly from your past suppliers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-5 pt-3.5 pb-2 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search previously purchased item or supplier..."
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3.5">
          {loading ? (
            <div className="py-14 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-500">Loading your purchase history...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto border border-purple-100">
                <span className="material-symbols-outlined text-[28px]">shopping_bag</span>
              </div>
              <div className="max-w-xs mx-auto space-y-1">
                <h4 className="font-bold text-[14px] text-slate-900">No Past Supplier Purchases Yet</h4>
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  This B2B Re-Purchase feature is exclusively for trade between merchants, wholesalers, and manufacturers.
                  Items you purchase from upstream suppliers via B2B invoices will appear here for fast 1-click re-ordering.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/vendor/merchant-payment');
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-[12px] font-bold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <span>Buy Stock / Pay Supplier</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </button>
            </div>
          ) : (
            filteredProducts.map((p) => {
              const qty = quantities[p.key] || 10;
              const subtotal = Math.round((p.lastPurchasedRate || p.mrp || 0) * qty);
              return (
                <div
                  key={p.key}
                  className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs hover:border-purple-300 transition-all space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                      {p.image ? (
                        <img src={getMediaUrl(p.image)} alt={p.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="material-symbols-outlined text-purple-700 text-[20px]">inventory_2</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-[13.5px] text-slate-900 leading-snug truncate">
                          {p.name}
                        </h4>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100 shrink-0">
                          {p.category}
                        </span>
                      </div>

                      {/* Supplier Tag */}
                      <p className="text-[11px] text-slate-600 mt-1 flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[13px] text-purple-600">storefront</span>
                        <span className="truncate">{p.supplierDetails?.storeName || 'Verified Supplier'}</span>
                        {p.supplierDetails?.zeebacId && (
                          <span className="font-mono text-[10px] text-purple-700 bg-purple-50 px-1 py-0.2 rounded">
                            {p.supplierDetails.zeebacId}
                          </span>
                        )}
                      </p>

                      {/* Rate info */}
                      <div className="flex items-center gap-2 mt-1 text-[11.5px] text-slate-500 font-mono">
                        <span>Wholesale Rate: <strong className="text-slate-900 font-bold">₹{p.lastPurchasedRate}</strong>/{p.unit || 'Pcs'}</span>
                        {p.mrp && <span className="text-slate-400 line-through text-[10.5px]">₹{p.mrp}</span>}
                        {p.currentStock !== undefined && (
                          <span className="text-[10.5px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            Current Stock: {p.currentStock}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Stepper & 1-Click Re-Purchase */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500">Reorder Qty:</span>
                      <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(p.key, -5)}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold text-sm cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={qty}
                          onChange={(e) => handleCustomQtyInput(p.key, e.target.value)}
                          className="w-12 text-center bg-transparent font-mono font-bold text-[13px] text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(p.key, 5)}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold text-sm cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Total</p>
                        <p className="font-mono font-black text-[14px] text-purple-700">₹{subtotal.toLocaleString()}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleProceedRepurchase(p)}
                        className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-95 text-white font-bold text-[12px] shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <span className="material-symbols-outlined text-[15px]">shopping_cart_checkout</span>
                        <span>Re-Purchase</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Note */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <span>🔒 B2B Trade only (Merchant ↔ Wholesaler ↔ Manufacturer)</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/vendor/billing');
            }}
            className="text-purple-700 font-bold hover:underline cursor-pointer"
          >
            View B2B Invoices →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
