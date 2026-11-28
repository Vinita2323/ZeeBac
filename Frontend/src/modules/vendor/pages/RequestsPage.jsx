import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI, OrderAPI } from '../../../services/api';
import { getSocket } from '../../../services/socket';
import useLanguageStore from '../../../store/useLanguageStore';
import {
  playNotificationChime,
  speakVoice,
  playStoreNewOrderAlarm,
  playRiderDeclinedTone,
  playRiderArrivedBell,
  playOrderDeliveredChime,
  formatOrderTime,
} from '../../../utils/voiceUtils';

export default function RequestsPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'claims'
  const [orders, setOrders] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [copiedOrderId, setCopiedOrderId] = useState(null);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Incoming order continuous ringing alarm
  const [ringingOrder, setRingingOrder] = useState(null);

  // Prep time selector modal (used by ringing banner & quick Accept button)
  const [prepModalOrder, setPrepModalOrder] = useState(null);
  const [selectedPrepMinutes, setSelectedPrepMinutes] = useState(15);
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');

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
      {/* TAB 1: ONLINE STORE ORDERS (ROW & COLUMN TABLE + VIEW MODAL) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-4 pb-[100px] lg:pb-6">
          {isOrdersLoading ? (
            <p className="text-[13px] text-on-surface-variant text-center py-8 font-bold">{t('Loading orders...')}</p>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 p-6 shadow-2xs">
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
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Order ID &amp; Date</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Items</th>
                      <th className="py-3 px-3">Amount</th>
                      <th className="py-3 px-3">Cashback</th>
                      <th className="py-3 px-3">Payment</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[12.5px]">
                    {filteredOrders.map((order) => {
                      const orderKey = order.orderId || order._id;
                      const isDelivered = order.orderStatus === 'DELIVERED';
                      const isCancelled = order.orderStatus === 'CANCELLED';
                      const pickupOtp =
                        order.pickupOtp ||
                        order.riderDetails?.pickupOtp ||
                        String(order.orderId || '').replace(/\D/g, '').slice(-4) ||
                        '1234';

                      const statusBadgeText =
                        order.orderStatus === 'PLACED'
                          ? 'Pending'
                          : order.orderStatus === 'DELIVERED'
                          ? 'Delivered'
                          : order.orderStatus === 'CANCELLED'
                          ? 'Cancelled'
                          : order.orderStatus === 'READY_FOR_PICKUP'
                          ? 'Ready'
                          : order.orderStatus === 'RIDER_ASSIGNED'
                          ? 'Rider Assigned'
                          : 'Processing';

                      const itemsSummary = order.items?.length
                        ? `${order.items[0].quantity}× ${order.items[0].name}${
                            order.items.length > 1 ? ` +${order.items.length - 1} more` : ''
                          }`
                        : '—';

                      return (
                        <tr
                          key={orderKey}
                          onClick={() => navigate(`/vendor/orders/${order.orderId}`, { state: { initialOrder: order } })}
                          className={`transition-colors cursor-pointer hover:bg-purple-50/40 ${
                            order.orderStatus === 'PLACED'
                              ? 'bg-amber-50/30'
                              : order.orderStatus === 'ARRIVED_AT_PICKUP'
                              ? 'bg-amber-50/50'
                              : ''
                          }`}
                        >
                          {/* Column 1: Order ID & Date */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-display font-black text-[13.5px] text-slate-900">
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
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {order.createdAt && (
                                <span className="text-[11px] text-slate-400 font-medium">
                                  {formatOrderTime(order.createdAt)}
                                </span>
                              )}
                              {!isDelivered && !isCancelled && (
                                <span className="bg-amber-100 text-amber-950 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-mono font-black">
                                  OTP: {pickupOtp}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Column 2: Customer */}
                          <td className="py-3 px-3 align-middle">
                            <p className="font-bold text-slate-900 truncate max-w-[150px]">
                              {order.customerName || 'Customer'}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {order.customerPhone || '—'}
                            </p>
                          </td>

                          {/* Column 3: Items */}
                          <td className="py-3 px-3 align-middle">
                            <div className="flex items-center gap-2.5 max-w-[240px]">
                              {order.items?.[0]?.image ? (
                                <img
                                  src={order.items[0].image}
                                  alt={order.items[0].name}
                                  className="w-10 h-10 rounded-xl object-cover border border-slate-200/80 shrink-0 bg-slate-50"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">{itemsSummary}</p>
                                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                  <span className="text-[10.5px] text-slate-400 font-medium">
                                    {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'} •{' '}
                                    {order.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}
                                  </span>
                                  {order.items?.[0]?.variant && (
                                    <span className="text-[9.5px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                                      {order.items[0].variant}
                                    </span>
                                  )}
                                  {order.items?.[0]?.sku && (
                                    <span className="text-[9.5px] font-mono font-bold bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded">
                                      SKU: {order.items[0].sku}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Column 4: Amount */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <p className="font-mono font-black text-[13.5px] text-slate-900">
                              ₹{Number(order.finalPayableAmount ?? order.totalAmount ?? 0).toFixed(2).replace(/\.00$/, '')}
                            </p>
                            {Number(order.pointsRedeemed) > 0 && (
                              <span className="text-[10px] font-bold text-emerald-700">
                                -{order.pointsRedeemed} Pts used
                              </span>
                            )}
                          </td>

                          {/* Column 5: Cashback Details */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 font-bold text-[11px]">
                              +{order.totalCashbackPoints || 0} Pts
                            </span>
                            <p className="text-[10px] font-semibold mt-0.5">
                              {isCancelled ? (
                                <span className="text-slate-400">Cancelled</span>
                              ) : order.cashbackSettled ? (
                                <span className="text-emerald-700">✓ Credited</span>
                              ) : (
                                <span className="text-amber-700">On Delivery</span>
                              )}
                            </p>
                          </td>

                          {/* Column 6: Payment */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="text-[11px] font-bold text-slate-700 block">
                              {order.paymentMethod || '—'}
                            </span>
                            <span
                              className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                                order.paymentStatus === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : order.paymentStatus === 'REFUNDED'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {order.paymentStatus || 'PENDING'}
                            </span>
                          </td>

                          {/* Column 7: Status */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
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
                            {order.estimatedPrepTime &&
                              ['PREPARING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(
                                order.orderStatus
                              ) && (
                                <p className="text-[10px] font-bold text-indigo-700 mt-0.5">
                                  Prep: ~{order.estimatedPrepTime}m
                                </p>
                              )}
                          </td>

                          {/* Column 8: Action (View Button) */}
                          <td
                            onClick={(e) => e.stopPropagation()}
                            className="py-3 px-4 align-middle text-right whitespace-nowrap"
                          >
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {order.orderStatus === 'PLACED' && (
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => {
                                    setPrepModalOrder(order);
                                    setSelectedPrepMinutes(order.estimatedPrepTime || 15);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer transition-all active:scale-95"
                                >
                                  Accept
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => navigate(`/vendor/orders/${order.orderId}`, { state: { initialOrder: order } })}
                                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11.5px] inline-flex items-center gap-1 shadow-2xs cursor-pointer transition-all active:scale-95"
                              >
                                <span className="material-symbols-outlined text-[15px]">visibility</span>
                                <span>View</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cashback & Coins Shortcut Banner at Bottom of Orders */}
          <button
            type="button"
            onClick={() => navigate('/vendor/wallet')}
            className="w-full text-left p-4 rounded-2xl bg-purple-50/80 border border-purple-100 flex items-center justify-between gap-3 cursor-pointer hover:bg-purple-100/60 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">featured_seasonal_and_gifts</span>
              </div>
              <div>
                <h4 className="font-bold text-[13.5px] text-slate-900">Earn more with Zeebac</h4>
                <p className="text-[11.5px] text-slate-500">
                  Manage your cashback coin pool, earned coins &amp; store rewards
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
          </button>
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

    </div>
  );
}
