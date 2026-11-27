import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import VendorSidebar from './VendorSidebar';
import VendorTopBar from './VendorTopBar';
import VendorBottomNav from './VendorBottomNav';
import { getSocket } from '../../../../services/socket';
import { startStoreOrderContinuousBell, stopStoreOrderContinuousBell } from '../../../../utils/voiceUtils';
import { OrderAPI } from '../../../../services/api';
import { toast } from 'react-hot-toast';

export default function VendorLayout({ children }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [incomingOrderAlert, setIncomingOrderAlert] = useState(null);
  const [selectedPrepMinutes, setSelectedPrepMinutes] = useState(15);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('Kitchen too busy');
  const [isRejectingOrder, setIsRejectingOrder] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // Only show the logo top bar on the dashboard home page (like user app's HomeScreen)
  const isDashboard = location.pathname === '/vendor' || location.pathname === '/vendor/';

  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch (_) {}

    if (socket) {
      const handleGlobalNewOrder = (data) => {
        const order = data?.order || data;
        if (!order) return;

        // Start loud restaurant continuous bell chime
        setIsMuted(false);
        startStoreOrderContinuousBell({
          orderId: order.orderId,
          amount: order.finalPayableAmount || order.totalAmount,
          customerName: order.customerName,
        });

        // Set active incoming order modal
        setIncomingOrderAlert(order);
        setSelectedPrepMinutes(order.estimatedPrepTime || 15);
      };

      socket.on('order:new', handleGlobalNewOrder);
      socket.on('order:paid', handleGlobalNewOrder);

      return () => {
        socket.off('order:new', handleGlobalNewOrder);
        socket.off('order:paid', handleGlobalNewOrder);
        stopStoreOrderContinuousBell();
      };
    }
  }, []);

  // Mute audio bell
  const handleMute = () => {
    stopStoreOrderContinuousBell();
    setIsMuted(true);
    toast('Audio alarm muted', { icon: '🔇' });
  };

  // Accept Order with Preparation Time
  const handleAcceptIncomingOrder = async () => {
    if (!incomingOrderAlert || isAcceptingOrder) return;
    const targetId = incomingOrderAlert.orderId || incomingOrderAlert._id;

    setIsAcceptingOrder(true);
    stopStoreOrderContinuousBell();

    try {
      const res = await OrderAPI.updateOrderStatus(targetId, {
        status: 'PREPARING',
        estimatedPrepTime: selectedPrepMinutes,
      });

      if (res.success || res.data) {
        toast.success(`🎉 Order #${incomingOrderAlert.orderId} Accepted! Prep time: ~${selectedPrepMinutes} mins.`);
        setIncomingOrderAlert(null);
        setShowRejectModal(false);
        // Refresh page state if needed
        window.dispatchEvent(new CustomEvent('vendor:order_updated', { detail: { orderId: incomingOrderAlert.orderId, status: 'PREPARING' } }));
      } else {
        toast.error(res.message || 'Failed to accept order');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not accept order');
    } finally {
      setIsAcceptingOrder(false);
    }
  };

  // Reject Order with Reason
  const handleRejectIncomingOrder = async () => {
    if (!incomingOrderAlert || isRejectingOrder) return;
    const targetId = incomingOrderAlert.orderId || incomingOrderAlert._id;

    setIsRejectingOrder(true);
    stopStoreOrderContinuousBell();

    try {
      const res = await OrderAPI.updateOrderStatus(targetId, {
        status: 'CANCELLED',
        cancellationReason: rejectReason,
      });

      if (res.success || res.data) {
        toast('Order rejected & customer notified', { icon: 'ℹ️' });
        setIncomingOrderAlert(null);
        setShowRejectModal(false);
        window.dispatchEvent(new CustomEvent('vendor:order_updated', { detail: { orderId: incomingOrderAlert.orderId, status: 'CANCELLED' } }));
      } else {
        toast.error(res.message || 'Failed to reject order');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reject order');
    } finally {
      setIsRejectingOrder(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-[#f9f9ff] text-on-surface font-body-lg flex overflow-hidden">
      {/* ─── FULLSCREEN INCOMING STORE ORDER MODAL (Zomato Merchant Partner Style) ─── */}
      {incomingOrderAlert && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl border border-purple-200 overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            {/* Top Flashing Alert Header */}
            <div className="bg-gradient-to-r from-purple-700 via-rose-600 to-purple-800 text-white px-5 py-3.5 flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400" />
                </span>
                <div>
                  <h3 className="font-display font-black text-sm uppercase tracking-wider text-white leading-tight">
                    NEW STORE ORDER RECEIVED!
                  </h3>
                  <p className="text-[11px] text-purple-200 font-semibold">
                    Order #{incomingOrderAlert.orderId} • {incomingOrderAlert.fulfillmentType === 'delivery' ? '🛵 Rider Delivery' : '🛍️ Store Pickup'}
                  </p>
                </div>
              </div>

              {/* Soundbox Mute Toggle */}
              <button
                type="button"
                onClick={handleMute}
                className={`px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer flex items-center gap-1 active:scale-95 ${
                  isMuted ? 'bg-white/20 text-white' : 'bg-amber-400 text-slate-950 shadow-md animate-pulse'
                }`}
                title="Mute Soundbox Bell"
              >
                <span>{isMuted ? '🔇 Muted' : '🔔 Mute Bell'}</span>
              </button>
            </div>

            {/* Body Info Area */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-left hide-scrollbar">
              {/* Order Total & Customer Name */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider block">
                    Total Order Value
                  </span>
                  <span className="text-3xl sm:text-4xl font-display font-black text-purple-950">
                    ₹{incomingOrderAlert.finalPayableAmount || incomingOrderAlert.totalAmount || 0}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 block mt-0.5">
                    {incomingOrderAlert.paymentStatus === 'PAID' ? '🟢 Paid Online (Prepaid)' : '💵 Cash on Delivery'}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider block">
                    Customer
                  </span>
                  <span className="font-display font-black text-slate-900 text-base block">
                    {incomingOrderAlert.customerName || 'Customer'}
                  </span>
                  {incomingOrderAlert.customerPhone && (
                    <a
                      href={`tel:${incomingOrderAlert.customerPhone}`}
                      className="text-xs font-bold text-purple-700 hover:underline flex items-center justify-end gap-0.5 mt-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">call</span>
                      <span>{incomingOrderAlert.customerPhone}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Delivery Address (if Delivery) */}
              {incomingOrderAlert.deliveryAddress && (
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 block mb-0.5">
                    📍 Delivery Address:
                  </span>
                  <p className="text-slate-700 font-medium leading-relaxed">
                    {typeof incomingOrderAlert.deliveryAddress === 'string'
                      ? incomingOrderAlert.deliveryAddress
                      : `${incomingOrderAlert.deliveryAddress.houseNo || ''}, ${incomingOrderAlert.deliveryAddress.street || ''}, ${incomingOrderAlert.deliveryAddress.city || ''}`}
                  </p>
                </div>
              )}

              {/* Order Items List */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-purple-700">receipt_long</span>
                  <span>Items Ordered ({incomingOrderAlert.items?.length || 1}):</span>
                </span>

                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 divide-y divide-slate-200/60 text-xs">
                  {(incomingOrderAlert.items || []).map((item, idx) => (
                    <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-900 font-black text-[11px] flex items-center justify-center">
                          {item.quantity || 1}
                        </span>
                        <span className="font-bold text-slate-900">
                          {item.name || item.title || 'Product'}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-700">
                        ₹{item.price ? item.price * (item.quantity || 1) : 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Notes / Instructions (if any) */}
              {incomingOrderAlert.orderNotes && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block mb-0.5">
                    📝 Cooking / Packing Instructions:
                  </span>
                  <p className="text-amber-950 font-semibold">
                    {incomingOrderAlert.orderNotes}
                  </p>
                </div>
              )}

              {/* ── Preparation Time Selector ── */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center justify-between">
                  <span>How much time to prepare this order?</span>
                  <span className="text-purple-700 font-black">~{selectedPrepMinutes} mins</span>
                </span>

                <div className="grid grid-cols-5 gap-1.5">
                  {[10, 15, 20, 30, 45].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setSelectedPrepMinutes(mins)}
                      className={`py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        selectedPrepMinutes === mins
                          ? 'bg-purple-700 text-white shadow-md scale-105'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Rejection Reason Dropdown (if rejecting) */}
              {showRejectModal && (
                <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 space-y-2.5">
                  <span className="text-xs font-black text-rose-900 block">
                    Select Rejection Reason:
                  </span>
                  <select
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-rose-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                  >
                    <option value="Kitchen too busy">Kitchen too busy</option>
                    <option value="Item out of stock">Item out of stock</option>
                    <option value="Store closing soon">Store closing soon</option>
                    <option value="Order capacity reached">Order capacity reached</option>
                  </select>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRejectModal(false)}
                      className="flex-1 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRejectIncomingOrder}
                      disabled={isRejectingOrder}
                      className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 cursor-pointer shadow-sm"
                    >
                      {isRejectingOrder ? 'Rejecting...' : 'Confirm Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            {!showRejectModal && (
              <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0 shadow-lg">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-xs font-black transition-all cursor-pointer active:scale-95"
                >
                  Reject ✕
                </button>

                <button
                  type="button"
                  onClick={handleAcceptIncomingOrder}
                  disabled={isAcceptingOrder}
                  className="flex-1 py-3.5 rounded-2xl btn-primary-gradient text-white font-display font-black text-sm shadow-xl shadow-purple-600/30 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">timer</span>
                  <span>
                    {isAcceptingOrder ? 'Accepting Order...' : `Accept & Prepare (~${selectedPrepMinutes}m)`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Sidebar (from 1024px; phones & tablets use the bottom nav) */}
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-300 relative z-20 ${isDesktopCollapsed ? 'w-[88px]' : 'w-[260px]'}`}>
        <VendorSidebar 
          isCollapsed={isDesktopCollapsed} 
          onToggleCollapse={() => setIsDesktopCollapsed(!isDesktopCollapsed)} 
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10 lg:mesh-gradient">
        {/* Top Bar — only on dashboard for mobile, always for desktop */}
        <div className={isDashboard ? '' : 'hidden md:block'}>
          <VendorTopBar />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scroll-smooth bg-[#f8f9fc]">
          <div className="w-full max-w-full sm:max-w-none lg:max-w-7xl 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6 lg:py-8 pb-28 lg:pb-8 space-y-4 md:space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <VendorBottomNav />
    </div>
  );
}
