import { useState, useEffect, useRef } from 'react';
import { B2BAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function B2BBillingPage() {
  const currentVendor = useAuthStore((s) => s.currentUser) || {};
  const [activeTab, setActiveTab] = useState('billing'); // 'billing' | 'invoices' | 'ledger'

  // Billing form state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [billItems, setBillItems] = useState([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerResults, setBuyerResults] = useState([]);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI_INTENT'); // 'UPI_INTENT' | 'CASH'
  const [notes, setNotes] = useState('');

  // Camera scanner modal
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const scannerRef = useRef(null);

  // Invoices & Ledger states
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // Verification & Transfer Modal
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [invoiceUpiUri, setInvoiceUpiUri] = useState('');
  const [utrInput, setUtrInput] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccessData, setTransferSuccessData] = useState(null);

  // Load Invoices / Ledger
  useEffect(() => {
    if (activeTab === 'invoices') {
      setIsLoadingList(true);
      B2BAPI.getSellerInvoices()
        .then((res) => {
          if (res.success) setInvoices(res.data || []);
        })
        .catch(console.error)
        .finally(() => setIsLoadingList(false));
    } else if (activeTab === 'ledger') {
      setIsLoadingList(true);
      B2BAPI.getStockLedger()
        .then((res) => {
          if (res.success) setLedger(res.data || []);
        })
        .catch(console.error)
        .finally(() => setIsLoadingList(false));
    }
  }, [activeTab]);

  // Search product by barcode or text
  const handleProductLookup = async (codeToSearch) => {
    const term = (codeToSearch || barcodeInput).trim();
    if (!term) return;

    setIsSearchingProduct(true);
    try {
      const res = await B2BAPI.searchProducts({ query: term });
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const found = res.data[0];
        addProductToBill(found);
        setBarcodeInput('');
        toast.success(`Added "${found.name}" to bill!`);
      } else {
        toast.error(`No product found matching "${term}" in your catalog`);
      }
    } catch (err) {
      toast.error('Product lookup failed');
    } finally {
      setIsSearchingProduct(false);
    }
  };

  const addProductToBill = (product) => {
    setBillItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.productId === product._id);
      if (existingIndex > -1) {
        const existing = prev[existingIndex];
        const nextQty = existing.quantity + 1;
        if (nextQty > product.stock) {
          toast.error(`Cannot exceed available stock (${product.stock} ${product.unit || 'Pcs'})`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIndex] = {
          ...existing,
          quantity: nextQty,
          totalAmount: Math.round(nextQty * existing.rate * 100) / 100,
        };
        return updated;
      } else {
        if (product.stock <= 0) {
          toast.error(`"${product.name}" is currently out of stock!`);
          return prev;
        }
        const rate = product.wholesalePrice || product.price || 0;
        return [
          ...prev,
          {
            productId: product._id,
            name: product.name,
            barcode: product.barcode || '',
            image: product.image || '',
            category: product.category || 'General',
            rate,
            mrp: product.mrp || product.price,
            stock: product.stock,
            unit: product.unit || 'Pcs',
            quantity: 1,
            totalAmount: rate,
          },
        ];
      }
    });
  };

  const updateItemQty = (productId, delta) => {
    setBillItems((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (nextQty > item.stock) {
              toast.error(`Max available stock is ${item.stock}`);
              return item;
            }
            return {
              ...item,
              quantity: nextQty,
              totalAmount: Math.round(nextQty * item.rate * 100) / 100,
            };
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeItem = (productId) => {
    setBillItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  // Search Wholesalers
  const handleBuyerSearch = async (val) => {
    setBuyerQuery(val);
    if (val.trim().length < 2) {
      setBuyerResults([]);
      return;
    }
    try {
      const res = await B2BAPI.searchBuyers({ query: val.trim() });
      if (res.success) setBuyerResults(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Grand totals
  const totalAmount = Math.round(billItems.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
  const totalUnits = billItems.reduce((sum, item) => sum + item.quantity, 0);

  // Initialize Camera Barcode Scanner
  useEffect(() => {
    if (showCameraScanner) {
      const scanner = new Html5QrcodeScanner('b2b-qr-reader', {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      });

      scanner.render(
        (decodedText) => {
          handleProductLookup(decodedText);
          setShowCameraScanner(false);
          scanner.clear();
        },
        (error) => {
          // ignore scan frame errors
        }
      );
      scannerRef.current = scanner;

      return () => {
        try {
          scanner.clear();
        } catch (_) {}
      };
    }
  }, [showCameraScanner]);

  // Generate B2B Invoice & Open Transfer Modal
  const handleGenerateInvoice = async () => {
    if (billItems.length === 0) {
      toast.error('Please scan or add at least one product');
      return;
    }
    if (!selectedBuyer) {
      toast.error('Please select a Wholesaler buyer');
      return;
    }

    try {
      const res = await B2BAPI.createInvoice({
        buyerId: selectedBuyer._id,
        items: billItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          rate: i.rate,
          mrp: i.mrp,
        })),
        paymentMethod,
        notes,
      });

      if (res.success) {
        setCreatedInvoice(res.data.invoice);
        if (res.data.upiIntentUri) {
          setInvoiceUpiUri(res.data.upiIntentUri);
          const qr = await QRCode.toDataURL(res.data.upiIntentUri, { width: 260, margin: 1 });
          setQrCodeUrl(qr);
        }
        toast.success(`Invoice #${res.data.invoice.invoiceNumber} created!`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate invoice');
    }
  };

  // Execute Stock Transfer upon payment confirmation
  const handleExecuteTransfer = async () => {
    if (!createdInvoice || isTransferring) return;

    if (paymentMethod === 'UPI_INTENT' && (!utrInput || utrInput.length !== 12)) {
      toast.error('Please enter the 12-digit UPI UTR number from payment receipt');
      return;
    }

    setIsTransferring(true);
    try {
      const res = await B2BAPI.verifyAndTransferStock(createdInvoice._id, {
        paymentMethod,
        utr: paymentMethod === 'UPI_INTENT' ? utrInput.trim() : undefined,
        cashConfirmed: paymentMethod === 'CASH' ? true : undefined,
      });

      if (res.success) {
        setTransferSuccessData(res.data);
        toast.success('🎉 Products & Stock successfully transferred to Wholesaler!');
        // Reset billing form
        setBillItems([]);
        setSelectedBuyer(null);
        setUtrInput('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="mesh-gradient min-h-screen text-on-surface font-body-lg pb-24 text-left">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 shadow-xs">
        <div className="max-w-[1000px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-800 text-white flex items-center justify-center font-black shadow-md">
              <span className="material-symbols-outlined text-[24px]">barcode_scanner</span>
            </div>
            <div>
              <h1 className="font-display font-black text-[17px] text-slate-900 leading-tight">
                Manufacturer to Wholesaler Billing
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Barcode Cashier POS • Automatic Stock Transfer
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab('billing')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'billing' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Billing POS
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'invoices' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sales Invoices
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'ledger' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stock Ledger
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1000px] mx-auto p-4 space-y-4">
        {/* ─── TAB 1: CASHIER BARCODE BILLING ─── */}
        {activeTab === 'billing' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Barcode Input & Bill Table */}
            <div className="lg:col-span-2 space-y-4">
              {/* Barcode Scanner Bar */}
              <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Scan Barcode or Search Product ID / Name
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                      barcode
                    </span>
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleProductLookup()}
                      placeholder="Scan with barcode gun or type EAN (e.g. 8901008310247)..."
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-[13.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <button
                    onClick={() => handleProductLookup()}
                    disabled={isSearchingProduct}
                    className="h-11 px-4 rounded-2xl btn-primary-gradient text-white font-bold text-[12.5px] flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSearchingProduct ? 'Adding...' : 'Add Item'}
                  </button>
                  <button
                    onClick={() => setShowCameraScanner(true)}
                    className="h-11 px-3.5 rounded-2xl bg-purple-50 text-primary border border-purple-200 font-bold text-[12.5px] flex items-center gap-1 hover:bg-purple-100 active:scale-95 transition-all cursor-pointer"
                    title="Scan with Camera"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                  </button>
                </div>
              </div>

              {/* Items in Current Bill */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-display font-black text-[15px] text-slate-900">
                    B2B Invoice Items ({billItems.length})
                  </h3>
                  {billItems.length > 0 && (
                    <button
                      onClick={() => setBillItems([])}
                      className="text-xs font-bold text-red-500 hover:underline cursor-pointer"
                    >
                      Clear Bill
                    </button>
                  )}
                </div>

                {billItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <span className="material-symbols-outlined text-slate-300 text-[48px]">receipt_long</span>
                    <p className="font-bold text-[14px] text-slate-700">No items added to bill yet</p>
                    <p className="text-[12px] text-slate-400 max-w-[280px] mx-auto">
                      Scan barcodes or type product names above. Products will automatically be added like a POS cashier software!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {billItems.map((item) => (
                      <div key={item.productId} className="py-3 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-slate-400">inventory_2</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 text-left">
                          <h4 className="font-bold text-[13px] text-slate-900 truncate">{item.name}</h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                            {item.barcode && <span>Code: {item.barcode}</span>}
                            <span>• Rate: ₹{item.rate}</span>
                            <span className="text-emerald-600 font-bold">Avail: {item.stock} {item.unit}</span>
                          </div>
                        </div>

                        {/* Qty Stepper */}
                        <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                          <button
                            onClick={() => updateItemQty(item.productId, -1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-[13px]">{item.quantity}</span>
                          <button
                            onClick={() => updateItemQty(item.productId, 1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <p className="font-display font-black text-[14px] text-slate-900">
                            ₹{item.totalAmount}
                          </p>
                          <button
                            onClick={() => removeItem(item.productId)}
                            className="text-[11px] text-red-500 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Buyer Wholesaler & Payment */}
            <div className="space-y-4">
              {/* Buyer Selector Card */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Select Wholesaler Buyer *
                </label>

                {!selectedBuyer ? (
                  <div className="space-y-2 relative">
                    <input
                      type="text"
                      value={buyerQuery}
                      onChange={(e) => handleBuyerSearch(e.target.value)}
                      placeholder="Search Wholesaler Zeebac ID / Phone..."
                      className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-primary"
                    />

                    {buyerResults.length > 0 && (
                      <div className="absolute top-12 left-0 right-0 z-20 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {buyerResults.map((b) => (
                          <div
                            key={b._id}
                            onClick={() => {
                              setSelectedBuyer(b);
                              setBuyerQuery('');
                              setBuyerResults([]);
                            }}
                            className="p-3 hover:bg-purple-50 cursor-pointer text-left transition-colors"
                          >
                            <p className="font-bold text-[13px] text-slate-900">{b.storeName || b.ownerName}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {b.zeebacId} • {b.phone} • {b.city || 'Lucknow'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-primary px-2 py-0.5 rounded-full bg-white">
                        {selectedBuyer.businessType || 'Wholesaler'}
                      </span>
                      <h4 className="font-extrabold text-[14px] text-slate-900 mt-1">
                        {selectedBuyer.storeName || selectedBuyer.ownerName}
                      </h4>
                      <p className="text-[11px] font-mono text-slate-500">
                        ID: {selectedBuyer.zeebacId} • {selectedBuyer.phone}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedBuyer(null)}
                      className="text-xs font-bold text-slate-500 hover:text-red-600 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Payment Mode Selector */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI_INTENT')}
                      className={`py-2 px-3 rounded-xl border text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        paymentMethod === 'UPI_INTENT'
                          ? 'bg-purple-50 border-primary text-primary shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                      <span>Direct UPI Intent</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`py-2 px-3 rounded-xl border text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        paymentMethod === 'CASH'
                          ? 'bg-purple-50 border-primary text-primary shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      <span>Cash Received</span>
                    </button>
                  </div>
                </div>

                {/* Bill Summary */}
                <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5 text-[12.5px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Products:</span>
                    <strong className="text-slate-800">{billItems.length} lines ({totalUnits} units)</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono text-slate-800 font-bold">₹{totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-display">
                    <span className="text-[13px] font-black text-slate-900">Total Payable:</span>
                    <span className="text-[18px] font-black text-primary font-mono">₹{totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Generate Invoice Action */}
                <button
                  onClick={handleGenerateInvoice}
                  disabled={billItems.length === 0 || !selectedBuyer}
                  className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-black text-[13.5px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt</span>
                  <span>Generate B2B Invoice & Transfer</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: INVOICES HISTORY ─── */}
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            <h3 className="font-display font-black text-[16px] text-slate-900">
              B2B Sales Invoices
            </h3>

            {isLoadingList ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm space-y-2">
                <span className="material-symbols-outlined text-slate-300 text-[40px]">description</span>
                <p className="font-bold text-[14px] text-slate-700">No B2B invoices generated yet</p>
              </div>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv._id}
                  className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Invoice</span>
                      <h4 className="font-mono font-bold text-[13.5px] text-slate-900">{inv.invoiceNumber}</h4>
                      <p className="text-[11.5px] text-slate-500">
                        Buyer: <strong>{inv.buyerDetails?.storeName}</strong> ({inv.buyerDetails?.zeebacId})
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <p className="font-display font-black text-[16px] text-slate-900">₹{inv.totalAmount}</p>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                          inv.isTransferred
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {inv.isTransferred ? 'Stock Transferred' : 'Payment Pending'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                    <span>
                      {inv.items?.length || 1} Products • {inv.totalQuantity} Units
                    </span>
                    <span>{new Date(inv.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── TAB 3: STOCK MOVEMENT LEDGER ─── */}
        {activeTab === 'ledger' && (
          <div className="space-y-3">
            <h3 className="font-display font-black text-[16px] text-slate-900">
              Stock Movement Audit Trail
            </h3>

            {isLoadingList ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : ledger.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm space-y-2">
                <span className="material-symbols-outlined text-slate-300 text-[40px]">history_edu</span>
                <p className="font-bold text-[14px] text-slate-700">No stock movements recorded yet</p>
              </div>
            ) : (
              ledger.map((entry) => (
                <div
                  key={entry._id}
                  className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                        entry.movementType === 'IN'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {entry.movementType === 'IN' ? 'arrow_downward' : 'arrow_upward'}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-[13px] text-slate-900">{entry.productName}</h4>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {entry.reason} • {entry.notes || 'Inventory updated'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className={`font-mono font-black text-[14px] ${
                        entry.movementType === 'IN' ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {entry.movementType === 'IN' ? `+${entry.quantity}` : `-${entry.quantity}`}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {entry.previousStock} → {entry.newStock}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ── CAMERA SCANNER MODAL ── */}
      {showCameraScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 max-w-[360px] w-full shadow-2xl text-center space-y-3 relative">
            <button
              onClick={() => setShowCameraScanner(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <h3 className="font-display font-black text-[16px] text-slate-900">
              Scan Product Barcode
            </h3>
            <p className="text-[12px] text-slate-500">Hold barcode inside the square box to scan</p>
            <div id="b2b-qr-reader" className="w-full rounded-2xl overflow-hidden" />
          </div>
        </div>
      )}

      {/* ── PAYMENT & STOCK TRANSFER MODAL ── */}
      {createdInvoice && !transferSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-reveal">
          <div className="bg-white rounded-3xl p-6 max-w-[380px] w-full shadow-2xl text-center space-y-4 relative">
            <button
              onClick={() => setCreatedInvoice(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <div>
              <span className="text-[10.5px] uppercase font-bold text-primary px-3 py-1 rounded-full bg-purple-50">
                Invoice #{createdInvoice.invoiceNumber}
              </span>
              <h3 className="font-display font-black text-[18px] text-slate-900 mt-2">
                Verify Payment & Transfer
              </h3>
              <p className="text-[12px] text-slate-500">
                Total: <strong>₹{createdInvoice.totalAmount}</strong> to{' '}
                <strong>{createdInvoice.buyerDetails?.storeName}</strong>
              </p>
            </div>

            {paymentMethod === 'UPI_INTENT' ? (
              <div className="space-y-3">
                {qrCodeUrl && (
                  <div className="w-48 h-48 mx-auto p-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-center">
                    <img src={qrCodeUrl} alt="UPI QR" className="w-full h-full object-contain" />
                  </div>
                )}
                {invoiceUpiUri && (
                  <a
                    href={invoiceUpiUri}
                    className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[12.5px] flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all text-center"
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    <span>Pay via UPI App (GPay / PhonePe / Paytm)</span>
                  </a>
                )}
                <div className="text-left space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    12-Digit UPI UTR / Reference No. *
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 425512345678"
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <div className="bg-purple-50 rounded-2xl p-4 text-left space-y-1 text-[12px]">
                <p className="font-bold text-purple-900">Cash Payment Confirmation</p>
                <p className="text-purple-800">
                  You are confirming receipt of ₹{createdInvoice.totalAmount} cash from buyer. Stock will automatically transfer upon confirmation.
                </p>
              </div>
            )}

            <button
              onClick={handleExecuteTransfer}
              disabled={isTransferring}
              className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[13.5px] shadow-lg shadow-primary/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isTransferring ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                  <span>Confirm Payment & Transfer Stock</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── TRANSFER SUCCESS AUDIT MODAL ── */}
      {transferSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-reveal">
          <div className="bg-white rounded-3xl p-6 max-w-[400px] w-full shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>

            <div>
              <h3 className="font-display font-black text-[20px] text-slate-900">
                Stock Transferred Successfully!
              </h3>
              <p className="text-[12px] text-slate-500 mt-1">
                Products have been transferred directly to Wholesaler's inventory.
              </p>
            </div>

            {/* Audit details card */}
            <div className="bg-slate-50 rounded-2xl p-3 text-left space-y-2 text-[12px] border border-slate-100 max-h-48 overflow-y-auto">
              <p className="font-bold text-slate-800 border-b pb-1 text-[11px] uppercase tracking-wider">
                Transfer Audit Summary
              </p>
              {transferSuccessData.transferAudit?.map((audit, idx) => (
                <div key={idx} className="space-y-0.5 pb-1 border-b border-slate-200/60 last:border-0">
                  <p className="font-bold text-slate-900">{audit.name}</p>
                  <p className="text-slate-500 font-mono text-[11px]">
                    Qty: <strong>{audit.quantity}</strong> | Manufacturer: {audit.sellerStockBefore} → <strong>{audit.sellerStockAfter}</strong> | Wholesaler: {audit.buyerStockBefore} → <strong>{audit.buyerStockAfter}</strong>
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setTransferSuccessData(null);
                setCreatedInvoice(null);
              }}
              className="w-full py-3 rounded-2xl btn-primary-gradient text-white font-bold text-[13px] shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Done & Return to Billing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
