import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';

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

  // Reject Modal
  const [rejectOrderId, setRejectOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('Too far from pickup');

  // Geolocation watcher ref
  const watchIdRef = useRef(null);

  // Check auth and approval status
  useEffect(() => {
    if (!token || !rider) {
      navigate('/delivery/login');
      return;
    }

    if (rider.applicationStatus && rider.applicationStatus !== 'APPROVED') {
      navigate('/delivery/status');
    }
  }, [token, rider, navigate]);

  // Fetch orders and active state
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await DeliveryAPI.getOrders();
      if (res.success && res.data) {
        setActiveOrder(res.data.activeOrder || null);
        setAvailableOrders(res.data.availableOrders || []);
        if (res.data.isOnline !== undefined) {
          setOnlineStatus(res.data.isOnline);
        }
      }
    } catch (err) {
      console.error('Failed to load rider orders', err);
      if (err.response?.status === 403) {
        navigate('/delivery/status');
      }
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setOnlineStatus]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000); // Poll every 5 seconds for new assignments
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // GPS Location Tracking when online
  useEffect(() => {
    if (isOnline && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading, speed } = pos.coords;
          DeliveryAPI.updateLocation({
            lat: latitude,
            lng: longitude,
            heading: heading || 0,
            speed: speed || 0,
          }).catch(() => {});
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    } else {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isOnline]);

  // Toggle availability
  const handleToggleOnline = async () => {
    if (isOnline && activeOrder) {
      toast.error('You cannot go offline while delivering an active order!');
      return;
    }

    setIsTogglingOnline(true);
    const nextStatus = !isOnline;
    try {
      const res = await DeliveryAPI.toggleAvailability({ isOnline: nextStatus });
      if (res.success) {
        setOnlineStatus(nextStatus);
        toast.success(nextStatus ? 'You are now ONLINE & ready to receive orders!' : 'You are now OFFLINE');
        fetchDashboardData();
      }
    } catch (err) {
      toast.error('Failed to update availability status');
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

  // Reject Order
  const handleRejectOrder = async () => {
    if (!rejectOrderId) return;
    setActionLoadingId(rejectOrderId);
    try {
      const res = await DeliveryAPI.rejectOrder(rejectOrderId, rejectReason);
      if (res.success) {
        toast.success('Order declined');
        setAvailableOrders((prev) => prev.filter((o) => o._id !== rejectOrderId));
        setRejectOrderId(null);
      }
    } catch (err) {
      toast.error('Failed to reject order');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Update Stepper Status
  const handleUpdateStatus = async (newStatus, extra = {}) => {
    if (!activeOrder) return;
    setActionLoadingId(activeOrder._id);
    try {
      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, {
        status: newStatus,
        ...extra,
      });
      if (res.success) {
        toast.success(res.message || 'Status updated');
        setActiveOrder(res.data.order);
        if (res.data.totalEarnings !== undefined) {
          updateRider({ totalEarnings: res.data.totalEarnings });
        }
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
        toast.success(`🎉 Delivery Completed! +₹${res.data.earnedAmount || 50} added to your wallet.`);
        setShowOtpModal(false);
        setDeliveryOtpInput('');
        setActiveOrder(null);
        if (res.data.totalEarnings !== undefined) {
          updateRider({ totalEarnings: res.data.totalEarnings });
        }
        fetchDashboardData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP. Ask the customer for the 4-digit code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Google Maps navigation helper
  const openMaps = (address, label = '') => {
    const query = encodeURIComponent(`${label ? label + ', ' : ''}${address}`);
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
                {rider?.vehicleType || 'Bike'} • {rider?.riderId}
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
        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">power_settings_new</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[13px] text-amber-900">You are currently Offline</h3>
              <p className="text-[11.5px] text-amber-700">Toggle to Online to receive nearby delivery assignments.</p>
            </div>
            <button
              onClick={handleToggleOnline}
              disabled={isTogglingOnline}
              className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-[11.5px] shadow-sm hover:bg-amber-700 cursor-pointer shrink-0"
            >
              Go Online
            </button>
          </div>
        )}

        {/* 1. ACTIVE ORDER CARD (ZOMATO-STYLE LIFECYCLE STEPPER) */}
        {activeOrder && (
          <div className="bg-white rounded-3xl border-2 border-primary/30 p-5 shadow-xl space-y-4">
            {/* Header Badge */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-bold text-[12px] text-primary uppercase tracking-wider">
                  Active Delivery In Progress
                </span>
              </div>
              <span className="font-mono text-[11.5px] font-bold text-slate-500">
                #{String(activeOrder.orderId || activeOrder._id).slice(-6)}
              </span>
            </div>

            {/* Zomato-style Stepper indicator */}
            <div className="py-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                <span className={activeOrder.orderStatus === 'RIDER_ASSIGNED' ? 'text-primary font-black' : activeOrder.orderStatus !== 'PENDING' ? 'text-emerald-600' : ''}>
                  1. Assigned
                </span>
                <span className={activeOrder.orderStatus === 'ARRIVED_AT_PICKUP' ? 'text-primary font-black' : ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER', 'DELIVERED'].includes(activeOrder.orderStatus) ? 'text-emerald-600' : ''}>
                  2. At Store
                </span>
                <span className={['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(activeOrder.orderStatus) ? 'text-primary font-black' : ['ARRIVED_AT_CUSTOMER', 'DELIVERED'].includes(activeOrder.orderStatus) ? 'text-emerald-600' : ''}>
                  3. In Transit
                </span>
                <span className={activeOrder.orderStatus === 'ARRIVED_AT_CUSTOMER' ? 'text-primary font-black' : activeOrder.orderStatus === 'DELIVERED' ? 'text-emerald-600' : ''}>
                  4. Drop-off
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{
                    width:
                      activeOrder.orderStatus === 'ARRIVED_AT_CUSTOMER'
                        ? '100%'
                        : ['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(activeOrder.orderStatus)
                        ? '75%'
                        : activeOrder.orderStatus === 'ARRIVED_AT_PICKUP'
                        ? '50%'
                        : '25%',
                  }}
                />
              </div>
            </div>

            {/* Store Pickup Section */}
            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">storefront</span>
                  <span>Pickup Store</span>
                </span>
                <button
                  onClick={() => openMaps(formatAddress(activeOrder.vendor?.address || activeOrder.vendorAddress), activeOrder.vendor?.storeName || activeOrder.vendorName)}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[14px]">navigation</span>
                  <span>Navigate Store</span>
                </button>
              </div>

              <div>
                <h4 className="font-bold text-[14px] text-slate-900">
                  {activeOrder.vendor?.storeName || activeOrder.vendorName || 'Partner Store'}
                </h4>
                <p className="text-[11.5px] text-slate-600 line-clamp-2">
                  {formatAddress(activeOrder.vendor?.address || activeOrder.vendorAddress)}
                </p>
                {activeOrder.vendor?.phone && (
                  <a
                    href={`tel:${activeOrder.vendor.phone}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary mt-1"
                  >
                    <span className="material-symbols-outlined text-[13px]">call</span>
                    <span>Call Store (+91 {activeOrder.vendor.phone})</span>
                  </a>
                )}
              </div>
            </div>

            {/* Customer Drop-off Section */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">person_pin_circle</span>
                  <span>Customer Drop-off</span>
                </span>
                <button
                  onClick={() => openMaps(formatAddress(activeOrder.deliveryAddress))}
                  className="text-[11px] font-bold text-slate-700 hover:text-primary flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[14px]">navigation</span>
                  <span>Navigate Drop</span>
                </button>
              </div>

              <div>
                <h4 className="font-bold text-[13.5px] text-slate-900">
                  {activeOrder.deliveryAddress?.receiverName || activeOrder.user?.name || 'Customer'}
                </h4>
                <p className="text-[11.5px] text-slate-600 line-clamp-2">
                  {formatAddress(activeOrder.deliveryAddress)}
                </p>
                {(activeOrder.deliveryAddress?.phone || activeOrder.user?.phone) && (
                  <a
                    href={`tel:${activeOrder.deliveryAddress?.phone || activeOrder.user?.phone}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 mt-1"
                  >
                    <span className="material-symbols-outlined text-[13px]">call</span>
                    <span>Call Customer</span>
                  </a>
                )}
              </div>
            </div>

            {/* Items Summary */}
            <div className="flex items-center justify-between px-1 text-[12px]">
              <span className="text-slate-500 font-medium">
                {activeOrder.items?.length || 1} items • ₹{activeOrder.finalAmount || activeOrder.totalAmount}
              </span>
              <span className="font-bold text-emerald-600 font-mono">
                Payout: +₹50
              </span>
            </div>

            {/* Stepper Action Buttons */}
            <div className="pt-2">
              {/* State 1: RIDER_ASSIGNED -> Arrived at store */}
              {activeOrder.orderStatus === 'RIDER_ASSIGNED' && (
                <button
                  onClick={() => handleUpdateStatus('ARRIVED_AT_PICKUP')}
                  disabled={actionLoadingId === activeOrder._id}
                  className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                  <span>Arrived at Pickup Store</span>
                </button>
              )}

              {/* State 2: ARRIVED_AT_PICKUP -> Pick up order */}
              {activeOrder.orderStatus === 'ARRIVED_AT_PICKUP' && (
                <button
                  onClick={() => handleUpdateStatus('PICKED_UP')}
                  disabled={actionLoadingId === activeOrder._id}
                  className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[14px] shadow-lg shadow-amber-600/25 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                  <span>Confirm Order Picked Up</span>
                </button>
              )}

              {/* State 3: PICKED_UP / OUT_FOR_DELIVERY -> Arrived at customer */}
              {['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(activeOrder.orderStatus) && (
                <button
                  onClick={() => handleUpdateStatus('ARRIVED_AT_CUSTOMER')}
                  disabled={actionLoadingId === activeOrder._id}
                  className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">near_me</span>
                  <span>Arrived at Customer Location</span>
                </button>
              )}

              {/* State 4: ARRIVED_AT_CUSTOMER -> Enter OTP & Complete */}
              {activeOrder.orderStatus === 'ARRIVED_AT_CUSTOMER' && (
                <button
                  onClick={() => setShowOtpModal(true)}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[14.5px] shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center justify-center gap-2 animate-pulse"
                >
                  <span className="material-symbols-outlined text-[20px]">pin</span>
                  <span>Enter OTP & Complete Delivery</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. AVAILABLE DELIVERY REQUESTS FEED */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display font-black text-[16px] text-slate-900 flex items-center gap-1.5">
              <span>Delivery Requests</span>
              {availableOrders.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-mono flex items-center justify-center font-bold">
                  {availableOrders.length}
                </span>
              )}
            </h2>
            <button
              onClick={fetchDashboardData}
              className="text-[11.5px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              <span>Refresh</span>
            </button>
          </div>

          {availableOrders.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-primary flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[28px]">search_hands</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-[14px] text-slate-800">
                  {activeOrder ? 'Focus on your active delivery' : isOnline ? 'Waiting for nearby orders...' : 'You are currently offline'}
                </h3>
                <p className="text-[12px] text-slate-500 max-w-[280px] mx-auto">
                  {activeOrder
                    ? 'Complete your current delivery to receive new assignment requests.'
                    : isOnline
                    ? 'New customer orders in your area will appear here automatically with pickup distances.'
                    : 'Turn your status ONLINE above to start receiving order assignment alerts.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {availableOrders.map((ord) => (
                <div
                  key={ord._id}
                  className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-md space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-slate-400">
                      Order #{String(ord.orderId || ord._id).slice(-6)}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-mono font-bold text-[12px] border border-emerald-200">
                      +₹50 Payout
                    </span>
                  </div>

                  {/* Store pickup */}
                  <div className="text-left space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Pickup From
                    </span>
                    <h4 className="font-bold text-[14px] text-slate-900 leading-tight">
                      {ord.vendor?.storeName || ord.vendorName || 'Partner Store'}
                    </h4>
                    <p className="text-[11.5px] text-slate-500 line-clamp-1">
                      {formatAddress(ord.vendor?.address || ord.vendorAddress)}
                    </p>
                  </div>

                  {/* Drop area */}
                  <div className="text-left space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Deliver To
                    </span>
                    <p className="text-[12px] text-slate-800 font-medium line-clamp-1">
                      {formatAddress(ord.deliveryAddress)}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => setRejectOrderId(ord._id)}
                      className="py-2.5 px-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-[12.5px] hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAcceptOrder(ord._id)}
                      disabled={actionLoadingId === ord._id}
                      className="py-2.5 px-3 rounded-2xl btn-primary-gradient text-white font-bold text-[12.5px] shadow-md shadow-primary/25 cursor-pointer flex items-center justify-center gap-1"
                    >
                      {actionLoadingId === ord._id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>Accept & Deliver</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 4-DIGIT DELIVERY OTP MODAL */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[380px] w-full p-6 border border-slate-100 shadow-2xl space-y-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[36px]">verified</span>
            </div>

            <div className="space-y-1">
              <h3 className="font-display font-black text-[19px] text-slate-900">
                Customer Delivery OTP
              </h3>
              <p className="text-[12px] text-slate-500 max-w-[280px] mx-auto">
                Ask the customer for the 4-digit secret delivery code displayed on their screen.
              </p>
            </div>

            <form onSubmit={handleCompleteDelivery} className="space-y-4">
              <input
                type="text"
                maxLength={4}
                value={deliveryOtpInput}
                onChange={(e) => setDeliveryOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full py-3.5 text-center text-[26px] tracking-[1em] font-black rounded-2xl bg-slate-50 border-2 border-emerald-500/40 focus:border-emerald-500 outline-none font-mono"
                autoFocus
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-[13px] hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingOtp || deliveryOtpInput.length < 4}
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px] shadow-md shadow-emerald-600/25 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isVerifyingOtp ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Verify & Drop</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DECLINE ORDER MODAL */}
      {rejectOrderId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[360px] w-full p-5 border border-slate-100 shadow-2xl space-y-4 text-left">
            <h3 className="font-display font-black text-[16px] text-slate-900">
              Decline Order Assignment
            </h3>
            <p className="text-[12px] text-slate-500">
              Please choose a reason for declining this request:
            </p>

            <div className="space-y-2">
              {[
                'Too far from pickup',
                'Heavy traffic / Bad route',
                'Vehicle issue / Low battery',
                'Store closed or inaccessible',
              ].map((r) => (
                <label key={r} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 cursor-pointer text-[12px]">
                  <input
                    type="radio"
                    name="rejectReason"
                    value={r}
                    checked={rejectReason === r}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="text-primary"
                  />
                  <span className="font-medium text-slate-800">{r}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectOrderId(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectOrder}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs shadow-md shadow-red-600/20 cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
