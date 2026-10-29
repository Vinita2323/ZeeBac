import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, OrderAPI } from '../../../services/api';
import { getSocket } from '../../../services/socket';
import useLanguageStore from '../../../store/useLanguageStore';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { playNotificationChime, speakVoice } from '../../../utils/voiceUtils';

export default function RequestsPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'claims'
  const [orders, setOrders] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  // Rider assignment modal
  const [assignRiderModalOrder, setAssignRiderModalOrder] = useState(null);
  const [riderForm, setRiderForm] = useState({ name: '', phone: '', vehicleNo: '' });
  const [isAssigningRider, setIsAssigningRider] = useState(false);

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
          setOrders((prev) => [data.order, ...prev.filter((o) => o._id !== data.order._id)]);
          playNotificationChime('incoming');
          speakVoice('New online order received with product cashback!');
        }
      };

      const handleOrderPaid = (data) => {
        setOrders((prev) =>
          prev.map((o) => (o.orderId === data.orderId ? { ...o, paymentStatus: 'PAID', orderStatus: 'CONFIRMED' } : o))
        );
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
      socket.on('new_cash_request', handleNewRequest);
      socket.on('cash_request_verified', handleVerified);

      return () => {
        socket.off('order:new', handleNewOrder);
        socket.off('order:paid', handleOrderPaid);
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
        }
      }
    } catch (err) {
      console.error('Failed to update order status', err);
      alert(err.response?.data?.message || 'Failed to update order status');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Assign Rider Submission ──
  const handleAssignRiderSubmit = async (e) => {
    e.preventDefault();
    if (!riderForm.name || !riderForm.phone || isAssigningRider) return;

    setIsAssigningRider(true);
    try {
      const res = await OrderAPI.assignRider(assignRiderModalOrder.orderId, riderForm);
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.orderId === assignRiderModalOrder.orderId ? { ...o, ...res.data.order } : o))
        );
        playNotificationChime('incoming');
        speakVoice(`Rider ${riderForm.name} assigned to order.`);
        setAssignRiderModalOrder(null);
        setRiderForm({ name: '', phone: '', vehicleNo: '' });
      }
    } catch (err) {
      console.error('Failed to assign rider', err);
      alert(err.response?.data?.message || 'Failed to assign rider');
    } finally {
      setIsAssigningRider(false);
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

  return (
    <div className="animate-reveal text-left">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
        <button
          onClick={() => safeNavigateBack(navigate, '/vendor')}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px] text-primary">arrow_back</span>
        </button>
        <h1 className="ml-2 font-display text-[18px] font-black text-on-surface leading-none tracking-tight">
          {t('Orders & Requests')}
        </h1>
      </header>

      {/* Desktop Header */}
      <div className="hidden md:flex justify-between items-end mb-4">
        <div>
          <h1 className="font-display text-[24px] font-black text-on-surface leading-none tracking-tight">
            {t('Orders & Requests')}
          </h1>
          <p className="text-on-surface-variant text-[12px] font-bold mt-1">
            {t('Manage store shopping orders, rider dispatch, and cashback claims')}
          </p>
        </div>
      </div>

      {/* Primary Section Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 gap-1">
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-[12.5px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'orders' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[17px]">local_shipping</span>
          <span>Online Store Orders ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('claims')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-[12.5px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'claims' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[17px]">receipt_long</span>
          <span>In-Store Claims ({pendingRequests.length})</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: ONLINE STORE ORDERS & RIDER DELIVERY MANAGEMENT */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-3 pb-[100px] md:pb-6">
          {isOrdersLoading ? (
            <p className="text-[13px] text-on-surface-variant text-center py-8 font-bold">{t('Loading orders...')}</p>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 p-6 shadow-2xs">
              <div className="w-16 h-16 bg-purple-50 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-[30px]">shopping_bag</span>
              </div>
              <h3 className="font-bold text-slate-800 text-[15px] mb-1">No Orders Yet</h3>
              <p className="text-slate-500 text-[12.5px] max-w-xs mx-auto">
                Customer jab aapke online store se product khareedenge, yahan live orders dikhenge.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const isDelivered = order.orderStatus === 'DELIVERED';
              const isRiderAssigned = ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.orderStatus);

              return (
                <div
                  key={order._id || order.orderId}
                  className={`rounded-3xl border p-4 sm:p-5 transition-all space-y-3 ${
                    isDelivered
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : order.orderStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'RIDER_ASSIGNED'
                      ? 'bg-purple-50/30 border-purple-200 shadow-sm'
                      : 'bg-white border-slate-100 shadow-2xs'
                  }`}
                >
                  {/* Order Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-black text-[14px] text-slate-900">
                          #{order.orderId}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isDelivered
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.orderStatus === 'OUT_FOR_DELIVERY'
                              ? 'bg-purple-100 text-purple-800'
                              : order.orderStatus === 'RIDER_ASSIGNED'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.orderStatus.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 mt-0.5">
                        Customer: <strong className="text-slate-800">{order.customerName}</strong> ({order.customerPhone})
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-black text-[16px] text-slate-900 font-mono">
                        ₹{order.totalAmount}
                      </p>
                      <span className="text-[10px] font-extrabold text-primary bg-purple-50 px-1.5 py-0.2 rounded-md">
                        +{order.totalCashbackPoints} Pts Cashback
                      </span>
                    </div>
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
                    <div className="bg-purple-50/70 border border-purple-100 rounded-2xl p-3 flex items-center justify-between text-[12px]">
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
                  )}

                  {/* Order Status Action Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    {order.orderStatus === 'PLACED' && (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleOrderStatusUpdate(order.orderId, 'PREPARING')}
                        className="py-2.5 px-4 rounded-xl btn-primary-gradient text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Accept & Prepare Order</span>
                      </button>
                    )}

                    {(order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PREPARING') && (
                      <button
                        onClick={() => {
                          setAssignRiderModalOrder(order);
                          setRiderForm({ name: '', phone: '', vehicleNo: '' });
                        }}
                        className="py-2.5 px-4 rounded-xl btn-primary-gradient text-white font-bold text-[12px] flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                        <span>Assign Delivery Rider</span>
                      </button>
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
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: IN-STORE CLAIMS (CASH / POS BILL VERIFICATION) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'claims' && (
        <div className="space-y-3 pb-[100px] md:pb-6">
          {isLoading ? (
            <p className="text-[13px] text-on-surface-variant text-center py-8 font-bold">{t('Loading...')}</p>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-12">
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
      {/* ASSIGN RIDER MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {assignRiderModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">two_wheeler</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Assign Delivery Rider
                </h3>
              </div>
              <button
                onClick={() => setAssignRiderModalOrder(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-[11.5px] text-slate-600 leading-snug">
              Order #{assignRiderModalOrder.orderId} ke liye delivery partner ki details enter karein:
            </p>

            <form onSubmit={handleAssignRiderSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Rider Full Name *</label>
                <input
                  type="text"
                  required
                  value={riderForm.name}
                  onChange={(e) => setRiderForm({ ...riderForm, name: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Rider Mobile Number *</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={riderForm.phone}
                  onChange={(e) => setRiderForm({ ...riderForm, phone: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 9876543210"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Vehicle Number (Optional)</label>
                <input
                  type="text"
                  value={riderForm.vehicleNo}
                  onChange={(e) => setRiderForm({ ...riderForm, vehicleNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. UP32 AB 1234"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none focus:bg-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isAssigningRider}
                className="w-full py-3 rounded-xl btn-primary-gradient text-white font-bold text-[13px] shadow-sm cursor-pointer mt-2"
              >
                {isAssigningRider ? 'Assigning...' : 'Confirm & Dispatch Order'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
