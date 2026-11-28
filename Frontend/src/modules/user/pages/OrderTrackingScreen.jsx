import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { OrderAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import { getSocket } from '../../../services/socket';
import { playNotificationChime } from '../../../utils/voiceUtils';
import { openOrderRazorpayCheckout } from '../../../utils/razorpayOrderCheckout';
import PayAtStoreCard from '../components/PayAtStoreCard';
import LiveOrderTrackingModal from '../../../components/common/LiveOrderTrackingModal';
import BottomNavBar from '../components/common/BottomNavBar';

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

export default function OrderTrackingScreen() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const rawWalletBalance = useAuthStore((state) => state.walletBalance) || 0;
  const walletBalance = Math.round((Number(rawWalletBalance) || 0) * 100) / 100;
  const updateBalance = useAuthStore((state) => state.updateBalance);

  const [order, setOrder] = useState(() => location.state?.initialOrder || null);
  const [isLoading, setIsLoading] = useState(!location.state?.initialOrder);
  const [loadError, setLoadError] = useState('');
  const [pendingRazorpay, setPendingRazorpay] = useState(() => location.state?.pendingRazorpay || null);
  const [showLiveMap, setShowLiveMap] = useState(false);

  const autoLaunchedRazorpayRef = useRef(false);

  // Fetch order by orderId from URL so deep links and page refreshes always work
  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      setLoadError('Order ID is missing.');
      return;
    }

    let isMounted = true;
    const fetchOrder = async () => {
      try {
        const res = await OrderAPI.getOrderById(orderId);
        if (!isMounted) return;
        if (res.success && res.data) {
          setOrder(res.data);
          setLoadError('');
        } else {
          setLoadError(res.message || 'Order not found.');
        }
      } catch (err) {
        if (!isMounted) return;
        setLoadError(err.response?.data?.message || 'Unable to load order details.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOrder();
    return () => {
      isMounted = false;
    };
  }, [orderId]);

  const launchRazorpay = async (rzp) => {
    await openOrderRazorpayCheckout(rzp, {
      onVerified: (updatedOrder) => {
        setOrder(updatedOrder);
        setPendingRazorpay(null);
        playNotificationChime('incoming');
      },
    });
  };

  // If navigated directly after creating an online Razorpay order, open checkout sheet once
  useEffect(() => {
    if (
      !autoLaunchedRazorpayRef.current &&
      pendingRazorpay &&
      order?.paymentStatus !== 'PAID' &&
      order?.orderStatus !== 'CANCELLED'
    ) {
      autoLaunchedRazorpayRef.current = true;
      launchRazorpay(pendingRazorpay);
    }
  }, [pendingRazorpay, order?.paymentStatus, order?.orderStatus]);

  const retryOnlinePayment = async () => {
    if (!order?.orderId) return;
    try {
      if (pendingRazorpay && pendingRazorpay.orderId === order.orderId) {
        return launchRazorpay(pendingRazorpay);
      }
      const res = await OrderAPI.getRazorpayCheckout(order.orderId);
      if (res.success) {
        const rzp = { ...res.data, orderId: order.orderId };
        setPendingRazorpay(rzp);
        launchRazorpay(rzp);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not start payment. Please try again.');
    }
  };

  // Real-time socket updates + polling fallback for this order
  useEffect(() => {
    const activeId = order?.orderId || orderId;
    if (!activeId) return;
    if (order && ['DELIVERED', 'CANCELLED'].includes(order.orderStatus)) return;

    let socket;
    try {
      socket = getSocket();
    } catch (_) {}

    const matchesOrder = (id) => id === activeId || id === order?._id;

    const handleStatusUpdate = (data) => {
      if (matchesOrder(data?.orderId)) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                orderStatus: data.orderStatus || prev.orderStatus,
              }
            : prev
        );
      }
    };

    const handleRiderAssigned = (data) => {
      if (matchesOrder(data?.orderId)) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                orderStatus: data.orderStatus || 'RIDER_ASSIGNED',
                riderDetails: data.rider || data.riderDetails || prev.riderDetails,
              }
            : prev
        );
      }
    };

    const handleLocationUpdate = (data) => {
      if (matchesOrder(data?.orderId) && data?.latitude) {
        setOrder((prev) =>
          prev
            ? {
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
              }
            : prev
        );
      }
    };

    const handleDelivered = (data) => {
      if (matchesOrder(data?.orderId)) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                orderStatus: 'DELIVERED',
                cashbackSettled: true,
              }
            : prev
        );
        if (updateBalance && data.cashbackEarned) {
          updateBalance(Math.round((walletBalance + Number(data.cashbackEarned || 0)) * 100) / 100);
        }
      }
    };

    const handleCancelled = (data) => {
      if (matchesOrder(data?.orderId)) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                orderStatus: 'CANCELLED',
                cancellationReason: data.cancellationReason || data.reason || 'Store was unable to accept this order',
                cancelledBy: data.cancelledBy || 'VENDOR',
              }
            : prev
        );
        if (data.pointsRefunded && data.refundedPoints && updateBalance) {
          updateBalance(Math.round((walletBalance + Number(data.refundedPoints || 0)) * 100) / 100);
        }
      }
    };

    const handleStoreBill = (data) => {
      if (matchesOrder(data?.orderId)) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                storeBill: data.storeBill,
                paymentStatus: data.paymentStatus,
                paymentMethod: data.paymentMethod,
              }
            : prev
        );
        if (data.paymentStatus === 'PAID') playNotificationChime('incoming');
      }
    };

    if (socket) {
      socket.on('order:store_bill', handleStoreBill);
      socket.on('order:status_update', handleStatusUpdate);
      socket.on('order:rider_assigned', handleRiderAssigned);
      socket.on('delivery:location_update', handleLocationUpdate);
      socket.on('order:delivered', handleDelivered);
      socket.on('order:cancelled', handleCancelled);
    }

    const interval = setInterval(async () => {
      try {
        const res = await OrderAPI.getOrderById(activeId);
        if (res.success && res.data) {
          setOrder(res.data);
          if (res.data.orderStatus === 'DELIVERED' || res.data.orderStatus === 'CANCELLED') {
            clearInterval(interval);
          }
        }
      } catch (_) {}
    }, 6000);

    return () => {
      if (socket) {
        socket.off('order:store_bill', handleStoreBill);
        socket.off('order:status_update', handleStatusUpdate);
        socket.off('order:rider_assigned', handleRiderAssigned);
        socket.off('delivery:location_update', handleLocationUpdate);
        socket.off('order:delivered', handleDelivered);
        socket.off('order:cancelled', handleCancelled);
      }
      clearInterval(interval);
    };
  }, [order?.orderId, order?._id, order?.orderStatus, orderId, walletBalance, updateBalance]);

  if (isLoading) {
    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-28">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
          <button
            onClick={() => navigate('/orders')}
            className="text-[12px] font-bold text-purple-700 hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>All Orders</span>
          </button>
          <h1 className="font-display font-black text-[16.5px] text-slate-900">Order Tracking &amp; Delivery</h1>
          <div className="w-8" />
        </header>

        <main className="flex-1 app-container px-4 py-6 space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs animate-pulse space-y-4">
            <div className="h-5 bg-slate-200 rounded w-40" />
            <div className="h-7 bg-slate-200 rounded w-64" />
            <div className="grid grid-cols-4 gap-2 pt-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-12 bg-slate-100 rounded-xl" />
              ))}
            </div>
            <div className="h-24 bg-purple-50 rounded-2xl" />
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-28">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
          <button
            onClick={() => navigate('/orders')}
            className="text-[12px] font-bold text-purple-700 hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>All Orders</span>
          </button>
          <h1 className="font-display font-black text-[16.5px] text-slate-900">Order Details</h1>
          <div className="w-8" />
        </header>

        <main className="flex-1 app-container px-4 py-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[40px]">receipt_long</span>
          </div>
          <div className="space-y-1 max-w-xs">
            <h2 className="font-display font-black text-[18px] text-slate-900">Order not found</h2>
            <p className="text-[12.5px] text-slate-500">{loadError || 'We could not find this order.'}</p>
          </div>
          <button
            onClick={() => navigate('/orders')}
            className="btn-primary-gradient text-white px-6 py-3 rounded-2xl font-bold text-[13px] cursor-pointer active:scale-95 transition-all"
          >
            View All Orders
          </button>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  const isDelivered = order.orderStatus === 'DELIVERED';
  const isCancelled = order.orderStatus === 'CANCELLED';
  const isRiderAssigned = [
    'RIDER_ASSIGNED',
    'ARRIVED_AT_PICKUP',
    'PICKED_UP',
    'OUT_FOR_DELIVERY',
    'ARRIVED_AT_CUSTOMER',
    'DELIVERED',
  ].includes(order.orderStatus);
  const canTrackLiveMap = [
    'RIDER_ASSIGNED',
    'ARRIVED_AT_PICKUP',
    'PICKED_UP',
    'OUT_FOR_DELIVERY',
    'ARRIVED_AT_CUSTOMER',
  ].includes(order.orderStatus);

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-28">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
        <button
          onClick={() => navigate('/orders')}
          className="text-[12px] font-bold text-purple-700 hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>All Orders</span>
        </button>
        <h1 className="font-display font-black text-[16.5px] text-slate-900">
          {isDelivered
            ? 'Order Delivered'
            : isCancelled
            ? 'Order Cancelled'
            : 'Order Tracking & Delivery'}
        </h1>
        <button
          onClick={() => navigate('/orders')}
          className="w-8 h-8 rounded-full hover:bg-purple-50 text-purple-700 flex items-center justify-center cursor-pointer"
          title="View All Orders"
        >
          <span className="material-symbols-outlined text-[20px]">list_alt</span>
        </button>
      </header>

      <main className="flex-1 app-container px-4 py-6 space-y-4 text-left">
        {/* Status Progress Card */}
        <div
          className={`rounded-3xl p-5 border shadow-md space-y-4 transition-all ${
            isCancelled
              ? 'bg-rose-50/50 border-rose-200'
              : isDelivered
              ? 'bg-emerald-50/40 border-emerald-200'
              : 'bg-white border-purple-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`px-3 py-1 rounded-full font-black text-[11px] tracking-wider uppercase ${
                isCancelled
                  ? 'bg-rose-100 text-rose-800'
                  : isDelivered
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-purple-50 text-primary'
              }`}
            >
              Order #{order.orderId}
            </span>
            <span className="text-[12px] font-bold text-slate-500">
              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {order.deliverySchedule?.deliveryType === 'SCHEDULED' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2.5 text-amber-900 text-[12px]">
              <span className="material-symbols-outlined text-amber-700 text-[20px]">calendar_clock</span>
              <div className="text-left">
                <p className="font-extrabold text-[12.5px] text-amber-900">Scheduled Delivery Order</p>
                <p className="text-[11px] text-amber-800 font-medium">
                  <span className="material-symbols-outlined text-[13px] align-middle">calendar_month</span> Date: <strong>{order.deliverySchedule.scheduledDate || 'Scheduled'}</strong> • <span className="material-symbols-outlined text-[13px] align-middle">schedule</span> Slot:{' '}
                  <strong>{order.deliverySchedule.scheduledSlot || 'Slot'}</strong>
                </p>
              </div>
            </div>
          )}

          <h2 className="font-display font-black text-[20px] text-slate-900">
            {isDelivered
              ? order.fulfillmentType === 'pickup'
                ? 'Order Picked Up Successfully!'
                : 'Order Delivered Successfully!'
              : isCancelled
              ? 'Order Cancelled by Store'
              : order.orderStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'PICKED_UP'
              ? 'Rider is Out for Delivery!'
              : order.orderStatus === 'ARRIVED_AT_CUSTOMER'
              ? 'Rider Has Arrived at Your Location!'
              : order.orderStatus === 'RIDER_ASSIGNED' || order.orderStatus === 'ARRIVED_AT_PICKUP'
              ? 'Rider Assigned & Collecting Order'
              : order.orderStatus === 'READY_FOR_PICKUP'
              ? order.fulfillmentType === 'pickup'
                ? 'Order Packed & Ready for Counter Pickup!'
                : 'Order Packed & Ready for Rider Pickup!'
              : order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING'
              ? 'Store Accepted & Preparing Order'
              : 'Order Placed with Store (Waiting for Store to Accept)'}
          </h2>

          {isCancelled ? (
            <div className="bg-white rounded-2xl p-4 border border-rose-200 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-[13.5px]">
                <span className="material-symbols-outlined text-[20px] text-rose-600">info</span>
                <span>Cancellation Reason</span>
              </div>
              <p className="text-[12.5px] text-rose-950 leading-relaxed font-semibold">
                "{order.cancellationReason || 'Store was unable to fulfill this order at this time.'}"
              </p>
              {order.pointsRedeemed > 0 && (
                <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200 text-[11.5px] text-emerald-800 font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                  <span>₹{order.pointsRedeemed} Zeebac Points refunded to your wallet.</span>
                </div>
              )}
              <button
                onClick={() => navigate('/explore')}
                className="w-full mt-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12.5px] cursor-pointer shadow-xs active:scale-95 transition-all text-center"
              >
                Explore Other Partner Stores
              </button>
            </div>
          ) : (
            <>
              {/* Live Progress Bar */}
              <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                {[
                  { label: 'Placed', active: true, icon: 'receipt_long' },
                  {
                    label: order.fulfillmentType === 'pickup' ? 'Packed' : 'Prepared',
                    active: [
                      'CONFIRMED',
                      'PREPARING',
                      'READY_FOR_PICKUP',
                      'RIDER_ASSIGNED',
                      'ARRIVED_AT_PICKUP',
                      'PICKED_UP',
                      'OUT_FOR_DELIVERY',
                      'ARRIVED_AT_CUSTOMER',
                      'DELIVERED',
                    ].includes(order.orderStatus),
                    icon: 'inventory_2',
                  },
                  {
                    label: order.fulfillmentType === 'pickup' ? 'Ready' : 'On the Way',
                    active:
                      order.fulfillmentType === 'pickup'
                        ? ['READY_FOR_PICKUP', 'DELIVERED'].includes(order.orderStatus)
                        : [
                            'READY_FOR_PICKUP',
                            'RIDER_ASSIGNED',
                            'ARRIVED_AT_PICKUP',
                            'PICKED_UP',
                            'OUT_FOR_DELIVERY',
                            'ARRIVED_AT_CUSTOMER',
                            'DELIVERED',
                          ].includes(order.orderStatus),
                    icon: order.fulfillmentType === 'pickup' ? 'store' : 'two_wheeler',
                  },
                  {
                    label: order.fulfillmentType === 'pickup' ? 'Collected' : 'Delivered',
                    active: isDelivered,
                    icon: 'check_circle',
                  },
                ].map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        step.active ? 'btn-primary-gradient text-white shadow-xs' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${step.active ? 'text-primary' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Decided Product Cashback Reward Banner */}
              <div
                className={`p-4 rounded-2xl border text-center space-y-1 transition-all ${
                  isDelivered
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-gradient-to-r from-purple-50 via-indigo-50/70 to-purple-100/60 border-purple-200'
                }`}
              >
                <p className="text-[11px] uppercase tracking-wider font-extrabold text-primary">
                  {isDelivered ? 'Points Credited to Zeebac Wallet' : 'Decided Product Cashback Reward'}
                </p>
                <p className="font-display font-black text-[24px] text-primary">
                  +{order.totalCashbackPoints} Zeebac Points
                </p>
                <p className="text-[11px] text-slate-600">
                  {isDelivered
                    ? 'Aapke Zeebac Wallet me 1 Point = ₹1 credit ho chuka hai. Kisi bhi partner store par use karein!'
                    : 'Order deliver hote hi ye points aapke wallet me automatic credit honge.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Online order not paid yet: let the customer reopen Razorpay */}
        {['ONLINE', 'RAZORPAY'].includes(order.paymentMethod) &&
          order.paymentStatus === 'PENDING' &&
          !isCancelled && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5 shadow-2xs">
              <p className="text-[12.5px] font-bold text-amber-900">
                Payment pending: your order is sent to the store once payment is received.
              </p>
              <button
                type="button"
                onClick={retryOnlinePayment}
                className="w-full py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-[12.5px] cursor-pointer active:scale-95 transition-all"
              >
                Complete Payment ₹{formatCurrency(order.finalPayableAmount)}
              </button>
            </div>
          )}

        {/* Store Pickup: Pay at Store */}
        {order.fulfillmentType === 'pickup' &&
          order.paymentMethod === 'CASH' &&
          !isDelivered &&
          !isCancelled &&
          Number(order.finalPayableAmount) > 0 && <PayAtStoreCard order={order} />}

        {/* Assigned Rider Card */}
        {isRiderAssigned && order.riderDetails?.name && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-[13px] text-slate-900">Assigned Delivery Rider</h3>
                  <p className="text-[10.5px] text-slate-500">Live Delivery Partner</p>
                </div>
              </div>

              {order.riderDetails.phone && (
                <a
                  href={`tel:${order.riderDetails.phone}`}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 text-primary hover:bg-purple-100 font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">call</span>
                  <span>Call Rider</span>
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Rider Name</p>
                <p className="font-black text-slate-800 text-[13px]">{order.riderDetails.name}</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Vehicle / Phone</p>
                <p className="font-bold text-slate-800 text-[12px]">
                  {order.riderDetails.vehicleNo || order.riderDetails.phone}
                </p>
              </div>
            </div>

            {/* Pickup Verification Badge */}
            {order.riderDetails?.pickupProofImage && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-[11.5px] text-emerald-900">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-emerald-600 text-[16px]">verified</span>
                  <span>Order Bill &amp; Package Inspected at Pickup</span>
                </div>
                <a
                  href={order.riderDetails.pickupProofImage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10.5px] text-emerald-700 font-extrabold underline flex items-center gap-0.5"
                >
                  <span>View Proof</span>
                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                </a>
              </div>
            )}

            {canTrackLiveMap && (
              <button
                type="button"
                onClick={() => setShowLiveMap(true)}
                className="w-full py-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs flex items-center justify-between shadow-xs active:scale-98 transition-all cursor-pointer"
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

            {order.riderDetails?.deliveryOtp && !isDelivered && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center space-y-0.5">
                <p className="text-[10.5px] font-bold text-amber-800 uppercase tracking-wider">
                  {order.fulfillmentType === 'pickup'
                    ? 'Show this Pickup Code at the Store Counter'
                    : 'Share OTP with Rider upon Delivery'}
                </p>
                <p className="font-mono font-black text-[22px] text-amber-900 tracking-widest">
                  {order.riderDetails.deliveryOtp}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pickup/Delivery OTP if generated before rider details are populated */}
        {(!isRiderAssigned || !order.riderDetails?.name) &&
          order.riderDetails?.deliveryOtp &&
          !isDelivered &&
          !isCancelled && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-0.5 shadow-2xs">
              <p className="text-[10.5px] font-bold text-amber-800 uppercase tracking-wider">
                {order.fulfillmentType === 'pickup'
                  ? 'Show this Pickup Code at the Store Counter'
                  : 'Share OTP with Rider upon Delivery'}
              </p>
              <p className="font-mono font-black text-[22px] text-amber-900 tracking-widest">
                {order.riderDetails.deliveryOtp}
              </p>
            </div>
          )}

        {/* Delivery Address & Store */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2 text-[12px]">
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">storefront</span>
            <div>
              <p className="font-black text-slate-900">{order.storeName}</p>
              <p className="text-slate-500 text-[11px]">{order.vendorZeebacId}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 pt-2 border-t border-slate-100">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">location_on</span>
            <div>
              <p className="font-bold text-slate-800">
                {order.fulfillmentType === 'pickup' ? 'Pickup Mode' : 'Delivery Address'}
              </p>
              <p className="text-slate-500 text-[11px]">
                {order.fulfillmentType === 'pickup'
                  ? 'Counter Pickup at Partner Store'
                  : formatAddress(order.deliveryAddress)}
              </p>
            </div>
          </div>
        </div>

        {/* Purchased Items List & Bill Summary */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5">
          <h3 className="font-display font-black text-[13.5px] text-slate-900 border-b border-slate-100 pb-2">
            Purchased Items ({order.items?.length || 0})
          </h3>
          <div className="divide-y divide-slate-100">
            {order.items?.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between gap-2.5 text-[12px]">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200/80 shrink-0 bg-slate-50"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-slate-900 truncate">{item.name}</p>
                      {item.variant && (
                        <span className="text-[9.5px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                          {item.variant}
                        </span>
                      )}
                      {item.sku && (
                        <span className="text-[9.5px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded">
                          SKU: {item.sku}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Qty: {item.quantity} × ₹{item.price}
                    </p>
                    <span className="inline-block text-[9.5px] font-extrabold text-primary bg-purple-50 px-1.5 py-0.2 rounded-md mt-0.5">
                      {item.cashbackPercentage}% Cashback = +{formatCurrency(item.cashbackPoints)} Zeebac Points
                    </span>
                  </div>
                </div>
                <span className="font-black text-slate-900 shrink-0">₹{item.price * item.quantity}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-1 text-[12px]">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span className="font-bold text-slate-900 font-mono">
                ₹{formatCurrency(order.itemTotal || order.totalAmount)}
              </span>
            </div>
            {order.deliveryCharge !== undefined && (
              <div className="flex justify-between text-slate-600">
                <span>Delivery Charge:</span>
                <span className="font-mono text-slate-900 font-bold">
                  {order.deliveryCharge === 0 ? 'FREE' : `₹${formatCurrency(order.deliveryCharge)}`}
                </span>
              </div>
            )}
            {order.packagingCharge !== undefined && order.packagingCharge > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Packaging &amp; Handling:</span>
                <span className="font-mono text-slate-900 font-bold">₹{formatCurrency(order.packagingCharge)}</span>
              </div>
            )}
            {order.taxAmount !== undefined && order.taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Taxes &amp; GST ({order.taxPercentage || 5}%):</span>
                <span className="font-mono text-slate-900 font-bold">₹{formatCurrency(order.taxAmount)}</span>
              </div>
            )}
            {order.tipAmount !== undefined && order.tipAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Delivery Partner Tip:</span>
                <span className="font-mono text-purple-700 font-bold">₹{formatCurrency(order.tipAmount)}</span>
              </div>
            )}
            {order.pointsRedeemed > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Zeebac Points Redeemed:</span>
                <span className="font-mono">-₹{formatCurrency(order.pointsRedeemed)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13.5px] font-black text-slate-900 pt-1 border-t border-slate-100">
              <span>
                {order.paymentMethod === 'CASH'
                  ? 'Pay on Delivery (Cash/UPI):'
                  : order.paymentMethod === 'ONLINE'
                  ? 'Total Paid (Online):'
                  : order.paymentMethod === 'ZEEBAC_POINTS'
                  ? 'Total Paid (Points):'
                  : `Total Paid (${order.paymentMethod}):`}
              </span>
              <span className="text-primary font-mono text-[15px]">₹{formatCurrency(order.finalPayableAmount)}</span>
            </div>
            {order.paymentMethod === 'CASH' && order.paymentStatus !== 'PAID' && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 text-[11.5px]">
                <span className="material-symbols-outlined text-amber-700 text-[18px]">payments</span>
                <span>
                  Please keep <strong>₹{formatCurrency(order.finalPayableAmount)}</strong> ready in cash or pay via UPI
                  QR to delivery rider upon arrival.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => navigate('/orders')}
            className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[13px] shadow-md shadow-primary/25 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">local_shipping</span>
            <span>View All Online Orders</span>
          </button>
          <button
            onClick={() => navigate('/wallet')}
            className="w-full py-3 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[13px] cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
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

      {showLiveMap && <LiveOrderTrackingModal order={order} onClose={() => setShowLiveMap(false)} />}
      <BottomNavBar />
    </div>
  );
}
