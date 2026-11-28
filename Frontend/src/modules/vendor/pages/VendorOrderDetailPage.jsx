import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { OrderAPI } from '../../../services/api';
import { getSocket } from '../../../services/socket';
import {
  formatOrderTime,
  playNotificationChime,
  playOrderDeliveredChime,
  playRiderArrivedBell,
  playRiderDeclinedTone,
  speakVoice,
} from '../../../utils/voiceUtils';
import { formatDisplayAddress } from '../../../utils/addressUtils';
import LiveOrderTrackingModal from '../../../components/common/LiveOrderTrackingModal';
import DarkStorePickerModal from '../../../components/vendor/DarkStorePickerModal';
import StoreBillingModal from '../../../components/vendor/StoreBillingModal';

export default function VendorOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [order, setOrder] = useState(() => location.state?.initialOrder || null);
  const [isLoading, setIsLoading] = useState(!location.state?.initialOrder);
  const [loadError, setLoadError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Action modals
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [pickingModalOrder, setPickingModalOrder] = useState(null);
  const [billingOrder, setBillingOrder] = useState(null);
  const [pickupHandover, setPickupHandover] = useState(null);
  const [pickupCode, setPickupCode] = useState('');
  const [pickupCodeError, setPickupCodeError] = useState('');
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  // Prep time modal
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [selectedPrepMinutes, setSelectedPrepMinutes] = useState(15);
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');

  // Reject order modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Item out of stock');
  const [customRejectReason, setCustomRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Rate rider modal
  const [rateRiderOpen, setRateRiderOpen] = useState(false);
  const [riderStarRating, setRiderStarRating] = useState(5);
  const [riderComment, setRiderComment] = useState('');
  const [riderSelectedTags, setRiderSelectedTags] = useState([]);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Fetch order by orderId so direct URL navigation and page refresh always work
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

  // Real-time Socket.IO updates for this order
  useEffect(() => {
    const activeId = order?.orderId || orderId;
    if (!activeId) return;

    let socket;
    try {
      socket = getSocket();
    } catch (_) {}

    if (!socket) return;

    const matchesOrder = (id) => id === activeId || id === order?._id;

    const handleOrderPaid = (data) => {
      if (!matchesOrder(data?.orderId)) return;
      setOrder((prev) => (prev ? { ...prev, paymentStatus: 'PAID', orderStatus: 'CONFIRMED' } : prev));
    };

    const handleRiderAssigned = (data) => {
      if (!matchesOrder(data?.orderId)) return;
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              orderStatus: data.orderStatus || 'RIDER_ASSIGNED',
              riderDetails: data.rider || {
                ...(prev.riderDetails || {}),
                riderId: data.riderId || prev.riderDetails?.riderId,
                name: data.riderName || prev.riderDetails?.name,
                phone: data.riderPhone || prev.riderDetails?.phone,
                vehicleNo: data.vehicleNo || prev.riderDetails?.vehicleNo,
              },
            }
          : prev
      );
      playNotificationChime('incoming');
      speakVoice(`Delivery partner ${data.rider?.name || data.riderName || 'Rider'} assigned to order!`, 300, 'en-IN');
    };

    const handleRiderDeclined = (data) => {
      if (!matchesOrder(data?.orderId)) return;
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              riderRejections: [
                ...(prev.riderRejections || []),
                {
                  riderName: data.riderName,
                  riderPhone: data.riderPhone,
                  reason: data.reason,
                  rejectedAt: data.timestamp || new Date(),
                },
              ],
            }
          : prev
      );
      playRiderDeclinedTone({ riderName: data.riderName, reason: data.reason });
    };

    const handleOrderCancelled = (data) => {
      if (!matchesOrder(data?.orderId)) return;
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              orderStatus: 'CANCELLED',
              cancellationReason: data.cancellationReason || prev.cancellationReason,
              cancelledBy: data.cancelledBy || 'VENDOR',
            }
          : prev
      );
    };

    const handleLiveStatus = (data) => {
      if (!matchesOrder(data?.orderId)) return;
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              orderStatus: data.orderStatus || prev.orderStatus,
              pickupOtp: data.pickupOtp || prev.pickupOtp,
              riderDetails: {
                ...prev.riderDetails,
                ...(data.riderDetails || {}),
                name: data.riderName || prev.riderDetails?.name,
                phone: data.riderPhone || prev.riderDetails?.phone,
                vehicleNo: data.vehicleNo || prev.riderDetails?.vehicleNo,
                pickupOtp: data.pickupOtp || prev.riderDetails?.pickupOtp,
                currentLocation: data.currentLocation || prev.riderDetails?.currentLocation,
              },
            }
          : prev
      );

      if (data.orderStatus === 'ARRIVED_AT_PICKUP') {
        playRiderArrivedBell({ riderName: data.riderName, pickupOtp: data.pickupOtp });
      } else if (data.orderStatus === 'OUT_FOR_DELIVERY') {
        playNotificationChime('incoming');
      } else if (data.orderStatus === 'DELIVERED') {
        playOrderDeliveredChime();
      }
    };

    const handleRiderArrived = (data) => handleLiveStatus({ ...data, orderStatus: 'ARRIVED_AT_PICKUP' });
    const handleOutForDelivery = (data) => handleLiveStatus({ ...data, orderStatus: 'OUT_FOR_DELIVERY' });
    const handleOrderDelivered = (data) => handleLiveStatus({ ...data, orderStatus: 'DELIVERED' });

    socket.on('order:paid', handleOrderPaid);
    socket.on('order:rider_assigned', handleRiderAssigned);
    socket.on('order:status_update', handleLiveStatus);
    socket.on('delivery:rider_arrived_store', handleRiderArrived);
    socket.on('order:out_for_delivery', handleOutForDelivery);
    socket.on('order:delivered', handleOrderDelivered);
    socket.on('delivery:rider_declined', handleRiderDeclined);
    socket.on('order:cancelled', handleOrderCancelled);

    return () => {
      socket.off('order:paid', handleOrderPaid);
      socket.off('order:rider_assigned', handleRiderAssigned);
      socket.off('order:status_update', handleLiveStatus);
      socket.off('delivery:rider_arrived_store', handleRiderArrived);
      socket.off('order:out_for_delivery', handleOutForDelivery);
      socket.off('order:delivered', handleOrderDelivered);
      socket.off('delivery:rider_declined', handleRiderDeclined);
      socket.off('order:cancelled', handleOrderCancelled);
    };
  }, [order?.orderId, order?._id, orderId]);

  const handleOrderStatusUpdate = async (newStatus, prepMinutes = null, { extra = {}, silent = false } = {}) => {
    if (!order?.orderId) return { ok: false, message: 'Missing order ID' };
    setIsProcessing(true);
    try {
      const payload = { status: newStatus, ...extra };
      if (prepMinutes) payload.prepTimeMinutes = Number(prepMinutes);
      const res = await OrderAPI.updateOrderStatus(order.orderId, payload);
      if (res.success) {
        setOrder((prev) => ({ ...prev, ...res.data.order }));
        playNotificationChime('incoming');
        if (newStatus === 'DELIVERED') {
          speakVoice('Order marked delivered. Cashback points paid to customer.');
        } else if (newStatus === 'PREPARING' || newStatus === 'CONFIRMED') {
          speakVoice('Order accepted and preparing.');
        } else if (newStatus === 'READY_FOR_PICKUP') {
          speakVoice('Order is packed and ready for pickup.');
        }
        return { ok: true };
      }
      return { ok: false, message: res.message || 'Failed to update order status' };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update order status';
      if (!silent) alert(message);
      return { ok: false, message };
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectOrderSubmit = async (e) => {
    e?.preventDefault();
    if (!order?.orderId) return;
    const finalReason =
      rejectReason === 'Other'
        ? customRejectReason.trim() || 'Store unable to fulfill order at this time'
        : rejectReason;

    setIsRejecting(true);
    try {
      const res = await OrderAPI.updateOrderStatus(order.orderId, {
        status: 'CANCELLED',
        cancellationReason: finalReason,
      });
      if (res.success) {
        setOrder((prev) => ({
          ...prev,
          orderStatus: 'CANCELLED',
          cancellationReason: finalReason,
          cancelledBy: 'VENDOR',
        }));
        playNotificationChime('incoming');
        speakVoice('Order cancelled.');
        setRejectModalOpen(false);
        setRejectReason('Item out of stock');
        setCustomRejectReason('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject order');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleRateRiderSubmit = async (e) => {
    e?.preventDefault();
    if (!order?.orderId) return;
    setIsSubmittingRating(true);
    try {
      const res = await OrderAPI.rateRiderByVendor(order.orderId, {
        rating: riderStarRating,
        comment: riderComment.trim(),
        tags: riderSelectedTags,
      });
      if (res.success) {
        setOrder((prev) => ({
          ...prev,
          riderFeedbackFromVendor: res.data?.riderFeedbackFromVendor || {
            rating: riderStarRating,
            comment: riderComment.trim(),
            tags: riderSelectedTags,
            ratedAt: new Date(),
          },
        }));
        playNotificationChime('success');
        speakVoice('Delivery partner rated. Thank you!');
        setRateRiderOpen(false);
        setRiderStarRating(5);
        setRiderComment('');
        setRiderSelectedTags([]);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit rider rating');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto animate-pulse">
        <div className="h-10 bg-white rounded-2xl border border-slate-100 w-64" />
        <div className="h-36 bg-white rounded-2xl border border-slate-100" />
        <div className="h-64 bg-white rounded-2xl border border-slate-100" />
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-4 mt-8 bg-white rounded-3xl border border-slate-100 shadow-xs">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[32px]">receipt_long</span>
        </div>
        <h2 className="font-display font-black text-[18px] text-slate-900">Order not found</h2>
        <p className="text-[13px] text-slate-500">{loadError || 'Unable to locate this order.'}</p>
        <button
          type="button"
          onClick={() => navigate('/vendor/orders')}
          className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs cursor-pointer"
        >
          Back to All Orders
        </button>
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
  const pickupOtp =
    order.pickupOtp ||
    order.riderDetails?.pickupOtp ||
    String(order.orderId || '').replace(/\D/g, '').slice(-4) ||
    '1234';

  const steps = [
    { label: 'Placed', icon: 'receipt' },
    { label: 'Preparing', icon: 'soup_kitchen' },
    { label: 'Packed', icon: 'inventory_2' },
    { label: 'Rider', icon: 'sports_motorsports' },
    { label: 'On the Way', icon: 'two_wheeler' },
    { label: 'Delivered', icon: 'check_circle' },
  ];
  const stageOf = {
    PLACED: 0,
    CONFIRMED: 1,
    PREPARING: 1,
    READY_FOR_PICKUP: 2,
    RIDER_ASSIGNED: 3,
    ARRIVED_AT_PICKUP: 3,
    PICKED_UP: 4,
    OUT_FOR_DELIVERY: 4,
    ARRIVED_AT_CUSTOMER: 4,
    DELIVERED: 5,
  };
  const stageDetail = {
    PLACED: 'New order, waiting for you to accept',
    CONFIRMED: 'Accepted',
    PREPARING: 'You are preparing the order',
    READY_FOR_PICKUP: order.riderDetails?.name
      ? 'Packed, rider is on the way to your store'
      : 'Packed, finding a delivery partner',
    RIDER_ASSIGNED: `${order.riderDetails?.name || 'Rider'} accepted and is coming to your store`,
    ARRIVED_AT_PICKUP: `${order.riderDetails?.name || 'Rider'} is at your store`,
    PICKED_UP: `${order.riderDetails?.name || 'Rider'} picked up the order`,
    OUT_FOR_DELIVERY: `${order.riderDetails?.name || 'Rider'} is on the way to the customer`,
    ARRIVED_AT_CUSTOMER: `${order.riderDetails?.name || 'Rider'} reached the customer`,
    DELIVERED: 'Delivered to the customer',
    FAILED_DELIVERY: 'Delivery failed',
  };
  const currIdx = stageOf[order.orderStatus] ?? -1;

  return (
    <div className="animate-reveal text-left w-full max-w-5xl mx-auto px-3 sm:px-5 py-4 space-y-4 pb-24 lg:pb-8">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/vendor/orders')}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            title="Back to All Orders"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-black text-[18px] sm:text-[20px] text-slate-900">
                Order #{order.orderId}
              </h1>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(order.orderId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-[10.5px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold cursor-pointer"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isDelivered
                    ? 'bg-emerald-100 text-emerald-800'
                    : isCancelled
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                {order.orderStatus}
              </span>
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {order.createdAt ? formatOrderTime(order.createdAt) : ''} •{' '}
              {order.fulfillmentType === 'pickup' ? 'Counter Pickup' : 'Rider Delivery'} •{' '}
              {order.paymentMethod} ({order.paymentStatus})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Order Total</span>
            <span className="font-mono font-black text-[18px] text-slate-900">
              ₹{order.finalPayableAmount ?? order.totalAmount}
            </span>
          </div>
        </div>
      </div>

      {/* Store Pickup OTP Card */}
      {!isDelivered && !isCancelled && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">key</span>
            </div>
            <div>
              <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider block">
                Store Pickup OTP (Rider Handover Code)
              </span>
              <p className="text-2xl font-mono font-black text-amber-950 tracking-widest">{pickupOtp}</p>
            </div>
          </div>
          <p className="text-[12px] text-amber-900 font-medium max-w-sm">
            Rider jab aapke store pahuchega, ye 4-digit code rider ko batayein taaki parcel handover verify ho sake.
          </p>
        </div>
      )}

      {/* Rider Arrived Banner */}
      {order.orderStatus === 'ARRIVED_AT_PICKUP' && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[26px]">sports_motorsports</span>
            <div>
              <p className="font-extrabold text-[14px]">
                🚨 Delivery Partner {order.riderDetails?.name || 'Partner'} has reached your store!
              </p>
              <p className="text-[11.5px] text-amber-100">
                Match OTP: <strong className="font-mono text-white">{pickupOtp}</strong> and handover parcel.
              </p>
            </div>
          </div>
          {order.riderDetails?.phone && (
            <a
              href={`tel:${order.riderDetails.phone}`}
              className="px-3.5 py-2 rounded-xl bg-white text-orange-900 font-bold text-xs flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">call</span>
              <span>Call Rider</span>
            </a>
          )}
        </div>
      )}

      {/* Customer & Cashback Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-2 text-[12.5px] shadow-2xs">
          <p className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider">Customer Information</p>
          <p className="font-black text-slate-900 text-[15px]">{order.customerName || 'Customer'}</p>
          <p className="text-slate-600 font-mono text-[12.5px]">📞 {order.customerPhone || 'N/A'}</p>
          <div className="flex items-start gap-1.5 pt-1 text-slate-600">
            <span className="material-symbols-outlined text-primary text-[17px] shrink-0 mt-0.5">location_on</span>
            <span>{formatDisplayAddress(order.deliveryAddress, 'Store Counter Pickup')}</span>
          </div>
          {order.deliverySchedule?.deliveryType === 'SCHEDULED' && (
            <p className="text-[11.5px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg inline-block mt-1">
              📅 Scheduled: {order.deliverySchedule.scheduledDate} • {order.deliverySchedule.scheduledSlot}
            </p>
          )}
        </div>

        <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-4 space-y-2.5 text-[12.5px] shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-black uppercase text-purple-800 tracking-wider">
              Cashback &amp; Points Details
            </p>
            <span
              className={`text-[10.5px] font-black px-2.5 py-0.5 rounded-full ${
                isCancelled
                  ? 'bg-rose-100 text-rose-700'
                  : order.cashbackSettled
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isCancelled ? 'Cancelled' : order.cashbackSettled ? 'Cashback Settled' : 'Pending Delivery'}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Decided Customer Cashback:</span>
              <span className="font-mono font-black text-purple-800">
                +{order.totalCashbackPoints || 0} Pts (₹{order.totalCashbackPoints || 0})
              </span>
            </div>
            {order.cashbackIssued !== null && order.cashbackIssued !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-600">Coins Funded by Store:</span>
                <span className="font-mono font-bold text-emerald-700">{order.cashbackIssued} Pts</span>
              </div>
            )}
            {Number(order.cashbackShortfall) > 0 && (
              <div className="flex justify-between text-rose-700 font-bold">
                <span>Cashback Pool Shortfall:</span>
                <span className="font-mono">{order.cashbackShortfall} Pts</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">Customer Points Redeemed:</span>
              <span className="font-mono font-bold text-emerald-700">
                {Number(order.pointsRedeemed) > 0
                  ? `-₹${order.pointsRedeemed} (${order.pointsRedeemed} Pts)`
                  : '0 Pts'}
              </span>
            </div>
            {Number(order.redemptionCoinsCredited) > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Earned Coins Credited to Store:</span>
                <span className="font-mono font-bold text-purple-900">+{order.redemptionCoinsCredited} Coins</span>
              </div>
            )}
            {order.settledAt && (
              <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
                <span>Settled At:</span>
                <span>{formatOrderTime(order.settledAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delivery Lifecycle Stepper */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-2.5">
        <span className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider block">
          Delivery Lifecycle Status
        </span>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {steps.map((step, idx) => {
            const isCurrent = currIdx === idx;
            const isDone = currIdx > idx;
            return (
              <div
                key={step.label}
                className={`p-2 rounded-xl flex flex-col items-center gap-0.5 ${
                  isCurrent
                    ? 'bg-purple-700 text-white font-bold shadow-xs'
                    : isDone
                    ? 'bg-emerald-100 text-emerald-900 font-semibold'
                    : 'bg-slate-50 text-slate-400 border border-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">{isDone ? 'check' : step.icon}</span>
                <span className="leading-tight text-[10.5px]">{step.label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isDelivered ? 'bg-emerald-500' : 'bg-purple-600 animate-pulse'}`} />
          {stageDetail[order.orderStatus] || order.orderStatus}
        </p>
      </div>

      {/* Live GPS Tracking Button */}
      {['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'].includes(
        order.orderStatus
      ) && (
        <button
          type="button"
          onClick={() => setTrackingOrder(order)}
          className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-between shadow-xs cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">map</span>
            <span>Track Rider Live Location on Map</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] bg-white/20 px-2.5 py-0.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Live GPS</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </span>
        </button>
      )}

      {/* Customer Notes */}
      {order.orderNotes && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 text-[12.5px] space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <span className="material-symbols-outlined text-amber-700 text-[18px]">edit_note</span>
            <span>Customer Special Instructions:</span>
          </div>
          <p className="text-amber-950 font-medium bg-white/90 p-2.5 rounded-xl border border-amber-200">
            "{order.orderNotes}"
          </p>
        </div>
      )}

      {/* Ordered Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
            Ordered Products ({order.items?.length || 0})
          </p>
          {order.toteNumber && (
            <span className="text-[10.5px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md">
              Tote: {order.toteNumber}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10.5px] font-black uppercase text-slate-400 bg-slate-50/40">
                <th className="py-2.5 px-4">Product &amp; Bin</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Price</th>
                <th className="py-2.5 px-3 text-right">Cashback</th>
                <th className="py-2.5 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items?.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200/80 shrink-0 bg-slate-50"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800">{item.name}</span>
                          {item.variant && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.2 rounded">
                              {item.variant}
                            </span>
                          )}
                          {item.picked && (
                            <span className="text-[9.5px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                              ✓ Picked
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10.5px] font-mono font-bold text-purple-900 bg-purple-100/80 px-1.5 py-0.2 rounded">
                            Bin: {item.binCode || item.warehouseLocation?.binCode || 'C01-S01-B01'}
                          </span>
                          {item.sku && (
                            <span className="text-[10px] font-mono font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                              SKU: {item.sku}
                            </span>
                          )}
                          {item.barcode && (
                            <span className="text-[10px] font-mono text-slate-500">EAN: {item.barcode}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">× {item.quantity}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-600">₹{item.price}</td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      {item.cashbackPercentage || 0}% (+{item.cashbackPoints || 0} pts)
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                    ₹{item.price * item.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(order.orderStatus) && (
          <div className="p-3 bg-slate-50/60 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPickingModalOrder(order)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white font-display font-black text-xs flex items-center justify-between shadow-xs cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px]">shelves</span>
                <span>
                  {order.packingStatus === 'READY_FOR_PICKUP'
                    ? '✓ Order Picked & Packed (View Station)'
                    : order.packingStatus === 'PICKING_IN_PROGRESS'
                    ? 'Continue Picking (In Progress)'
                    : 'Launch Picker Mode (Dark Store Station)'}
                </span>
              </span>
              <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                {order.items?.filter((i) => i.picked).length || 0}/{order.items?.length || 0} Picked →
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Bill & Seller Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12.5px]">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-1.5 shadow-2xs">
          <p className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider">Customer Bill Breakdown</p>
          <div className="flex justify-between text-slate-600">
            <span>Items Subtotal:</span>
            <span className="font-mono font-bold text-slate-900">₹{order.itemTotal || order.totalAmount}</span>
          </div>
          {Number(order.packagingCharge) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Packaging Charge:</span>
              <span className="font-mono">₹{order.packagingCharge}</span>
            </div>
          )}
          {order.deliveryCharge !== undefined && (
            <div className="flex justify-between text-slate-600">
              <span>Delivery Charge:</span>
              <span className="font-mono">{order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge}`}</span>
            </div>
          )}
          {Number(order.taxAmount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Taxes &amp; GST ({order.taxPercentage || 5}%):</span>
              <span className="font-mono">₹{order.taxAmount}</span>
            </div>
          )}
          {Number(order.tipAmount) > 0 && (
            <div className="flex justify-between text-purple-700 font-bold">
              <span>Rider Tip:</span>
              <span className="font-mono">₹{order.tipAmount}</span>
            </div>
          )}
          {Number(order.pointsRedeemed) > 0 && (
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>Points Redeemed:</span>
              <span className="font-mono">-₹{order.pointsRedeemed}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-slate-200 font-black text-slate-900 text-[13.5px]">
            <span>Final Payable ({order.paymentMethod}):</span>
            <span className="font-mono text-primary">₹{order.finalPayableAmount ?? order.totalAmount}</span>
          </div>
        </div>

        {order.financials && (
          <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-black uppercase text-emerald-800 tracking-wider">
                Seller Settlement Summary
              </p>
              <span className="text-[10px] font-bold bg-white border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">
                {order.financials.settlementStatus || 'PENDING'}
              </span>
            </div>
            {order.financials.sellerGross !== undefined && (
              <div className="flex justify-between text-slate-600">
                <span>Seller Gross (Items + Packaging):</span>
                <span className="font-mono font-bold text-slate-900">₹{order.financials.sellerGross}</span>
              </div>
            )}
            {Number(order.financials.commissionAmount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Platform Commission ({order.financials.commissionPercent || 0}%):</span>
                <span className="font-mono text-rose-700">-₹{order.financials.commissionAmount}</span>
              </div>
            )}
            {Number(order.financials.gatewayFee) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Gateway Fee:</span>
                <span className="font-mono text-rose-700">-₹{order.financials.gatewayFee}</span>
              </div>
            )}
            {order.financials.sellerPayable !== undefined && (
              <div className="flex justify-between pt-2 border-t border-emerald-200 font-black text-emerald-900 text-[13.5px]">
                <span>Net Seller Payable:</span>
                <span className="font-mono">₹{order.financials.sellerPayable}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assigned Rider Info */}
      {isRiderAssigned && order.riderDetails?.name && (
        <div className="bg-purple-50/70 border border-purple-100 rounded-2xl p-4 space-y-2 text-[12.5px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[22px]">two_wheeler</span>
              <div>
                <p className="font-bold text-slate-900">
                  {order.riderDetails.name}
                  <span className="ml-1.5 text-[10px] font-semibold text-purple-700 bg-white border border-purple-200 px-1.5 py-0.5 rounded">
                    ZeeBac Rider
                  </span>
                </p>
                <p className="text-[11.5px] text-slate-600">
                  📞 {order.riderDetails.phone || 'N/A'} · 🛵 {order.riderDetails.vehicleNo || 'Vehicle N/A'}
                </p>
              </div>
            </div>
            {order.riderDetails.phone && (
              <a
                href={`tel:${order.riderDetails.phone}`}
                className="px-3 py-1.5 rounded-lg bg-white border border-purple-200 text-primary font-bold text-[11.5px]"
              >
                Call
              </a>
            )}
          </div>
          {order.riderDetails.pickupProofImage && (
            <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-emerald-800 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                <span>Pickup Proof (Bill/Bag) Attached</span>
              </span>
              <button
                type="button"
                onClick={() => setViewReceiptUrl(order.riderDetails.pickupProofImage)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[13px]">visibility</span>
                <span>View Photo</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Rider Rejections */}
      {order.riderRejections && order.riderRejections.length > 0 && !isDelivered && !isCancelled && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-[12px] text-amber-950 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
            <span>Delivery Rider Alert ({order.riderRejections.length} Declined):</span>
          </div>
          {order.riderRejections.slice(-2).map((rej, rIdx) => (
            <p key={rIdx} className="text-[11.5px] text-amber-900">
              ⚠️ <strong>{rej.riderName || 'Rider'}</strong> declined: "{rej.reason || 'Not available'}"
            </p>
          ))}
        </div>
      )}

      {/* Cancelled Banner */}
      {isCancelled && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-[12px] text-rose-950">
          <p className="font-bold text-rose-800 flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">cancel</span>
            <span>Order Cancelled</span>
          </p>
          <p className="text-[11.5px] text-rose-700">
            Reason: <strong>{order.cancellationReason || 'Cancelled by store'}</strong>
          </p>
        </div>
      )}

      {/* Action Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center gap-2.5">
        {order.orderStatus === 'PLACED' && (
          <>
            <button
              disabled={isProcessing}
              onClick={() => {
                setSelectedPrepMinutes(order.estimatedPrepTime || 15);
                setPrepModalOpen(true);
              }}
              className="py-2.5 px-4 rounded-xl btn-primary-gradient text-white font-bold text-[12.5px] flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Accept &amp; Set Prep Time</span>
            </button>
            <button
              disabled={isProcessing}
              onClick={() => {
                if (order.orderNotes) setRejectReason('Cannot fulfill special customer instructions');
                setRejectModalOpen(true);
              }}
              className="py-2.5 px-4 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[12.5px] flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              <span>Reject Order</span>
            </button>
          </>
        )}

        {(order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING') && (
          <button
            disabled={isProcessing}
            onClick={() => handleOrderStatusUpdate('READY_FOR_PICKUP')}
            className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[12.5px] flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">inventory</span>
            <span>Mark Ready for Pickup</span>
          </button>
        )}

        {order.orderStatus === 'READY_FOR_PICKUP' && order.fulfillmentType === 'pickup' && (
          <>
            {order.paymentStatus !== 'PAID' && (
              <button
                disabled={isProcessing}
                onClick={() => setBillingOrder(order)}
                className="py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[12.5px] flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                <span>
                  {order.storeBill?.status === 'GENERATED' ? 'Bill Generated · Collect' : 'Generate Bill'} ₹
                  {Number(order.finalPayableAmount || 0).toFixed(2)}
                </span>
              </button>
            )}
            <button
              disabled={isProcessing || order.paymentStatus !== 'PAID'}
              title={order.paymentStatus !== 'PAID' ? 'Confirm payment first' : undefined}
              onClick={() => {
                setPickupHandover({
                  orderId: order.orderId,
                  customerName: order.customerName || order.customerId?.name || 'Customer',
                });
                setPickupCode('');
                setPickupCodeError('');
              }}
              className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12.5px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>Handover to Customer (Enter Pickup Code)</span>
            </button>
          </>
        )}

        {isDelivered && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-100/70 px-3 py-1.5 rounded-xl">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>Order Completed • Points Paid to Customer</span>
          </span>
        )}

        {isDelivered &&
          order.riderDetails?.name &&
          (order.riderFeedbackFromVendor ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-[12px] font-bold">
              <span className="material-symbols-outlined text-amber-500 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
              <span>Rated Rider: {order.riderFeedbackFromVendor.rating}/5 ★</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setRiderStarRating(5);
                setRiderComment('');
                setRiderSelectedTags([]);
                setRateRiderOpen(true);
              }}
              className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[12px] flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
              <span>Rate Rider</span>
            </button>
          ))}

        <button
          type="button"
          onClick={() => navigate('/vendor/orders')}
          className="ml-auto py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] cursor-pointer"
        >
          All Orders
        </button>
      </div>

      {/* Prep Time Modal */}
      {prepModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-[22px]">timer</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">Kitchen Prep Time</h3>
              </div>
              <button
                type="button"
                onClick={() => setPrepModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[10, 15, 20, 25, 30, 45].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setSelectedPrepMinutes(mins);
                    setCustomPrepMinutes('');
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black cursor-pointer ${
                    selectedPrepMinutes === mins && !customPrepMinutes
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {mins} mins
                </button>
              ))}
            </div>
            <input
              type="number"
              min="5"
              max="120"
              value={customPrepMinutes}
              onChange={(e) => setCustomPrepMinutes(e.target.value)}
              placeholder="Or custom minutes (e.g. 35)"
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrepModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  const mins = customPrepMinutes ? parseInt(customPrepMinutes, 10) : selectedPrepMinutes;
                  handleOrderStatusUpdate('PREPARING', mins || 15);
                  setPrepModalOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12px] cursor-pointer"
              >
                Confirm &amp; Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-display font-black text-[15px] text-slate-900">Reject Order #{order.orderId}</h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="space-y-2">
              {[
                'Cannot fulfill special customer instructions',
                'Item out of stock',
                'Store closed / closing soon',
                'Kitchen overloaded / cannot prepare in time',
                'Delivery address outside serviceable area',
                'Other',
              ].map((reasonOption) => (
                <label
                  key={reasonOption}
                  onClick={() => setRejectReason(reasonOption)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-[12px] font-semibold cursor-pointer ${
                    rejectReason === reasonOption
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-slate-50/70 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="rejectReason"
                    checked={rejectReason === reasonOption}
                    onChange={() => setRejectReason(reasonOption)}
                    className="accent-rose-600"
                  />
                  <span>{reasonOption}</span>
                </label>
              ))}
              {rejectReason === 'Other' && (
                <textarea
                  rows={2}
                  value={customRejectReason}
                  onChange={(e) => setCustomRejectReason(e.target.value)}
                  placeholder="Specify exact reason..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none resize-none"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={handleRejectOrderSubmit}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12px] cursor-pointer"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate Rider Modal */}
      {rateRiderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-display font-black text-[15px] text-slate-900">Rate Delivery Rider</h3>
              <button
                type="button"
                onClick={() => setRateRiderOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRiderStarRating(star)}
                  className="p-1 hover:scale-125 transition-transform cursor-pointer"
                >
                  <span
                    className={`material-symbols-outlined text-[28px] ${
                      star <= riderStarRating ? 'text-amber-400' : 'text-slate-200'
                    }`}
                    style={{ fontVariationSettings: star <= riderStarRating ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                '⚡ Fast Pickup',
                '👍 Polite & Professional',
                '🎒 Had Thermal Bag',
                '📦 Handled Food Carefully',
                '⏳ Delayed Arrival',
              ].map((tag) => {
                const isSelected = riderSelectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setRiderSelectedTags((prev) =>
                        isSelected ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${
                      isSelected ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <textarea
              rows={2}
              value={riderComment}
              onChange={(e) => setRiderComment(e.target.value)}
              placeholder="Optional comment..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRateRiderOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={isSubmittingRating}
                onClick={handleRateRiderSubmit}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[12px] cursor-pointer"
              >
                {isSubmittingRating ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {viewReceiptUrl && (
        <div
          onClick={() => setViewReceiptUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden text-left"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h4 className="font-display font-black text-[14px] text-slate-900">Verified Bill / Pickup Proof</h4>
              <button
                type="button"
                onClick={() => setViewReceiptUrl(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-3 bg-slate-950 flex items-center justify-center min-h-[280px] max-h-[75vh]">
              <img src={viewReceiptUrl} alt="Pickup Proof" className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* Live GPS Map Modal */}
      {trackingOrder && <LiveOrderTrackingModal order={trackingOrder} onClose={() => setTrackingOrder(null)} />}

      {/* Dark Store Picker Modal */}
      {pickingModalOrder && (
        <DarkStorePickerModal
          isOpen={Boolean(pickingModalOrder)}
          order={pickingModalOrder}
          onClose={() => setPickingModalOrder(null)}
          onOrderUpdated={(updated) => {
            setOrder((prev) => ({ ...prev, ...updated }));
            setPickingModalOrder((prev) => (prev ? { ...prev, ...updated } : prev));
          }}
        />
      )}

      {/* Store Billing Modal */}
      {billingOrder && (
        <StoreBillingModal
          order={billingOrder}
          onOrderUpdated={(updated) => {
            if (!updated) return;
            setOrder((prev) => ({ ...prev, ...updated }));
            setBillingOrder((prev) => (prev ? { ...prev, ...updated } : prev));
          }}
          onClose={(result) => {
            setBillingOrder(null);
            if (result?.paid) {
              playNotificationChime('incoming');
              speakVoice('Payment received. Now hand over the order with the pickup code.');
            }
          }}
        />
      )}

      {/* Store Pickup Handover OTP Modal */}
      {pickupHandover && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal"
          onClick={() => !isProcessing && setPickupHandover(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!/^\d{4}$/.test(pickupCode)) {
                setPickupCodeError("Enter the 4-digit code from the customer's app.");
                return;
              }
              const r = await handleOrderStatusUpdate('DELIVERED', null, {
                extra: { deliveryOtp: pickupCode },
                silent: true,
              });
              if (r?.ok) setPickupHandover(null);
              else setPickupCodeError(r?.message || 'Could not hand over the order.');
            }}
            className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-black text-[16px] text-slate-900">Hand Over Pickup Order</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Order #{pickupHandover.orderId} · {pickupHandover.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickupHandover(null)}
                disabled={isProcessing}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={4}
              value={pickupCode}
              onChange={(e) => {
                setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPickupCodeError('');
              }}
              placeholder="• • • •"
              className="w-full text-center tracking-[0.6em] font-mono font-black text-2xl py-3 rounded-2xl border-2 border-slate-200 focus:border-purple-600 focus:outline-none"
            />
            {pickupCodeError && <p className="text-[12px] font-bold text-rose-600">{pickupCodeError}</p>}
            <button
              type="submit"
              disabled={isProcessing || pickupCode.length !== 4}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[13px] cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? 'Verifying…' : 'Verify & Hand Over'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
