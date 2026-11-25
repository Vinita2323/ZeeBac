import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { OrderAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import useCartStore from '../../../store/useCartStore';
import { getSocket } from '../../../services/socket';
import {
  playNotificationChime,
  playOrderOutForDeliveryChime,
  playOrderDeliveredChime,
} from '../../../utils/voiceUtils';
import LiveOrderTrackingModal from '../../../components/common/LiveOrderTrackingModal';

export default function OnlineOrdersSubView({ onBack, t = (k, d) => d || k }) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const addItem = useCartStore((state) => state.addItem);

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'delivered' | 'pickup' | 'cancelled'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [trackingOrder, setTrackingOrder] = useState(null);

  // Feedback Modal State
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    order: null,
    target: 'vendor', // 'vendor' | 'rider'
  });
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackHoverRating, setFeedbackHoverRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackTags, setFeedbackTags] = useState([]);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState(null);

  // Open feedback dialog
  const handleOpenFeedback = (order, target) => {
    const existing = target === 'vendor' ? order.vendorFeedback : order.riderFeedback;
    setFeedbackModal({ isOpen: true, order, target });
    setFeedbackRating(existing?.rating || 5);
    setFeedbackHoverRating(0);
    setFeedbackComment(existing?.comment || '');
    setFeedbackTags(existing?.tags || []);
    setFeedbackSuccessMsg(null);
  };

  // Toggle tag in feedback
  const handleToggleTag = (tag) => {
    setFeedbackTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Submit Feedback
  const handleSubmitFeedback = async () => {
    if (!feedbackModal.order) return;
    setIsSubmittingFeedback(true);
    try {
      const orderIdentifier = feedbackModal.order.orderId || feedbackModal.order._id;
      const res = await OrderAPI.submitOrderFeedback(orderIdentifier, {
        target: feedbackModal.target,
        rating: feedbackRating,
        comment: feedbackComment,
        tags: feedbackTags,
      });

      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.orderId === feedbackModal.order.orderId || o._id === feedbackModal.order._id) {
              if (feedbackModal.target === 'vendor') {
                return {
                  ...o,
                  vendorFeedback: {
                    rating: feedbackRating,
                    comment: feedbackComment,
                    tags: feedbackTags,
                    ratedAt: new Date().toISOString(),
                  },
                };
              } else {
                return {
                  ...o,
                  riderFeedback: {
                    rating: feedbackRating,
                    comment: feedbackComment,
                    tags: feedbackTags,
                    ratedAt: new Date().toISOString(),
                  },
                };
              }
            }
            return o;
          })
        );

        setFeedbackSuccessMsg(
          feedbackModal.target === 'vendor'
            ? 'Thank you! Store review submitted successfully.'
            : 'Thank you! Delivery partner rating submitted.'
        );
        setTimeout(() => {
          setFeedbackModal({ isOpen: false, order: null, target: 'vendor' });
          setFeedbackSuccessMsg(null);
        }, 1400);
      }
    } catch (err) {
      console.error('Failed to submit order feedback', err);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // 1. Fetch Customer's Orders
  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await OrderAPI.getMyOrders({ limit: 50 });
      if (res.success && Array.isArray(res.data)) {
        setOrders(res.data);
      }
    } catch (err) {
      console.error('Failed to load customer orders', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // 2. Real-Time Socket Updates
  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
      if (socket) {
        const handleStatusUpdate = (data) => {
          if (!data?.orderId) return;
          const updatedStatus = data.orderStatus;

          setOrders((prev) =>
            prev.map((o) => {
              if (o.orderId === data.orderId || o._id === data.orderId) {
                const nextOrder = {
                  ...o,
                  orderStatus: updatedStatus || o.orderStatus,
                  riderDetails: {
                    ...o.riderDetails,
                    ...(data.riderDetails || {}),
                    name: data.riderName || o.riderDetails?.name,
                    phone: data.riderPhone || o.riderDetails?.phone,
                    vehicleNo: data.vehicleNo || o.riderDetails?.vehicleNo,
                    deliveryOtp: data.deliveryOtp || o.riderDetails?.deliveryOtp,
                    currentLocation: data.currentLocation || o.riderDetails?.currentLocation,
                  },
                };
                return nextOrder;
              }
              return o;
            })
          );

          setTrackingOrder((prev) => {
            if (prev && (prev.orderId === data.orderId || prev._id === data.orderId)) {
              return {
                ...prev,
                orderStatus: updatedStatus || prev.orderStatus,
                riderDetails: {
                  ...prev.riderDetails,
                  ...(data.riderDetails || {}),
                  name: data.riderName || prev.riderDetails?.name,
                  phone: data.riderPhone || prev.riderDetails?.phone,
                  vehicleNo: data.vehicleNo || prev.riderDetails?.vehicleNo,
                  deliveryOtp: data.deliveryOtp || prev.riderDetails?.deliveryOtp,
                },
              };
            }
            return prev;
          });

          if (updatedStatus === 'OUT_FOR_DELIVERY') {
            playOrderOutForDeliveryChime({ riderName: data.riderName });
          } else if (updatedStatus === 'DELIVERED') {
            playOrderDeliveredChime();
          } else if (updatedStatus === 'ARRIVED_AT_PICKUP' || updatedStatus === 'ARRIVED_AT_CUSTOMER') {
            playNotificationChime('incoming');
          }
        };

        const handleLocationUpdate = (data) => {
          if (!data?.orderId && !data?.latitude) return;
          setTrackingOrder((prev) => {
            if (prev && (prev.orderId === data.orderId || prev._id === data.orderId || !data.orderId)) {
              return {
                ...prev,
                riderDetails: {
                  ...prev.riderDetails,
                  currentLocation: {
                    latitude: Number(data.latitude),
                    longitude: Number(data.longitude),
                    heading: Number(data.heading || 0),
                    speed: Number(data.speed || 0),
                    updatedAt: new Date(),
                  },
                },
              };
            }
            return prev;
          });
        };

        const handleRiderAssigned = (data) => {
          if (!data?.orderId) return;
          handleStatusUpdate({ ...data, orderStatus: 'RIDER_ASSIGNED' });
        };

        const handleOrderDelivered = (data) => {
          if (!data?.orderId) return;
          handleStatusUpdate({ ...data, orderStatus: 'DELIVERED', paymentStatus: 'PAID', cashbackSettled: true });
        };

        const handleOrderCancelled = (data) => {
          if (!data?.orderId) return;
          setOrders((prev) =>
            prev.map((o) =>
              o.orderId === data.orderId
                ? {
                    ...o,
                    orderStatus: 'CANCELLED',
                    cancellationReason: data.reason || 'Cancelled by store',
                  }
                : o
            )
          );
        };

        socket.on('order:status_update', handleStatusUpdate);
        socket.on('order:rider_assigned', handleRiderAssigned);
        socket.on('order:out_for_delivery', handleStatusUpdate);
        socket.on('delivery:location_update', handleLocationUpdate);
        socket.on('order:delivered', handleOrderDelivered);
        socket.on('order:cancelled', handleOrderCancelled);

        return () => {
          socket.off('order:status_update', handleStatusUpdate);
          socket.off('order:rider_assigned', handleRiderAssigned);
          socket.off('order:out_for_delivery', handleStatusUpdate);
          socket.off('delivery:location_update', handleLocationUpdate);
          socket.off('order:delivered', handleOrderDelivered);
          socket.off('order:cancelled', handleOrderCancelled);
        };
      }
    } catch (_) {}
  }, []);

  // Format Date and Time
  const formatDateTime = (val) => {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(val);
    }
  };

  // Format Delivery Address Safely
  const formatAddress = (addr) => {
    if (!addr) return 'Customer Address';
    if (typeof addr === 'string') return addr;
    const parts = [addr.fullAddress, addr.addressLine, addr.street, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Customer Address';
  };

  // Reorder Items
  const handleReorder = (order) => {
    if (!order.items || order.items.length === 0) return;
    order.items.forEach((item) => {
      addItem({
        _id: item.productId || item._id,
        id: item.productId || item._id,
        name: item.name,
        price: item.price,
        image: item.image,
        cashbackPercentage: item.cashbackPercentage,
        vendor: {
          zeebacId: order.vendorZeebacId,
          storeName: order.storeName,
        },
      });
    });
    navigate('/cart');
  };

  // Copy to clipboard
  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Tab filter
      const isDelivered = o.orderStatus === 'DELIVERED';
      const isCancelled = o.orderStatus === 'CANCELLED';
      const isActive = !isDelivered && !isCancelled;
      const isPickup = o.fulfillmentType === 'pickup';

      if (activeTab === 'active' && !isActive) return false;
      if (activeTab === 'delivered' && !isDelivered) return false;
      if (activeTab === 'pickup' && !isPickup) return false;
      if (activeTab === 'cancelled' && !isCancelled) return false;

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesStore = o.storeName?.toLowerCase().includes(q);
        const matchesId = o.orderId?.toLowerCase().includes(q);
        const matchesItem = o.items?.some((it) => it.name?.toLowerCase().includes(q));
        if (!matchesStore && !matchesId && !matchesItem) return false;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  // Active Orders count badge
  const activeCount = useMemo(() => {
    return orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.orderStatus)).length;
  }, [orders]);

  // Stepper Stage Calculation
  const getStepperStages = (order) => {
    const isPickup = order.fulfillmentType === 'pickup';
    const s = order.orderStatus;

    const stages = [
      { id: 'placed', label: 'Order Placed', icon: 'receipt' },
      { id: 'confirmed', label: 'Store Accepted & Preparing', icon: 'soup_kitchen' },
      { id: 'ready', label: isPickup ? 'Packed & Ready at Counter' : 'Order Packed & Ready', icon: 'inventory' },
      { id: 'moving', label: isPickup ? 'Ready for Handover' : 'Rider Out for Delivery', icon: isPickup ? 'storefront' : 'two_wheeler' },
      { id: 'delivered', label: isPickup ? 'Collected from Store' : 'Delivered to Doorstep', icon: 'check_circle' },
    ];

    let currentStep = 1;
    if (s === 'PLACED') currentStep = 1;
    else if (s === 'CONFIRMED' || s === 'PREPARING') currentStep = 2;
    else if (s === 'READY_FOR_PICKUP') currentStep = 3;
    else if (s === 'RIDER_ASSIGNED') currentStep = 3.5;
    else if (s === 'ARRIVED_AT_PICKUP') currentStep = 3.8;
    else if (s === 'PICKED_UP' || s === 'OUT_FOR_DELIVERY') currentStep = 4;
    else if (s === 'ARRIVED_AT_CUSTOMER') currentStep = 4.5;
    else if (s === 'DELIVERED') currentStep = 5;
    else if (s === 'CANCELLED') currentStep = 0;

    return { stages, currentStep };
  };

  return (
    <div className="mesh-gradient text-slate-900 min-h-screen flex flex-col font-body-lg pb-32">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (onBack) onBack();
              else navigate(-1);
            }}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <div>
            <h1 className="font-display font-black text-[16.5px] text-slate-900 leading-tight">
              {t('My Online Orders & Deliveries', 'My Online Orders & Deliveries')}
            </h1>
            <p className="text-[10.5px] text-slate-500 font-medium">
              {orders.length} {orders.length === 1 ? 'order placed' : 'orders placed'} • Live rider tracking
            </p>
          </div>
        </div>

        <button
          onClick={fetchOrders}
          className="w-8 h-8 rounded-full hover:bg-purple-50 text-purple-700 flex items-center justify-center cursor-pointer transition-all active:scale-95"
          title="Refresh Orders"
        >
          <span className={`material-symbols-outlined text-[20px] ${isLoading ? 'animate-spin' : ''}`}>
            refresh
          </span>
        </button>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 app-container px-3 sm:px-4 py-4 space-y-3.5">
        {/* Search + Filters (single row on desktop) */}
        <div className="space-y-3.5 lg:space-y-0 lg:flex lg:items-center lg:gap-4">
        {/* Search Bar */}
        <div className="relative lg:w-[380px] lg:shrink-0">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by store, product, or order ID..."
            className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-2xl text-[12.5px] text-slate-800 placeholder-slate-400 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-1 lg:flex-1 lg:min-w-0">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'active', label: 'Active 🛵', count: activeCount },
            { id: 'delivered', label: 'Delivered ✅' },
            { id: 'pickup', label: 'Counter Pickup 🛍️' },
            { id: 'cancelled', label: 'Cancelled ❌' },
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                      isSelected ? 'bg-white text-purple-700' : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-3 pt-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs animate-pulse space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-200 rounded-md w-32" />
                  <div className="h-4 bg-slate-200 rounded-md w-20" />
                </div>
                <div className="h-10 bg-slate-100 rounded-xl" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-4 bg-slate-200 rounded-md w-24" />
                  <div className="h-4 bg-slate-200 rounded-md w-16" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredOrders.length === 0 && (
          <div className="bg-white rounded-3xl p-8 md:p-12 border border-slate-100 shadow-sm text-center space-y-4 my-6 md:max-w-xl md:mx-auto">
            <div className="w-20 h-20 rounded-full bg-purple-50 text-purple-700 mx-auto flex items-center justify-center">
              <span className="material-symbols-outlined text-[40px]">local_shipping</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-display font-black text-base text-slate-900">
                {searchQuery ? 'No matching orders found' : 'No online orders yet'}
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {searchQuery
                  ? 'Try searching with a different store name or product.'
                  : 'Order groceries, food, or products from verified Zeebac stores and track delivery here!'}
              </p>
            </div>
            <button
              onClick={() => navigate('/explore')}
              className="btn-primary-gradient text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 mx-auto shadow-md shadow-primary/20 cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">storefront</span>
              <span>Explore Partner Stores</span>
            </button>
          </div>
        )}

        {/* ─── LIVE ACTIVE DELIVERY BANNER (MATCHING ZOMATO LIVE TRACKING SCREENSHOT) ─── */}
        {orders.find((o) => ['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'].includes(o.orderStatus)) && (() => {
          const activeOrder = orders.find((o) => ['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'].includes(o.orderStatus));
          return (
            <div
              onClick={() => setTrackingOrder(activeOrder)}
              className="mb-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 rounded-3xl shadow-lg shadow-emerald-900/15 cursor-pointer hover:shadow-xl transition-all flex items-center justify-between gap-3 animate-reveal"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 shadow-xs">
                  <span className="material-symbols-outlined text-[28px] text-white">two_wheeler</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-[14.5px] leading-tight">
                      Order is on the way! 🛵
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping"></span>
                  </div>
                  <p className="text-[11.5px] text-emerald-50 truncate mt-0.5 font-medium">
                    {activeOrder.vendorId?.storeName || activeOrder.storeName || 'Store'} • Reaching in ~7 mins
                  </p>
                  <p className="text-[10px] text-emerald-200 mt-0.5">
                    Tap to view live GPS map &amp; moving rider
                  </p>
                </div>
              </div>

              <div className="px-3.5 py-2 bg-white text-emerald-800 rounded-xl font-black text-xs shrink-0 flex items-center gap-1 shadow-sm active:scale-95 transition-all">
                <span>Track Live</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </div>
            </div>
          );
        })()}

        {/* Orders List */}
        {!isLoading && filteredOrders.length > 0 && (
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-3 md:items-start">
            {filteredOrders.map((order) => {
              const isDelivered = order.orderStatus === 'DELIVERED';
              const isCancelled = order.orderStatus === 'CANCELLED';
              const isPickup = order.fulfillmentType === 'pickup';
              const isScheduled = order.deliverySchedule?.deliveryType === 'SCHEDULED';
              const isExpanded = expandedOrderId === order.orderId;
              const hasOtp = Boolean(order.riderDetails?.deliveryOtp) && !isDelivered && !isCancelled;
              const { stages, currentStep } = getStepperStages(order);

              // Feedback eligibility:
              // 1. Vendor: Can rate once order is confirmed/accepted by store or beyond (not when PLACED or CANCELLED)
              const canRateVendor = order.orderStatus !== 'PLACED' && order.orderStatus !== 'CANCELLED';
              // 2. Rider: Can rate when delivery order is marked DELIVERED
              const canRateRider = isDelivered && !isPickup;

              // Status badge style
              let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
              let statusIcon = 'schedule';
              let statusText = order.orderStatus;

              if (order.orderStatus === 'PLACED') {
                statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                statusIcon = 'hourglass_top';
                statusText = 'Order Placed (Waiting for Store)';
              } else if (order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING') {
                statusBadgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
                statusIcon = 'soup_kitchen';
                statusText = 'Store Accepted & Preparing';
              } else if (order.orderStatus === 'READY_FOR_PICKUP') {
                statusBadgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
                statusIcon = 'inventory_2';
                statusText = isPickup ? 'Packed & Ready at Counter' : 'Packed & Ready for Pickup';
              } else if (order.orderStatus === 'RIDER_ASSIGNED') {
                statusBadgeClass = 'bg-blue-50 text-blue-800 border-blue-200';
                statusIcon = 'two_wheeler';
                statusText = `Rider Assigned: ${order.riderDetails?.name || 'Rider'}`;
              } else if (order.orderStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'PICKED_UP' || order.orderStatus === 'ARRIVED_AT_CUSTOMER') {
                statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
                statusIcon = 'electric_moped';
                statusText = 'Rider Out for Delivery 🛵';
              } else if (isDelivered) {
                statusBadgeClass = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                statusIcon = 'verified';
                statusText = 'Delivered & Cashback Credited';
              } else if (isCancelled) {
                statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                statusIcon = 'cancel';
                statusText = 'Order Cancelled';
              }

              return (
                <div
                  key={order.orderId || order._id}
                  className={`bg-white rounded-3xl border transition-all shadow-2xs overflow-hidden ${
                    !isDelivered && !isCancelled
                      ? 'border-purple-200/90 ring-1 ring-purple-100 shadow-sm'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-100 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-display font-black text-[14.5px] text-slate-900">
                            {order.storeName || order.vendorId?.storeName || 'Partner Store'}
                          </h3>
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 rounded">
                            {order.vendorZeebacId || 'STORE'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                          <span>#{order.orderId}</span>
                          <span>•</span>
                          <span>{formatDateTime(order.createdAt)}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-display font-black text-base text-slate-900 block">
                          ₹{order.finalPayableAmount || order.totalAmount}
                        </span>
                        <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                          +{order.totalCashbackPoints} Pts CB
                        </span>
                      </div>
                    </div>

                    {/* Status Badge & Fulfillment Pill */}
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${statusBadgeClass}`}>
                        <span className="material-symbols-outlined text-[14px]">{statusIcon}</span>
                        <span>{statusText}</span>
                      </span>

                      <span className="text-[10.5px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">
                          {isPickup ? 'storefront' : 'local_shipping'}
                        </span>
                        <span>{isPickup ? 'Counter Pickup' : 'Rider Delivery'}</span>
                      </span>

                      <span className="text-[10.5px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg">
                        {order.paymentMethod} • {order.paymentStatus}
                      </span>
                    </div>

                    {/* Scheduled Delivery Banner */}
                    {isScheduled && (
                      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2 text-amber-950 text-[11.5px]">
                        <span className="material-symbols-outlined text-amber-700 text-[18px] shrink-0">
                          calendar_clock
                        </span>
                        <div>
                          <span className="font-extrabold block text-amber-900 leading-tight">
                            Scheduled Order Delivery
                          </span>
                          <span className="text-[11px] font-medium text-amber-800">
                            📅 {order.deliverySchedule?.scheduledDate || 'Scheduled'} • ⏰ {order.deliverySchedule?.scheduledSlot || 'Slot'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Delivery OTP Prominent Banner (for active delivery) */}
                    {hasOtp && (
                      <div className="bg-linear-to-r from-purple-700 to-indigo-700 text-white rounded-2xl p-3 flex items-center justify-between shadow-md">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-purple-200 block">
                            🔑 Delivery OTP
                          </span>
                          <span className="font-mono font-black text-2xl tracking-widest block">
                            {order.riderDetails.deliveryOtp}
                          </span>
                          <p className="text-[10.5px] text-purple-100">
                            Share with delivery partner upon arrival to complete delivery
                          </p>
                        </div>
                        <button
                          onClick={() => handleCopy(order.riderDetails.deliveryOtp, `otp_${order.orderId}`)}
                          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-black flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[14px]">content_copy</span>
                          <span>{copyFeedback === `otp_${order.orderId}` ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    {/* Assigned Rider Info Card */}
                    {order.riderDetails?.name && !isDelivered && !isCancelled && (
                      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                            <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                          </div>
                          <div>
                            <span className="font-black text-indigo-950 block">
                              {order.riderDetails.name}
                            </span>
                            <span className="text-[10.5px] text-indigo-700 font-medium">
                              {order.riderDetails.vehicleNo || 'Delivery Partner'}
                            </span>
                          </div>
                        </div>

                        {order.riderDetails.phone && (
                          <a
                            href={`tel:${order.riderDetails.phone}`}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs hover:bg-indigo-700"
                          >
                            <span className="material-symbols-outlined text-[14px]">call</span>
                            <span>Call Rider</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Live GPS Map Trigger Button */}
                    {['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'].includes(order.orderStatus) && (
                      <button
                        type="button"
                        onClick={() => setTrackingOrder(order)}
                        className="w-full mt-2.5 py-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs flex items-center justify-between shadow-xs active:scale-98 transition-all cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                          <span>Track Live Rider on Map</span>
                        </span>
                        <span className="flex items-center gap-1 text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-extrabold">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                          <span>Live GPS</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Items Preview */}
                  <div className="p-3 bg-slate-50/60 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                      <span>{order.items?.length || 0} Items Ordered</span>
                      <span>₹{order.itemTotal || order.totalAmount}</span>
                    </div>

                    <div className="space-y-1">
                      {order.items?.slice(0, isExpanded ? 50 : 2).map((it, idx) => (
                        <div key={idx} className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {it.quantity}x
                            </span>
                            <span className="font-bold text-slate-800 truncate">
                              {it.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-slate-700">
                              ₹{it.price * it.quantity}
                            </span>
                            {it.cashbackPercentage > 0 && (
                              <span className="text-[9.5px] font-black text-purple-700 bg-purple-50 px-1 py-0.2 rounded">
                                +{it.cashbackPercentage}% CB
                              </span>
                            )}
                          </div>
                        </div>
                      ))}

                      {!isExpanded && order.items?.length > 2 && (
                        <button
                          onClick={() => setExpandedOrderId(order.orderId)}
                          className="text-[11px] font-bold text-purple-700 hover:underline px-1 cursor-pointer block"
                        >
                          + {order.items.length - 2} more items...
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details: Live Tracking Stepper, Address, Financials */}
                  {isExpanded && (
                    <div className="p-4 bg-white border-t border-slate-100 space-y-4 text-xs animate-fadeIn">
                      {/* Step Timeline */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block">
                          Delivery Lifecycle Status
                        </span>

                        <div className="space-y-2 pl-2">
                          {stages.map((stage, sIdx) => {
                            const isPassed = currentStep > sIdx + 1;
                            const isCurrent = Math.floor(currentStep) === sIdx + 1;

                            return (
                              <div key={stage.id} className="flex items-start gap-2.5">
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${
                                      isPassed
                                        ? 'bg-emerald-600 text-white'
                                        : isCurrent
                                        ? 'bg-purple-600 text-white ring-4 ring-purple-100'
                                        : 'bg-slate-100 text-slate-400'
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      {isPassed ? 'check' : stage.icon}
                                    </span>
                                  </div>
                                  {sIdx < stages.length - 1 && (
                                    <div
                                      className={`w-0.5 h-6 my-0.5 ${
                                        isPassed ? 'bg-emerald-600' : 'bg-slate-200'
                                      }`}
                                    />
                                  )}
                                </div>
                                <div className="pt-0.5">
                                  <p
                                    className={`font-black text-xs leading-tight ${
                                      isCurrent
                                        ? 'text-purple-700'
                                        : isPassed
                                        ? 'text-slate-900'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {stage.label}
                                  </p>
                                  {isCurrent && (
                                    <span className="text-[10px] text-purple-600 font-bold block mt-0.5">
                                      In progress • Real-time status
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Drop Address or Counter Pickup Details */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                          {isPickup ? 'Store Counter Location' : 'Delivery Address'}
                        </span>
                        <p className="font-bold text-slate-800 text-xs">
                          {isPickup
                            ? `${order.storeName || order.vendorId?.storeName || 'Store'}, ${formatAddress(order.vendorAddress || order.vendorId?.address || 'Market Area')}`
                            : formatAddress(order.deliveryAddress)}
                        </p>
                        {order.orderNotes && (
                          <p className="text-[11px] text-slate-500 italic mt-1">
                            Note: "{order.orderNotes}"
                          </p>
                        )}
                      </div>

                      {/* Bill / Price Breakdown */}
                      <div className="p-3 rounded-2xl bg-purple-50/50 border border-purple-100 space-y-1.5">
                        <span className="text-[10px] font-black uppercase text-purple-800 tracking-wider block">
                          Payment Summary
                        </span>
                        <div className="space-y-1 text-slate-600 text-xs">
                          <div className="flex justify-between">
                            <span>Item Total</span>
                            <span className="font-mono">₹{order.itemTotal || order.totalAmount}</span>
                          </div>
                          {order.deliveryCharge > 0 && (
                            <div className="flex justify-between">
                              <span>Delivery Charge</span>
                              <span className="font-mono">₹{order.deliveryCharge}</span>
                            </div>
                          )}
                          {order.packagingCharge > 0 && (
                            <div className="flex justify-between">
                              <span>Packaging Charge</span>
                              <span className="font-mono">₹{order.packagingCharge}</span>
                            </div>
                          )}
                          {order.pointsRedeemed > 0 && (
                            <div className="flex justify-between text-emerald-700 font-bold">
                              <span>Zeebac Points Redeemed</span>
                              <span className="font-mono">-₹{order.pointsRedeemed}</span>
                            </div>
                          )}
                          {order.tipAmount > 0 && (
                            <div className="flex justify-between text-purple-700 font-bold">
                              <span>Delivery Partner Tip</span>
                              <span className="font-mono">₹{order.tipAmount}</span>
                            </div>
                          )}
                          <div className="border-t border-purple-200/60 pt-1 flex justify-between font-black text-slate-900 text-sm">
                            <span>Total Paid / Payable</span>
                            <span className="font-mono text-purple-900">
                              ₹{order.finalPayableAmount || order.totalAmount}
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] font-black text-purple-700 bg-purple-100/70 p-1.5 rounded-lg mt-1">
                            <span>🪙 Zeebac Cashback Points</span>
                            <span>+{order.totalCashbackPoints} Pts</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rating & Feedback Action Strip */}
                  {(canRateVendor || canRateRider) && (
                    <div className="px-3.5 py-2.5 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {canRateVendor && (
                          order.vendorFeedback?.rating ? (
                            <button
                              onClick={() => handleOpenFeedback(order, 'vendor')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 transition-all cursor-pointer shadow-2xs active:scale-95"
                              title="Click to view or edit store review"
                            >
                              <span className="text-amber-500 font-black text-[13px]">★</span>
                              <span>{order.vendorFeedback.rating}/5</span>
                              <span className="text-slate-500 font-medium text-[10.5px]">Store</span>
                              <span className="material-symbols-outlined text-[13px] text-slate-400">edit</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenFeedback(order, 'vendor')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 transition-all shadow-2xs cursor-pointer active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[15px] text-purple-600">star</span>
                              <span>Rate Store</span>
                            </button>
                          )
                        )}

                        {canRateRider && (
                          order.riderFeedback?.rating ? (
                            <button
                              onClick={() => handleOpenFeedback(order, 'rider')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100 transition-all cursor-pointer shadow-2xs active:scale-95"
                              title="Click to view or edit delivery partner rating"
                            >
                              <span className="material-symbols-outlined text-[14px] text-emerald-600">two_wheeler</span>
                              <span>★ {order.riderFeedback.rating}/5</span>
                              <span className="text-slate-500 font-medium text-[10.5px]">Rider</span>
                              <span className="material-symbols-outlined text-[13px] text-slate-400">edit</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenFeedback(order, 'rider')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-all shadow-2xs cursor-pointer active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[15px] text-indigo-600">two_wheeler</span>
                              <span>Rate Rider</span>
                            </button>
                          )
                        )}
                      </div>

                      {order.tipAmount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-1 rounded-lg">
                          <span>🛵 Rider Tip:</span>
                          <span className="font-mono font-black">₹{order.tipAmount}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Card Action Footer */}
                  <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.orderId)}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isExpanded ? 'expand_less' : 'radar'}
                      </span>
                      <span>{isExpanded ? 'Hide Details' : 'Track Status'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* View Bill Invoice */}
                      <button
                        onClick={() => setSelectedOrderForInvoice(order)}
                        className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                        title="View Tax Invoice"
                      >
                        <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                        <span>Bill</span>
                      </button>

                      {/* Store Call */}
                      {(order.vendorPhone || order.vendorId?.phone) && (
                        <a
                          href={`tel:${order.vendorPhone || order.vendorId?.phone}`}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">call</span>
                          <span>Store</span>
                        </a>
                      )}

                      {/* Order Again */}
                      <button
                        onClick={() => handleReorder(order)}
                        className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-all active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">replay</span>
                        <span>Reorder</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Order Tax Invoice / Receipt Modal ── */}
      {selectedOrderForInvoice && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-purple-700 font-display font-black text-sm">
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                <span>Tax Invoice / Bill</span>
              </div>
              <button
                onClick={() => setSelectedOrderForInvoice(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Receipt Body (Matching Zeebac Tax Invoice Template) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-3">
                <h3 className="font-display font-black text-base text-slate-900">
                  {selectedOrderForInvoice.storeName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Zeebac Store ID: {selectedOrderForInvoice.vendorZeebacId || 'ZBV-STORE'}
                </p>
                <p className="text-[10px] text-slate-400">Verified Merchant Store</p>
              </div>

              <div className="space-y-1 text-slate-600 text-[11px]">
                <div className="flex justify-between">
                  <span>Bill / Order No:</span>
                  <span className="font-mono font-bold text-slate-900">#{selectedOrderForInvoice.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date & Time:</span>
                  <span>{formatDateTime(selectedOrderForInvoice.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-bold">{selectedOrderForInvoice.customerName || currentUser?.name || 'Customer'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer ID:</span>
                  <span className="font-mono font-bold">{currentUser?.zeebacId || 'ZBC-CUSTOMER'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Mode:</span>
                  <span className="font-bold">{selectedOrderForInvoice.paymentMethod}</span>
                </div>
                {selectedOrderForInvoice.deliverySchedule?.deliveryType === 'SCHEDULED' && (
                  <div className="flex justify-between text-amber-800 font-bold">
                    <span>Scheduled Delivery:</span>
                    <span>{selectedOrderForInvoice.deliverySchedule.scheduledDate}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="border-t border-b border-dashed border-slate-300 py-2.5 space-y-1.5">
                <div className="flex justify-between font-black text-[10.5px] text-slate-500 uppercase tracking-wider">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Price</span>
                  <span>Total</span>
                </div>
                {selectedOrderForInvoice.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[11.5px] text-slate-800">
                    <span className="font-bold truncate max-w-[140px]">{it.name}</span>
                    <span className="text-center">{it.quantity}</span>
                    <span className="font-mono text-slate-600">₹{it.price}</span>
                    <span className="font-mono font-bold text-slate-900">₹{it.price * it.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Total & Cashback */}
              <div className="space-y-1 text-[12px]">
                {selectedOrderForInvoice.tipAmount > 0 && (
                  <div className="flex justify-between text-purple-700 font-bold">
                    <span>Delivery Partner Tip:</span>
                    <span className="font-mono">₹{selectedOrderForInvoice.tipAmount}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-slate-900 text-sm">
                  <span>Grand Total:</span>
                  <span className="font-mono text-purple-900">
                    ₹{selectedOrderForInvoice.finalPayableAmount || selectedOrderForInvoice.totalAmount}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>GST (Statutory Included):</span>
                  <span>₹0 (Inc.)</span>
                </div>

                <div className="bg-purple-100 text-purple-900 rounded-xl p-2.5 text-center mt-2 space-y-0.5">
                  <span className="font-black text-xs block">
                    🎁 ZEEBAC INSTANT REWARD
                  </span>
                  <span className="font-mono font-black text-sm text-purple-700 block">
                    +{selectedOrderForInvoice.totalCashbackPoints} Cashback Points
                  </span>
                  <span className="text-[10px] text-purple-800 font-medium block">
                    Points Credited to Customer Wallet!
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setSelectedOrderForInvoice(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Order Feedback Modal ── */}
      {feedbackModal.isOpen && feedbackModal.order && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${
                    feedbackModal.target === 'vendor'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {feedbackModal.target === 'vendor' ? 'storefront' : 'two_wheeler'}
                  </span>
                </div>
                <div>
                  <h3 className="font-display font-black text-sm text-slate-900 leading-tight">
                    {feedbackModal.target === 'vendor'
                      ? `Rate Store: ${feedbackModal.order.storeName || 'Merchant'}`
                      : `Rate Rider: ${feedbackModal.order.riderDetails?.name || 'Delivery Partner'}`}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Order #{feedbackModal.order.orderId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setFeedbackModal({ isOpen: false, order: null, target: 'vendor' })}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {feedbackSuccessMsg ? (
              <div className="py-8 text-center space-y-2 animate-scaleUp">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-[32px]">check_circle</span>
                </div>
                <h4 className="font-display font-black text-slate-900 text-base">Feedback Saved!</h4>
                <p className="text-xs text-slate-600">{feedbackSuccessMsg}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 5-Star Rating Selector */}
                <div className="text-center space-y-1 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Your Rating
                  </span>
                  <div className="flex items-center justify-center gap-1.5 py-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = (feedbackHoverRating || feedbackRating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setFeedbackHoverRating(star)}
                          onMouseLeave={() => setFeedbackHoverRating(0)}
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 cursor-pointer transition-transform hover:scale-125 active:scale-95 text-amber-400 focus:outline-hidden"
                        >
                          <span
                            className={`material-symbols-outlined text-[32px] ${
                              isFilled ? 'fill-current text-amber-400' : 'text-slate-300'
                            }`}
                            style={{ fontVariationSettings: isFilled ? "'FILL' 1" : "'FILL' 0" }}
                          >
                            star
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-black text-amber-600 block">
                    {(feedbackHoverRating || feedbackRating) === 5 && '⭐⭐⭐⭐⭐ Excellent! Loved it!'}
                    {(feedbackHoverRating || feedbackRating) === 4 && '⭐⭐⭐⭐ Very Good!'}
                    {(feedbackHoverRating || feedbackRating) === 3 && '⭐⭐⭐ Good, Average'}
                    {(feedbackHoverRating || feedbackRating) === 2 && '⭐⭐ Needs Improvement'}
                    {(feedbackHoverRating || feedbackRating) === 1 && '⭐ Poor Experience'}
                  </span>
                </div>

                {/* Quick Tags Selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block">
                    What stood out? (Quick Tags)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(feedbackModal.target === 'vendor'
                      ? [
                          '⚡ Fast Preparation',
                          '🥗 Fresh & Quality Food',
                          '📦 Neat Packaging',
                          '🏷️ Value for Money',
                          '❤️ Polite Store Team',
                        ]
                      : [
                          '⏱️ On-time Delivery',
                          '🤝 Polite & Professional',
                          '🛵 Contactless Handover',
                          '🛡️ Handled with Care',
                          '📍 Quick Route Navigation',
                        ]
                    ).map((tag) => {
                      const isSelected = feedbackTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Review Comment */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block">
                    Detailed Review (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder={
                      feedbackModal.target === 'vendor'
                        ? 'Write how was the food, freshness, taste or store service...'
                        : 'Share feedback about the rider behavior and delivery handling...'
                    }
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-purple-400 text-slate-800 placeholder-slate-400 resize-none bg-slate-50/50"
                  />
                </div>

                {/* Submit / Cancel Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmittingFeedback}
                    onClick={handleSubmitFeedback}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs disabled:opacity-50 active:scale-95"
                  >
                    {isSubmittingFeedback ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">send</span>
                        <span>Submit Feedback</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackModal({ isOpen: false, order: null, target: 'vendor' })}
                    className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      {/* ─── LIVE GPS ORDER & RIDER TRACKING MODAL (MATCHING SCREENSHOT) ─── */}
      {trackingOrder && (
        <LiveOrderTrackingModal
          order={trackingOrder}
          onClose={() => setTrackingOrder(null)}
        />
      )}
    </div>
  );
}
