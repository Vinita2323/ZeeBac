import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { B2BAPI, VendorAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import ProductBarcodeScannerModal from '../../../components/common/ProductBarcodeScannerModal';

export default function B2BBillingPage() {
  const currentVendor = useAuthStore((s) => s.currentUser) || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['retail', 'wholesale', 'invoices', 'ledger'];
  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    validTabs.includes(tabFromQuery) ? tabFromQuery : 'retail'
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // ══════════════════════════════════════════════════════════════
  // ─── TAB 1: RETAIL POS (B2C) COUNTER BILLING STATE ──────────
  // ══════════════════════════════════════════════════════════════
  const [customerQuery, setCustomerQuery] = useState('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [verifiedCustomer, setVerifiedCustomer] = useState(null);
  const [customerError, setCustomerError] = useState('');

  const [retailBarcode, setRetailBarcode] = useState('');
  const [isLookingUpRetailProduct, setIsLookingUpRetailProduct] = useState(false);
  const [retailItems, setRetailItems] = useState([]);
  const [retailPaymentMethod, setRetailPaymentMethod] = useState('Cash'); // 'Cash' | 'UPI' | 'Card'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [receivedCash, setReceivedCash] = useState('');
  const [retailUpiQr, setRetailUpiQr] = useState('');
  const [isLoggingRetailBill, setIsLoggingRetailBill] = useState(false);
  const [completedRetailBill, setCompletedRetailBill] = useState(null);

  // Catalog Picker & Custom Item Modals
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [vendorCatalog, setVendorCatalog] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItem, setCustomItem] = useState({
    name: '',
    price: '',
    quantity: '1',
    cashbackPercentage: currentVendor?.cashbackRate || 5,
  });

  // ══════════════════════════════════════════════════════════════
  // ─── TAB 2: WHOLESALE (B2B) SUPPLY CHAIN BILLING STATE ───────
  // ══════════════════════════════════════════════════════════════
  const [wholesaleBarcode, setWholesaleBarcode] = useState('');
  const [isSearchingWholesaleProduct, setIsSearchingWholesaleProduct] = useState(false);
  const [wholesaleItems, setWholesaleItems] = useState([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerResults, setBuyerResults] = useState([]);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [wholesalePaymentMethod, setWholesalePaymentMethod] = useState('UPI_INTENT');
  const [b2bNotes, setB2BNotes] = useState('');

  // B2B Verification & Transfer Modal
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [invoiceUpiUri, setInvoiceUpiUri] = useState('');
  const [utrInput, setUtrInput] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccessData, setTransferSuccessData] = useState(null);

  // ══════════════════════════════════════════════════════════════
  // ─── COMMON CAMERA SCANNER MODAL ─────────────────────────────
  // ══════════════════════════════════════════════════════════════
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraScanMode, setCameraScanMode] = useState('product'); // 'product' | 'customer'

  // ══════════════════════════════════════════════════════════════
  // ─── TABS 3 & 4: INVOICES & LEDGER DATA ──────────────────────
  // ══════════════════════════════════════════════════════════════
  const [invoicesFilter, setInvoicesFilter] = useState('all'); // 'all' | 'retail' | 'b2b'
  const [retailTransactions, setRetailTransactions] = useState([]);
  const [b2bInvoices, setB2BInvoices] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // ─── STOCK PUTAWAY & AUDIT STATE ───
  const [showPutawayModal, setShowPutawayModal] = useState(false);
  const [putawayForm, setPutawayForm] = useState({
    productId: '',
    quantity: '10',
    batchNumber: '',
    expiryDate: '',
    locationRack: '',
    notes: '',
    sourceSupplier: '',
  });
  const [isSubmittingPutaway, setIsSubmittingPutaway] = useState(false);

  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditForm, setAuditForm] = useState({
    productId: '',
    countedStock: '',
    auditReason: 'Routine Physical Stock Audit',
    notes: '',
  });
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState('all'); // 'all' | 'in' | 'out' | 'audit'

  // Print Receipt Viewer Modal (from Invoices list)
  const [receiptToView, setReceiptToView] = useState(null);

  // Fetch Vendor Catalog for Quick-Picker
  const fetchCatalog = async () => {
    setIsLoadingCatalog(true);
    try {
      const res = await VendorAPI.getProducts();
      if (res.success) setVendorCatalog(res.data || []);
    } catch (e) {
      console.error('Failed to load catalog', e);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if ((activeTab === 'retail' || activeTab === 'ledger') && vendorCatalog.length === 0) {
      fetchCatalog();
    }
  }, [activeTab]);

  // Load Invoices / Ledger upon tab switch
  useEffect(() => {
    if (activeTab === 'invoices') {
      setIsLoadingList(true);
      Promise.allSettled([
        VendorAPI.getTransactions(),
        B2BAPI.getSellerInvoices(),
      ])
        .then(([retailRes, b2bRes]) => {
          if (retailRes.status === 'fulfilled' && retailRes.value?.success) {
            setRetailTransactions(retailRes.value.data || []);
          }
          if (b2bRes.status === 'fulfilled' && b2bRes.value?.success) {
            setB2BInvoices(b2bRes.value.data || []);
          }
        })
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

  // ─── STOCK PUTAWAY & AUDIT HANDLERS ───
  const handleOpenPutaway = (p = null) => {
    const target = p || vendorCatalog[0];
    setPutawayForm({
      productId: target ? target._id : '',
      quantity: '10',
      batchNumber: target?.batchNumber || '',
      expiryDate: target?.expiryDate ? target.expiryDate.split('T')[0] : '',
      locationRack: '',
      notes: '',
      sourceSupplier: target?.supplierDetails?.storeName || '',
    });
    setShowPutawayModal(true);
  };

  const handleSelectPutawayProduct = (prodId) => {
    const prod = vendorCatalog.find((p) => p._id === prodId);
    setPutawayForm((prev) => ({
      ...prev,
      productId: prodId,
      batchNumber: prod?.batchNumber || prev.batchNumber,
      expiryDate: prod?.expiryDate ? prod.expiryDate.split('T')[0] : prev.expiryDate,
      sourceSupplier: prod?.supplierDetails?.storeName || prev.sourceSupplier,
    }));
  };

  const handleSubmitPutaway = async (e) => {
    if (e) e.preventDefault();
    if (!putawayForm.productId) return toast.error('Please select a product for putaway');
    if (!putawayForm.quantity || Number(putawayForm.quantity) <= 0) return toast.error('Enter valid putaway quantity');

    setIsSubmittingPutaway(true);
    try {
      const res = await B2BAPI.recordStockPutaway({
        productId: putawayForm.productId,
        quantity: Number(putawayForm.quantity),
        batchNumber: putawayForm.batchNumber.trim(),
        expiryDate: putawayForm.expiryDate || undefined,
        locationRack: putawayForm.locationRack.trim(),
        notes: putawayForm.notes.trim(),
        sourceSupplier: putawayForm.sourceSupplier.trim(),
      });
      if (res.success) {
        toast.success(res.message || 'Putaway completed successfully!');
        setShowPutawayModal(false);
        // Refresh ledger & catalog
        const ledgerRes = await B2BAPI.getStockLedger();
        if (ledgerRes.success) setLedger(ledgerRes.data || []);
        fetchCatalog();
      } else {
        toast.error(res.message || 'Putaway failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record putaway');
    } finally {
      setIsSubmittingPutaway(false);
    }
  };

  const handleOpenAudit = (p = null) => {
    const target = p || vendorCatalog[0];
    setAuditForm({
      productId: target ? target._id : '',
      countedStock: target ? String(target.stock ?? 0) : '0',
      auditReason: 'Routine Physical Stock Audit',
      notes: '',
    });
    setShowAuditModal(true);
  };

  const handleSelectAuditProduct = (prodId) => {
    const prod = vendorCatalog.find((p) => p._id === prodId);
    setAuditForm((prev) => ({
      ...prev,
      productId: prodId,
      countedStock: prod ? String(prod.stock ?? 0) : '0',
    }));
  };

  const handleSubmitAudit = async (e) => {
    if (e) e.preventDefault();
    if (!auditForm.productId) return toast.error('Please select a product to audit');
    if (auditForm.countedStock === '' || isNaN(Number(auditForm.countedStock))) {
      return toast.error('Enter valid physical stock count');
    }

    setIsSubmittingAudit(true);
    try {
      const res = await B2BAPI.recordStockAudit({
        productId: auditForm.productId,
        countedStock: Number(auditForm.countedStock),
        auditReason: auditForm.auditReason,
        notes: auditForm.notes.trim(),
      });
      if (res.success) {
        toast.success(res.message || 'Audit adjustment recorded!');
        setShowAuditModal(false);
        // Refresh ledger & catalog
        const ledgerRes = await B2BAPI.getStockLedger();
        if (ledgerRes.success) setLedger(ledgerRes.data || []);
        fetchCatalog();
      } else {
        toast.error(res.message || 'Audit recording failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record audit adjustment');
    } finally {
      setIsSubmittingAudit(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ─── RETAIL POS BILLING HANDLERS (B2C) ────────────────────────
  // ══════════════════════════════════════════════════════════════

  // 1. Customer Zeebac ID Lookup
  const handleLookupCustomer = async (termToLookup) => {
    const raw = (termToLookup || customerQuery).trim();
    if (!raw) {
      setVerifiedCustomer(null);
      setCustomerError('');
      return;
    }

    setIsSearchingCustomer(true);
    setCustomerError('');
    try {
      const res = await VendorAPI.lookupCustomerByPhone(raw);
      if (res.success && res.data) {
        setVerifiedCustomer(res.data);
        toast.success(`Verified: ${res.data.name} (${res.data.zeebacId || res.data.phone})`);
      } else {
        setVerifiedCustomer(null);
        setCustomerError('Customer not registered on Zeebac');
      }
    } catch (err) {
      setVerifiedCustomer(null);
      setCustomerError(err.response?.data?.message || 'Customer not found. Please verify Zeebac ID.');
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  // 2. Barcode Product Lookup in Vendor Inventory
  const handleRetailProductLookup = async (codeToSearch) => {
    const term = (codeToSearch || retailBarcode).trim();
    if (!term) return;

    setIsLookingUpRetailProduct(true);
    try {
      // First check local catalog
      const localMatch = vendorCatalog.find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === term.toLowerCase()) ||
          (p.productId && p.productId.toLowerCase() === term.toLowerCase()) ||
          p.name.toLowerCase().includes(term.toLowerCase())
      );

      if (localMatch) {
        addRetailItem(localMatch);
        setRetailBarcode('');
        toast.success(`Added "${localMatch.name}" to bill!`);
      } else {
        // Fallback to B2B search endpoint
        const res = await B2BAPI.searchProducts({ query: term });
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          addRetailItem(res.data[0]);
          setRetailBarcode('');
          toast.success(`Added "${res.data[0].name}" to bill!`);
        } else {
          toast.error(`No product found matching "${term}" in store inventory`);
        }
      }
    } catch {
      toast.error('Product lookup failed');
    } finally {
      setIsLookingUpRetailProduct(false);
    }
  };

  const addRetailItem = (product) => {
    setRetailItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === product._id);
      if (existingIdx > -1) {
        const existing = prev[existingIdx];
        const nextQty = existing.quantity + 1;
        if (product.stock && nextQty > product.stock) {
          toast.error(`Max available stock is ${product.stock}`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          quantity: nextQty,
          total: Math.round(nextQty * existing.price * 100) / 100,
        };
        return updated;
      }

      const price = Number(product.price || product.mrp || 0);
      const cashbackPct = Number(product.cashbackPercentage || currentVendor?.cashbackRate || 5);

      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          barcode: product.barcode || '',
          productIdString: product.productId || '',
          price,
          quantity: 1,
          total: price,
          cashbackPercentage: cashbackPct,
          stock: product.stock ?? 999,
          unit: product.unit || 'Pcs',
          image: product.image || '',
        },
      ];
    });
  };

  const updateRetailQty = (productId, delta) => {
    setRetailItems((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (item.stock && nextQty > item.stock) {
              toast.error(`Max stock available is ${item.stock}`);
              return item;
            }
            return {
              ...item,
              quantity: nextQty,
              total: Math.round(nextQty * item.price * 100) / 100,
            };
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeRetailItem = (productId) => {
    setRetailItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleAddCustomItem = () => {
    const { name, price, quantity, cashbackPercentage } = customItem;
    const parsedPrice = parseFloat(price);
    const parsedQty = parseInt(quantity, 10);
    const parsedCB = parseFloat(cashbackPercentage);

    if (!name.trim()) return toast.error('Enter item name');
    if (!parsedPrice || parsedPrice <= 0) return toast.error('Enter valid unit price');
    if (!parsedQty || parsedQty <= 0) return toast.error('Enter valid quantity');

    const newItem = {
      productId: null,
      name: name.trim(),
      barcode: '',
      price: parsedPrice,
      quantity: parsedQty,
      total: Math.round(parsedPrice * parsedQty * 100) / 100,
      cashbackPercentage: parsedCB > 0 ? parsedCB : (currentVendor?.cashbackRate || 5),
      stock: 9999,
      unit: 'Pcs',
      image: '',
    };

    setRetailItems((prev) => [...prev, newItem]);
    setShowCustomItemModal(false);
    setCustomItem({
      name: '',
      price: '',
      quantity: '1',
      cashbackPercentage: currentVendor?.cashbackRate || 5,
    });
    toast.success(`Custom item "${name}" added!`);
  };

  // Retail Calculations
  const retailSubtotal = Math.round(retailItems.reduce((acc, i) => acc + i.total, 0) * 100) / 100;
  const retailTotalUnits = retailItems.reduce((acc, i) => acc + i.quantity, 0);
  const retailTotalCashback = Math.round(
    retailItems.reduce((acc, i) => acc + (i.total * (i.cashbackPercentage || 5)) / 100, 0) * 100
  ) / 100;

  // Proceed to Payment Modal Trigger
  const handleProceedToPayment = () => {
    if (retailItems.length === 0) {
      toast.error('Please add at least one item to proceed');
      return;
    }
    setReceivedCash(String(retailSubtotal));
    setShowPaymentModal(true);
  };

  // Generate UPI QR Code dynamically when modal opens with UPI selected
  useEffect(() => {
    if (showPaymentModal && retailPaymentMethod === 'UPI' && retailSubtotal > 0) {
      const upiId = currentVendor?.upiId || currentVendor?.bankDetails?.upiId || 'zeebac@upi';
      const storeName = currentVendor?.storeName || currentVendor?.ownerName || 'Zeebac Store';
      const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${retailSubtotal}&cu=INR&tn=Zeebac%20POS%20Bill`;
      QRCode.toDataURL(uri, { width: 220, margin: 1 })
        .then((url) => setRetailUpiQr(url))
        .catch((e) => console.warn('Could not generate UPI QR', e));
    }
  }, [showPaymentModal, retailPaymentMethod, retailSubtotal, currentVendor]);

  // 3. Complete Sale & Credit Cashback to Customer Wallet
  const handleCompleteRetailSale = async () => {
    if (retailItems.length === 0) {
      toast.error('Please add at least one item to generate bill');
      return;
    }

    if (!verifiedCustomer && !customerQuery.trim()) {
      toast.error('Enter Customer Zeebac ID or mobile number to credit cashback points');
      return;
    }

    setIsLoggingRetailBill(true);
    try {
      const generatedBillNo = `BILL-${Date.now().toString().slice(-6)}`;
      const payload = {
        customerZeebacId: verifiedCustomer?.zeebacId || customerQuery.trim().toUpperCase(),
        customerPhone: verifiedCustomer?.phone || customerQuery.trim(),
        amount: retailSubtotal,
        items: retailItems,
        paymentMethod: retailPaymentMethod,
        billNumber: generatedBillNo,
        cashbackPercent: currentVendor?.cashbackRate || 5,
      };

      const res = await VendorAPI.logPurchase(payload);

      if (res.success) {
        const finalTxn = res.data;
        setCompletedRetailBill({
          ...finalTxn,
          items: retailItems,
          customerName: verifiedCustomer?.name || finalTxn.customerName || 'Valued Customer',
          customerZeebacId: verifiedCustomer?.zeebacId || finalTxn.customerZeebacId,
          customerPhone: verifiedCustomer?.phone || finalTxn.customerPhone,
          vendorStoreName: currentVendor?.storeName || currentVendor?.ownerName || 'Zeebac Store',
          vendorZeebacId: currentVendor?.zeebacId || 'ZBV-STORE',
          vendorAddress: currentVendor?.address || 'Verified Merchant Store',
          vendorPhone: currentVendor?.phone || '',
          billNumber: generatedBillNo,
          cashbackCredited: finalTxn.cashbackAmount || retailTotalCashback,
          date: new Date().toLocaleString(),
          paymentMethod: retailPaymentMethod,
        });

        toast.success(
          `🎉 Bill Generated! ₹${finalTxn.cashbackAmount || retailTotalCashback} cashback points credited to customer wallet!`
        );

        // Close payment modal
        setShowPaymentModal(false);

        // Reset form
        setRetailItems([]);
        setVerifiedCustomer(null);
        setCustomerQuery('');
      } else {
        toast.error(res.message || 'Failed to generate bill');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transaction failed. Check merchant wallet balance.');
    } finally {
      setIsLoggingRetailBill(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ─── WHOLESALE B2B BILLING HANDLERS ──────────────────────────
  // ══════════════════════════════════════════════════════════════

  const handleWholesaleProductLookup = async (codeToSearch) => {
    const term = (codeToSearch || wholesaleBarcode).trim();
    if (!term) return;

    setIsSearchingWholesaleProduct(true);
    try {
      const res = await B2BAPI.searchProducts({ query: term });
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const found = res.data[0];
        addWholesaleItem(found);
        setWholesaleBarcode('');
        toast.success(`Added "${found.name}" to wholesale bill!`);
      } else {
        toast.error(`No product found matching "${term}" in your catalog`);
      }
    } catch {
      toast.error('Product lookup failed');
    } finally {
      setIsSearchingWholesaleProduct(false);
    }
  };

  const addWholesaleItem = (product) => {
    setWholesaleItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.productId === product._id);
      if (existingIndex > -1) {
        const existing = prev[existingIndex];
        const nextQty = existing.quantity + 1;
        if (product.stock && nextQty > product.stock) {
          toast.error(`Cannot exceed stock (${product.stock} ${product.unit || 'Pcs'})`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIndex] = {
          ...existing,
          quantity: nextQty,
          totalAmount: Math.round(nextQty * existing.rate * 100) / 100,
        };
        return updated;
      }
      const rate = product.wholesalePrice || product.price || 0;
      return [
        ...prev,
        {
          productId: product._id,
          productIdString: product.productId || '',
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
          cashbackPercentage: product.cashbackPercentage || 0,
        },
      ];
    });
  };

  const updateWholesaleQty = (productId, delta) => {
    setWholesaleItems((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (item.stock && nextQty > item.stock) {
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

  const removeWholesaleItem = (productId) => {
    setWholesaleItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  // Search Buyers (Retailers)
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

  const wholesaleTotalAmount =
    Math.round(wholesaleItems.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
  const wholesaleTotalUnits = wholesaleItems.reduce((sum, item) => sum + item.quantity, 0);

  // Generate B2B Invoice & Open Transfer Modal
  const handleGenerateWholesaleInvoice = async () => {
    if (wholesaleItems.length === 0) {
      toast.error('Please scan or add at least one product');
      return;
    }
    if (!selectedBuyer) {
      toast.error('Please select the Purchasing Retailer Merchant');
      return;
    }

    try {
      const res = await B2BAPI.createInvoice({
        buyerId: selectedBuyer._id,
        items: wholesaleItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          rate: i.rate,
          mrp: i.mrp,
        })),
        paymentMethod: wholesalePaymentMethod,
        notes: b2bNotes,
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

  // Execute B2B Stock Transfer upon payment confirmation
  const handleExecuteTransfer = async () => {
    if (!createdInvoice || isTransferring) return;

    if (wholesalePaymentMethod === 'UPI_INTENT' && (!utrInput || utrInput.length !== 12)) {
      toast.error('Please enter the 12-digit UPI UTR number from payment receipt');
      return;
    }

    setIsTransferring(true);
    try {
      const res = await B2BAPI.verifyAndTransferStock(createdInvoice._id, {
        paymentMethod: wholesalePaymentMethod,
        utr: wholesalePaymentMethod === 'UPI_INTENT' ? utrInput.trim() : undefined,
        cashConfirmed: wholesalePaymentMethod === 'CASH' ? true : undefined,
        confirmedBy: currentVendor?.storeName || currentVendor?.ownerName || 'Authorized Merchant',
      });

      if (res.success) {
        setTransferSuccessData(res.data);
        toast.success('🎉 Products & Stock successfully imported into Retailer’s Zeebac ID!');
        setWholesaleItems([]);
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
      {/* ── PRINT STYLES FOR THERMAL RECEIPT ── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #pos-printable-receipt, #pos-printable-receipt * {
            visibility: visible;
          }
          #pos-printable-receipt {
            position: fixed;
            left: 0;
            top: 0;
            width: 80mm !important;
            margin: 0 !important;
            padding: 8px !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      {/* ── TOP HEADER & MODE SWITCHER ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-3 sm:px-4 py-3 border-b border-slate-100 shadow-xs">
        <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-800 text-white flex items-center justify-center font-black shadow-md shrink-0">
              <span className="material-symbols-outlined text-[24px]">point_of_sale</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-[16px] sm:text-[18px] text-slate-900 leading-tight">
                  Zeebac Billing POS
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                  {activeTab === 'retail' ? 'B2C Counter POS' : activeTab === 'wholesale' ? 'B2B Trade' : activeTab === 'ledger' ? 'Stock Putaway & Audit' : 'History'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {activeTab === 'retail'
                  ? 'Cashier Billing • Instant Customer Wallet Cashback Points'
                  : activeTab === 'ledger'
                  ? 'Putaway & Stock Movement Audit Trail • Realtime Inward/Outward Log'
                  : 'Supply Chain Trade • Automatic Retailer Stock Import'}
              </p>
            </div>
          </div>

          {/* Mode Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl overflow-x-auto hide-scrollbar">
            <button
              onClick={() => handleTabSelect('retail')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'retail' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
              <span>Retail POS (B2C)</span>
            </button>

            <button
              onClick={() => handleTabSelect('wholesale')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'wholesale' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">local_shipping</span>
              <span>Wholesale (B2B)</span>
            </button>

            <button
              onClick={() => handleTabSelect('invoices')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'invoices' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Invoices</span>
            </button>

            <button
              onClick={() => handleTabSelect('ledger')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'ledger' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
              <span>Stock Audit / Ledger</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT CONTAINER ── */}
      <main className="max-w-[1100px] mx-auto p-3 sm:p-4 space-y-4">
        {/* ══════════════════════════════════════════════════════════ */}
        {/* ─── TAB 1: RETAIL POS (B2C) CASHIER COUNTER BILLING ──── */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'retail' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Customer ID & Itemized Bill */}
            <div className="lg:col-span-2 space-y-4">
              {/* 1. Customer Zeebac ID Lookup Bar */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px] text-purple-600">account_circle</span>
                    <span>Customer Zeebac ID / Mobile Number</span>
                  </label>
                  <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    Instant Cashback Credit
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                      badge
                    </span>
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value);
                        if (e.target.value.trim().length >= 10 || e.target.value.toUpperCase().startsWith('ZBC')) {
                          handleLookupCustomer(e.target.value);
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleLookupCustomer()}
                      placeholder="Enter Zeebac ID (e.g. ZBC-10023) or Mobile (9876543210)..."
                      className="w-full h-11 pl-10 pr-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[13.5px] font-bold text-slate-900 focus:outline-none focus:border-purple-600 transition-all uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  <button
                    onClick={() => handleLookupCustomer()}
                    disabled={isSearchingCustomer}
                    className="h-11 px-4 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[12.5px] flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSearchingCustomer ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Verify</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setCameraScanMode('customer');
                      setShowCameraScanner(true);
                    }}
                    className="h-11 px-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[12.5px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                    title="Scan Customer QR Code"
                  >
                    <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                  </button>
                </div>

                {/* Verified Customer Card */}
                {verifiedCustomer && (
                  <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 animate-reveal">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[15px] shrink-0">
                        {verifiedCustomer.name ? verifiedCustomer.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-[13.5px] text-slate-900 truncate">
                            {verifiedCustomer.name}
                          </p>
                          <span className="material-symbols-outlined text-[16px] text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                            verified
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-mono">
                          ID: <strong className="text-purple-700">{verifiedCustomer.zeebacId}</strong> • {verifiedCustomer.phone}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-md block">
                        Cashback Eligible
                      </span>
                      <button
                        onClick={() => {
                          setVerifiedCustomer(null);
                          setCustomerQuery('');
                        }}
                        className="text-[11px] text-slate-400 hover:text-red-500 font-semibold mt-0.5 cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}

                {customerError && !verifiedCustomer && (
                  <p className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl font-medium">
                    ⚠️ {customerError}
                  </p>
                )}
              </div>

              {/* 2. Barcode Scanner & Quick Add Toolbar */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    Scan Barcode or Search Store Product
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCatalogModal(true)}
                      className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">menu_book</span>
                      <span>Pick From Catalog</span>
                    </button>
                    <button
                      onClick={() => setShowCustomItemModal(true)}
                      className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      <span>+ Custom Item</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                      barcode
                    </span>
                    <input
                      type="text"
                      value={retailBarcode}
                      onChange={(e) => setRetailBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRetailProductLookup()}
                      placeholder="Scan with barcode gun or type product name/barcode..."
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-[13.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600 transition-all placeholder:font-sans placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  <button
                    onClick={() => handleRetailProductLookup()}
                    disabled={isLookingUpRetailProduct}
                    className="h-11 px-4 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[12.5px] flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLookingUpRetailProduct ? 'Adding...' : 'Add Item'}
                  </button>

                  <button
                    onClick={() => {
                      setCameraScanMode('product');
                      setShowCameraScanner(true);
                    }}
                    className="h-11 px-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[12.5px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                    title="Scan Product with Camera"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                  </button>
                </div>
              </div>

              {/* 3. Items in Current Bill */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-display font-black text-[15px] text-slate-900 flex items-center gap-2">
                    <span>Retail Bill Items</span>
                    <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold flex items-center justify-center">
                      {retailItems.length}
                    </span>
                  </h3>
                  {retailItems.length > 0 && (
                    <button
                      onClick={() => setRetailItems([])}
                      className="text-xs font-bold text-red-500 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {retailItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <span className="material-symbols-outlined text-slate-300 text-[48px]">
                      receipt_long
                    </span>
                    <p className="font-bold text-[14px] text-slate-700">No items in the bill yet</p>
                    <p className="text-[12px] text-slate-400 max-w-[320px] mx-auto">
                      Scan product barcode gun, pick from your catalog, or tap <strong>+ Custom Item</strong>. Cashback points calculate automatically!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                    {retailItems.map((item, idx) => (
                      <div key={item.productId || `custom-${idx}`} className="py-3 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-purple-600">inventory_2</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-[13px] text-slate-900 truncate">{item.name}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                            <span>₹{item.price}</span>
                            <span className="text-purple-600 font-bold bg-purple-50 px-1 rounded text-[10px]">
                              {item.cashbackPercentage}% CB (₹{((item.price * item.cashbackPercentage) / 100).toFixed(1)})
                            </span>
                            {item.stock < 999 && (
                              <span className="text-slate-400 text-[10px]">Stock: {item.stock}</span>
                            )}
                          </div>
                        </div>

                        {/* Qty Stepper */}
                        <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                          <button
                            onClick={() => updateRetailQty(item.productId, -1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-[13px]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateRetailQty(item.productId, 1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        {/* Line Total */}
                        <div className="text-right min-w-[70px]">
                          <p className="font-display font-black text-[14px] text-slate-900">
                            ₹{item.total}
                          </p>
                          <button
                            onClick={() => removeRetailItem(item.productId)}
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

            {/* Right Col: Bill Summary & Proceed to Payment */}
            <div className="space-y-4">
              {/* Bill Calculation & Cashback Points Card */}
              <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-sm space-y-4">
                <h3 className="font-display font-black text-[15px] text-slate-900 pb-2 border-b border-slate-100">
                  Bill Calculation
                </h3>

                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Items</span>
                    <span className="font-bold">{retailItems.length} ({retailTotalUnits} Units)</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono font-bold">₹{retailSubtotal}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>GST / Taxes</span>
                    <span className="text-emerald-600 font-bold">Included</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
                    <span className="font-bold text-slate-900 text-[14px]">Net Payable Total</span>
                    <span className="font-display font-black text-[22px] text-purple-700">
                      ₹{retailSubtotal}
                    </span>
                  </div>
                </div>

                {/* Instant Cashback Highlight Box */}
                <div className="p-3.5 bg-gradient-to-br from-purple-900 to-indigo-950 text-white rounded-2xl space-y-1.5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-purple-200">
                      Customer Reward
                    </span>
                    <span className="material-symbols-outlined text-amber-400 text-[18px]">
                      stars
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold text-purple-100">
                      Zeebac Cashback Points:
                    </span>
                    <span className="font-display font-black text-[20px] text-amber-300">
                      +₹{retailTotalCashback}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-purple-200/80 leading-tight">
                    {verifiedCustomer
                      ? `Deposited instantly into ${verifiedCustomer.name}'s Zeebac wallet upon payment.`
                      : 'Points will be credited to the entered Customer Zeebac ID.'}
                  </p>
                </div>

                {/* Proceed Action Button */}
                {retailItems.length === 0 ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 rounded-2xl bg-slate-100 text-slate-400 font-bold text-[14px] flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200"
                  >
                    <span className="material-symbols-outlined text-[20px]">add_shopping_cart</span>
                    <span>Add Products to Proceed</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleProceedToPayment}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-800 hover:to-indigo-900 text-white font-bold text-[14px] shadow-lg shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Proceed to Payment (₹{retailSubtotal})</span>
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ─── TAB 2: WHOLESALE (B2B) SUPPLY CHAIN BILLING ───────── */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'wholesale' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Barcode Input & Wholesale Bill Table */}
            <div className="lg:col-span-2 space-y-4">
              {/* Barcode Scanner Bar */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Scan Barcode or Search Master Catalogue (EAN / Product ID)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(true)}
                    className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">menu_book</span>
                    <span>Pick From Catalog</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                      barcode
                    </span>
                    <input
                      type="text"
                      value={wholesaleBarcode}
                      onChange={(e) => setWholesaleBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleWholesaleProductLookup()}
                      placeholder="Scan with barcode gun or type EAN (e.g. 8901008310247)..."
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-[13.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600 transition-all"
                    />
                  </div>
                  <button
                    onClick={() => handleWholesaleProductLookup()}
                    disabled={isSearchingWholesaleProduct}
                    className="h-11 px-4 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[12.5px] flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSearchingWholesaleProduct ? 'Adding...' : 'Add Item'}
                  </button>
                  <button
                    onClick={() => {
                      setCameraScanMode('product');
                      setShowCameraScanner(true);
                    }}
                    className="h-11 px-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[12.5px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                    title="Scan with Camera"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                  </button>
                </div>
              </div>

              {/* Items in Wholesale Bill */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-display font-black text-[15px] text-slate-900">
                    B2B Wholesale Items ({wholesaleItems.length})
                  </h3>
                  {wholesaleItems.length > 0 && (
                    <button
                      onClick={() => setWholesaleItems([])}
                      className="text-xs font-bold text-red-500 hover:underline cursor-pointer"
                    >
                      Clear Bill
                    </button>
                  )}
                </div>

                {wholesaleItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <span className="material-symbols-outlined text-slate-300 text-[48px]">
                      local_shipping
                    </span>
                    <p className="font-bold text-[14px] text-slate-700">No items added to wholesale trade bill</p>
                    <p className="text-[12px] text-slate-400 max-w-[320px] mx-auto">
                      Scan product barcodes above. Upon payment confirmation, all these items and stock quantities will be automatically imported into the purchasing retailer’s inventory!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                    {wholesaleItems.map((item) => (
                      <div key={item.productId} className="py-3 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-slate-400">inventory_2</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-[13px] text-slate-900 truncate">{item.name}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                            {item.productIdString && (
                              <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 text-[10px]">
                                PID: {item.productIdString}
                              </span>
                            )}
                            <span>Rate: ₹{item.rate}</span>
                            <span>MRP: ₹{item.mrp}</span>
                            <span className="text-emerald-600 font-bold">Avail: {item.stock} {item.unit}</span>
                          </div>
                        </div>

                        {/* Qty Stepper */}
                        <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                          <button
                            onClick={() => updateWholesaleQty(item.productId, -1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-[13px]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateWholesaleQty(item.productId, 1)}
                            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90 font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <p className="font-display font-black text-[14px] text-slate-900">
                            ₹{item.totalAmount}
                          </p>
                          <button
                            onClick={() => removeWholesaleItem(item.productId)}
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

            {/* Right Col: Buyer Retailer & B2B Payment */}
            <div className="space-y-4">
              {/* Select Purchasing Retailer */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Purchasing Retailer Zeebac ID / Store Name
                </label>

                {!selectedBuyer ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                        search
                      </span>
                      <input
                        type="text"
                        value={buyerQuery}
                        onChange={(e) => handleBuyerSearch(e.target.value)}
                        placeholder="Search Retailer ID (e.g. ZBV-5706) or store..."
                        className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    </div>

                    {buyerResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-lg">
                        {buyerResults.map((buyer) => (
                          <div
                            key={buyer._id}
                            onClick={() => {
                              setSelectedBuyer(buyer);
                              setBuyerResults([]);
                              setBuyerQuery('');
                            }}
                            className="p-2.5 hover:bg-purple-50 cursor-pointer transition-colors text-left"
                          >
                            <p className="font-bold text-[13px] text-slate-900">{buyer.storeName}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              Zeebac ID: <strong className="text-purple-700">{buyer.zeebacId}</strong> • {buyer.phone}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[13.5px] text-purple-950">{selectedBuyer.storeName}</p>
                      <p className="text-[11px] text-purple-700 font-mono">
                        Zeebac ID: <strong>{selectedBuyer.zeebacId}</strong>
                      </p>
                      <p className="text-[10px] text-purple-600 mt-0.5">{selectedBuyer.phone}</p>
                    </div>
                    <button
                      onClick={() => setSelectedBuyer(null)}
                      className="text-xs font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              {/* B2B Payment Mode */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Wholesale Payment Terms
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setWholesalePaymentMethod('UPI_INTENT')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      wholesalePaymentMethod === 'UPI_INTENT'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 font-bold'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] block mb-1">qr_code_2</span>
                    <span className="text-[12px]">UPI Intent / QR</span>
                  </button>
                  <button
                    onClick={() => setWholesalePaymentMethod('CASH')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      wholesalePaymentMethod === 'CASH'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 font-bold'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] block mb-1">payments</span>
                    <span className="text-[12px]">Cash Confirmed</span>
                  </button>
                </div>

                <textarea
                  value={b2bNotes}
                  onChange={(e) => setB2BNotes(e.target.value)}
                  placeholder="Optional delivery or wholesale order notes..."
                  className="w-full h-16 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] text-slate-800 focus:outline-none focus:border-purple-600 resize-none"
                />
              </div>

              {/* Wholesale Totals & Action */}
              <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
                <div className="space-y-1.5 text-[13px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Items</span>
                    <span className="font-bold">{wholesaleItems.length} ({wholesaleTotalUnits} Units)</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
                    <span className="font-bold text-slate-900 text-[14px]">Wholesale Bill Total</span>
                    <span className="font-display font-black text-[22px] text-purple-700">
                      ₹{wholesaleTotalAmount}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-800 space-y-0.5">
                  <p className="font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">sync</span>
                    <span>Automatic Stock Import</span>
                  </p>
                  <p className="text-[10.5px]">
                    Upon payment confirmation, all {wholesaleItems.length} products and stock will be immediately imported into the retailer’s Zeebac catalog.
                  </p>
                </div>

                <button
                  onClick={handleGenerateWholesaleInvoice}
                  disabled={wholesaleItems.length === 0 || !selectedBuyer}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-800 text-white font-bold text-[14px] shadow-lg shadow-purple-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                  <span>Generate Wholesale Invoice</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ─── TAB 3: SALES INVOICES HISTORY ─────────────────────── */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-display font-black text-[17px] text-slate-900">
                  Sales & Billing Invoices
                </h3>
                <p className="text-[12px] text-slate-500">
                  View, re-print thermal receipts, or audit customer and wholesale transactions.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {['all', 'retail', 'b2b'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setInvoicesFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize ${
                      invoicesFilter === f ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {f === 'retail' ? 'Retail (B2C)' : f === 'b2b' ? 'Wholesale (B2B)' : 'All Invoices'}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingList ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">Loading invoices...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Retail Invoices */}
                {(invoicesFilter === 'all' || invoicesFilter === 'retail') &&
                  retailTransactions
                    .filter((t) => t.type === 'pos_bill' || t.source === 'vendor_pos_billing' || t.initiatedBy === 'vendor')
                    .map((tx) => (
                      <div
                        key={tx._id || tx.transactionId}
                        className="p-3.5 sm:p-4 rounded-2xl border border-slate-100 hover:border-purple-200 bg-white hover:bg-purple-50/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[13.5px] text-slate-900">
                                {tx.billNumber || tx.transactionId}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                                Retail B2C
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Customer: <strong>{tx.customerName || 'Walk-in'}</strong> ({tx.customerZeebacId || tx.customerPhone}) • {new Date(tx.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <div className="text-right">
                            <p className="font-display font-black text-[15px] text-slate-900">₹{tx.amount}</p>
                            <p className="text-[10.5px] font-bold text-emerald-600">
                              +₹{tx.cashbackAmount} Cashback Points
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setReceiptToView({
                                billNumber: tx.billNumber || tx.transactionId,
                                customerName: tx.customerName || 'Valued Customer',
                                customerZeebacId: tx.customerZeebacId || tx.customerPhone,
                                customerPhone: tx.customerPhone,
                                vendorStoreName: currentVendor?.storeName || 'Zeebac Store',
                                vendorZeebacId: currentVendor?.zeebacId || 'ZBV-STORE',
                                vendorAddress: currentVendor?.address || 'Verified Store',
                                vendorPhone: currentVendor?.phone || '',
                                items: tx.items && tx.items.length > 0 ? tx.items : [{ name: 'Store Items', quantity: 1, price: tx.amount, total: tx.amount }],
                                amount: tx.amount,
                                cashbackCredited: tx.cashbackAmount,
                                paymentMethod: tx.paymentMethod || 'Cash',
                                date: new Date(tx.createdAt).toLocaleString(),
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-purple-600 text-purple-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[15px]">print</span>
                            <span>View Receipt</span>
                          </button>
                        </div>
                      </div>
                    ))}

                {/* Wholesale B2B Invoices */}
                {(invoicesFilter === 'all' || invoicesFilter === 'b2b') &&
                  b2bInvoices.map((inv) => (
                    <div
                      key={inv._id}
                      className="p-3.5 sm:p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 bg-white hover:bg-indigo-50/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px]">local_shipping</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13.5px] text-slate-900">
                              #{inv.invoiceNumber}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Wholesale B2B
                            </span>
                            {inv.isTransferred && (
                              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Stock Imported
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Purchasing Retailer: <strong>{inv.buyerDetails?.storeName}</strong> ({inv.buyerDetails?.zeebacId}) • {new Date(inv.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <div className="text-right">
                          <p className="font-display font-black text-[15px] text-slate-900">₹{inv.totalAmount}</p>
                          <p className="text-[10.5px] text-slate-500 font-mono">
                            {inv.items?.length || 0} Products
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                            inv.paymentStatus === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ─── TAB 4: STOCK PUTAWAY & AUDIT LEDGER ──────────────── */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'ledger' && (() => {
          // Compute summary metrics
          const inwardUnits = ledger
            .filter((e) => e.movementType === 'IN' || e.movementType === 'INWARD')
            .reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
          const outwardUnits = ledger
            .filter((e) => e.movementType === 'OUT' || e.movementType === 'OUTWARD')
            .reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
          const auditCount = ledger.filter((e) => e.reason === 'MANUAL_ADJUSTMENT').length;

          // Filter entries
          const filteredLedger = ledger.filter((e) => {
            if (ledgerFilter === 'in') return e.movementType === 'IN' || e.movementType === 'INWARD';
            if (ledgerFilter === 'out') return e.movementType === 'OUT' || e.movementType === 'OUTWARD';
            if (ledgerFilter === 'audit') return e.reason === 'MANUAL_ADJUSTMENT';
            return true;
          });

          return (
            <div className="space-y-4">
              {/* Top Card: Putaway & Audit Actions Header */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-black text-[17px] text-slate-900">
                        Stock Putaway & Audit Trail
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active Ledger
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500">
                      Inward newly received stock with Batch/Expiry, or perform physical shelf audits & reconciliation.
                    </p>
                  </div>

                  {/* Two Prominent Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenPutaway()}
                      className="px-3.5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[12px] shadow-sm flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[17px]">add_box</span>
                      <span>+ Stock Putaway (Inward)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenAudit()}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[12px] shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[17px]">fact_check</span>
                      <span>Physical Stock Audit</span>
                    </button>
                  </div>
                </div>

                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="bg-purple-50/60 rounded-2xl p-3 border border-purple-100/80 text-left">
                    <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Total Events</p>
                    <p className="font-display font-black text-[18px] text-purple-900 mt-0.5">{ledger.length}</p>
                  </div>
                  <div className="bg-emerald-50/60 rounded-2xl p-3 border border-emerald-100/80 text-left">
                    <p className="text-[10.5px] font-bold text-emerald-700 uppercase tracking-wider">Inward Received</p>
                    <p className="font-display font-black text-[18px] text-emerald-800 mt-0.5">+{inwardUnits} Pcs</p>
                  </div>
                  <div className="bg-indigo-50/60 rounded-2xl p-3 border border-indigo-100/80 text-left">
                    <p className="text-[10.5px] font-bold text-indigo-700 uppercase tracking-wider">Outward Sold</p>
                    <p className="font-display font-black text-[18px] text-indigo-800 mt-0.5">-{outwardUnits} Pcs</p>
                  </div>
                  <div className="bg-amber-50/60 rounded-2xl p-3 border border-amber-100/80 text-left">
                    <p className="text-[10.5px] font-bold text-amber-700 uppercase tracking-wider">Audits & Fixes</p>
                    <p className="font-display font-black text-[18px] text-amber-800 mt-0.5">{auditCount}</p>
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pt-1">
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      ledgerFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Movements ({ledger.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('in')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      ledgerFilter === 'in' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Inward / Putaway
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('out')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      ledgerFilter === 'out' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Outward / Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('audit')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      ledgerFilter === 'audit' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Physical Audits ({auditCount})
                  </button>
                </div>

                {/* Ledger Listing */}
                {isLoadingList ? (
                  <div className="py-16 text-center">
                    <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-bold">Loading stock ledger...</p>
                  </div>
                ) : filteredLedger.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <span className="material-symbols-outlined text-[44px] text-slate-300">inventory_2</span>
                    <p className="text-sm font-bold text-slate-700">No stock movements recorded yet</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Use the <strong>"+ Stock Putaway"</strong> button above to record received stock, or perform a <strong>"Physical Stock Audit"</strong> to reconcile shelf quantities.
                    </p>
                    <div className="pt-2 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPutaway()}
                        className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-bold text-xs hover:bg-purple-100 transition-colors cursor-pointer"
                      >
                        + Record First Putaway
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto pr-1">
                    {filteredLedger.map((entry) => {
                      const isInward = entry.movementType === 'IN' || entry.movementType === 'INWARD';
                      const prevStock = entry.previousStock ?? entry.stockBefore ?? entry.beforeBuyerStock ?? 0;
                      const nextStock = entry.newStock ?? entry.stockAfter ?? entry.afterBuyerStock ?? 0;
                      return (
                        <div key={entry._id || entry.movementId} className="py-3 flex items-start sm:items-center justify-between gap-3 text-left">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 mt-0.5 sm:mt-0 ${
                                isInward ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[19px]">
                                {isInward ? 'arrow_downward' : 'arrow_upward'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-[13.5px] text-slate-900 truncate">{entry.productName}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono flex-wrap">
                                <span>{entry.movementId || 'SMV-LOG'}</span>
                                <span>•</span>
                                <span>{new Date(entry.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                {entry.reason && (
                                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100">
                                    {entry.reason.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </div>
                              {entry.notes && (
                                <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{entry.notes}</p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`text-[13px] font-bold font-mono ${
                                isInward ? 'text-emerald-600' : 'text-indigo-600'
                              }`}
                            >
                              {isInward ? '+' : '-'}
                              {entry.quantity} {entry.unit || 'Pcs'}
                            </span>
                            <p className="text-[10px] text-slate-400 font-mono">
                              Stock: {prevStock} → <strong className="text-slate-800">{nextStock}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </main>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: QUICK CATALOG PRODUCT PICKER ─────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showCatalogModal && (() => {
        const currentBillItems = activeTab === 'retail' ? retailItems : wholesaleItems;
        const totalAddedQty = currentBillItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
        const totalAddedAmount = Math.round(
          currentBillItems.reduce((acc, i) => acc + (activeTab === 'retail' ? (i.total || 0) : (i.totalAmount || 0)), 0) * 100
        ) / 100;
        const uniqueProductsCount = currentBillItems.length;

        return createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-reveal">
            <div className="bg-white rounded-3xl p-5 max-w-[500px] w-full shadow-2xl space-y-3.5 relative max-h-[88vh] flex flex-col border border-slate-100">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-700">menu_book</span>
                  <div>
                    <h3 className="font-display font-black text-[16px] text-slate-900 leading-tight">
                      Select Product From Store Catalog
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {activeTab === 'retail' ? 'Retail POS Counter Bill' : 'B2B Wholesale Trade Bill'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCatalogModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-all active:scale-95 shrink-0"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Search bar */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search products in your catalog..."
                  className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-900 focus:outline-none focus:border-purple-600 transition-colors"
                />
              </div>

              {/* Product List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 min-h-[180px]">
                {vendorCatalog
                  .filter((p) => p.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                  .map((product) => {
                    const existingInBill = currentBillItems.find((i) => i.productId === product._id);
                    const inBillQty = existingInBill?.quantity || 0;

                    return (
                      <div
                        key={product._id}
                        className={`py-2.5 px-1.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                          inBillQty > 0 ? 'bg-purple-50/40' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center p-1 shrink-0 shadow-2xs">
                            {product.image ? (
                              <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                            ) : (
                              <span className="material-symbols-outlined text-purple-600 text-[18px]">inventory_2</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[13px] text-slate-900 truncate">{product.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              ₹{activeTab === 'retail' ? (product.price || product.mrp) : (product.wholesalePrice || product.price)} • Stock: {product.stock ?? 'N/A'} • {product.cashbackPercentage || 5}% CB
                            </p>
                          </div>
                        </div>

                        {inBillQty > 0 ? (
                          <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-xl p-1 shrink-0 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => {
                                if (activeTab === 'retail') {
                                  updateRetailQty(product._id, -1);
                                } else {
                                  updateWholesaleQty(product._id, -1);
                                }
                              }}
                              className="w-7 h-7 rounded-lg bg-white text-purple-700 flex items-center justify-center font-bold text-sm shadow-xs hover:bg-purple-100 active:scale-90 cursor-pointer transition-all"
                              title="Decrease quantity"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-mono font-black text-xs text-purple-900">
                              {inBillQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (activeTab === 'retail') {
                                  addRetailItem(product);
                                } else {
                                  addWholesaleItem(product);
                                }
                              }}
                              className="w-7 h-7 rounded-lg bg-purple-700 text-white flex items-center justify-center font-bold text-sm shadow-xs hover:bg-purple-800 active:scale-90 cursor-pointer transition-all"
                              title="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (activeTab === 'retail') {
                                addRetailItem(product);
                              } else {
                                addWholesaleItem(product);
                              }
                              toast.success(`Added ${product.name}`);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-200 cursor-pointer active:scale-95 transition-all flex items-center gap-1 shrink-0 shadow-2xs"
                          >
                            <span className="material-symbols-outlined text-[15px]">add</span>
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Bottom Sticky Summary & Done Button */}
              <div className="pt-3 border-t border-slate-100 space-y-2 shrink-0">
                {currentBillItems.length > 0 ? (
                  <>
                    {/* Added Products Summary Strip */}
                    <div className="bg-purple-50/90 border border-purple-200 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm shadow-purple-600/30">
                          {totalAddedQty}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-[12.5px] text-slate-900 truncate">
                            {uniqueProductsCount} {uniqueProductsCount === 1 ? 'Product' : 'Products'} Added ({totalAddedQty} Total Qty)
                          </p>
                          <p className="text-[11px] font-mono font-bold text-purple-700">
                            Total Bill Value: ₹{totalAddedAmount.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        In Bill
                      </span>
                    </div>

                    {/* Chips Preview of Added Items */}
                    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-h-12 no-scrollbar">
                      {currentBillItems.map((item) => (
                        <span
                          key={item.productId || item.name}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 whitespace-nowrap shrink-0 shadow-2xs"
                        >
                          <span className="truncate max-w-[120px]">{item.name}</span>
                          <span className="text-purple-700 font-mono font-black bg-purple-50 px-1 py-0.2 rounded border border-purple-100">
                            ×{item.quantity}
                          </span>
                        </span>
                      ))}
                    </div>

                    {/* Done Adding Button */}
                    <button
                      type="button"
                      onClick={() => setShowCatalogModal(false)}
                      className="w-full py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[13px] flex items-center justify-center gap-2 shadow-md shadow-purple-700/25 active:scale-98 transition-all cursor-pointer"
                    >
                      <span>Done Adding ({uniqueProductsCount} Products • {totalAddedQty} Qty • ₹{totalAddedAmount.toLocaleString('en-IN')})</span>
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11.5px] text-center text-slate-400 font-medium">
                      No products added yet. Tap &apos;+ Add&apos; to include in bill.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCatalogModal(false)}
                      className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer active:scale-98 transition-all"
                    >
                      Done Adding
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: ADD CUSTOM ITEM (NON-CATALOG PRODUCT) ────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showCustomItemModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-reveal">
          <div className="bg-white rounded-3xl p-5 max-w-[380px] w-full shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-700">add_circle</span>
                <h3 className="font-display font-black text-[16px] text-slate-900">
                  Add Custom Item to Bill
                </h3>
              </div>
              <button
                onClick={() => setShowCustomItemModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-3 text-left">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Item / Product Name *
                </label>
                <input
                  type="text"
                  value={customItem.name}
                  onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                  placeholder="e.g. Sugar 1kg, Loose Tea, Rice 5kg..."
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    value={customItem.price}
                    onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                    placeholder="100"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={customItem.quantity}
                    onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })}
                    placeholder="1"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Cashback Rate (%)
                </label>
                <input
                  type="number"
                  value={customItem.cashbackPercentage}
                  onChange={(e) => setCustomItem({ ...customItem, cashbackPercentage: e.target.value })}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>

            <button
              onClick={handleAddCustomItem}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-800 text-white font-bold text-[13px] shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Add to Bill
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: CAMERA BARCODE SCANNER ────────────────────────── */}
      <ProductBarcodeScannerModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        title={cameraScanMode === 'customer' ? 'Scan Customer App QR' : 'Scan Product Barcode'}
        subtitle={
          cameraScanMode === 'customer'
            ? 'Align the customer’s Zeebac App QR inside the viewfinder'
            : 'Hold product barcode inside the viewfinder to add'
        }
        onScan={(decodedText) => {
          if (cameraScanMode === 'customer') {
            setCustomerQuery(decodedText);
            handleLookupCustomer(decodedText);
          } else {
            if (activeTab === 'retail') {
              handleRetailProductLookup(decodedText);
            } else {
              handleWholesaleProductLookup(decodedText);
            }
          }
        }}
      />

      {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── MODAL: SELECT PAYMENT METHOD & CONFIRM BILL ──────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showPaymentModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={() => setShowPaymentModal(false)} />

            {/* Modal Card with Separated Sticky Header & Footer for Guaranteed Scrolling */}
            <div className="relative z-10 bg-white rounded-t-3xl sm:rounded-3xl max-w-[480px] w-full shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] border border-slate-100 overflow-hidden">
              {/* 1. Modal Header (Fixed at top) */}
              <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-100 bg-white shrink-0">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-purple-700">payments</span>
                    <h3 className="font-display font-black text-[17px] text-slate-900">
                      Select Payment Method
                    </h3>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Amount to Collect:{' '}
                    <span className="font-mono font-black text-purple-700 text-[14px]">
                      ₹{retailSubtotal.toLocaleString('en-IN')}
                    </span>{' '}
                    • {retailItems.length} Products ({retailTotalUnits} Units)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* 2. Modal Body (Scrollable with Smooth Touch Scrolling) */}
              <div
                className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 text-left"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {/* Customer Information (Compact Confirmation - Avoids duplicate input if already verified) */}
                {verifiedCustomer ? (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-left animate-reveal">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {verifiedCustomer.name ? verifiedCustomer.name.charAt(0).toUpperCase() : 'C'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-[13px] text-slate-900 truncate">
                            {verifiedCustomer.name}
                          </p>
                          <span className="material-symbols-outlined text-[15px] text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                            verified
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-mono truncate">
                          ID: <strong className="text-purple-700">{verifiedCustomer.zeebacId}</strong> • {verifiedCustomer.phone}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedCustomer(null);
                        setCustomerQuery('');
                      }}
                      className="text-[11px] text-slate-400 hover:text-red-500 font-semibold cursor-pointer shrink-0 ml-2"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        Customer Cashback Wallet
                      </span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        Optional for Cashback
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customerQuery}
                        onChange={(e) => {
                          setCustomerQuery(e.target.value);
                          setCustomerError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleLookupCustomer()}
                        placeholder="Customer Mobile or Zeebac ID..."
                        className="flex-1 h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12.5px] font-mono font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleLookupCustomer()}
                        disabled={isSearchingCustomer || !customerQuery.trim()}
                        className="h-10 px-3 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSearchingCustomer ? '...' : 'Verify'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCameraScanMode('customer');
                          setShowCameraScanner(true);
                        }}
                        className="h-10 px-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl flex items-center justify-center cursor-pointer active:scale-95"
                        title="Scan Customer QR"
                      >
                        <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                      </button>
                    </div>
                    {customerError && (
                      <p className="text-[11px] text-amber-700 font-medium">{customerError}</p>
                    )}
                  </div>
                )}

                {/* Choose Payment Option */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Choose Payment Option
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Cash', label: 'Cash', icon: 'payments', desc: 'Cash Received' },
                      { id: 'UPI', label: 'UPI / QR', icon: 'qr_code_2', desc: 'Scan & Pay' },
                      { id: 'Card', label: 'Card Swipe', icon: 'credit_card', desc: 'POS Swipe' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRetailPaymentMethod(m.id)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          retailPaymentMethod === m.id
                            ? 'border-purple-600 bg-purple-50 text-purple-900 font-bold shadow-xs ring-2 ring-purple-600/20'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[24px]">{m.icon}</span>
                        <span className="text-[12px] font-bold">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash Tender Calculator */}
                {retailPaymentMethod === 'Cash' && (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3.5 space-y-3 animate-reveal">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-bold text-emerald-900">
                        💵 Cash Tender Calculator
                      </span>
                      <span className="text-[11px] font-mono font-bold text-emerald-700">
                        Bill: ₹{retailSubtotal}
                      </span>
                    </div>

                    {/* Quick denomination pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10.5px] font-bold text-slate-500 mr-1">Tender:</span>
                      {[
                        retailSubtotal,
                        ...[100, 200, 500, 1000, 2000].filter((val) => val > retailSubtotal).slice(0, 3),
                      ].map((val, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setReceivedCash(String(val))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all ${
                            Number(receivedCash) === val
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-100/50'
                          }`}
                        >
                          ₹{val}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                          Received Amount (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={receivedCash}
                          onChange={(e) => setReceivedCash(e.target.value)}
                          placeholder="Amount received..."
                          className="w-full h-10 px-3 bg-white border border-emerald-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600 text-[14px]"
                        />
                      </div>

                      <div className="flex-1 text-right">
                        <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                          Change to Return
                        </label>
                        <div className="h-10 px-3 bg-white border border-slate-200 rounded-xl flex items-center justify-end font-mono font-black text-[15px]">
                          {Number(receivedCash) >= retailSubtotal ? (
                            <span className="text-emerald-700">
                              ₹{Math.max(0, Math.round((Number(receivedCash) - retailSubtotal) * 100) / 100)}
                            </span>
                          ) : (
                            <span className="text-amber-600 text-[12px]">
                              Due: ₹{Math.round((retailSubtotal - (Number(receivedCash) || 0)) * 100) / 100}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* UPI QR Payment Mode */}
                {retailPaymentMethod === 'UPI' && (
                  <div className="text-center bg-purple-50/60 border border-purple-200 rounded-2xl p-4 space-y-2.5 animate-reveal">
                    <div className="flex items-center justify-between text-left">
                      <div>
                        <p className="font-bold text-[12.5px] text-purple-950">Scan &amp; Pay via UPI</p>
                        <p className="text-[11px] text-purple-700 font-mono">
                          Payable: <strong className="text-[13px]">₹{retailSubtotal}</strong>
                        </p>
                      </div>
                      <span className="text-[10.5px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
                        GPay / PhonePe / Paytm
                      </span>
                    </div>

                    {retailUpiQr ? (
                      <div className="w-44 h-44 mx-auto p-2 bg-white border-2 border-purple-200 rounded-2xl shadow-sm flex items-center justify-center">
                        <img src={retailUpiQr} alt="UPI Payment QR" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-44 h-44 mx-auto bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400">
                        <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-600 rounded-full animate-spin" />
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 font-medium">
                      Ask customer to scan with any UPI App and complete payment of ₹{retailSubtotal}.
                    </p>
                  </div>
                )}

                {/* Card Swipe Mode */}
                {retailPaymentMethod === 'Card' && (
                  <div className="text-left bg-indigo-50/60 border border-indigo-200 rounded-2xl p-4 space-y-2 animate-reveal">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-[13px]">
                      <span className="material-symbols-outlined text-[20px]">credit_card</span>
                      <span>Card Swipe / POS Terminal</span>
                    </div>
                    <p className="text-[12px] text-slate-600 leading-relaxed">
                      Swipe, insert, or tap the customer’s Debit / Credit Card on your merchant card machine for{' '}
                      <strong className="text-indigo-950 font-mono">₹{retailSubtotal}</strong>. Once payment approval receipt is printed on your card machine, click confirm below.
                    </p>
                  </div>
                )}

                {/* Instant Cashback Point Preview Banner */}
                <div className="bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-2xl p-3 flex items-center justify-between text-left shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-300 text-[20px]">stars</span>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-purple-200 font-bold">Customer Cashback</p>
                      <p className="text-[12px] font-bold text-white">
                        +₹{retailTotalCashback} will be credited to customer wallet
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-black text-amber-300 text-[16px]">
                    +₹{retailTotalCashback}
                  </span>
                </div>
              </div>

              {/* 3. Modal Sticky Bottom Actions (ALWAYS VISIBLE & UNBLOCKED) */}
              <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-white/98 backdrop-blur-md shrink-0 flex items-center gap-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="w-1/3 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] active:scale-95 transition-all cursor-pointer"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleCompleteRetailSale}
                  disabled={isLoggingRetailBill}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-800 hover:to-indigo-900 text-white font-bold text-[13.5px] shadow-lg shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoggingRetailBill ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      <span>Confirm &amp; Generate Bill</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: THERMAL POS RECEIPT (PRINTABLE & SHAREABLE) ───── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {(completedRetailBill || receiptToView) &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-reveal">
            <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-[420px] w-full shadow-2xl text-left space-y-4 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => {
                  setCompletedRetailBill(null);
                  setReceiptToView(null);
                }}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>

              {/* Receipt Body (Targeted by @media print) */}
              <div
                id="pos-printable-receipt"
                className="p-4 bg-slate-50/60 rounded-2xl border border-slate-200/80 font-mono text-[12px] space-y-3"
              >
                {/* Store Header */}
                <div className="text-center pb-2 border-b border-dashed border-slate-300 space-y-0.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-purple-700 text-[18px]">receipt_long</span>
                    <h3 className="font-bold text-[14px] text-slate-900 uppercase">
                      {(completedRetailBill || receiptToView).vendorStoreName}
                    </h3>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Zeebac Store ID: {(completedRetailBill || receiptToView).vendorZeebacId}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {(completedRetailBill || receiptToView).vendorAddress}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Ph: {(completedRetailBill || receiptToView).vendorPhone || 'N/A'}
                  </p>
                </div>

                {/* Bill Meta */}
                <div className="text-[11px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
                  <div className="flex justify-between">
                    <span>Tax Invoice / Bill No:</span>
                    <span className="font-bold">{(completedRetailBill || receiptToView).billNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date &amp; Time:</span>
                    <span>{(completedRetailBill || receiptToView).date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span className="font-bold">{(completedRetailBill || receiptToView).customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer ID:</span>
                    <span>
                      {(completedRetailBill || receiptToView).customerZeebacId || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payment Mode:</span>
                    <span className="font-bold">{(completedRetailBill || receiptToView).paymentMethod}</span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-1 border-b border-dashed border-slate-300 pb-2">
                  <div className="grid grid-cols-12 font-bold text-[10.5px] text-slate-500 pb-1">
                    <span className="col-span-6">Item</span>
                    <span className="col-span-2 text-center">Qty</span>
                    <span className="col-span-2 text-right">Price</span>
                    <span className="col-span-2 text-right">Total</span>
                  </div>
                  {((completedRetailBill || receiptToView).items || []).map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 text-[11px] text-slate-800">
                      <span className="col-span-6 truncate font-medium">{it.name}</span>
                      <span className="col-span-2 text-center">{it.quantity}</span>
                      <span className="col-span-2 text-right">₹{it.price}</span>
                      <span className="col-span-2 text-right font-bold">
                        ₹{it.total || it.price * it.quantity}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total & Cashback summary */}
                <div className="space-y-1 pt-1 text-[11px]">
                  <div className="flex justify-between font-bold text-[13px] text-slate-900 pt-1 border-t border-slate-200">
                    <span>Grand Total:</span>
                    <span>₹{(completedRetailBill || receiptToView).amount}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[10.5px]">
                    <span>GST (Statutory Included):</span>
                    <span>₹0 (Inc.)</span>
                  </div>
                </div>

                {/* Instant Zeebac Reward Box */}
                <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-center space-y-0.5 text-[11px]">
                  <p className="text-[10px] font-bold uppercase text-purple-700">
                    🎁 Zeebac Instant Reward
                  </p>
                  <p className="font-black text-purple-900 text-[14px]">
                    +₹{(completedRetailBill || receiptToView).cashbackCredited} Cashback
                  </p>
                  <p className="text-[9.5px] text-purple-700">
                    Points Credited Instantly to Customer Wallet!
                  </p>
                </div>

                <div className="text-center pt-1 text-[10px] text-slate-400 leading-tight">
                  <p>Thank you for shopping with us!</p>
                  <p>Powered by Zeebac Retail POS Network</p>
                </div>
              </div>

              {/* Receipt Modal Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => window.print()}
                  className="py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">print</span>
                  <span>Print Thermal Receipt</span>
                </button>

                <button
                  onClick={() => {
                    const bill = completedRetailBill || receiptToView;
                    const text = `🧾 *Zeebac Bill Receipt*\nStore: ${bill.vendorStoreName}\nBill No: ${bill.billNumber}\nCustomer: ${bill.customerName} (${bill.customerZeebacId})\nTotal: ₹${bill.amount}\n🎁 *Cashback Credited:* ₹${bill.cashbackCredited} Points deposited in your Zeebac Wallet!\nThank you!`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">share</span>
                  <span>WhatsApp Receipt</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
{/* ─── MODAL: WHOLESALE B2B PAYMENT & STOCK TRANSFER ────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {createdInvoice && !transferSuccessData &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-reveal">
          <div className="bg-white rounded-3xl p-6 max-w-[380px] w-full shadow-2xl text-center space-y-4 relative">
            <button
              onClick={() => setCreatedInvoice(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <div>
              <span className="text-[10.5px] uppercase font-bold text-purple-700 px-3 py-1 rounded-full bg-purple-50">
                Invoice #{createdInvoice.invoiceNumber}
              </span>
              <h3 className="font-display font-black text-[18px] text-slate-900 mt-2">
                Verify Payment & Transfer Stock
              </h3>
              <p className="text-[12px] text-slate-500">
                Total: <strong>₹{createdInvoice.totalAmount}</strong> to{' '}
                <strong>{createdInvoice.buyerDetails?.storeName}</strong>
              </p>
            </div>

            {wholesalePaymentMethod === 'UPI_INTENT' ? (
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
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[14px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <div className="bg-purple-50 rounded-2xl p-4 text-left space-y-1 text-[12px]">
                <p className="font-bold text-purple-900">Cash Payment Confirmation</p>
                <p className="text-purple-800">
                  You are confirming receipt of ₹{createdInvoice.totalAmount} cash from retailer. Stock will automatically transfer upon confirmation.
                </p>
              </div>
            )}

            <button
              onClick={handleExecuteTransfer}
              disabled={isTransferring}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-800 text-white font-bold text-[13.5px] shadow-lg shadow-purple-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
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
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: WHOLESALE TRANSFER SUCCESS CELEBRATION ────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {transferSuccessData &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-reveal">
          <div className="bg-white rounded-3xl p-6 max-w-[400px] w-full shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>

            <div>
              <h3 className="font-display font-black text-[20px] text-slate-900">
                Stock Transferred Successfully!
              </h3>
              <p className="text-[12px] text-slate-500 mt-1">
                All products and stock have been automatically imported into the purchasing retailer’s inventory!
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
                    Qty: <strong>{audit.quantity}</strong> | Retailer Stock: {audit.buyerStockBefore} → <strong>{audit.buyerStockAfter}</strong>
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setTransferSuccessData(null);
                setCreatedInvoice(null);
              }}
              className="w-full py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[13px] shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Done & Return to Billing
            </button>
          </div>
        </div>,
        document.body
      )}
      {/* ══════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: STOCK PUTAWAY (INWARD RECEIVING) ───────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showPutawayModal && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-left">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-800 text-white flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">add_box</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-[15px]">Record Stock Putaway</h3>
                  <p className="text-[11px] text-slate-400">Inward stock receiving into shop shelves</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPutawayModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitPutaway} className="space-y-3.5">
              {/* Product Select */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Select Product *
                </label>
                <select
                  value={putawayForm.productId}
                  onChange={(e) => handleSelectPutawayProduct(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                >
                  <option value="">-- Choose Product --</option>
                  {vendorCatalog.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} (Current Stock: {p.stock ?? 0} {p.unit || 'Pcs'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Inward Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Inward Quantity (+) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={putawayForm.quantity}
                    onChange={(e) => setPutawayForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    placeholder="10"
                    className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[13.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Rack / Shelf Location
                  </label>
                  <input
                    type="text"
                    value={putawayForm.locationRack}
                    onChange={(e) => setPutawayForm((prev) => ({ ...prev, locationRack: e.target.value }))}
                    placeholder="e.g. Rack A-1"
                    className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Batch & Expiry */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/50 rounded-2xl border border-purple-100">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Batch / Lot No.
                  </label>
                  <input
                    type="text"
                    value={putawayForm.batchNumber}
                    onChange={(e) => setPutawayForm((prev) => ({ ...prev, batchNumber: e.target.value }))}
                    placeholder="e.g. BATCH-001"
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={putawayForm.expiryDate}
                    onChange={(e) => setPutawayForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12px] text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Source Supplier & Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Supplier / Source
                </label>
                <input
                  type="text"
                  value={putawayForm.sourceSupplier}
                  onChange={(e) => setPutawayForm((prev) => ({ ...prev, sourceSupplier: e.target.value }))}
                  placeholder="e.g. Factory Direct / Wholesaler"
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Notes / Invoice Ref
                </label>
                <input
                  type="text"
                  value={putawayForm.notes}
                  onChange={(e) => setPutawayForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional receiving notes..."
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPutawayModal(false)}
                  className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPutaway}
                  className="w-2/3 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-[13px] shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  {isSubmittingPutaway ? (
                    <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  )}
                  <span>Confirm Putaway</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ─── MODAL: PHYSICAL STOCK AUDIT & RECONCILIATION ─────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showAuditModal && (() => {
        const selectedProd = vendorCatalog.find((p) => p._id === auditForm.productId);
        const currentRecorded = Number(selectedProd?.stock) || 0;
        const physicalCount = Number(auditForm.countedStock) || 0;
        const variance = physicalCount - currentRecorded;

        return createPortal(
          <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-left">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-100 space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-[22px]">fact_check</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-[15px]">Physical Stock Audit</h3>
                    <p className="text-[11px] text-slate-400">Reconcile counted stock with system inventory</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuditModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleSubmitAudit} className="space-y-3.5">
                {/* Product Select */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Product to Audit *
                  </label>
                  <select
                    value={auditForm.productId}
                    onChange={(e) => handleSelectAuditProduct(e.target.value)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                  >
                    <option value="">-- Choose Product --</option>
                    {vendorCatalog.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} (System Stock: {p.stock ?? 0} {p.unit || 'Pcs'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stock Comparison Box */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Stock</p>
                    <p className="font-display font-black text-[20px] text-slate-900 mt-0.5">
                      {currentRecorded} <span className="text-xs font-normal text-slate-500">{selectedProd?.unit || 'Pcs'}</span>
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                      Physical Count *
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={auditForm.countedStock}
                      onChange={(e) => setAuditForm((prev) => ({ ...prev, countedStock: e.target.value }))}
                      className="w-full h-9 px-2 bg-white border border-slate-300 rounded-lg text-[16px] font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600 mt-0.5"
                      required
                    />
                  </div>
                </div>

                {/* Variance Display */}
                <div
                  className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-bold ${
                    variance === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : variance < 0
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">
                      {variance === 0 ? 'verified' : variance < 0 ? 'remove_circle' : 'add_circle'}
                    </span>
                    <span>
                      {variance === 0 ? 'Exact Match (No Discrepancy)' : variance < 0 ? 'Stock Shortage' : 'Stock Surplus'}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-black">
                    {variance >= 0 ? `+${variance}` : variance} {selectedProd?.unit || 'Pcs'}
                  </span>
                </div>

                {/* Audit Reason */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Reason for Adjustment *
                  </label>
                  <select
                    value={auditForm.auditReason}
                    onChange={(e) => setAuditForm((prev) => ({ ...prev, auditReason: e.target.value }))}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-[12.5px] font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                  >
                    <option value="Routine Physical Stock Audit">Routine Physical Stock Audit</option>
                    <option value="Damaged / Broken Goods">Damaged / Broken Goods</option>
                    <option value="Expired Stock Discarded">Expired Stock Discarded</option>
                    <option value="Shrinkage / Unaccounted Loss">Shrinkage / Unaccounted Loss</option>
                    <option value="Supplier Mismatch Correction">Supplier Mismatch Correction</option>
                    <option value="Manual Reconciliation">Manual Reconciliation</option>
                  </select>
                </div>

                {/* Audit Notes */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Audit Notes
                  </label>
                  <input
                    type="text"
                    value={auditForm.notes}
                    onChange={(e) => setAuditForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="e.g. Audit conducted by store manager"
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAuditModal(false)}
                    className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAudit}
                    className="w-2/3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[13px] shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    {isSubmittingAudit ? (
                      <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">save</span>
                    )}
                    <span>Save Audit Adjustment</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        );
      })()}

    </div>
  );
}
