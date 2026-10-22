import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import useUIStore from '../../../store/useUIStore';
import { safeNavigateBack } from '../../../utils/navigationUtils';

export default function MerchantPaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Global auth state
  const currentUser = useAuthStore((s) => s.currentUser);
  const walletBalance = useAuthStore((s) => s.walletBalance);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  // Flow steps: 'search' | 'pay' | 'receipt'
  const [step, setStep] = useState('search');

  // Search state
  const [searchQuery, setSearchQuery] = useState(location.state?.recipientZeebacId || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [foundRecipient, setFoundRecipient] = useState(null);

  // Payment state
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Wallet'); // 'Wallet' | 'Razorpay'
  const [isProcessing, setIsProcessing] = useState(false);
  const isSubmittingRef = useRef(false);

  // PIN modal state (for Wallet payments)
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Receipt state
  const [receiptData, setReceiptData] = useState(null);

  // Refresh vendor wallet balance on mount
  useEffect(() => {
    let mounted = true;
    VendorAPI.getWallet()
      .then((res) => {
        if (mounted && res?.success && res.data?.wallet) {
          updateBalance(res.data.wallet.balance ?? 0);
        }
      })
      .catch((err) => console.warn('Could not refresh wallet balance:', err));
    return () => { mounted = false; };
  }, [updateBalance]);

  // If navigated with initial recipient, trigger search
  useEffect(() => {
    if (location.state?.recipientZeebacId && !foundRecipient) {
      handleSearch(location.state.recipientZeebacId);
    }
  }, [location.state]);

  // Load Razorpay SDK
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Perform search
  const handleSearch = async (overrideQuery) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q) {
      setSearchError('Please enter a 10-digit mobile number or ZeeBac Merchant ID.');
      return;
    }
    setSearchError('');
    setIsSearching(true);
    setFoundRecipient(null);

    try {
      const res = await VendorAPI.searchMerchant(q);
      if (res.success && res.data) {
        setFoundRecipient(res.data);
      } else {
        setSearchError(res.message || 'Merchant not found or ineligible.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Merchant search failed.';
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  // Calculations
  const purchaseAmount = parseFloat(amount) || 0;
  const cashbackRate = foundRecipient?.cashbackRate || 0;
  const cashbackAmount = Math.round(purchaseAmount * (cashbackRate / 100) * 100) / 100;
  const platformFee = 0; // Configured B2B fee
  const totalPayable = purchaseAmount + platformFee;
  const isWalletInsufficient = paymentMethod === 'Wallet' && totalPayable > walletBalance;
  const isAmountValid = purchaseAmount >= 1 && purchaseAmount <= 500000;

  // Initiate payment click
  const handleInitiatePayment = () => {
    if (!isAmountValid) {
      showSnackbar('Please enter a valid amount between ₹1 and ₹5,00,000', 'error');
      return;
    }

    if (paymentMethod === 'Wallet') {
      if (isWalletInsufficient) {
        showSnackbar(`Insufficient wallet balance. You need ₹${(totalPayable - walletBalance).toFixed(2)} more.`, 'error');
        return;
      }
      // Open PIN modal
      setPin('');
      setPinError('');
      setShowPinModal(true);
    } else {
      // Razorpay
      handleRazorpayPayment();
    }
  };

  // Execute Wallet Payment
  const executeWalletPayment = async () => {
    if (isProcessing || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsProcessing(true);
    setPinError('');

    try {
      const res = await VendorAPI.processMerchantPayment({
        recipientZeebacId: foundRecipient.zeebacId,
        amount: purchaseAmount,
        pin: pin.trim()
      });

      if (res.success) {
        setShowPinModal(false);
        if (res.data?.newPayerBalance !== undefined) {
          updateBalance(res.data.newPayerBalance);
        }
        setReceiptData({
          orderId: res.data.orderId,
          transactionId: res.data.transactionId,
          recipient: res.data.recipient,
          amountPaid: res.data.amountPaid,
          cashbackEarned: res.data.cashbackEarned,
          newBalance: res.data.newPayerBalance,
          paymentMethod: 'ZeeBac Wallet',
          timestamp: new Date().toISOString()
        });
        setStep('receipt');
        showSnackbar('Merchant Payment Successful! Cashback credited.', 'success');
      } else {
        setPinError(res.message || 'Payment failed.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Payment failed.';
      setPinError(msg);
      showSnackbar(msg, 'error');
    } finally {
      setIsProcessing(false);
      isSubmittingRef.current = false;
    }
  };

  // Execute Razorpay Payment
  const handleRazorpayPayment = async () => {
    if (isProcessing || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsProcessing(true);

    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        throw new Error('Razorpay payment gateway failed to load. Please check your internet connection.');
      }

      const orderRes = await VendorAPI.createMerchantPaymentOrder({
        recipientZeebacId: foundRecipient.zeebacId,
        amount: purchaseAmount
      });

      if (!orderRes.success) {
        throw new Error(orderRes.message || 'Could not initiate payment order.');
      }

      const orderData = orderRes.data;
      const rzpKey = orderData.key || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!rzpKey) {
        throw new Error('Payment gateway configuration is missing.');
      }

      const options = {
        key: rzpKey,
        amount: orderData.amount,
        currency: 'INR',
        name: foundRecipient.storeName || 'ZeeBac Merchant',
        description: `B2B Merchant Payment to ${foundRecipient.storeName}`,
        order_id: orderData.id,
        handler: async (response) => {
          try {
            const verifyRes = await VendorAPI.verifyMerchantPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              recipientZeebacId: foundRecipient.zeebacId,
              amount: purchaseAmount
            });

            if (verifyRes.success) {
              setReceiptData({
                orderId: verifyRes.data.orderId,
                transactionId: verifyRes.data.transactionId,
                recipient: verifyRes.data.recipient,
                amountPaid: verifyRes.data.amountPaid,
                cashbackEarned: verifyRes.data.cashbackEarned,
                newBalance: verifyRes.data.newPayerBalance,
                paymentMethod: 'Online / Gateway',
                timestamp: new Date().toISOString()
              });
              setStep('receipt');
              showSnackbar('Payment verified successfully! Cashback credited to your wallet.', 'success');
            } else {
              showSnackbar(verifyRes.message || 'Payment verification failed.', 'error');
            }
          } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Payment verification failed.';
            showSnackbar(msg, 'error');
          } finally {
            setIsProcessing(false);
            isSubmittingRef.current = false;
          }
        },
        prefill: {
          name: currentUser?.storeName || currentUser?.name || 'Merchant',
          contact: currentUser?.phone ? String(currentUser.phone).replace(/\D/g, '').slice(-10) : '',
          email: currentUser?.email || ''
        },
        theme: { color: '#6000da' }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        showSnackbar(`Payment cancelled or failed: ${resp.error?.description || 'Gateway error'}`, 'error');
        setIsProcessing(false);
        isSubmittingRef.current = false;
      });
      rzp.open();
    } catch (err) {
      showSnackbar(err.message || 'Could not launch payment gateway.', 'error');
      setIsProcessing(false);
      isSubmittingRef.current = false;
    }
  };

  const getBusinessTypeColor = (type) => {
    switch (type) {
      case 'Manufacturer':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Wholesaler':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Retailer':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="animate-reveal text-left max-w-3xl mx-auto pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (step === 'pay') {
                setStep('search');
              } else if (step === 'receipt') {
                navigate('/vendor');
              } else {
                safeNavigateBack(navigate, '/vendor');
              }
            }}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
            aria-label="Back"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <div>
            <h1 className="font-display text-title-md text-primary font-bold leading-tight">
              {step === 'receipt' ? 'Payment Receipt' : 'Merchant Payment (B2B)'}
            </h1>
            <p className="text-[11px] text-on-surface-variant">
              {step === 'receipt'
                ? 'Transaction confirmed'
                : 'Purchase from registered Manufacturers, Wholesalers & Retailers'}
            </p>
          </div>
        </div>

        {/* Live Wallet Balance Pill */}
        <div className="bg-primary/5 border border-primary/15 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary text-[16px]">account_balance_wallet</span>
          <div className="text-right">
            <span className="text-[10px] text-on-surface-variant uppercase font-bold block leading-none">Wallet</span>
            <span className="text-[12px] font-black text-primary leading-none">₹{Number(walletBalance || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </header>

      {/* ================= STEP 1: SEARCH MERCHANT ================= */}
      {step === 'search' && (
        <div className="space-y-5">
          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-800 text-white rounded-3xl p-5 shadow-sm relative overflow-hidden">
            <div className="relative z-10 space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                Verified B2B Settlement
              </span>
              <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight">
                Pay Other Merchants & Earn Instant Cashback
              </h2>
              <p className="text-white/85 text-[12px] sm:text-[13px] max-w-xl">
                Source inventory, wholesale supplies, or stock from ZeeBac verified trade partners with zero fees and direct wallet cashback.
              </p>
            </div>
          </div>

          {/* Search Card */}
          <div className="bg-white rounded-3xl border border-outline-variant/15 p-5 shadow-sm space-y-4">
            <div>
              <label htmlFor="merchant-search-input" className="block text-[13px] font-black text-on-surface uppercase tracking-wider mb-1.5">
                Search Recipient Merchant
              </label>
              <p className="text-[12px] text-on-surface-variant mb-3">
                Enter the recipient merchant's registered 10-digit mobile number or their ZeeBac Merchant ID (e.g. <span className="font-mono font-bold text-primary">ZEEBAC-MUM-1024</span>).
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                    storefront
                  </span>
                  <input
                    id="merchant-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (searchError) setSearchError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearch();
                    }}
                    placeholder="Mobile number or ZeeBac ID"
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-low border border-outline-variant/20 focus:border-primary focus:bg-white rounded-2xl outline-none transition-all text-[14px] font-medium"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFoundRecipient(null);
                        setSearchError('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSearch()}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-5 py-3 bg-primary hover:bg-primary-fixed-variant text-white font-bold text-[14px] rounded-2xl shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {isSearching ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">search</span>
                      <span>Find</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {searchError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-[13px] flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[20px] shrink-0 text-red-500 mt-0.5">error</span>
                <div>
                  <p className="font-bold">{searchError}</p>
                  <p className="text-[11px] text-red-600/90 mt-0.5">
                    Make sure the merchant is registered and approved on ZeeBac. Self-payments are not allowed.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Found Merchant Card */}
          {foundRecipient && (
            <div className="bg-white rounded-3xl border-2 border-primary/20 p-5 shadow-md space-y-4 animate-reveal">
              <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Verified ZeeBac Merchant
                </span>
                <span className="font-mono text-[11px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                  {foundRecipient.zeebacId}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-600/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xl shrink-0">
                    {foundRecipient.storeName?.charAt(0)?.toUpperCase() || 'M'}
                  </div>
                  <div>
                    <h3 className="text-[17px] font-black text-on-surface">{foundRecipient.storeName}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {foundRecipient.businessType && (
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getBusinessTypeColor(foundRecipient.businessType)}`}>
                          {foundRecipient.businessType}
                        </span>
                      )}
                      <span className="text-[12px] text-on-surface-variant font-medium">
                        {foundRecipient.category}
                      </span>
                      {foundRecipient.city && (
                        <span className="text-[12px] text-on-surface-variant font-medium flex items-center gap-0.5">
                          • <span className="material-symbols-outlined text-[13px]">location_on</span>
                          {foundRecipient.city}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-on-surface-variant/80 mt-1">
                      Registered Phone: {foundRecipient.phone}
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center sm:text-right shrink-0">
                  <p className="text-[10px] uppercase font-bold text-emerald-800">Cashback Reward</p>
                  <p className="text-xl font-black text-emerald-700">{foundRecipient.cashbackRate}%</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Instant to your wallet</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('pay')}
                className="w-full py-3.5 bg-primary hover:bg-primary-fixed-variant text-white font-bold text-[15px] rounded-2xl shadow-md shadow-primary/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Continue to Pay</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          )}

          {/* Informational Guidance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
            <div className="bg-white rounded-2xl border border-outline-variant/10 p-4 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-2">
                <span className="material-symbols-outlined text-[20px]">factory</span>
              </div>
              <h4 className="font-bold text-[13px] text-on-surface">Manufacturers</h4>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Pay bulk production costs and factory direct invoices with instant digital records.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant/10 p-4 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-2">
                <span className="material-symbols-outlined text-[20px]">warehouse</span>
              </div>
              <h4 className="font-bold text-[13px] text-on-surface">Wholesalers</h4>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Settle wholesale inventory orders and stock replenishment seamlessly.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant/10 p-4 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2">
                <span className="material-symbols-outlined text-[20px]">store</span>
              </div>
              <h4 className="font-bold text-[13px] text-on-surface">Retailers</h4>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Inter-retail stock transfers and local business-to-business settlements.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 2: PAYMENT SCREEN ================= */}
      {step === 'pay' && foundRecipient && (
        <div className="space-y-5 animate-reveal">
          {/* Selected Recipient Card */}
          <div className="bg-white rounded-3xl border border-outline-variant/15 p-4 sm:p-5 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                {foundRecipient.storeName?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-black text-on-surface">{foundRecipient.storeName}</h3>
                  {foundRecipient.businessType && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getBusinessTypeColor(foundRecipient.businessType)}`}>
                      {foundRecipient.businessType}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-on-surface-variant font-mono">
                  {foundRecipient.zeebacId} • {foundRecipient.phone}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep('search')}
              className="text-[12px] font-bold text-primary hover:underline cursor-pointer"
            >
              Change
            </button>
          </div>

          {/* Amount Entry */}
          <div className="bg-white rounded-3xl border border-outline-variant/15 p-5 shadow-sm space-y-4">
            <div className="text-center space-y-1">
              <label htmlFor="purchase-amount-input" className="block text-[12px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                Enter Purchase / Invoice Amount
              </label>
              <div className="relative inline-flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-black text-on-surface mr-1">₹</span>
                <input
                  id="purchase-amount-input"
                  type="number"
                  min="1"
                  max="500000"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-48 sm:w-64 text-3xl sm:text-4xl font-black text-center text-on-surface bg-transparent border-b-2 border-primary/30 focus:border-primary outline-none pb-1 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Quick Amount Chips */}
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {[500, 1000, 5000, 10000, 25000].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmount(String((parseFloat(amount) || 0) + chip))}
                  className="px-3 py-1.5 bg-surface-container-low hover:bg-primary/10 hover:text-primary rounded-xl text-[12px] font-bold text-on-surface-variant transition-colors cursor-pointer border border-outline-variant/10"
                >
                  +₹{chip.toLocaleString('en-IN')}
                </button>
              ))}
              {amount && (
                <button
                  type="button"
                  onClick={() => setAmount('')}
                  className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-xl text-[11px] font-bold cursor-pointer hover:bg-red-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="bg-white rounded-3xl border border-outline-variant/15 p-5 shadow-sm space-y-3">
            <h4 className="text-[13px] font-black text-on-surface uppercase tracking-wider">
              Select Payment Method
            </h4>

            {/* Option 1: ZeeBac Wallet */}
            <label
              className={`p-4 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                paymentMethod === 'Wallet'
                  ? 'border-primary bg-primary/5 shadow-xs'
                  : 'border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="Wallet"
                  checked={paymentMethod === 'Wallet'}
                  onChange={() => setPaymentMethod('Wallet')}
                  className="accent-primary w-4 h-4"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[14px] text-on-surface">ZeeBac Vendor Wallet</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      Instant
                    </span>
                  </div>
                  <p className="text-[12px] text-on-surface-variant mt-0.5">
                    Available Balance:{' '}
                    <span className="font-bold font-mono text-on-surface">
                      ₹{Number(walletBalance || 0).toLocaleString('en-IN')}
                    </span>
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[24px] text-primary">account_balance_wallet</span>
            </label>

            {/* Insufficient balance alert */}
            {paymentMethod === 'Wallet' && isWalletInsufficient && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[12px] text-amber-800 flex items-center justify-between">
                <span className="font-medium">
                  Need ₹{(totalPayable - walletBalance).toFixed(2)} more in wallet.
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/vendor/wallet')}
                  className="font-bold underline text-amber-900 cursor-pointer"
                >
                  Recharge Wallet
                </button>
              </div>
            )}

            {/* Option 2: Razorpay Online */}
            <label
              className={`p-4 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                paymentMethod === 'Razorpay'
                  ? 'border-primary bg-primary/5 shadow-xs'
                  : 'border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="Razorpay"
                  checked={paymentMethod === 'Razorpay'}
                  onChange={() => setPaymentMethod('Razorpay')}
                  className="accent-primary w-4 h-4"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[14px] text-on-surface">UPI / NetBanking / Cards</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                      Online Gateway
                    </span>
                  </div>
                  <p className="text-[12px] text-on-surface-variant mt-0.5">
                    Pay securely via Razorpay (GPay, PhonePe, Paytm, Cards)
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[24px] text-purple-700">credit_card</span>
            </label>
          </div>

          {/* Financial Breakdown & Cashback Summary */}
          {purchaseAmount > 0 && (
            <div className="bg-white rounded-3xl border border-outline-variant/15 p-5 shadow-sm space-y-2.5">
              <h4 className="text-[13px] font-black text-on-surface uppercase tracking-wider pb-1 border-b border-outline-variant/10">
                Payment Summary
              </h4>

              <div className="flex justify-between text-[13px] text-on-surface-variant">
                <span>Purchase Amount</span>
                <span className="font-bold font-mono text-on-surface">₹{purchaseAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-[13px] text-on-surface-variant">
                <span>Platform Convenience Fee</span>
                <span className="font-bold text-emerald-600">FREE (₹0.00)</span>
              </div>

              {cashbackAmount > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600 text-[20px]">redeem</span>
                    <div>
                      <p className="text-[12px] font-extrabold text-emerald-900 leading-tight">
                        Cashback to be Earned ({cashbackRate}%)
                      </p>
                      <p className="text-[10px] text-emerald-700 leading-tight">
                        Will be credited directly to your ZeeBac Wallet
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-black font-mono text-emerald-700">
                    +₹{cashbackAmount.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-[16px] font-black text-on-surface pt-2 border-t border-outline-variant/10">
                <span>Net Payable Amount</span>
                <span className="font-mono text-primary">₹{totalPayable.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Pay Button */}
          <button
            type="button"
            onClick={handleInitiatePayment}
            disabled={!isAmountValid || isProcessing || (paymentMethod === 'Wallet' && isWalletInsufficient)}
            className="w-full py-4 bg-primary hover:bg-primary-fixed-variant text-white font-black text-[16px] rounded-2xl shadow-lg shadow-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing Payment...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">lock</span>
                <span>
                  Pay ₹{isAmountValid ? totalPayable.toLocaleString('en-IN') : '0.00'} Securely
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ================= PIN AUTHORIZATION MODAL ================= */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-reveal text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[30px]">lock</span>
            </div>

            <div>
              <h3 className="font-black text-lg text-on-surface">Authorize Payment</h3>
              <p className="text-[12px] text-on-surface-variant mt-1">
                Enter your 4-digit Security PIN to transfer{' '}
                <span className="font-bold text-on-surface">₹{totalPayable.toFixed(2)}</span> to{' '}
                <span className="font-bold text-on-surface">{foundRecipient?.storeName}</span>
              </p>
            </div>

            <div>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                  if (pinError) setPinError('');
                }}
                placeholder="••••"
                className="w-36 text-center tracking-[1em] text-2xl font-black py-2.5 bg-surface-container-low border-2 border-outline-variant/30 focus:border-primary rounded-2xl outline-none"
                autoFocus
              />
            </div>

            {pinError && (
              <p className="text-[12px] font-bold text-red-600 bg-red-50 py-1.5 px-3 rounded-xl">
                {pinError}
              </p>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPinModal(false);
                  setPin('');
                  setPinError('');
                }}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeWalletPayment}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary-fixed-variant text-white font-bold text-[13px] transition-all shadow-sm shadow-primary/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Confirm Pay</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: TRANSACTION RECEIPT ================= */}
      {step === 'receipt' && receiptData && (
        <div className="space-y-5 animate-reveal">
          <div className="bg-white rounded-3xl border border-outline-variant/15 p-6 shadow-sm text-center relative overflow-hidden space-y-4">
            {/* Success Icon */}
            <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/25">
              <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'wght' 600" }}>
                done
              </span>
            </div>

            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-0.5 rounded-full">
                Payment Completed
              </span>
              <h2 className="text-2xl font-black text-on-surface mt-2">₹{Number(receiptData.amountPaid).toFixed(2)}</h2>
              <p className="text-[13px] text-on-surface-variant mt-0.5">
                Paid to <span className="font-bold text-on-surface">{receiptData.recipient?.storeName}</span>
              </p>
            </div>

            {/* Receipt Summary Table */}
            <div className="bg-surface-container-low/60 rounded-2xl p-4 text-[13px] space-y-2 text-left border border-outline-variant/10">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Recipient Trade Type</span>
                <span className="font-bold text-on-surface">{receiptData.recipient?.businessType || 'Merchant'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Recipient ZeeBac ID</span>
                <span className="font-mono font-bold text-on-surface">{receiptData.recipient?.zeebacId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Payment Method</span>
                <span className="font-bold text-on-surface">{receiptData.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Transaction Ref</span>
                <span className="font-mono font-bold text-on-surface">{receiptData.orderId || receiptData.transactionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Timestamp</span>
                <span className="font-medium text-on-surface">
                  {new Date(receiptData.timestamp).toLocaleString('en-IN')}
                </span>
              </div>

              {receiptData.cashbackEarned > 0 && (
                <div className="pt-2 border-t border-outline-variant/10 flex justify-between items-center text-emerald-700 font-bold">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">redeem</span>
                    Cashback Earned (Credited)
                  </span>
                  <span className="font-mono text-[15px] font-black">+₹{Number(receiptData.cashbackEarned).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[13px] rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Print / Save Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFoundRecipient(null);
                  setSearchQuery('');
                  setAmount('');
                  setReceiptData(null);
                  setStep('search');
                }}
                className="flex-1 py-3 bg-primary hover:bg-primary-fixed-variant text-white font-bold text-[13px] rounded-2xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                <span>Make Another Payment</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/vendor/passbook')}
                className="text-[12px] font-bold text-primary hover:underline cursor-pointer"
              >
                View in Wallet Passbook →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
