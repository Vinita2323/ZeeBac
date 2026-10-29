import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';
import { connectSocket } from '../../../services/socket';

const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [
      addr.fullAddress || addr.street,
      addr.landmark,
      addr.city,
      addr.state,
      addr.pincode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
  }
  return String(addr);
};

export default function DeliveryDashboardScreen() {
  const navigate = useNavigate();
  const rider = useDeliveryStore((state) => state.rider);
  const token = useDeliveryStore((state) => state.token);
  const isOnline = useDeliveryStore((state) => state.isOnline);
  const setOnlineStatus = useDeliveryStore((state) => state.setOnlineStatus);
  const updateRider = useDeliveryStore((state) => state.updateRider);

  const [activeOrder, setActiveOrder] = useState(null);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // OTP Modal for delivery completion
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [deliveryOtpInput, setDeliveryOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Check auth
  useEffect(() => {
    if (!token || !rider) {
      navigate('/delivery/login');
    }
  }, [token, rider, navigate]);

  // Fetch orders and active state
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await DeliveryAPI.getOrders();
      if (res.success) {
        setActiveOrder(res.data.activeOrder || null);
        setAvailableOrders(res.data.availableOrders || []);
        if (res.data.isOnline !== undefined) {
          setOnlineStatus(res.data.isOnline);
        }
      }
    } catch (err) {
      console.error('Failed to load rider orders', err);
    } finally {
      setIsLoading(false);
    }
  }, [setOnlineStatus]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 6000); // Poll every 6 seconds for new orders
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Toggle availability
  const handleToggleOnline = async () => {
    setIsTogglingOnline(true);
    const nextStatus = !isOnline;
    try {
      const res = await DeliveryAPI.toggleAvailability({ isOnline: nextStatus });
      if (res.success) {
        setOnlineStatus(nextStatus);
        toast.success(res.message);
        fetchDashboardData();
      }
    } catch (err) {
      toast.error('Failed to update availability');
    } finally {
      setIsTogglingOnline(false);
    }
  };

  // Accept Order
  const handleAcceptOrder = async (orderId) => {
    setActionLoadingId(orderId);
    try {
      const res = await DeliveryAPI.acceptOrder(orderId);
      if (res.success) {
        toast.success('Order accepted! Proceed to pickup store.');
        setActiveOrder(res.data.order);
        setAvailableOrders((prev) => prev.filter((o) => o._id !== orderId));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not accept order');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Update status (e.g. Mark Picked Up)
  const handleMarkPickedUp = async () => {
    if (!activeOrder) return;
    setActionLoadingId(activeOrder._id);
    try {
      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, { status: 'PICKED_UP' });
      if (res.success) {
        toast.success('Order Picked Up! Navigate to customer drop-off.');
        setActiveOrder((prev) => ({ ...prev, orderStatus: 'OUT_FOR_DELIVERY' }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update order status');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Complete Delivery with OTP
  const handleCompleteDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryOtpInput.trim() || isVerifyingOtp || !activeOrder) return;

    setIsVerifyingOtp(true);
    try {
      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, {
        status: 'DELIVERED',
        deliveryOtp: deliveryOtpInput.trim(),
      });

      if (res.success) {
        toast.success(`🎉 Delivery Complete! +₹${res.data.earnedAmount || 50} added to earnings.`);
        setShowOtpModal(false);
        setDeliveryOtpInput('');
        setActiveOrder(null);
        if (res.data.totalEarnings !== undefined) {
          updateRider({ totalEarnings: res.data.totalEarnings });
        }
        fetchDashboardData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP. Ask customer for 4-digit code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Google Maps navigation helper
  const openMaps = (address, storeName = '') => {
    const query = encodeURIComponent(`${storeName ? storeName + ', ' : ''}${address}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <div className="mesh-gradient min-h-screen flex flex-col font-body-lg pb-24 text-on-surface">
      {/* Top Rider Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 shadow-xs">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <span className="material-symbols-outlined text-[24px]">sports_motorsports</span>
            </div>
            <div className="text-left">
              <h1 className="font-display font-black text-[15px] text-slate-900 leading-tight">
                {rider?.name || 'Rider Partner'}
              </h1>
              <p className="text-[11px] font-mono text-slate-500 font-bold">
                {rider?.vehicleNo || 'Bike'} • {rider?.riderId}
              </p>
            </div>
          </div>

          {/* Online/Offline Toggle Button */}
          <button
            onClick={handleToggleOnline}
            disabled={isTogglingOnline}
            className={`px-3.5 py-1.5 rounded-full font-bold text-[12px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}
            />
            <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-[480px] w-full mx-auto p-4 space-y-4 text-left">
        {/* Offline Notice Banner */}
        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-start gap-3 text-left">
            <span className="material-symbols-outlined text-amber-600 text-[24px] shrink-0">toggle_off</span>
            <div className="space-y-1">
              <h3 className="font-bold text-[13.5px] text-amber-900">You are currently OFFLINE</h3>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                Toggle the switch above to go <strong>ONLINE</strong> and start receiving nearby delivery orders!
              </p>
              <button
                onClick={handleToggleOnline}
                className="mt-2 px-3 py-1 bg-amber-600 text-white font-bold text-[11px] rounded-xl cursor-pointer"
              >
                Go Online Now
              </button>
            </div>
          </div>
        )}

        {/* ── SECTION 1: ACTIVE IN-PROGRESS DELIVERY ── */}
        {activeOrder && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-primary/30 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-black text-[10.5px] uppercase tracking-wider">
                  Active Delivery
                </span>
                <span className="font-mono text-[12px] font-bold text-slate-500">
                  #{activeOrder.orderId}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-[12px]">
                Earn ₹50
              </span>
            </div>

            {/* Stepper Status Pill */}
            <div className="bg-purple-50/70 rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  {activeOrder.orderStatus === 'OUT_FOR_DELIVERY' ? 'local_shipping' : 'storefront'}
                </span>
                <div>
                  <p className="text-[11px] uppercase font-bold text-primary tracking-wider">Current Stage</p>
                  <p className="text-[13px] font-extrabold text-slate-900">
                    {activeOrder.orderStatus === 'OUT_FOR_DELIVERY'
                      ? 'Out for Delivery (Going to Customer)'
                      : 'Assigned (Heading to Store Pickup)'}
                  </p>
                </div>
              </div>
            </div>

            {/* 1. Pickup Store Info */}
            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 border border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[15px] text-amber-500">store</span>
                    <span>1. Pickup Store</span>
                  </div>
                  <h4 className="font-extrabold text-[14px] text-slate-900 mt-0.5">
                    {activeOrder.vendorId?.storeName || activeOrder.storeName || 'Merchant Store'}
                  </h4>
                  <p className="text-[12px] text-slate-600 mt-0.5">
                    {formatAddress(activeOrder.vendorId?.address) || 'Store Address'}
                  </p>
                </div>
              </div>

              {/* Action buttons for Store */}
              <div className="flex items-center gap-2 pt-1">
                {activeOrder.vendorId?.phone && (
                  <a
                    href={`tel:${activeOrder.vendorId.phone}`}
                    className="flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-[11.5px] flex items-center justify-center gap-1.5 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">call</span>
                    <span>Call Store</span>
                  </a>
                )}
                <button
                  onClick={() =>
                    openMaps(
                      formatAddress(activeOrder.vendorId?.address),
                      activeOrder.vendorId?.storeName || ''
                    )
                  }
                  className="flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-[11.5px] flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] text-blue-600">navigation</span>
                  <span>Navigate Store</span>
                </button>
              </div>
            </div>

            {/* 2. Customer Drop-off Info */}
            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 border border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[15px] text-emerald-500">pin_drop</span>
                    <span>2. Customer Drop-off</span>
                  </div>
                  <h4 className="font-extrabold text-[14px] text-slate-900 mt-0.5">
                    {activeOrder.customerDetails?.name || activeOrder.customerName || 'Customer'}
                  </h4>
                  <p className="text-[12px] text-slate-600 mt-0.5">
                    {activeOrder.customerDetails?.deliveryAddress || 'Customer Address'}
                  </p>
                </div>
              </div>

              {/* Action buttons for Customer */}
              <div className="flex items-center gap-2 pt-1">
                {activeOrder.customerDetails?.phone && (
                  <a
                    href={`tel:${activeOrder.customerDetails.phone}`}
                    className="flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-[11.5px] flex items-center justify-center gap-1.5 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">call</span>
                    <span>Call Customer</span>
                  </a>
                )}
                <button
                  onClick={() =>
                    openMaps(activeOrder.customerDetails?.deliveryAddress || '')
                  }
                  className="flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-[11.5px] flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] text-blue-600">navigation</span>
                  <span>Navigate Customer</span>
                </button>
              </div>
            </div>

            {/* Delivery Action Stepper Button */}
            <div className="pt-2">
              {activeOrder.orderStatus !== 'OUT_FOR_DELIVERY' ? (
                <button
                  onClick={handleMarkPickedUp}
                  disabled={actionLoadingId === activeOrder._id}
                  className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-black text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">inventory</span>
                  <span>Order Picked Up from Store</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowOtpModal(true)}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-700 text-white font-black text-[14px] shadow-lg shadow-green-600/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">verified</span>
                  <span>Delivered — Enter Customer OTP</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── SECTION 2: AVAILABLE ORDERS FEED ── */}
        {!activeOrder && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-black text-[15px] text-slate-900">
                Nearby Delivery Orders
              </h2>
              <span className="text-[11px] font-bold text-slate-500">
                {availableOrders.length} available
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : availableOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm space-y-2">
                <span className="material-symbols-outlined text-slate-300 text-[48px]">two_wheeler</span>
                <p className="font-bold text-[14px] text-slate-800">No pending delivery orders right now</p>
                <p className="text-[12px] text-slate-500 max-w-[260px] mx-auto">
                  Keep your status ONLINE. New orders from stores will appear here automatically!
                </p>
              </div>
            ) : (
              availableOrders.map((order) => (
                <div
                  key={order._id}
                  className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm space-y-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-[14px] text-slate-900">
                        {order.vendorId?.storeName || order.storeName || 'Partner Store'}
                      </h4>
                      <p className="text-[11.5px] text-slate-500 font-medium">
                        Order #{order.orderId} • {order.items?.length || 1} items
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-[12px]">
                      Earn ₹50
                    </span>
                  </div>

                  {/* Addresses summary */}
                  <div className="space-y-1.5 text-[12px] text-slate-700 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-amber-500 text-[16px] shrink-0 mt-0.5">store</span>
                      <p className="truncate">
                        <strong>Pickup:</strong> {formatAddress(order.vendorId?.address) || 'Store Location'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-emerald-500 text-[16px] shrink-0 mt-0.5">pin_drop</span>
                      <p className="truncate">
                        <strong>Drop-off:</strong> {order.customerDetails?.deliveryAddress || 'Customer Address'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleAcceptOrder(order._id)}
                      disabled={actionLoadingId === order._id || !isOnline}
                      className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12.5px] shadow-sm shadow-primary/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {actionLoadingId === order._id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>Accept Order</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ── 4-DIGIT DELIVERY OTP MODAL ── */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-reveal">
          <div className="bg-white rounded-3xl p-6 max-w-[340px] w-full shadow-2xl text-center space-y-4 relative">
            <button
              onClick={() => setShowOtpModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[32px]">verified_user</span>
            </div>

            <div>
              <h3 className="font-display font-black text-[18px] text-slate-900">
                Confirm Delivery
              </h3>
              <p className="text-[12px] text-slate-500 mt-1">
                Ask the customer for their 4-digit Delivery OTP to complete this delivery:
              </p>
            </div>

            <form onSubmit={handleCompleteDelivery} className="space-y-3">
              <input
                type="text"
                maxLength={4}
                value={deliveryOtpInput}
                onChange={(e) => setDeliveryOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full py-3 text-center text-[26px] tracking-[0.8em] font-mono font-black rounded-2xl bg-slate-50 border-2 border-emerald-400 focus:border-emerald-600 outline-none"
                autoFocus
              />

              <button
                type="submit"
                disabled={deliveryOtpInput.length < 4 || isVerifyingOtp}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13.5px] shadow-lg shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isVerifyingOtp ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">done_all</span>
                    <span>Verify & Complete</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Rider Bottom Navigation Bar */}
      <DeliveryBottomNav />
    </div>
  );
}
