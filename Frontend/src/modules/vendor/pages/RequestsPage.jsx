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
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

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
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  // Store Order Rejection modal
  const [rejectModalOrder, setRejectModalOrder] = useState(null);
  const [rejectReason, setRejectReason] = useState('Item out of stock');
  const [customRejectReason, setCustomRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

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
                    riderDetails: data.rider || o.riderDetails,
                  }
                : o
            )
          );
          playNotificationChime('incoming');
          speakVoice(`Delivery partner ${data.rider?.name || 'Rider'} assigned to order!`, 300, 'en-IN');
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

      socket.on('order:new', handleNewOrder);
      socket.on('order:paid', handleOrderPaid);
      socket.on('order:rider_assigned', handleRiderAssigned);
      socket.on('delivery:rider_declined', handleRiderDeclined);
      socket.on('order:cancelled', handleOrderCancelled);
      socket.on('new_cash_request', handleNewRequest);
      socket.on('cash_request_verified', handleVerified);

      return () => {
        socket.off('order:new', handleNewOrder);
        socket.off('order:paid', handleOrderPaid);
        socket.off('order:rider_assigned', handleRiderAssigned);
        socket.off('delivery:rider_declined', handleRiderDeclined);
        socket.off('order:cancelled', handleOrderCancelled);
        socket.off('new_cash_request', handleNewRequest);
        socket.off('cash_request_verified', handleVerified);
      };
    }
  }, []);

  // ── Vendor Order Actions (Accept, Prepare, Deliver) ──
  const handleOrderStatusUpdate = async (orderId, newStatus) => {
    setIsProcessing(true);
    try {
      const res = await OrderAPI.updateOrderStatus(orderId, { status: newStatus });
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.orderId === orderId ? { ...o, ...res.data.order } : o))
        );
        playNotificationChime('incoming');
        if (newStatus === 'DELIVERED') {
          speakVoice('Order marked delivered. Cashback points paid to customer.');
        } else if (newStatus === 'PREPARING' || newStatus === 'CONFIRMED') {
          speakVoice('Order accepted and preparing. Dispatching to nearby riders.');
        }
      }
    } catch (err) {
      console.error('Failed to update order status', err);
      alert(err.response?.data?.message || 'Failed to update order status');
    } finally {
      setIsProcessing(false);
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
    <div className="animate-reveal text-left max-w-2xl mx-auto pb-12">
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
        <div className="space-y-3 pb-[100px] md:pb-6">
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
            filteredOrders.map((order) => {
              const isDelivered = order.orderStatus === 'DELIVERED';
              const isRiderAssigned = ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.orderStatus);
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
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-black text-[14px] text-slate-900 truncate">
                            #{order.orderId}
                          </span>
                        </div>
                        {order.createdAt && (
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {formatOrderTime(order.createdAt)}
                          </p>
                        )}
                        <p className="font-mono font-black text-[14px] text-slate-900 mt-0.5">
                          ₹{order.finalPayableAmount || order.totalAmount}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                          statusBadgeText === 'Pending'
                            ? 'bg-amber-100 text-amber-800'
                            : statusBadgeText === 'Delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : statusBadgeText === 'Cancelled'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {statusBadgeText}
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
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 text-left animate-reveal">
                      <div className="pt-2 flex items-center justify-between text-[12px] text-slate-600">
                        <p>
                          Customer: <strong className="text-slate-900">{order.customerName}</strong> ({order.customerPhone})
                        </p>
                        <span className="text-[10.5px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                          +{order.totalCashbackPoints} Pts Cashback
                        </span>
                      </div>

                  {/* Order Items Breakdown with Individual Product Cashback Rates */}
                  <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100 space-y-1.5 text-[12px]">
                    <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                      Ordered Products ({order.items?.length || 0})
                    </p>
                    <div className="divide-y divide-slate-100">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="py-1.5 flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <span className="text-slate-500 ml-1.5">× {item.quantity}</span>
                            <span className="text-[10px] text-primary font-bold ml-2">
                              ({item.cashbackPercentage}% = +{item.cashbackPoints} pts)
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Address & Details */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-slate-600">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[17px] shrink-0">location_on</span>
                      <span className="truncate max-w-xs">{order.deliveryAddress || 'Store Pickup'}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                              Rider: {order.riderDetails.name} ({order.riderDetails.phone})
                            </p>
                            <p className="text-[10.5px] text-slate-500">
                              Vehicle: {order.riderDetails.vehicleNo || 'N/A'} • OTP: <strong>{order.riderDetails.deliveryOtp}</strong>
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
                          onClick={() => handleOrderStatusUpdate(order.orderId, 'PREPARING')}
                          className="py-2.5 px-4 rounded-xl btn-primary-gradient text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          <span>Accept & Prepare Order</span>
                        </button>

                        <button
                          disabled={isProcessing}
                          onClick={() => setRejectModalOrder(order)}
                          className="py-2.5 px-3.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[12px] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          <span>Reject Order</span>
                        </button>
                      </>
                    )}

                    {(order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING' || order.orderStatus === 'READY_FOR_PICKUP') && (
                      <div className="w-full space-y-2">
                        {/* Auto-Dispatch Radar Status (Automatic radius matching) */}
                        {!isRiderAssigned && (
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
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {order.orderStatus === 'PREPARING' && (
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
                            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
                              <span className="material-symbols-outlined text-[15px]">done_all</span>
                              <span>Food/Order Packed & Ready for Pickup</span>
                            </span>
                          )}

                          <button
                            disabled={isProcessing}
                            onClick={() => setRejectModalOrder(order)}
                            className="py-2 px-3 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[11.5px] flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[15px]">close</span>
                            <span>Cancel Order</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {(order.orderStatus === 'RIDER_ASSIGNED' || order.orderStatus === 'OUT_FOR_DELIVERY') && (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleOrderStatusUpdate(order.orderId, 'DELIVERED')}
                        className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">verified</span>
                        <span>Mark Delivered (Settle Cashback Points)</span>
                      </button>
                    )}

                    {isDelivered && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700 bg-emerald-100/70 px-3 py-1.5 rounded-xl">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        <span>Order Completed • Points Paid to Customer</span>
                      </span>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 pb-[100px] md:pb-6">
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
      {/* STORE ORDER REJECTION MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {rejectModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-left">
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
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative text-left"
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
    </div>
  );
}
