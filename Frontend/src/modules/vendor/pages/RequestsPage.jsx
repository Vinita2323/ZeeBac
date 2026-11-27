import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, OrderAPI } from '../../../services/api';
import { getSocket } from '../../../services/socket';
import useLanguageStore from '../../../store/useLanguageStore';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import {
  playNotificationChime,
  speakVoice,
  playStoreNewOrderAlarm,
  playRiderDeclinedTone,
  playRiderArrivedBell,
  playOrderOutForDeliveryChime,
  playOrderDeliveredChime,
  formatOrderTime,
} from '../../../utils/voiceUtils';
import LiveOrderTrackingModal from '../../../components/common/LiveOrderTrackingModal';
import DarkStorePickerModal from '../../../components/vendor/DarkStorePickerModal';
import StoreBillingModal from '../../../components/vendor/StoreBillingModal';
import { formatDisplayAddress } from '../../../utils/addressUtils';

export default function RequestsPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'claims'
  const [orders, setOrders] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [pickingModalOrder, setPickingModalOrder] = useState(null);

  const toggleOrderExpand = (id) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  // Store pickup handover: merchant must enter the customer's 4-digit pickup code
  const [pickupHandover, setPickupHandover] = useState(null); // { orderId, customerName }
  const [billingOrder, setBillingOrder] = useState(null); // store pickup in-store billing
  const [pickupCode, setPickupCode] = useState('');
  const [pickupCodeError, setPickupCodeError] = useState('');
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  // Store Order Rejection modal
  const [rejectModalOrder, setRejectModalOrder] = useState(null);
  const [rejectReason, setRejectReason] = useState('Item out of stock');
  const [customRejectReason, setCustomRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Incoming order continuous ringing alarm
  const [ringingOrder, setRingingOrder] = useState(null);

  // Prep time selector modal
  const [prepModalOrder, setPrepModalOrder] = useState(null);
  const [selectedPrepMinutes, setSelectedPrepMinutes] = useState(15);
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');

  // Rate delivery rider modal
  const [rateRiderModalOrder, setRateRiderModalOrder] = useState(null);
  const [riderStarRating, setRiderStarRating] = useState(5);
  const [riderComment, setRiderComment] = useState('');
  const [riderSelectedTags, setRiderSelectedTags] = useState([]);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Continuous sound alarm effect for incoming order
  useEffect(() => {
    if (!ringingOrder) return;
    const interval = setInterval(() => {
      playStoreNewOrderAlarm({
        orderId: ringingOrder.orderId,
        amount: ringingOrder.finalPayableAmount || ringingOrder.totalAmount,
        customerName: ringingOrder.customerName,
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [ringingOrder]);

  const stopOrderRing = () => {
    setRingingOrder(null);
  };

  const currentUser = useAuthStore((state) => state.currentUser);

  // ── Fetch Orders ──
  const fetchOrders = async () => {
    try {
      setIsOrdersLoading(true);
      const res = await OrderAPI.getVendorOrders();
      if (res.success) {
        setOrders(res.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch vendor orders', err);
    } finally {
      setIsOrdersLoading(false);
    }
  };

  // ── Fetch Offline Claims ──
  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const res = await VendorAPI.getPendingRequests();
      if (res.success) {
        const raw = res.data || [];
        const seenBills = new Set();
        const seenCashCustomers = new Set();
        const deduplicated = raw.filter((r) => {
          if (r.paymentMethod === 'Cash' || r.requestType === 'cash_claim') {
            const custId = r.customerId?._id || r.customerId?.id || r.customerId?.phone || r.customerId?.name;
            if (custId) {
              if (seenCashCustomers.has(String(custId))) return false;
              seenCashCustomers.add(String(custId));
            }
            return true;
          }
          if (!r.billNumber) return true;
          const key = String(r.billNumber).trim().toUpperCase();
          if (seenBills.has(key)) return false;
          seenBills.add(key);
          return true;
        });
        setPendingRequests(deduplicated);
      }
    } catch (err) {
      console.error('Failed to fetch pending requests', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchRequests();

    let socket;
    try {
      socket = getSocket();
    } catch (_) {}

    if (socket) {
      const handleNewOrder = (data) => {
        if (data?.order) {
          setOrders((prev) => [data.order, ...prev.filter((o) => o._id !== data.order._id && o.orderId !== data.order.orderId)]);
          setRingingOrder(data.order);
          playStoreNewOrderAlarm({
            orderId: data.order.orderId,
            amount: data.order.finalPayableAmount || data.order.totalAmount,
            customerName: data.order.customerName,
          });
        }
      };

      const handleOrderPaid = (data) => {
        setOrders((prev) =>
          prev.map((o) => (o.orderId === data.orderId ? { ...o, paymentStatus: 'PAID', orderStatus: 'CONFIRMED' } : o))
        );
      };

      const handleRiderAssigned = (data) => {
        if (data?.orderId) {
          setOrders((prev) =>
            prev.map((o) =>
              o.orderId === data.orderId
                ? {
                    ...o,
                    orderStatus: data.orderStatus || 'RIDER_ASSIGNED',
                    riderDetails: data.rider || {
                      ...(o.riderDetails || {}),
                      riderId: data.riderId || o.riderDetails?.riderId,
                      name: data.riderName || o.riderDetails?.name,
                      phone: data.riderPhone || o.riderDetails?.phone,
                      vehicleNo: data.vehicleNo || o.riderDetails?.vehicleNo,
                    },
                  }
                : o
            )
          );
          playNotificationChime('incoming');
          speakVoice(`Delivery partner ${data.rider?.name || data.riderName || 'Rider'} assigned to order!`, 300, 'en-IN');
        }
      };

      const handleRiderDeclined = (data) => {
        if (data?.orderId) {
          setOrders((prev) =>
            prev.map((o) => {
              if (o.orderId === data.orderId) {
                const existingRejections = o.riderRejections || [];
                return {
                  ...o,
                  riderRejections: [
                    ...existingRejections,
                    {
                      riderName: data.riderName,
                      riderPhone: data.riderPhone,
                      reason: data.reason,
                      rejectedAt: data.timestamp || new Date(),
                    },
                  ],
                };
              }
              return o;
            })
          );
          playRiderDeclinedTone({ riderName: data.riderName, reason: data.reason });
        }
      };

      const handleOrderCancelled = (data) => {
        if (data?.orderId) {
          setOrders((prev) =>
            prev.map((o) =>
              o.orderId === data.orderId
                ? {
                    ...o,
                    orderStatus: 'CANCELLED',
                    cancellationReason: data.cancellationReason || o.cancellationReason,
                    cancelledBy: data.cancelledBy || 'VENDOR',
                  }
                : o
            )
          );
        }
      };

      const handleNewRequest = (data) => {
        setPendingRequests((prev) => {
          const newCustId = data.customerId?._id || data.customerId || data.customerName;
          const filtered = prev.filter((r) => {
            if (r._id === data.requestId) return false;
            if (r.paymentMethod === 'Cash' || r.requestType === 'cash_claim') {
              const prevCustId = r.customerId?._id || r.customerId?.id || r.customerId?.phone || r.customerId?.name;
              if (prevCustId && newCustId && String(prevCustId) === String(newCustId)) {
                return false;
              }
            }
            return true;
          });

          return [
            {
              _id: data.requestId,
              customerId:
                typeof data.customerId === 'object' && data.customerId?.name
                  ? data.customerId
                  : { name: data.customerName, _id: data.customerId },
              amount: data.amount,
              cashbackAmount: data.cashbackAmount,
              paymentMethod: data.paymentMethod || 'Cash',
              verificationCode: data.verificationCode,
              status: 'Pending',
              createdAt: new Date().toISOString(),
            },
            ...filtered,
          ];
        });
      };

      const handleVerified = (data) => {
        setPendingRequests((prev) =>
          prev.filter((r) => r._id !== data.requestId && r.verificationCode !== data.verificationCode)
        );
      };

      // Real-time Order Status & Lifecycle Tracking updates
      const handleLiveOrderStatusUpdate = (data) => {
        if (!data?.orderId) return;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.orderId === data.orderId || o._id === data.orderId) {
              const updatedStatus = data.orderStatus || o.orderStatus;
              return {
                ...o,
                orderStatus: updatedStatus,
                pickupOtp: data.pickupOtp || o.pickupOtp,
                riderDetails: {
                  ...o.riderDetails,
                  ...(data.riderDetails || {}),
                  name: data.riderName || o.riderDetails?.name,
                  phone: data.riderPhone || o.riderDetails?.phone,
                  vehicleNo: data.vehicleNo || o.riderDetails?.vehicleNo,
                  pickupOtp: data.pickupOtp || o.riderDetails?.pickupOtp,
                  currentLocation: data.currentLocation || o.riderDetails?.currentLocation,
                },
              };
            }
            return o;
          })
        );

        if (data.orderStatus === 'ARRIVED_AT_PICKUP') {
          playRiderArrivedBell({ riderName: data.riderName, pickupOtp: data.pickupOtp });
        } else if (data.orderStatus === 'OUT_FOR_DELIVERY') {
          playNotificationChime('incoming');
        } else if (data.orderStatus === 'DELIVERED') {
          playOrderDeliveredChime();
        }
      };

      const handleRiderArrivedStore = (data) => {
        if (!data?.orderId) return;
        handleLiveOrderStatusUpdate({ ...data, orderStatus: 'ARRIVED_AT_PICKUP' });
      };

      const handleOutForDelivery = (data) => {
        if (!data?.orderId) return;
        handleLiveOrderStatusUpdate({ ...data, orderStatus: 'OUT_FOR_DELIVERY' });
      };

      const handleOrderDelivered = (data) => {
        if (!data?.orderId) return;
        handleLiveOrderStatusUpdate({ ...data, orderStatus: 'DELIVERED' });
      };

      socket.on('order:new', handleNewOrder);
      socket.on('order:paid', handleOrderPaid);
      socket.on('order:rider_assigned', handleRiderAssigned);
      socket.on('order:status_update', handleLiveOrderStatusUpdate);
      socket.on('delivery:rider_arrived_store', handleRiderArrivedStore);
      socket.on('order:out_for_delivery', handleOutForDelivery);
      socket.on('order:delivered', handleOrderDelivered);
      socket.on('delivery:rider_declined', handleRiderDeclined);
      socket.on('order:cancelled', handleOrderCancelled);
      socket.on('new_cash_request', handleNewRequest);
      socket.on('cash_request_verified', handleVerified);

      return () => {
        socket.off('order:new', handleNewOrder);
        socket.off('order:paid', handleOrderPaid);
        socket.off('order:rider_assigned', handleRiderAssigned);
        socket.off('order:status_update', handleLiveOrderStatusUpdate);
        socket.off('delivery:rider_arrived_store', handleRiderArrivedStore);
        socket.off('order:out_for_delivery', handleOutForDelivery);
        socket.off('order:delivered', handleOrderDelivered);
        socket.off('delivery:rider_declined', handleRiderDeclined);
        socket.off('order:cancelled', handleOrderCancelled);
        socket.off('new_cash_request', handleNewRequest);
        socket.off('cash_request_verified', handleVerified);
      };
    }
  }, []);

  // ── Vendor Order Actions (Accept, Prepare, Deliver) ──
  // `extra` lets callers send additional fields (e.g. the customer's pickup code).
  // `silent` suppresses the alert so a modal can show the error inline instead.
  // Returns { ok, message }.
  const handleOrderStatusUpdate = async (orderId, newStatus, prepMinutes = null, { extra = {}, silent = false } = {}) => {
    setIsProcessing(true);
    stopOrderRing();
    try {
      const payload = { status: newStatus, ...extra };
      if (prepMinutes) {
        payload.prepTimeMinutes = Number(prepMinutes);
      }
      const res = await OrderAPI.updateOrderStatus(orderId, payload);
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.orderId === orderId ? { ...o, ...res.data.order } : o))
        );
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
      console.error('Failed to update order status', err);
      const message = err.response?.data?.message || 'Failed to update order status';
      if (!silent) alert(message);
      return { ok: false, message };
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Vendor Rates Delivery Rider ──
  const handleRateRiderSubmit = async (e) => {
    e?.preventDefault();
    if (!rateRiderModalOrder) return;
    setIsSubmittingRating(true);
    try {
      const res = await OrderAPI.rateRiderByVendor(rateRiderModalOrder.orderId, {
        rating: riderStarRating,
        comment: riderComment.trim(),
        tags: riderSelectedTags,
      });
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.orderId === rateRiderModalOrder.orderId
              ? {
                  ...o,
                  riderFeedbackFromVendor: res.data?.riderFeedbackFromVendor || {
                    rating: riderStarRating,
                    comment: riderComment.trim(),
                    tags: riderSelectedTags,
                    ratedAt: new Date(),
                  },
                }
              : o
          )
        );
        playNotificationChime('success');
        speakVoice('Delivery partner rated. Thank you!');
        setRateRiderModalOrder(null);
        setRiderStarRating(5);
        setRiderComment('');
        setRiderSelectedTags([]);
      }
    } catch (err) {
      console.error('Failed to submit rider rating', err);
      alert(err.response?.data?.message || 'Failed to submit rider rating');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // ── Store Order Rejection Submission ──
  const handleRejectOrderSubmit = async (e) => {
    e?.preventDefault();
    if (!rejectModalOrder) return;
    const finalReason =
      rejectReason === 'Other'
        ? customRejectReason.trim() || 'Store unable to fulfill order at this time'
        : rejectReason;

    setIsRejecting(true);
    try {
      const res = await OrderAPI.updateOrderStatus(rejectModalOrder.orderId, {
        status: 'CANCELLED',
        cancellationReason: finalReason,
      });
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.orderId === rejectModalOrder.orderId
              ? {
                  ...o,
                  orderStatus: 'CANCELLED',
                  cancellationReason: finalReason,
                  cancelledBy: 'VENDOR',
                }
              : o
          )
        );
        playNotificationChime('incoming');
        speakVoice('Order cancelled.');
        setRejectModalOrder(null);
        setRejectReason('Item out of stock');
        setCustomRejectReason('');
      }
    } catch (err) {
      console.error('Failed to reject order', err);
      alert(err.response?.data?.message || 'Failed to reject order');
    } finally {
      setIsRejecting(false);
    }
  };

  // ── Existing Cash Claim Actions ──
  const handleRequestAction = async (requestId, action) => {
    setIsProcessing(true);
    try {
      const targetReq = pendingRequests.find((req) => req._id === requestId);
      const targetBillNumber = targetReq?.billNumber ? String(targetReq.billNumber).trim().toUpperCase() : null;
      const targetCustId = targetReq?.customerId?._id || targetReq?.customerId?.id || targetReq?.customerId?.name;
      const isCash = targetReq?.paymentMethod === 'Cash' || targetReq?.requestType === 'cash_claim';

      const res = await VendorAPI.respondToRequest(requestId, action);
      if (res.success) {
        setPendingRequests((prev) =>
          prev.filter((req) => {
            if (req._id === requestId) return false;
            if (targetBillNumber && req.billNumber && String(req.billNumber).trim().toUpperCase() === targetBillNumber) {
              return false;
            }
            if (isCash && targetCustId) {
              const cId = req.customerId?._id || req.customerId?.id || req.customerId?.name;
              if (cId && String(cId) === String(targetCustId)) return false;
            }
            return true;
          })
        );
      }
    } catch (error) {
      console.error('Failed to process request', error);
      alert(error.response?.data?.message || 'Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      !orderSearchQuery.trim() ||
      o.orderId?.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      o.customerName?.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      o.customerPhone?.includes(orderSearchQuery.trim());

    if (!matchesSearch) return false;

    if (selectedStatusFilter === 'All') return true;
    if (selectedStatusFilter === 'Pending') return o.orderStatus === 'PLACED';
    if (selectedStatusFilter === 'Processing') {
      return ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(o.orderStatus);
    }
    if (selectedStatusFilter === 'Delivered') return o.orderStatus === 'DELIVERED';
    if (selectedStatusFilter === 'Cancelled') return o.orderStatus === 'CANCELLED';
    return true;
  });

  return (
    <div className="animate-reveal text-left w-full pb-12">
      {/* ── INCOMING ORDER SOUNDBOX ALERT BANNER ── */}
      {ringingOrder && (
        <div className="sticky top-1 z-40 mb-3 mx-2 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white rounded-2xl p-3.5 shadow-xl border-2 border-white animate-pulse flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white text-rose-600 flex items-center justify-center shrink-0 shadow-md">
              <span className="material-symbols-outlined text-[24px]">notifications_active</span>
            </div>
            <div className="min-w-0">
              <p className="font-display font-black text-xs sm:text-sm leading-tight truncate">
                🔔 New Order Received #{ringingOrder.orderId}!
              </p>
              <p className="text-[11px] text-amber-100 font-bold truncate">
                ₹{ringingOrder.finalPayableAmount || ringingOrder.totalAmount} • {ringingOrder.customerName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={stopOrderRing}
              className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs cursor-pointer active:scale-95"
              title="Stop Alarm"
            >
              Mute 🔇
            </button>
            <button
              type="button"
              onClick={() => {
                stopOrderRing();
                setPrepModalOrder(ringingOrder);
                setSelectedPrepMinutes(ringingOrder.estimatedPrepTime || 15);
              }}
              className="px-3 py-1.5 rounded-xl bg-white text-rose-700 hover:bg-amber-50 font-black text-xs shadow-md cursor-pointer active:scale-95"
            >
              Accept ⏱️
            </button>
          </div>
        </div>
      )}

      {/* ── TOP HEADER (Screen 4 Design) ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-100 shadow-xs mb-3 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-display font-black text-[22px] text-slate-900 tracking-tight">
            Orders
          </h1>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            {orders.length} Total Orders
          </span>
        </div>

        {/* Search Orders */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">
            search
          </span>
          <input
            type="text"
            value={orderSearchQuery}
            onChange={(e) => setOrderSearchQuery(e.target.value)}
            placeholder="Search orders..."
            className="w-full h-11 pl-10 pr-4 bg-slate-100/80 border border-slate-200/80 rounded-2xl text-[13.5px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
          />
          {orderSearchQuery && (
            <button
              onClick={() => setOrderSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[16px]">cancel</span>
            </button>
          )}
        </div>

        {/* Filter Pills (Screen 4 Design) */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pt-1 pb-0.5">
          {['All', 'Pending', 'Processing', 'Delivered', 'In-Store Claims'].map((f) => {
            const isSelected = selectedStatusFilter === f;
            return (
              <button
                key={f}
                onClick={() => {
                  setSelectedStatusFilter(f);
                  if (f === 'In-Store Claims') setActiveTab('claims');
                  else setActiveTab('orders');
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: ONLINE STORE ORDERS & RIDER DELIVERY MANAGEMENT */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-3 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-3 xl:items-start pb-[100px] lg:pb-6">
          {isOrdersLoading ? (
            <p className="xl:col-span-2 text-[13px] text-on-surface-variant text-center py-8 font-bold">{t('Loading orders...')}</p>
          ) : filteredOrders.length === 0 ? (
            <div className="xl:col-span-2 text-center py-12 bg-white rounded-3xl border border-slate-100 p-6 shadow-2xs">
              <div className="w-16 h-16 bg-purple-50 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-[30px]">shopping_bag</span>
              </div>
              <h3 className="font-bold text-slate-800 text-[15px] mb-1">No Orders Found</h3>
              <p className="text-slate-500 text-[12.5px] max-w-xs mx-auto">
                {orderSearchQuery || selectedStatusFilter !== 'All'
                  ? 'No orders match your filter criteria.'
                  : 'Customer jab aapke online store se product khareedenge, yahan live orders dikhenge.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isDelivered = order.orderStatus === 'DELIVERED';
              const isRiderAssigned = ['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER', 'DELIVERED'].includes(order.orderStatus);
              const isExpanded = expandedOrderIds.has(order._id || order.orderId);

              const statusBadgeText =
                order.orderStatus === 'PLACED'
                  ? 'Pending'
                  : order.orderStatus === 'DELIVERED'
                  ? 'Delivered'
                  : order.orderStatus === 'CANCELLED'
                  ? 'Cancelled'
                  : 'Processing';

              return (
                <div
                  key={order._id || order.orderId}
                  className={`rounded-2xl border transition-all ${
                    isDelivered
                      ? 'bg-white border-slate-100'
                      : order.orderStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'RIDER_ASSIGNED'
                      ? 'bg-purple-50/20 border-purple-200 shadow-2xs'
                      : 'bg-white border-slate-100 shadow-2xs'
                  }`}
                >
                  {/* Clean Order Header Row (Matching Screen 4) */}
                  <div
                    onClick={() => toggleOrderExpand(order._id || order.orderId)}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 rounded-2xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-black text-[15px] text-slate-900 tracking-tight">
                            #{order.orderId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(order.orderId);
                              setCopiedOrderId(order.orderId);
                              setTimeout(() => setCopiedOrderId(null), 2000);
                            }}
                            className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors"
                            title="Copy Order ID"
                          >
                            {copiedOrderId === order.orderId ? 'Copied!' : 'Copy'}
                          </button>

                          {/* Quick Store Pickup OTP Pill in Header */}
                          {order.orderStatus !== 'DELIVERED' && order.orderStatus !== 'CANCELLED' && (
                            <span className="bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-lg text-[11px] font-mono font-black flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px] text-amber-800">key</span>
                              <span>OTP: {order.pickupOtp || order.riderDetails?.pickupOtp || String(order.orderId || '').replace(/\D/g, '').slice(-4) || '1234'}</span>
                            </span>
                          )}
                        </div>
                        {order.createdAt && (
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {formatOrderTime(order.createdAt)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="font-mono font-black text-[14px] text-slate-900">
                            ₹{order.finalPayableAmount || order.totalAmount}
                          </p>
                          {order.estimatedPrepTime && ['PREPARING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(order.orderStatus) && (
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold text-[10.5px] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">timer</span>
                              <span>Prep: ~{order.estimatedPrepTime}m</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                          order.orderStatus === 'ARRIVED_AT_PICKUP'
                            ? 'bg-amber-500 text-white animate-pulse shadow-sm'
                            : order.orderStatus === 'OUT_FOR_DELIVERY'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : statusBadgeText === 'Pending'
                            ? 'bg-amber-100 text-amber-800'
                            : statusBadgeText === 'Delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : statusBadgeText === 'Cancelled'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {order.orderStatus === 'ARRIVED_AT_PICKUP'
                          ? '🚨 Rider At Store'
                          : order.orderStatus === 'OUT_FOR_DELIVERY'
                          ? '🛵 Out for Delivery'
                          : statusBadgeText}
                      </span>
                      <span
                        className={`material-symbols-outlined text-slate-400 text-[19px] transition-transform duration-200 ${
                          isExpanded ? 'rotate-90 text-purple-700' : ''
                        }`}
                      >
                        chevron_right
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detailed View with Actions */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3.5 text-left animate-reveal">
                      <div className="pt-2 flex items-center justify-between text-[12px] text-slate-600">
                        <p>
                          Customer: <strong className="text-slate-900">{order.customerName}</strong> ({order.customerPhone})
                        </p>
                        <span className="text-[10.5px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                          +{order.totalCashbackPoints} Pts Cashback
                        </span>
                      </div>

                      {/* ─── ZOMATO STORE PICKUP OTP HANDOVER CARD ─── */}
                      {order.orderStatus !== 'DELIVERED' && order.orderStatus !== 'CANCELLED' && (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                              <span className="material-symbols-outlined text-[24px]">key</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider">
                                  Store Pickup OTP
                                </span>
                                <span className="text-[10px] font-bold bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full">
                                  Rider Handover Code
                                </span>
                              </div>
                              <p className="text-2xl font-mono font-black text-amber-950 tracking-widest mt-0.5">
                                {order.pickupOtp || order.riderDetails?.pickupOtp || String(order.orderId || '').replace(/\D/g, '').slice(-4) || '1234'}
                              </p>
                            </div>
                          </div>
                          <p className="text-[11.5px] text-amber-900 font-medium max-w-xs">
                            Rider jab aapke store pahuchega, ye 4-digit code rider ko batayein taaki parcel handover verify ho sake.
                          </p>
                        </div>
                      )}

                      {/* ─── RIDER ARRIVED AT STORE ALERT BANNER ─── */}
                      {order.orderStatus === 'ARRIVED_AT_PICKUP' && (
                        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-3.5 shadow-md flex items-center justify-between animate-pulse">
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-[26px]">sports_motorsports</span>
                            <div>
                              <p className="font-extrabold text-[13.5px] leading-tight">
                                🚨 Delivery Partner {order.riderDetails?.name || 'Partner'} has reached your store!
                              </p>
                              <p className="text-[11px] text-amber-100 mt-0.5">
                                Match OTP: <strong className="font-mono text-white text-[13px]">{order.pickupOtp || order.riderDetails?.pickupOtp}</strong> and handover parcel to rider.
                              </p>
                            </div>
                          </div>
                          {order.riderDetails?.phone && (
                            <a
                              href={`tel:${order.riderDetails.phone}`}
                              className="px-3.5 py-2 rounded-xl bg-white text-orange-900 font-bold text-xs flex items-center gap-1 shadow-xs shrink-0 active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined text-[15px]">call</span>
                              <span>Call Rider</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* ─── DELIVERY LIFECYCLE PROGRESS STEPPER (MERCHANT VIEW) ─── */}
                      <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/80 space-y-2">
                        <span className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider block">
                          Delivery Lifecycle Status
                        </span>
                        {(() => {
                          const steps = [
                            { label: 'Placed', icon: 'receipt' },
                            { label: 'Preparing', icon: 'soup_kitchen' },
                            { label: 'Packed', icon: 'inventory_2' },
                            { label: 'Rider', icon: 'sports_motorsports' },
                            { label: 'On the Way', icon: 'two_wheeler' },
                            { label: 'Delivered', icon: 'check_circle' },
                          ];
                          const stageOf = {
                            PLACED: 0, CONFIRMED: 1, PREPARING: 1, READY_FOR_PICKUP: 2,
                            RIDER_ASSIGNED: 3, ARRIVED_AT_PICKUP: 3,
                            PICKED_UP: 4, OUT_FOR_DELIVERY: 4, ARRIVED_AT_CUSTOMER: 4, DELIVERED: 5,
                          };
                          const detail = {
                            PLACED: 'New order, waiting for you to accept',
                            CONFIRMED: 'Accepted',
                            PREPARING: 'You are preparing the order',
                            READY_FOR_PICKUP: order.riderDetails?.name ? 'Packed, rider is on the way to your store' : 'Packed, finding a delivery partner',
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
                            <>
                              <div className="grid grid-cols-6 gap-1.5 text-center">
                                {steps.map((step, idx) => {
                                  const isCurrent = currIdx === idx;
                                  const isDone = currIdx > idx;
                                  return (
                                    <div
                                      key={step.label}
                                      className={`p-1.5 rounded-xl flex flex-col items-center gap-0.5 transition-all ${
                                        isCurrent
                                          ? 'bg-purple-700 text-white font-bold shadow-xs'
                                          : isDone
                                          ? 'bg-emerald-100 text-emerald-900 font-semibold'
                                          : 'bg-white text-slate-400 border border-slate-100'
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">{isDone ? 'check' : step.icon}</span>
                                      <span className="leading-tight text-[10px]">{step.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-[11.5px] font-semibold text-slate-700 flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${order.orderStatus === 'DELIVERED' ? 'bg-emerald-500' : 'bg-purple-600 animate-pulse'}`} />
                                {detail[order.orderStatus] || order.orderStatus}
                              </p>
                            </>
                          );
                        })()}
                      </div>

                      {/* ─── LIVE GPS RIDER TRACKING BUTTON (MERCHANT VIEW) ─── */}
                      {['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'].includes(order.orderStatus) && (
                        <button
                          type="button"
                          onClick={() => setTrackingOrder(order)}
                          className="w-full py-2.5 px-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-between shadow-xs active:scale-98 transition-all cursor-pointer"
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

                  {/* Customer Special Instructions / Notes */}
                  {order.orderNotes && (
                    <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3 text-[12px] space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <span className="material-symbols-outlined text-amber-700 text-[18px]">edit_note</span>
                        <span>Customer Special Instructions:</span>
                      </div>
                      <p className="text-amber-950 font-medium bg-white/90 p-2.5 rounded-xl border border-amber-200 shadow-2xs">
                        "{order.orderNotes}"
                      </p>
                    </div>
                  )}

                  {/* Order Items Breakdown with WMS Shelf & Bin Locations */}
                  <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100 space-y-2 text-[12px]">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                        Ordered Products ({order.items?.length || 0})
                      </p>
                      {order.toteNumber && (
                        <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] text-amber-700">shopping_basket</span>
                          <span>Tote: {order.toteNumber}</span>
                        </span>
                      )}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="py-2 flex items-start sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-800">{item.name}</span>
                              <span className="text-slate-500 ml-1.5 font-mono">× {item.quantity}</span>
                              {item.picked && (
                                <span className="text-[9.5px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                  ✓ Picked
                                </span>
                              )}
                              <span className="text-[10px] text-primary font-bold ml-1">
                                ({item.cashbackPercentage}% = +{item.cashbackPoints} pts)
                              </span>
                            </div>

                            {/* WMS Physical Bin Location Pill */}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black text-purple-900 bg-purple-100/90 border border-purple-300 px-2 py-0.5 rounded-md shadow-2xs">
                                <span className="material-symbols-outlined text-[13px] text-purple-700">location_on</span>
                                <span>Bin: {item.binCode || item.warehouseLocation?.binCode || 'C01-S01-B01'}</span>
                              </span>
                              {item.barcode && (
                                <span className="text-[10px] font-mono text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                                  EAN: {item.barcode}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-slate-900 shrink-0">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Dark Store Picker Station Launcher Button */}
                    {['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(order.orderStatus) && (
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={() => setPickingModalOrder(order)}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white font-display font-black text-xs flex items-center justify-between shadow-xs active:scale-98 transition-all cursor-pointer"
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
                          <span className="flex items-center gap-1 text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                            {order.items?.filter((i) => i.picked).length || 0}/{order.items?.length || 0} Picked →
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Delivery Address & Details */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-slate-600">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[17px] shrink-0">location_on</span>
                      <span className="truncate max-w-xs">{formatDisplayAddress(order.deliveryAddress, 'Store Pickup')}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {order.deliverySchedule?.deliveryType === 'SCHEDULED' ? (
                        <span className="bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-bold text-[10.5px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-amber-700">calendar_clock</span>
                          <span>Scheduled: {order.deliverySchedule.scheduledDate ? `${order.deliverySchedule.scheduledDate} • ` : ''}{order.deliverySchedule.scheduledSlot || 'Scheduled'}</span>
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-[10.5px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-emerald-700">bolt</span>
                          <span>Instant Order</span>
                        </span>
                      )}
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold text-[10.5px]">
                        {order.fulfillmentType === 'pickup' ? 'Counter Pickup' : 'Rider Delivery'}
                      </span>
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold text-[10.5px]">
                        Payment: {order.paymentMethod} ({order.paymentStatus})
                      </span>
                    </div>
                  </div>

                  {/* Assigned Rider Info (if present) */}
                  {isRiderAssigned && order.riderDetails?.name && (
                    <div className="bg-purple-50/70 border border-purple-100 rounded-2xl p-3 space-y-2 text-[12px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[20px]">two_wheeler</span>
                          <div>
                            <p className="font-bold text-slate-900">
                              {order.riderDetails.name}
                              <span className="ml-1.5 text-[10px] font-semibold text-purple-700 bg-white border border-purple-200 px-1.5 py-0.5 rounded">
                                ZeeBac Rider
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-600">
                              📞 {order.riderDetails.phone || 'N/A'} · 🛵 {order.riderDetails.vehicleNo || 'Vehicle N/A'}
                            </p>
                          </div>
                        </div>

                        <a
                          href={`tel:${order.riderDetails.phone}`}
                          className="px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-primary font-bold text-[11px]"
                        >
                          Call
                        </a>
                      </div>

                      {order.riderDetails.pickupProofImage && (
                        <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                            <span>Pickup Proof (Bill/Bag) Attached</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewReceiptUrl(order.riderDetails.pickupProofImage)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[13px]">visibility</span>
                            <span>View Photo</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rider Declined Alert (if any driver rejected this order) */}
                  {order.riderRejections && order.riderRejections.length > 0 && order.orderStatus !== 'DELIVERED' && order.orderStatus !== 'CANCELLED' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11.5px] text-amber-950 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800">
                        <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
                        <span>Delivery Rider Alert ({order.riderRejections.length} Declined):</span>
                      </div>
                      {order.riderRejections.slice(-2).map((rej, rIdx) => (
                        <p key={rIdx} className="text-[11px] leading-tight text-amber-900">
                          ⚠️ <strong>{rej.riderName || 'Rider'}</strong> declined: "{rej.reason || 'Not available'}" {rej.rejectedAt ? `(${formatOrderTime(rej.rejectedAt)})` : ''}
                        </p>
                      ))}
                      <p className="text-[10.5px] text-amber-700 italic font-medium">
                        Searching for other nearby available delivery partners...
                      </p>
                    </div>
                  )}

                  {/* Cancelled Alert Banner */}
                  {order.orderStatus === 'CANCELLED' && (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-[11.5px] text-rose-950 space-y-0.5">
                      <p className="font-bold text-rose-800 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                        <span>Order Cancelled</span>
                      </p>
                      <p className="text-[11px] text-rose-700">
                        Reason: <strong>{order.cancellationReason || 'Cancelled by store'}</strong>
                      </p>
                    </div>
                  )}

                  {/* Order Status Action Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    {order.orderStatus === 'PLACED' && (
                      <>
                        <button
                          disabled={isProcessing}
                          onClick={() => {
                            setPrepModalOrder(order);
                            setSelectedPrepMinutes(order.estimatedPrepTime || 15);
                          }}
                          className="py-2.5 px-4 rounded-xl btn-primary-gradient text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          <span>Accept & Set Prep Time</span>
                        </button>

                        <button
                          disabled={isProcessing}
                          onClick={() => {
                            setRejectModalOrder(order);
                            if (order.orderNotes) {
                              setRejectReason('Cannot fulfill special customer instructions');
                            }
                          }}
                          className="py-2.5 px-3.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[12px] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          <span>Reject Order</span>
                        </button>
                      </>
                    )}

                    {(order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING' || order.orderStatus === 'READY_FOR_PICKUP') && (
                      <div className="w-full space-y-2">
                        {/* Auto-Dispatch Radar Status or Counter Pickup Banner */}
                        {order.fulfillmentType === 'pickup' ? (
                          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-[12px]">
                            <span className="material-symbols-outlined text-amber-700 text-[18px]">storefront</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-amber-900 leading-tight">
                                Store Counter Pickup Order
                              </p>
                              <p className="text-[10.5px] text-amber-700 mt-0.5">
                                Customer will collect this order directly from your store. Pack the items and click Mark Ready for Pickup.
                              </p>
                            </div>
                          </div>
                        ) : (
                          !isRiderAssigned && (
                            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-purple-50/80 border border-purple-200 text-purple-950 text-[12px]">
                              <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                                <span className="w-4 h-4 rounded-full bg-primary/25 animate-ping absolute"></span>
                                <span className="material-symbols-outlined text-primary text-[18px] relative z-10">radar</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-900 leading-tight">
                                  Auto-Dispatching to Nearby Delivery Riders...
                                </p>
                                <p className="text-[10.5px] text-slate-500 mt-0.5">
                                  Order broadcast to active riders in store radius. Partner will be automatically assigned upon acceptance.
                                </p>
                              </div>
                            </div>
                          )
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {(order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING') && (
                            <button
                              disabled={isProcessing}
                              onClick={() => handleOrderStatusUpdate(order.orderId, 'READY_FOR_PICKUP')}
                              className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined text-[16px]">inventory</span>
                              <span>Mark Ready for Pickup</span>
                            </button>
                          )}

                          {order.orderStatus === 'READY_FOR_PICKUP' && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
                                <span className="material-symbols-outlined text-[15px]">done_all</span>
                                <span>Order Packed & Ready for Pickup</span>
                              </span>

                              {order.fulfillmentType === 'pickup' && order.paymentStatus !== 'PAID' && (
                                <button
                                  disabled={isProcessing}
                                  onClick={() => setBillingOrder(order)}
                                  className="py-2 px-3.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                                >
                                  <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                                  <span>
                                    {order.storeBill?.status === 'GENERATED' ? 'Bill Generated · Collect' : 'Generate Bill'} ₹
                                    {Number(order.finalPayableAmount || 0).toFixed(2)}
                                  </span>
                                </button>
                              )}

                              {order.fulfillmentType === 'pickup' && order.paymentStatus === 'PAID' && (
                                <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
                                  <span className="material-symbols-outlined text-[15px]">paid</span>
                                  <span>
                                    Paid{order.storeBill?.paidVia ? ` · ${order.storeBill.paidVia === 'CASH' ? 'Cash' : 'UPI'}` : ''}
                                  </span>
                                </span>
                              )}

                              {order.fulfillmentType === 'pickup' && (
                                <button
                                  disabled={isProcessing || order.paymentStatus !== 'PAID'}
                                  title={order.paymentStatus !== 'PAID' ? 'Confirm payment first' : undefined}
                                  onClick={() => {
                                    setPickupHandover({ orderId: order.orderId, customerName: order.customerName || order.customerId?.name || 'Customer' });
                                    setPickupCode('');
                                    setPickupCodeError('');
                                  }}
                                  className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <span className="material-symbols-outlined text-[15px]">verified</span>
                                  <span>Handover to Customer (Enter Pickup Code)</span>
                                </button>
                              )}

                              {order.fulfillmentType === 'delivery' && !isRiderAssigned && (
                                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                                  <span className="material-symbols-outlined text-[15px] animate-pulse">two_wheeler</span>
                                  <span>Waiting for a ZeeBac delivery partner to accept</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'].includes(order.orderStatus) && (
                      <p className="text-[11.5px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        The delivery partner marks this order delivered after the customer shares their code. Status updates here automatically.
                      </p>
                    )}

                    {isDelivered && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700 bg-emerald-100/70 px-3 py-1.5 rounded-xl">
                          <span className="material-symbols-outlined text-[15px]">check_circle</span>
                          <span>Order Completed • Points Paid to Customer</span>
                        </span>

                        {order.riderDetails?.name && (
                          order.riderFeedbackFromVendor ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-[11.5px] font-bold">
                              <span className="material-symbols-outlined text-amber-500 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                              <span>Rated Rider: {order.riderFeedbackFromVendor.rating}/5 ★</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setRateRiderModalOrder(order);
                                setRiderStarRating(5);
                                setRiderComment('');
                                setRiderSelectedTags([]);
                              }}
                              className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs cursor-pointer active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                              <span>Rate Rider</span>
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {order.orderStatus === 'CANCELLED' && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-rose-700 bg-rose-100/70 px-3 py-1.5 rounded-xl">
                        <span className="material-symbols-outlined text-[15px]">cancel</span>
                        <span>Cancelled / Rejected</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

          {/* Promo Banner at Bottom of Orders (Matching Screen 4) */}
          <div className="mt-4 p-4 rounded-2xl bg-purple-50/80 border border-purple-100 flex items-center justify-between gap-3 cursor-pointer hover:bg-purple-100/60 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">featured_seasonal_and_gifts</span>
              </div>
              <div>
                <h4 className="font-bold text-[13.5px] text-slate-900">Earn more with Zeebac</h4>
                <p className="text-[11.5px] text-slate-500">Get up to 5% cashback on every order</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: IN-STORE CLAIMS (CASH / POS BILL VERIFICATION) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'claims' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 pb-[100px] lg:pb-6">
          {isLoading ? (
            <p className="col-span-1 lg:col-span-2 text-[13px] text-on-surface-variant text-center py-8 font-bold">{t('Loading...')}</p>
          ) : pendingRequests.length === 0 ? (
            <div className="col-span-1 lg:col-span-2 text-center py-12">
              <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[28px] text-on-surface-variant">check_circle</span>
              </div>
              <h3 className="font-bold text-on-surface text-[15px] mb-1">{t('All Caught Up!')}</h3>
              <p className="text-on-surface-variant text-[13px]">{t('No pending in-store claims require your attention.')}</p>
            </div>
          ) : (
            pendingRequests.map((req) => {
              const isCashOtp = !!req.verificationCode;
              const isPendingCashOtp = isCashOtp && req.status === 'Pending';
              const isApproved = req.status === 'Approved';

              return (
                <div
                  key={req._id}
                  className={`rounded-2xl border transition-all p-4 flex gap-3 items-start ${
                    isPendingCashOtp
                      ? 'bg-gradient-to-br from-red-50/95 via-white to-rose-50/80 border-2 border-red-500 shadow-lg ring-2 ring-red-400/20'
                      : isApproved
                      ? 'bg-gradient-to-br from-emerald-50/95 via-white to-green-50/80 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-400/20'
                      : 'bg-white border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-[18px] border flex-shrink-0 shadow-xs ${
                      isPendingCashOtp
                        ? 'bg-red-600 text-white border-red-700 animate-pulse'
                        : isApproved
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-orange-50 text-orange-600 border-orange-100'
                    }`}
                  >
                    {isPendingCashOtp ? (
                      <span className="material-symbols-outlined text-[24px]">pin</span>
                    ) : isApproved ? (
                      <span className="material-symbols-outlined text-[24px]">verified</span>
                    ) : (
                      req.customerId?.name?.charAt(0) || 'C'
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-slate-900 leading-tight">
                      {req.customerId?.name || 'Customer'}
                    </p>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Bill Amount: <strong className="text-slate-800">₹{req.amount}</strong> • Cashback: ₹{req.cashbackAmount}
                    </p>

                    {req.verificationCode && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-xl inline-block">
                        <span className="text-[10px] font-bold text-amber-800 uppercase block">Verification Code</span>
                        <span className="font-mono font-black text-[18px] text-amber-900">{req.verificationCode}</span>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleRequestAction(req._id, 'Approved')}
                        disabled={isProcessing}
                        className="py-1.5 px-3 rounded-lg bg-emerald-600 text-white font-bold text-[11px] cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRequestAction(req._id, 'Rejected')}
                        disabled={isProcessing}
                        className="py-1.5 px-3 rounded-lg bg-rose-600 text-white font-bold text-[11px] cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* KITCHEN PREPARATION TIME MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {prepModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-[22px]">timer</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Kitchen Prep Time
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPrepModalOrder(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div>
              <p className="text-[12px] text-slate-600 leading-snug">
                Select estimated time required to prepare and pack <strong>Order #{prepModalOrder.orderId}</strong> ({prepModalOrder.items?.length || 0} items).
              </p>
              <p className="text-[11px] text-purple-700 font-semibold mt-1">
                Customer & nearby delivery riders will be notified.
              </p>
            </div>

            {/* Quick Preset Chips */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Select Preparation Time:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[10, 15, 20, 25, 30, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setSelectedPrepMinutes(mins);
                      setCustomPrepMinutes('');
                    }}
                    className={`py-2 px-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      selectedPrepMinutes === mins && !customPrepMinutes
                        ? 'bg-purple-700 text-white shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {mins} mins
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Or Custom Minutes:
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={customPrepMinutes}
                onChange={(e) => setCustomPrepMinutes(e.target.value)}
                placeholder="e.g. 35"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrepModalOrder(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  const finalMinutes = customPrepMinutes ? parseInt(customPrepMinutes, 10) : selectedPrepMinutes;
                  handleOrderStatusUpdate(prepModalOrder.orderId, 'PREPARING', finalMinutes || 15);
                  setPrepModalOrder(null);
                }}
                className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12px] shadow-sm cursor-pointer active:scale-95 transition-all"
              >
                Confirm & Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VENDOR RATES DELIVERY RIDER MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {rateRiderModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Rate Delivery Rider
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRateRiderModalOrder(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Rider Header */}
            <div className="bg-purple-50/70 border border-purple-100 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-700 text-white flex items-center justify-center font-black text-sm shrink-0">
                {(rateRiderModalOrder.riderDetails?.name || 'R')[0]}
              </div>
              <div className="min-w-0">
                <p className="font-display font-black text-xs text-slate-900 truncate">
                  {rateRiderModalOrder.riderDetails?.name || 'Delivery Partner'}
                </p>
                <p className="text-[10.5px] text-slate-500 font-medium">
                  Vehicle: {rateRiderModalOrder.riderDetails?.vehicleNo || 'N/A'} • {rateRiderModalOrder.riderDetails?.phone}
                </p>
              </div>
            </div>

            {/* Interactive 5-Star Rating */}
            <div className="space-y-1 text-center py-1">
              <p className="text-xs font-bold text-slate-700">How was the rider's pickup & behavior?</p>
              <div className="flex items-center justify-center gap-1.5 pt-1">
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
              <p className="text-[11px] font-black text-amber-600">
                {riderStarRating === 5
                  ? 'Excellent (5/5)'
                  : riderStarRating === 4
                  ? 'Good (4/5)'
                  : riderStarRating === 3
                  ? 'Average (3/5)'
                  : riderStarRating === 2
                  ? 'Below Average (2/5)'
                  : 'Poor (1/5)'}
              </p>
            </div>

            {/* Quick Feedback Tags */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Feedback Highlights:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '⚡ Fast Pickup',
                  '👍 Polite & Professional',
                  '🎒 Had Thermal Bag',
                  '📦 Handled Food Carefully',
                  '⏳ Delayed Arrival',
                  '⚠️ Unprofessional',
                ].map((tag) => {
                  const isSelected = riderSelectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setRiderSelectedTags((prev) =>
                          isSelected ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Comment */}
            <div className="space-y-1">
              <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Comment (Optional):
              </label>
              <textarea
                rows={2}
                value={riderComment}
                onChange={(e) => setRiderComment(e.target.value)}
                placeholder="Rider arrived quickly with clean thermal bag..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white resize-none"
              />
            </div>

            {/* Submit Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRateRiderModalOrder(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={isSubmittingRating}
                onClick={handleRateRiderSubmit}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[12px] shadow-sm cursor-pointer active:scale-95 transition-all"
              >
                {isSubmittingRating ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* STORE ORDER REJECTION MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {rejectModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600 text-[22px]">cancel</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Reject Order #{rejectModalOrder.orderId}
                </h3>
              </div>
              <button
                onClick={() => setRejectModalOrder(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-[12px] text-slate-600 leading-snug">
              Please select a reason for rejecting this order. The customer will be informed immediately in real time, and any redeemed points will be refunded.
            </p>

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
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-[12px] font-semibold cursor-pointer transition-all ${
                    rejectReason === reasonOption
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-50'
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
                  placeholder="Specify exact reason to notify customer..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none focus:bg-white resize-none"
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={handleRejectOrderSubmit}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12px] shadow-sm cursor-pointer"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* PHOTO LIGHTBOX MODAL (FOR BILL / PICKUP PROOF) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {viewReceiptUrl && (
        <div
          onClick={() => setViewReceiptUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-lg w-full shadow-2xl relative text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
                <h4 className="font-display font-black text-[14px] text-slate-900">
                  Verified Bill / Pickup Proof Photo
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setViewReceiptUrl(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-3 bg-slate-950 flex items-center justify-center min-h-[300px] max-h-[75vh]">
              <img
                src={viewReceiptUrl}
                alt="Pickup Proof"
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
              <a
                href={viewReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-bold text-primary hover:underline inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                <span>Open Full Image in New Tab</span>
              </a>
            </div>
          </div>
        </div>
      )}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* LIVE GPS ORDER & RIDER TRACKING MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {trackingOrder && (
        <LiveOrderTrackingModal
          order={trackingOrder}
          onClose={() => setTrackingOrder(null)}
        />
      )}
      {/* ───────────────────────────────────────────────────────────── */}
      {/* DARK STORE WMS PICKER STATION MODAL (Zepto / Blinkit Flow) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {pickingModalOrder && (
        <DarkStorePickerModal
          isOpen={Boolean(pickingModalOrder)}
          order={pickingModalOrder}
          onClose={() => setPickingModalOrder(null)}
          onOrderUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? { ...o, ...updated } : o)));
            setPickingModalOrder((prev) => (prev && prev.orderId === updated.orderId ? { ...prev, ...updated } : prev));
          }}
        />
      )}

      {/* Store pickup in-store billing — UPI QR to seller / cash; confirms payment only */}
      {billingOrder && (
        <StoreBillingModal
          order={billingOrder}
          onOrderUpdated={(updated) => {
            if (!updated) return;
            setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? { ...o, ...updated } : o)));
            setBillingOrder((prev) => (prev && prev.orderId === updated.orderId ? { ...prev, ...updated } : prev));
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

      {/* Store pickup handover — verify the customer's 4-digit pickup code */}
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
                setPickupCodeError('Enter the 4-digit code from the customer\'s app.');
                return;
              }
              const r = await handleOrderStatusUpdate(pickupHandover.orderId, 'DELIVERED', null, {
                extra: { deliveryOtp: pickupCode },
                silent: true,
              });
              if (r?.ok) setPickupHandover(null);
              else setPickupCodeError(r?.message || 'Could not hand over the order.');
            }}
            className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
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
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 text-[12px] text-purple-900 leading-snug">
              Ask the customer for the <b>4-digit pickup code</b> shown in their Zeebac app, and enter it below to hand over the order.
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Pickup Code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
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
            </div>

            <button
              type="submit"
              disabled={isProcessing || pickupCode.length !== 4}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[13px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[17px]">verified</span>
              {isProcessing ? 'Verifying…' : 'Verify & Hand Over'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
