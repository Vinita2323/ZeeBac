import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { OrderAPI, UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import useCartStore from '../../../store/useCartStore';
import useLanguageStore from '../../../store/useLanguageStore';
import BottomNavBar from '../components/common/BottomNavBar';
import { playNotificationChime, speakVoice } from '../../../utils/voiceUtils';
import { getSocket } from '../../../services/socket';

// Helper to format address object or string
const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    return [addr.fullAddress || addr.street, addr.landmark, addr.city, addr.state, addr.pincode]
      .filter(Boolean)
      .join(', ');
  }
  return String(addr);
};

const formatCurrency = (val) => {
  const num = Math.round((Number(val) || 0) * 100) / 100;
  return Number.isInteger(num) ? num.toString() : num.toFixed(2);
};

export default function CartScreen() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const currentUser = useAuthStore((state) => state.currentUser);
  const rawWalletBalance = useAuthStore((state) => state.walletBalance) || 0;
  const walletBalance = Math.round((Number(rawWalletBalance) || 0) * 100) / 100; // Zeebac Points balance (1 Point = ₹1)
  const updateBalance = useAuthStore((state) => state.updateBalance);

  // Cart store
  const items = useCartStore((state) => state.items);
  const vendor = useCartStore((state) => state.vendor);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const totalAmount = useCartStore((state) => state.getTotalAmount());
  const totalCashback = useCartStore((state) => state.getTotalCashback());
  const totalItemsCount = useCartStore((state) => state.getTotalItemsCount());
  const fulfillmentType = useCartStore((state) => state.fulfillmentType);
  const setFulfillmentType = useCartStore((state) => state.setFulfillmentType);

  // Vendor & Delivery Settings State (configured by store owner & admin)
  const [storeDeliveryConfig, setStoreDeliveryConfig] = useState({
    deliveryCharge: 30,
    freeDeliveryAbove: 499,
    packagingCharge: 10,
    minOrderAmount: 0,
    isDeliveryAvailable: true,
    platformTaxPercent: 5,
  });

  // Saved Delivery Addresses (Zomato-style step-by-step management)
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [showAddressPickerModal, setShowAddressPickerModal] = useState(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);

  // Add Address Form State
  const [newAddressForm, setNewAddressForm] = useState({
    houseNo: '',
    street: '',
    landmark: '',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '',
    receiverName: currentUser?.name || '',
    receiverPhone: currentUser?.phone || '',
    label: 'Home', // 'Home', 'Work', 'Other'
    isDefault: false,
  });
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressFormError, setAddressFormError] = useState('');

  // Fallback / legacy delivery address string
  const [deliveryAddress, setDeliveryAddress] = useState(() => {
    return (
      formatAddress(currentUser?.location?.address) ||
      formatAddress(currentUser?.address) ||
      'Flat 402, Royal Residency, Hazratganj, Lucknow'
    );
  });

  // Delivery Instructions (Zomato-style pills & custom notes)
  const [orderNotes, setOrderNotes] = useState('');
  const [selectedInstructionPill, setSelectedInstructionPill] = useState('');

  // Effective vendor info
  const effectiveVendor = vendor || {
    storeName: 'Sharma General Store',
    cashbackRate: 5,
    city: 'Lucknow',
    address: 'Kirana • FMCG • Household, Hazratganj, Lucknow',
    phone: '9876543210',
    zeebacId: 'ZBV-1001',
  };

  // 1. Fetch Store Delivery Settings & Admin Tax Rate
  useEffect(() => {
    const fetchVendorConfig = async () => {
      try {
        const queryId = vendor?.zeebacId || vendor?._id || vendor?.id;
        if (!queryId) return;
        const res = await UserAPI.getVendorDetails(queryId);
        if (res.success && res.data) {
          const v = res.data;
          setStoreDeliveryConfig({
            deliveryCharge: Number(v.deliverySettings?.deliveryCharge ?? 30),
            freeDeliveryAbove: Number(v.deliverySettings?.freeDeliveryAbove ?? 499),
            packagingCharge: Number(v.deliverySettings?.packagingCharge ?? 10),
            minOrderAmount: Number(v.deliverySettings?.minOrderAmount ?? 0),
            isDeliveryAvailable: v.deliverySettings?.isDeliveryAvailable !== false,
            platformTaxPercent: Number(v.platformTaxPercent ?? 5),
          });
        }
      } catch (e) {
        console.warn('Could not load vendor delivery config, using platform defaults', e);
      }
    };
    fetchVendorConfig();
  }, [vendor?.zeebacId, vendor?._id]);

  // 2. Fetch User Saved Addresses on mount
  useEffect(() => {
    const loadSavedAddresses = async () => {
      if (!currentUser) return;
      setIsLoadingAddresses(true);
      try {
        const res = await UserAPI.getSavedAddresses();
        if (res.success && res.data?.addresses?.length > 0) {
          setSavedAddresses(res.data.addresses);
          const defaultAddr = res.data.addresses.find((a) => a.isDefault) || res.data.addresses[0];
          setSelectedAddressId(defaultAddr._id);
          setDeliveryAddress(formatSavedAddressString(defaultAddr));
        } else if (currentUser?.location?.address) {
          const autoAddr = {
            label: 'Home',
            houseNo: formatAddress(currentUser.location.address),
            street: '',
            landmark: '',
            city: currentUser.location.city || 'Lucknow',
            state: currentUser.location.state || 'Uttar Pradesh',
            pincode: currentUser.location.pincode || '',
            receiverName: currentUser.name || 'Customer',
            receiverPhone: currentUser.phone || '',
            isDefault: true,
          };
          setDeliveryAddress(formatSavedAddressString(autoAddr));
        }
      } catch (err) {
        console.warn('Failed to load saved addresses', err);
      } finally {
        setIsLoadingAddresses(false);
      }
    };
    loadSavedAddresses();
  }, [currentUser]);

  const formatSavedAddressString = (addr) => {
    if (!addr) return '';
    const parts = [
      addr.houseNo,
      addr.street,
      addr.landmark ? `Near ${addr.landmark}` : '',
      addr.city,
      addr.pincode ? `PIN: ${addr.pincode}` : '',
    ].filter(Boolean);
    return parts.join(', ');
  };

  const selectedSavedAddress = savedAddresses.find((a) => a._id === selectedAddressId) || savedAddresses[0] || null;

  // ── Financial Calculations (Zomato Breakdown) ──
  const itemTotal = totalAmount;
  const isPickup = fulfillmentType === 'pickup';
  const qualifiesForFreeDelivery = isPickup || itemTotal >= storeDeliveryConfig.freeDeliveryAbove;
  const deliveryFee = isPickup ? 0 : qualifiesForFreeDelivery ? 0 : storeDeliveryConfig.deliveryCharge;
  const packagingFee = isPickup ? 0 : storeDeliveryConfig.packagingCharge;
  const taxRate = storeDeliveryConfig.platformTaxPercent;
  const taxAmount = Math.round(itemTotal * (taxRate / 100) * 100) / 100;

  // Gross total bill before points redemption
  const grossBillTotal = Math.round((itemTotal + deliveryFee + packagingFee + taxAmount) * 100) / 100;

  // Points redemption (1 Point = ₹1)
  const [usePoints, setUsePoints] = useState(false);
  const maxRedeemablePoints = Math.round(Math.min(walletBalance, grossBillTotal) * 100) / 100;
  const pointsRedeemed = usePoints ? maxRedeemablePoints : 0;
  const finalPayableAmount = Math.max(0, Math.round((grossBillTotal - pointsRedeemed) * 100) / 100);

  // Checkout states
  // 'UPI' | 'Points' | 'Cash'
  const [paymentMethod, setPaymentMethod] = useState(finalPayableAmount === 0 && walletBalance >= grossBillTotal ? 'Points' : 'UPI');
  const [isProcessing, setIsProcessing] = useState(false);

  // Direct UPI Intent Modal state
  const [upiIntentData, setUpiIntentData] = useState(null);
  const [utrInput, setUtrInput] = useState('');
  const [isVerifyingUpi, setIsVerifyingUpi] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Active Order Live Tracking state
  const [activeOrder, setActiveOrder] = useState(null);

  // Sync payment method when points redemption changes
  useEffect(() => {
    if (finalPayableAmount === 0 && pointsRedeemed > 0) {
      setPaymentMethod('Points');
    } else if (paymentMethod === 'Points' && finalPayableAmount > 0) {
      setPaymentMethod('UPI');
    }
  }, [finalPayableAmount, pointsRedeemed]);

  // Live order socket updates
  useEffect(() => {
    if (!activeOrder?.orderId) return;

    let socket;
    try {
      socket = getSocket();
    } catch (_) {}

    const handleStatusUpdate = (data) => {
      if (data?.orderId === activeOrder.orderId) {
        setActiveOrder((prev) => ({
          ...prev,
          orderStatus: data.orderStatus,
        }));
        playNotificationChime('incoming');
      }
    };

    const handleRiderAssigned = (data) => {
      if (data?.orderId === activeOrder.orderId) {
        setActiveOrder((prev) => ({
          ...prev,
          orderStatus: data.orderStatus || 'RIDER_ASSIGNED',
          riderDetails: data.rider,
        }));
        playNotificationChime('incoming');
        speakVoice(`Rider ${data.rider?.name || ''} has been assigned for your order.`);
      }
    };

    const handleDelivered = (data) => {
      if (data?.orderId === activeOrder.orderId) {
        setActiveOrder((prev) => ({
          ...prev,
          orderStatus: 'DELIVERED',
          cashbackSettled: true,
        }));
        if (updateBalance && data.cashbackEarned) {
          updateBalance(Math.round((walletBalance + Number(data.cashbackEarned || 0)) * 100) / 100);
        }
        playNotificationChime('incoming');
        speakVoice(`Congratulations! Order delivered. ${data.cashbackEarned} Zeebac Points credited.`);
      }
    };

    if (socket) {
      socket.on('order:status_update', handleStatusUpdate);
      socket.on('order:rider_assigned', handleRiderAssigned);
      socket.on('order:delivered', handleDelivered);
    }

    const interval = setInterval(async () => {
      try {
        const res = await OrderAPI.getOrderById(activeOrder.orderId);
        if (res.success && res.data) {
          setActiveOrder(res.data);
          if (res.data.orderStatus === 'DELIVERED') {
            clearInterval(interval);
          }
        }
      } catch (_) {}
    }, 6000);

    return () => {
      if (socket) {
        socket.off('order:status_update', handleStatusUpdate);
        socket.off('order:rider_assigned', handleRiderAssigned);
        socket.off('order:delivered', handleDelivered);
      }
      clearInterval(interval);
    };
  }, [activeOrder?.orderId, walletBalance, updateBalance]);

  // Copy Payee UPI ID
  const handleCopyVpa = (vpa) => {
    if (!vpa) return;
    navigator.clipboard.writeText(vpa);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // ── Address Actions (Add, Select, Delete) ──
  const handleSaveNewAddress = async (e) => {
    e.preventDefault();
    if (!newAddressForm.houseNo.trim()) {
      setAddressFormError(t('Please enter House/Flat No. and building details'));
      return;
    }
    setAddressFormError('');
    setIsSavingAddress(true);

    try {
      const res = await UserAPI.addSavedAddress(newAddressForm);
      if (res.success && res.data) {
        const updatedList = res.addresses || [...savedAddresses, res.data];
        setSavedAddresses(updatedList);
        setSelectedAddressId(res.data._id);
        setDeliveryAddress(formatSavedAddressString(res.data));
        setShowAddAddressModal(false);
        setShowAddressPickerModal(false);
        setNewAddressForm({
          houseNo: '',
          street: '',
          landmark: '',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pincode: '',
          receiverName: currentUser?.name || '',
          receiverPhone: currentUser?.phone || '',
          label: 'Home',
          isDefault: false,
        });
      } else {
        setAddressFormError(res.message || 'Failed to save address');
      }
    } catch (err) {
      setAddressFormError(err.response?.data?.message || err.message || 'Error saving address');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSelectAddress = (addr) => {
    setSelectedAddressId(addr._id);
    setDeliveryAddress(formatSavedAddressString(addr));
    setShowAddressPickerModal(false);
  };

  const handleDeleteAddress = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await UserAPI.deleteSavedAddress(id);
      if (res.success) {
        const remaining = (res.addresses || savedAddresses.filter((a) => a._id !== id));
        setSavedAddresses(remaining);
        if (selectedAddressId === id) {
          const next = remaining[0] || null;
          setSelectedAddressId(next?._id || null);
          setDeliveryAddress(next ? formatSavedAddressString(next) : '');
        }
      }
    } catch (err) {
      console.error('Failed to delete address', err);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Core Checkout: End-to-End Direct UPI Intent & Points Handler
  // ─────────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (items.length === 0 || isProcessing) return;

    if (storeDeliveryConfig.minOrderAmount > 0 && itemTotal < storeDeliveryConfig.minOrderAmount) {
      alert(`Minimum order value for delivery from this store is ₹${storeDeliveryConfig.minOrderAmount}. Please add more items.`);
      return;
    }

    if (fulfillmentType === 'delivery' && !deliveryAddress.trim()) {
      setShowAddAddressModal(true);
      return;
    }

    setIsProcessing(true);

    try {
      const combinedNotes = [selectedInstructionPill, orderNotes].filter(Boolean).join(' • ');

      const payload = {
        vendorZeebacId: effectiveVendor.zeebacId || 'ZBV-1001',
        fulfillmentType,
        deliveryAddress: selectedSavedAddress
          ? `${selectedSavedAddress.houseNo}, ${selectedSavedAddress.street}${selectedSavedAddress.landmark ? `, Near ${selectedSavedAddress.landmark}` : ''}, ${selectedSavedAddress.city} - ${selectedSavedAddress.pincode} (${selectedSavedAddress.receiverName}, ${selectedSavedAddress.receiverPhone})`
          : deliveryAddress,
        orderNotes: combinedNotes,
        paymentMethod: paymentMethod === 'Points' ? 'ZEEBAC_POINTS' : 'UPI_INTENT',
        redeemPoints: usePoints ? pointsRedeemed : 0,
        items: items.map((item) => ({
          productId: item._id || item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          cashbackPercentage: item.cashbackPercentage,
          image: item.image,
          category: item.category,
        })),
      };

      const res = await OrderAPI.createOrder(payload);

      if (!res.success) {
        alert(res.message || 'Failed to place order');
        setIsProcessing(false);
        return;
      }

      const { order, upiDetails, pointsSummary } = res.data;

      if (pointsSummary?.availablePointsAfter !== undefined && updateBalance) {
        updateBalance(pointsSummary.availablePointsAfter);
      }

      // ── CASE 1: DIRECT UPI INTENT FLOW ──
      if (order.paymentMethod === 'UPI_INTENT' && order.finalPayableAmount > 0) {
        let qrDataUrl = '';
        try {
          qrDataUrl = await QRCode.toDataURL(upiDetails.upiUri, {
            margin: 1,
            width: 240,
            color: { dark: '#1e1b4b', light: '#ffffff' },
          });
        } catch (e) {
          console.warn('QR code generation fallback', e);
        }

        setUpiIntentData({
          ...upiDetails,
          orderId: order.orderId,
          qrDataUrl,
          order,
        });

        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile && upiDetails.upiUri) {
          window.location.href = upiDetails.upiUri;
        }

        setIsProcessing(false);
        return;
      }

      // ── CASE 2: 100% ZEEBAC POINTS FLOW ──
      clearCart();
      setActiveOrder(order);
      setIsProcessing(false);
      playNotificationChime('incoming');
      speakVoice('Order placed successfully using Zeebac Points. Delivery rider will be assigned soon.');
    } catch (err) {
      console.error('Order checkout error', err);
      alert(err.response?.data?.message || 'Unable to process order right now. Please try again.');
      setIsProcessing(false);
    }
  };

  // Verify UPI Payment with 12-digit UTR
  const handleVerifyUpiPayment = async () => {
    if (!upiIntentData?.orderId || isVerifyingUpi) return;
    const cleanUtr = utrInput.trim();

    if (cleanUtr && !/^\d{12}$/.test(cleanUtr)) {
      alert('Please enter a valid 12-digit UPI Reference ID (UTR)');
      return;
    }

    setIsVerifyingUpi(true);
    try {
      const res = await OrderAPI.verifyOrderUpi(upiIntentData.orderId, cleanUtr);
      if (res.success && res.data?.order) {
        playNotificationChime('incoming');
        speakVoice('UPI Payment confirmed! Merchant is preparing your order.');
        clearCart();
        setActiveOrder(res.data.order);
        setUpiIntentData(null);
      } else {
        alert(res.message || 'Payment verification failed');
      }
    } catch (err) {
      console.error('Verification error', err);
      alert(err.response?.data?.message || 'Could not verify UPI payment. Please check UTR number.');
    } finally {
      setIsVerifyingUpi(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 1. EMPTY CART STATE
  // ─────────────────────────────────────────────────────────────
  if (items.length === 0 && !activeOrder && !upiIntentData) {
    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-28">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => safeNavigateBack(navigate, '/home')}
              className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </button>
            <h1 className="font-display font-black text-[18px] text-slate-900 leading-tight">
              {t('Your Cart')}
            </h1>
          </div>
        </header>

        <main className="flex-1 app-container px-4 py-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-purple-50 text-primary flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-[48px]">shopping_cart</span>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <h2 className="font-display font-black text-[20px] text-slate-900">
              {t('Your cart is empty')}
            </h2>
            <p className="text-[12.5px] text-slate-500 leading-relaxed">
              {t('Explore nearby partner shops to add products and get decided cashback points on every product!')}
            </p>
          </div>

          <button
            onClick={() => navigate('/explore')}
            className="btn-primary-gradient text-white px-6 py-3 rounded-2xl font-bold text-[13px] flex items-center gap-2 shadow-md shadow-primary/25 cursor-pointer active:scale-95 transition-all mt-2"
          >
            <span className="material-symbols-outlined text-[18px]">storefront</span>
            <span>{t('Explore Partner Stores')}</span>
          </button>
        </main>

        <BottomNavBar />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. LIVE ORDER TRACKING & RIDER STATUS SCREEN
  // ─────────────────────────────────────────────────────────────
  if (activeOrder) {
    const isDelivered = activeOrder.orderStatus === 'DELIVERED';
    const isRiderAssigned = ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeOrder.orderStatus);

    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-10">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
          <h1 className="font-display font-black text-[18px] text-slate-900 mx-auto">
            {isDelivered ? 'Order Delivered 🎉' : 'Order Tracking & Delivery'}
          </h1>
        </header>

        <main className="flex-1 app-container px-4 py-6 space-y-4 text-left">
          {/* Status Progress Card */}
          <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-purple-50 text-primary font-black text-[11px] tracking-wider uppercase">
                Order #{activeOrder.orderId}
              </span>
              <span className="text-[12px] font-bold text-slate-500">
                {new Date(activeOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <h2 className="font-display font-black text-[20px] text-slate-900">
              {isDelivered
                ? 'Order Delivered Successfully!'
                : activeOrder.orderStatus === 'OUT_FOR_DELIVERY'
                ? 'Rider is Out for Delivery! 🛵'
                : activeOrder.orderStatus === 'RIDER_ASSIGNED'
                ? 'Rider Assigned & Packing Order'
                : activeOrder.orderStatus === 'CONFIRMED' || activeOrder.orderStatus === 'PREPARING'
                ? 'Store Accepted & Preparing Order'
                : 'Order Placed with Store'}
            </h2>

            {/* Live Progress Bar */}
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              {[
                { label: 'Placed', active: true, icon: 'receipt_long' },
                {
                  label: 'Prepared',
                  active: ['CONFIRMED', 'PREPARING', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
                    activeOrder.orderStatus
                  ),
                  icon: 'inventory_2',
                },
                {
                  label: 'On the Way',
                  active: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(activeOrder.orderStatus),
                  icon: 'two_wheeler',
                },
                {
                  label: 'Delivered',
                  active: isDelivered,
                  icon: 'check_circle',
                },
              ].map((step, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      step.active
                        ? 'btn-primary-gradient text-white shadow-xs'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      step.active ? 'text-primary' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Guaranteed Product Cashback Reward Banner */}
            <div
              className={`p-4 rounded-2xl border text-center space-y-1 transition-all ${
                isDelivered
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-gradient-to-r from-purple-50 via-indigo-50/70 to-purple-100/60 border-purple-200'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider font-extrabold text-primary">
                {isDelivered ? '🎉 Points Credited to Zeebac Wallet' : 'Decided Product Cashback Reward'}
              </p>
              <p className="font-display font-black text-[24px] text-primary">
                +{activeOrder.totalCashbackPoints} Zeebac Points
              </p>
              <p className="text-[11px] text-slate-600">
                {isDelivered
                  ? 'Aapke Zeebac Wallet me 1 Point = ₹1 credit ho chuka hai. Kisi bhi partner store par use karein!'
                  : 'Order deliver hote hi ye points aapke wallet me automatic credit honge.'}
              </p>
            </div>
          </div>

          {/* Rider Details Card */}
          {isRiderAssigned && activeOrder.riderDetails?.name && (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                  </div>
                  <div>
                    <h3 className="font-display font-black text-[13px] text-slate-900">
                      Assigned Delivery Rider
                    </h3>
                    <p className="text-[10.5px] text-slate-500">Live Delivery Partner</p>
                  </div>
                </div>

                <a
                  href={`tel:${activeOrder.riderDetails.phone}`}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 text-primary hover:bg-purple-100 font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">call</span>
                  <span>Call Rider</span>
                </a>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="bg-slate-50 p-2.5 rounded-xl">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Rider Name</p>
                  <p className="font-black text-slate-800 text-[13px]">{activeOrder.riderDetails.name}</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Vehicle / Phone</p>
                  <p className="font-bold text-slate-800 text-[12px]">
                    {activeOrder.riderDetails.vehicleNo || activeOrder.riderDetails.phone}
                  </p>
                </div>
              </div>

              {/* Delivery OTP Badge */}
              {activeOrder.riderDetails?.deliveryOtp && !isDelivered && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center space-y-0.5">
                  <p className="text-[10.5px] font-bold text-amber-800 uppercase tracking-wider">
                    Share OTP with Rider upon Delivery
                  </p>
                  <p className="font-mono font-black text-[22px] text-amber-900 tracking-widest">
                    {activeOrder.riderDetails.deliveryOtp}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Delivery Address & Store */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2 text-[12px]">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">storefront</span>
              <div>
                <p className="font-black text-slate-900">{activeOrder.storeName}</p>
                <p className="text-slate-500 text-[11px]">{activeOrder.vendorZeebacId}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-slate-100">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">location_on</span>
              <div>
                <p className="font-bold text-slate-800">Delivery Address</p>
                <p className="text-slate-500 text-[11px]">{formatAddress(activeOrder.deliveryAddress)}</p>
              </div>
            </div>
          </div>

          {/* Purchased Items List */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5">
            <h3 className="font-display font-black text-[13.5px] text-slate-900 border-b border-slate-100 pb-2">
              Purchased Items ({activeOrder.items?.length || 0})
            </h3>
            <div className="divide-y divide-slate-100">
              {activeOrder.items?.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-[12px]">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-900 truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      Qty: {item.quantity} × ₹{item.price}
                    </p>
                    <span className="inline-block text-[9.5px] font-extrabold text-primary bg-purple-50 px-1.5 py-0.2 rounded-md mt-0.5">
                      {item.cashbackPercentage}% Cashback = +{formatCurrency(item.cashbackPoints)} Zeebac Points
                    </span>
                  </div>
                  <span className="font-black text-slate-900 shrink-0">
                    ₹{item.price * item.quantity}
                  </span>
                </div>
              ))}
            </div>

            {/* Bill Summary */}
            <div className="pt-2 border-t border-slate-100 space-y-1 text-[12px]">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal:</span>
                <span className="font-bold text-slate-900 font-mono">₹{formatCurrency(activeOrder.itemTotal || activeOrder.totalAmount)}</span>
              </div>
              {activeOrder.deliveryCharge !== undefined && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charge:</span>
                  <span className="font-mono text-slate-900 font-bold">
                    {activeOrder.deliveryCharge === 0 ? 'FREE' : `₹${formatCurrency(activeOrder.deliveryCharge)}`}
                  </span>
                </div>
              )}
              {activeOrder.packagingCharge !== undefined && activeOrder.packagingCharge > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Packaging & Handling:</span>
                  <span className="font-mono text-slate-900 font-bold">₹{formatCurrency(activeOrder.packagingCharge)}</span>
                </div>
              )}
              {activeOrder.taxAmount !== undefined && activeOrder.taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Taxes & GST ({activeOrder.taxPercentage || 5}%):</span>
                  <span className="font-mono text-slate-900 font-bold">₹{formatCurrency(activeOrder.taxAmount)}</span>
                </div>
              )}
              {activeOrder.pointsRedeemed > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Zeebac Points Redeemed:</span>
                  <span className="font-mono">-₹{formatCurrency(activeOrder.pointsRedeemed)}</span>
                </div>
              )}
              <div className="flex justify-between text-[13.5px] font-black text-slate-900 pt-1 border-t border-slate-100">
                <span>Total Paid ({activeOrder.paymentMethod}):</span>
                <span className="text-primary font-mono text-[15px]">
                  ₹{formatCurrency(activeOrder.finalPayableAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => navigate('/wallet')}
              className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[13px] shadow-md shadow-primary/25 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              <span>View Zeebac Points Wallet</span>
            </button>
            <button
              onClick={() => navigate('/home')}
              className="w-full py-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-[13px] cursor-pointer active:scale-95 transition-all"
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 3. FULL SHOPPING CART & ZOMATO-STYLE STEP-BY-STEP FLOW
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-36">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => safeNavigateBack(navigate, '/vendor-detail')}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer transition-colors shrink-0"
            title={t('Back')}
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-black text-[17px] text-slate-900 truncate leading-tight">
              {effectiveVendor.storeName}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'} in cart • {effectiveVendor.city || 'Lucknow'}
            </p>
          </div>
        </div>

        <button
          onClick={clearCart}
          className="text-[11.5px] font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
        >
          {t('Clear')}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 app-container px-3.5 sm:px-4 py-4 space-y-3.5 text-left">
        {/* Model Highlights Notice Banner */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-3.5 rounded-2xl shadow-md space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-[20px]">stars</span>
            <p className="text-[12.5px] font-black text-amber-300">
              Zeebac Points & Direct Store Delivery
            </p>
          </div>
          <p className="text-[11px] text-purple-100 leading-snug">
            Each product earns decided cashback points <strong className="text-white">(1 Pt = ₹1)</strong> upon delivery. Use your points anytime to pay for your groceries and store orders!
          </p>
        </div>

        {/* Fulfillment Type Toggle (Pickup vs Delivery) */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-100 shadow-2xs grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setFulfillmentType('delivery')}
            className={`py-2 px-3 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              fulfillmentType === 'delivery'
                ? 'btn-primary-gradient text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
            <span>{t('Rider Delivery')}</span>
          </button>

          <button
            onClick={() => setFulfillmentType('pickup')}
            className={`py-2 px-3 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              fulfillmentType === 'pickup'
                ? 'btn-primary-gradient text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">storefront</span>
            <span>{t('Store Pickup')}</span>
          </button>
        </div>

        {/* ── STEP 1: ZOMATO-STYLE DELIVERY ADDRESS CARD ── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-3">
          {fulfillmentType === 'pickup' ? (
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[20px]">storefront</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[13px] text-slate-900">{effectiveVendor.storeName} Counter</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5 leading-tight">{formatAddress(effectiveVendor.address) || 'Hazratganj, Lucknow'}</p>
                <span className="inline-block mt-1.5 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md">
                  Ready in 10-15 mins • No Waiting
                </span>
              </div>
            </div>
          ) : selectedSavedAddress ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-700 text-[20px]">home_pin</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-black text-slate-900">
                      Deliver to: {selectedSavedAddress.label || 'Home'}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                      {selectedSavedAddress.label || 'Home'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowAddressPickerModal(true)}
                  className="text-[11.5px] font-black text-purple-700 hover:text-purple-900 uppercase tracking-wider cursor-pointer hover:underline"
                >
                  {t('Change')}
                </button>
              </div>

              <div className="pl-7 space-y-1">
                <p className="text-[12.5px] font-bold text-slate-800 leading-snug">
                  {selectedSavedAddress.houseNo}, {selectedSavedAddress.street}
                  {selectedSavedAddress.landmark ? `, Near ${selectedSavedAddress.landmark}` : ''}
                </p>
                <p className="text-[11.5px] text-slate-500">
                  {selectedSavedAddress.city} - {selectedSavedAddress.pincode}
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  Recipient: <strong className="text-slate-700">{selectedSavedAddress.receiverName}</strong> ({selectedSavedAddress.receiverPhone})
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px]">add_location_alt</span>
                </div>
                <div>
                  <h3 className="font-bold text-[13px] text-slate-900">Add Delivery Address</h3>
                  <p className="text-[11px] text-slate-500">Choose where you want your order delivered</p>
                </div>
              </div>

              <button
                onClick={() => setShowAddAddressModal(true)}
                className="px-3.5 py-2 rounded-xl btn-primary-gradient text-white text-[11.5px] font-bold shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                <span>{t('Add Address')}</span>
              </button>
            </div>
          )}
        </div>

        {/* ── STEP 2: CART ITEMS LIST (ZOMATO STYLE) ── */}
        <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-slate-100 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="font-display font-black text-[14px] text-slate-900">
              {t('Items in Order')} ({items.length})
            </h2>
            <button
              onClick={() => navigate('/vendor-detail', { state: { vendor: effectiveVendor } })}
              className="text-[11.5px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span>{t('Add more items')}</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const itemCashback = Math.round(item.price * item.quantity * (item.cashbackPercentage / 100) * 100) / 100;

              return (
                <div key={item._id || item.id} className="py-3 flex items-center justify-between gap-3">
                  {/* Thumbnail & Product Details */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 shrink-0 overflow-hidden flex items-center justify-center p-1">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="material-symbols-outlined text-slate-400 text-[20px]">shopping_bag</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[13px] text-slate-900 truncate leading-tight">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-black text-[13px] text-slate-900">₹{item.price}</span>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <span className="text-[11px] text-slate-400 line-through">₹{item.originalPrice}</span>
                        )}
                      </div>
                      {/* Product Specific Cashback Badge */}
                      <span className="inline-block text-[9.5px] font-extrabold text-primary bg-purple-50 px-1.5 py-0.2 rounded-md mt-0.5">
                        {item.cashbackPercentage}% Cashback = +{formatCurrency(itemCashback)} Zeebac Points
                      </span>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="h-8 rounded-xl btn-primary-gradient text-white flex items-center justify-between px-1.5 shadow-2xs font-black text-[12px] shrink-0 w-22">
                    <button
                      onClick={() => updateQuantity(item._id || item.id, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                      title="Decrease"
                    >
                      <span className="material-symbols-outlined text-[15px]">remove</span>
                    </button>
                    <span className="font-mono font-bold text-[12px] px-1">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item._id || item.id, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                      title="Increase"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP 3: DELIVERY / ORDER INSTRUCTIONS (ZOMATO STYLE) ── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-700 text-[18px]">notes</span>
            <h3 className="font-display font-black text-[13.5px] text-slate-900">
              Delivery Instructions
            </h3>
          </div>

          <div className="flex gap-2 overflow-x-auto hide-scrollbar py-0.5">
            {[
              { label: 'Avoid calling', icon: 'notifications_off' },
              { label: 'Leave at door', icon: 'door_front' },
              { label: 'Call on arrival', icon: 'ring_volume' },
              { label: 'Leave with guard', icon: 'shield_person' },
            ].map((pill) => {
              const isSelected = selectedInstructionPill === pill.label;
              return (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => setSelectedInstructionPill(isSelected ? '' : pill.label)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{pill.icon}</span>
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="e.g. Leave package at security gate or call on arrival"
            className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] text-slate-800 focus:bg-white outline-none"
          />
        </div>

        {/* ── STEP 4: ZEEBAC POINTS REDEMPTION (1 POINT = ₹1) ── */}
        <div className="bg-white rounded-2xl p-4 border border-purple-100 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">stars</span>
              </div>
              <div>
                <p className="font-black text-[13px] text-slate-900">Use Zeebac Points</p>
                <p className="text-[11px] text-slate-500">
                  Available: <strong className="text-primary">{formatCurrency(walletBalance)} Points</strong> (Value: ₹{formatCurrency(walletBalance)})
                </p>
              </div>
            </div>

            <button
              disabled={walletBalance <= 0}
              onClick={() => setUsePoints(!usePoints)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                walletBalance <= 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : usePoints
                  ? 'btn-primary-gradient text-white shadow-xs'
                  : 'bg-purple-50 text-primary hover:bg-purple-100'
              }`}
            >
              {usePoints ? 'Points Applied ✓' : 'Apply Points'}
            </button>
          </div>

          {usePoints && (
            <div className="bg-purple-50/70 p-2.5 rounded-xl border border-purple-100 text-[11.5px] text-slate-700 flex justify-between items-center">
              <span>Redeemed for Purchase (1 Pt = ₹1):</span>
              <span className="font-black text-primary font-mono">-₹{formatCurrency(pointsRedeemed)}</span>
            </div>
          )}
        </div>

        {/* ── STEP 5: BILL DETAILS (ZOMATO BREAKDOWN: TAX, DELIVERY & PACKAGING) ── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5 text-[12.5px]">
          <h3 className="font-display font-black text-[14px] text-slate-900 border-b border-slate-100 pb-2">
            {t('Bill Details')}
          </h3>

          {/* 1. Item Total */}
          <div className="flex justify-between items-center text-slate-600">
            <span>{t('Item Total')}</span>
            <span className="font-bold text-slate-900 font-mono">₹{formatCurrency(itemTotal)}</span>
          </div>

          {/* 2. Delivery Partner Fee */}
          <div className="flex justify-between items-center text-slate-600">
            <div className="flex items-center gap-1">
              <span>Delivery Fee</span>
              {!isPickup && qualifiesForFreeDelivery && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded">
                  Above ₹{storeDeliveryConfig.freeDeliveryAbove}
                </span>
              )}
            </div>
            <span className="font-mono">
              {isPickup ? (
                <span className="text-slate-500 font-bold">₹0 (Store Pickup)</span>
              ) : qualifiesForFreeDelivery ? (
                <span>
                  <span className="line-through text-slate-400 mr-1.5">₹{storeDeliveryConfig.deliveryCharge}</span>
                  <span className="font-black text-emerald-600 uppercase text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full">
                    FREE
                  </span>
                </span>
              ) : (
                <span className="font-bold text-slate-900">₹{formatCurrency(deliveryFee)}</span>
              )}
            </span>
          </div>

          {/* Free delivery upsell message */}
          {!isPickup && !qualifiesForFreeDelivery && (
            <p className="text-[10.5px] text-purple-700 font-medium bg-purple-50/70 px-2.5 py-1 rounded-lg">
              Add ₹{formatCurrency(storeDeliveryConfig.freeDeliveryAbove - itemTotal)} more to get <strong>FREE Delivery</strong>!
            </p>
          )}

          {/* 3. Packaging & Handling Charge (Set by Store Owner) */}
          {!isPickup && packagingFee > 0 && (
            <div className="flex justify-between items-center text-slate-600">
              <span>Packaging & Handling Fee</span>
              <span className="font-bold text-slate-900 font-mono">₹{formatCurrency(packagingFee)}</span>
            </div>
          )}

          {/* 4. Govt Taxes & Statutory GST (Decided by Admin) */}
          {taxAmount > 0 && (
            <div className="flex justify-between items-center text-slate-600">
              <span>Govt Taxes & GST ({taxRate}%)</span>
              <span className="font-bold text-slate-900 font-mono">₹{formatCurrency(taxAmount)}</span>
            </div>
          )}

          {/* 5. Zeebac Points Discount */}
          {usePoints && pointsRedeemed > 0 && (
            <div className="flex justify-between items-center text-emerald-600 font-bold">
              <span>Zeebac Points Applied (Discount):</span>
              <span className="font-mono">-₹{formatCurrency(pointsRedeemed)}</span>
            </div>
          )}

          {/* 6. Total Payable */}
          <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[14px] font-black">
            <span className="text-slate-900">{t('To Pay')}</span>
            <span className="text-primary font-mono text-[17px]">₹{formatCurrency(finalPayableAmount)}</span>
          </div>

          {/* Total Cashback Earned Badge */}
          <div className="pt-1.5 flex justify-between items-center text-[12px] font-extrabold text-primary bg-purple-50 p-2.5 rounded-xl border border-purple-100">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">redeem</span>
              <span>Total Zeebac Points Earned upon Delivery:</span>
            </span>
            <span className="font-mono text-[13px]">+{formatCurrency(totalCashback)} Points</span>
          </div>
        </div>

        {/* ── STEP 6: PAYMENT METHOD SELECTOR ── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5">
          <h3 className="font-display font-black text-[14px] text-slate-900">
            {t('Select Payment Method')}
          </h3>

          <div className="space-y-2">
            {/* 1. Direct UPI Intent (Default) */}
            {finalPayableAmount > 0 && (
              <label
                onClick={() => setPaymentMethod('UPI')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  paymentMethod === 'UPI'
                    ? 'border-primary bg-purple-50/50 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">account_balance</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-[13px] text-slate-900">Direct UPI Intent</p>
                      <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                        Fast & Direct
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Pay via Google Pay, PhonePe, Paytm, BHIM</p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'UPI' ? 'border-primary' : 'border-slate-300'}`}>
                  {paymentMethod === 'UPI' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
              </label>
            )}

            {/* 2. 100% Zeebac Points Payment */}
            {finalPayableAmount === 0 && pointsRedeemed > 0 && (
              <label
                onClick={() => setPaymentMethod('Points')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  paymentMethod === 'Points'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">stars</span>
                  </div>
                  <div>
                    <p className="font-bold text-[12.5px] text-emerald-900">100% Zeebac Points Purchase</p>
                    <p className="text-[10.5px] text-emerald-700">₹0 Payable • Covered by {formatCurrency(pointsRedeemed)} Points</p>
                  </div>
                </div>
                <div className="w-4 h-4 rounded-full border-2 border-emerald-600 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-600" />
                </div>
              </label>
            )}
          </div>
        </div>
      </main>

      {/* ── STICKY BOTTOM CHECKOUT BAR (ZOMATO STYLE) ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 px-4 py-3 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{t('Total Payable')}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-black text-[20px] text-slate-900 font-mono">
                ₹{formatCurrency(finalPayableAmount)}
              </span>
              {pointsRedeemed > 0 && (
                <span className="text-[11px] text-emerald-600 font-bold font-mono">
                  ({formatCurrency(pointsRedeemed)} pts used)
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={isProcessing}
            className={`flex-1 py-3.5 px-4 rounded-2xl btn-primary-gradient text-white font-bold text-[13.5px] flex items-center justify-center gap-2 shadow-md shadow-primary/25 cursor-pointer active:scale-95 transition-all ${
              isProcessing ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isProcessing ? (
              <>
                <span className="animate-spin material-symbols-outlined text-[18px]">progress_activity</span>
                <span>Processing Order...</span>
              </>
            ) : paymentMethod === 'Points' ? (
              <>
                <span className="material-symbols-outlined text-[18px]">stars</span>
                <span>Place Order with Points</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                <span>Pay ₹{formatCurrency(finalPayableAmount)} via Direct UPI</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: SAVED ADDRESSES SELECTOR / PICKER (ZOMATO STYLE) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showAddressPickerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-reveal">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-[22px]">location_on</span>
                <h3 className="font-display font-black text-base text-slate-900">Select Delivery Address</h3>
              </div>
              <button
                onClick={() => setShowAddressPickerModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {savedAddresses.map((addr) => {
                const isSelected = addr._id === selectedAddressId;
                return (
                  <div
                    key={addr._id}
                    onClick={() => handleSelectAddress(addr)}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/40'
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-purple-700 text-[18px]">
                          {addr.label?.toLowerCase() === 'work' ? 'work' : 'home'}
                        </span>
                        <span className="font-black text-sm text-slate-900">{addr.label || 'Home'}</span>
                        {addr.isDefault && (
                          <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleDeleteAddress(addr._id, e)}
                          className="w-7 h-7 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete address"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-purple-600' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 font-medium mt-1 leading-snug">
                      {addr.houseNo}, {addr.street}
                      {addr.landmark ? `, Near ${addr.landmark}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {addr.city} - {addr.pincode} • Phone: {addr.receiverPhone || currentUser?.phone}
                    </p>
                  </div>
                );
              })}

              {savedAddresses.length === 0 && (
                <div className="text-center py-6 text-slate-400">
                  <span className="material-symbols-outlined text-[36px] opacity-40">location_off</span>
                  <p className="text-xs font-bold mt-1">No saved addresses yet</p>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowAddressPickerModal(false);
                setShowAddAddressModal(true);
              }}
              className="w-full py-3 rounded-xl border-2 border-dashed border-purple-300 text-purple-700 hover:bg-purple-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>+ Add New Address</span>
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: ADD NEW DELIVERY ADDRESS (ZOMATO STEP-BY-STEP FORM) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showAddAddressModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-reveal">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-[22px]">add_location</span>
                <h3 className="font-display font-black text-base text-slate-900">Add Delivery Address</h3>
              </div>
              <button
                onClick={() => setShowAddAddressModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {addressFormError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{addressFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewAddress} className="space-y-3.5 text-xs">
              {/* Tag Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Save Address As</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Home', 'Work', 'Other'].map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setNewAddressForm({ ...newAddressForm, label: lbl })}
                      className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                        newAddressForm.label === lbl
                          ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {lbl === 'Home' ? 'home' : lbl === 'Work' ? 'work' : 'location_on'}
                      </span>
                      <span>{lbl}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* House / Flat / Floor / Apartment */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  House / Flat / Block No. & Floor *
                </label>
                <input
                  type="text"
                  required
                  value={newAddressForm.houseNo}
                  onChange={(e) => setNewAddressForm({ ...newAddressForm, houseNo: e.target.value })}
                  placeholder="e.g. Flat 402, 4th Floor, Royal Heights"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                />
              </div>

              {/* Street / Area / Locality */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Apartment / Road / Area *
                </label>
                <input
                  type="text"
                  required
                  value={newAddressForm.street}
                  onChange={(e) => setNewAddressForm({ ...newAddressForm, street: e.target.value })}
                  placeholder="e.g. Hazratganj, Park Road"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                />
              </div>

              {/* Landmark */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={newAddressForm.landmark}
                  onChange={(e) => setNewAddressForm({ ...newAddressForm, landmark: e.target.value })}
                  placeholder="e.g. Near City Mall / Opposite Metro Pillar"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                />
              </div>

              {/* City & Pincode */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={newAddressForm.city}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={newAddressForm.pincode}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, pincode: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 226001"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                  />
                </div>
              </div>

              {/* Recipient Details */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receiver Name</label>
                  <input
                    type="text"
                    value={newAddressForm.receiverName}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, receiverName: e.target.value })}
                    placeholder="Name"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receiver Phone</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={newAddressForm.receiverPhone}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, receiverPhone: e.target.value.replace(/\D/g, '') })}
                    placeholder="10-digit Mobile"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-purple-600 outline-none font-medium text-xs"
                  />
                </div>
              </div>

              {/* Set as Default Checkbox */}
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAddressForm.isDefault}
                  onChange={(e) => setNewAddressForm({ ...newAddressForm, isDefault: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-slate-700 font-bold">Set as default delivery address</span>
              </label>

              <button
                type="submit"
                disabled={isSavingAddress}
                className="w-full py-3.5 rounded-xl btn-primary-gradient text-white font-bold text-sm shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isSavingAddress ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving Address...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Save & Deliver Here</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* DIRECT UPI INTENT INTERACTIVE MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {upiIntentData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-reveal">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">account_balance</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-[15px] text-slate-900">
                    Direct UPI Intent Payment
                  </h3>
                  <p className="text-[11px] text-slate-500">Order #{upiIntentData.orderId}</p>
                </div>
              </div>

              <button
                onClick={() => setUpiIntentData(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Amount Banner */}
            <div className="bg-purple-50 p-3 rounded-2xl text-center space-y-0.5 border border-purple-100">
              <p className="text-[11px] uppercase tracking-wider text-purple-900 font-extrabold">Payable Amount</p>
              <p className="font-display font-black text-[26px] text-primary font-mono">
                ₹{formatCurrency(upiIntentData.amount)}
              </p>
              <p className="text-[11px] text-slate-600">
                To: <strong className="text-slate-900">{upiIntentData.payeeName}</strong>
              </p>
            </div>

            {/* Direct UPI App Launch Button */}
            <a
              href={upiIntentData.upiUri}
              className="w-full py-3.5 px-4 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-md shadow-primary/25 cursor-pointer active:scale-95 transition-all text-center"
            >
              <span className="material-symbols-outlined text-[20px]">open_in_new</span>
              <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
            </a>

            {/* Dynamic QR Code */}
            {upiIntentData.qrDataUrl && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-center space-y-2">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Scan Dynamic UPI QR Code
                </p>
                <img
                  src={upiIntentData.qrDataUrl}
                  alt="UPI Payment QR"
                  className="w-44 h-44 mx-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
                />
                <div className="flex items-center justify-center gap-1.5 text-[11.5px] text-slate-700">
                  <span>UPI ID:</span>
                  <span className="font-mono font-bold text-slate-900">{upiIntentData.payeeVpa}</span>
                  <button
                    onClick={() => handleCopyVpa(upiIntentData.payeeVpa)}
                    className="p-1 text-primary hover:bg-purple-100 rounded-md transition-colors cursor-pointer"
                    title="Copy UPI ID"
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {copySuccess ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 12-Digit UTR Verification Form */}
            <div className="bg-purple-50/60 p-3.5 rounded-2xl border border-purple-100 space-y-2">
              <div>
                <p className="font-bold text-[12px] text-purple-950">
                  Payment done? Enter 12-Digit UPI UTR / Ref No:
                </p>
                <p className="text-[10.5px] text-slate-500">
                  Found on your payment success receipt in Google Pay / PhonePe / Paytm.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={12}
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 425612345678"
                  className="flex-1 h-10 px-3 bg-white border border-purple-200 rounded-xl text-[13px] font-mono font-bold text-slate-900 tracking-wider focus:outline-none focus:border-primary"
                />

                <button
                  onClick={handleVerifyUpiPayment}
                  disabled={isVerifyingUpi || !utrInput.trim()}
                  className="px-4 h-10 rounded-xl btn-primary-gradient text-white font-bold text-[12px] shrink-0 active:scale-95 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isVerifyingUpi ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
