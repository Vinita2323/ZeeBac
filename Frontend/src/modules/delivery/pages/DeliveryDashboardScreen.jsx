import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';
import { getSocket } from '../../../services/socket';
import { playDeliveryOrderAlarm, formatOrderTime } from '../../../utils/voiceUtils';

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

  // Pickup Proof Image Capture
  const [pickupProofFile, setPickupProofFile] = useState(null);
  const [pickupProofPreview, setPickupProofPreview] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Ringing Order Alert banner
  const [ringingOrderAlert, setRingingOrderAlert] = useState(null);
  const knownOrderIdsRef = useRef(new Set());
  const initialLoadDoneRef = useRef(false);

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
        const incomingList = res.data.availableOrders || [];
        setAvailableOrders(incomingList);
        if (res.data.isOnline !== undefined) {
          setOnlineStatus(res.data.isOnline);
        }

        // Ring audio alarm for online rider when new orders arrive
        if (isOnline && !res.data.activeOrder && initialLoadDoneRef.current) {
          const newlyArrived = incomingList.filter(
            (o) => !knownOrderIdsRef.current.has(o._id)
          );
          if (newlyArrived.length > 0) {
            const latest = newlyArrived[0];
            const storeName = latest.vendor?.storeName || latest.vendorName || 'Partner Store';
            const payout = latest.deliveryPayout || 50;
            playDeliveryOrderAlarm({ storeName, payout });
            setRingingOrderAlert({
              orderId: latest.orderId || latest._id,
              storeName,
              payout,
            });
            toast.success(`🔔 New Order Received! +₹${payout} from ${storeName}`, { duration: 6000 });
          }
        }

        knownOrderIdsRef.current = new Set(incomingList.map((o) => o._id));
        initialLoadDoneRef.current = true;
      }
    } catch (err) {
      console.error('Failed to load rider orders', err);
      if (err.response?.status === 403) {
        navigate('/delivery/status');
      }
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setOnlineStatus, isOnline]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000); // Poll every 5 seconds for new assignments
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Real-time socket listener for incoming delivery orders
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewOrder = (data) => {
      console.log('Realtime delivery order received:', data);
      if (isOnline && !activeOrder) {
        const storeName = data.storeName || data.order?.vendor?.storeName || 'Partner Store';
        const payout = data.payout || data.order?.deliveryPayout || 50;
        playDeliveryOrderAlarm({ storeName, payout });
        setRingingOrderAlert({
          orderId: data.orderId || data.order?._id,
          storeName,
          payout,
        });
        toast.success(`🔔 New Delivery Order: +₹${payout} from ${storeName}`, { duration: 6000 });
      }
      fetchDashboardData();
    };

    socket.on('delivery:new_order', handleNewOrder);
    return () => {
      socket.off('delivery:new_order', handleNewOrder);
    };
  }, [isOnline, activeOrder, fetchDashboardData]);

  // Test ring function for rider to test sound and audio permissions
  const handleTestRing = () => {
    playDeliveryOrderAlarm({
      storeName: 'Shree Shyama',
      payout: 60,
    });
    setRingingOrderAlert({
      orderId: 'TEST-1001',
      storeName: 'Shree Shyama',
      payout: 60,
    });
    toast.success('🔊 Playing test delivery chime & English announcement!');
  };

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

  // Pickup Photo Selection handler
  const handlePickupPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPEG, PNG, WebP)');
      return;
    }
    setPickupProofFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPickupProofPreview(objectUrl);
  };

  // Update Stepper Status (supports JSON and multipart FormData)
  const handleUpdateStatus = async (newStatus, extra = {}) => {
    if (!activeOrder) return;
    setActionLoadingId(activeOrder._id);
    try {
      const dataToSend =
        extra instanceof FormData
          ? extra
          : { status: newStatus, ...extra };

      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, dataToSend);
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

  // Confirm Pickup with Mandatory Bill Photo Proof
  const handleConfirmPickupWithProof = async () => {
    if (!activeOrder) return;
    if (!pickupProofFile) {
      toast.error('Store invoice/bill ya packed bag ki photo attach karna zaroori hai');
      return;
    }

    const formData = new FormData();
    formData.append('status', 'PICKED_UP');
    formData.append('pickupProof', pickupProofFile);

    await handleUpdateStatus('PICKED_UP', formData);
    setPickupProofFile(null);
    setPickupProofPreview(null);
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
        {/* Ringing New Order Banner */}
        {ringingOrderAlert && (
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white p-4 rounded-3xl shadow-xl flex items-center justify-between border-2 border-white/40 animate-pulse">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px] text-white">notifications_active</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-black text-[14px] leading-tight flex items-center gap-1.5">
                  <span>New Delivery Order Received!</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-white/30 text-[10.5px] font-mono">
                    +₹{ringingOrderAlert.payout}
                  </span>
                </h3>
                <p className="text-[11.5px] text-white/90 truncate">
                  {ringingOrderAlert.storeName}
                </p>
              </div>
            </div>
            <button
              onClick={() => setRingingOrderAlert(null)}
              className="px-3 py-1.5 rounded-xl bg-white text-slate-900 font-bold text-[11.5px] hover:bg-slate-100 cursor-pointer shadow-sm shrink-0 ml-2"
            >
              Mute
            </button>
          </div>
        )}

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
              <div className="flex items-center gap-2">
                {activeOrder.createdAt && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    <span>{formatOrderTime(activeOrder.createdAt)}</span>
                  </span>
                )}
                <span className="font-mono text-[11.5px] font-bold text-slate-500">
                  #{String(activeOrder.orderId || activeOrder._id).slice(-6)}
                </span>
              </div>
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
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">storefront</span>
                    <span>Pickup Store</span>
                  </span>
                  {activeOrder.pickupDistanceKm && (
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-100 text-purple-800">
                      {activeOrder.pickupDistanceKm} km away
                    </span>
                  )}
                </div>
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
              <span className="font-bold text-emerald-600 font-mono flex items-center gap-1">
                <span>Payout: +₹{activeOrder.deliveryPayout || 50}</span>
                {activeOrder.deliveryDistanceKm && (
                  <span className="text-[10.5px] font-medium text-emerald-700/70">
                    ({activeOrder.deliveryDistanceKm} km)
                  </span>
                )}
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

              {/* State 2: ARRIVED_AT_PICKUP -> Mandatory Bill / Order Photo Proof */}
              {activeOrder.orderStatus === 'ARRIVED_AT_PICKUP' && (
                <div className="space-y-3.5 bg-gradient-to-b from-amber-500/[0.08] via-amber-500/[0.03] to-transparent border border-amber-300 rounded-2xl p-3.5 text-left">
                  <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-[20px]">verified</span>
                      <h4 className="font-display font-black text-[13.5px] text-slate-900">
                        Store Pickup Verification Required
                      </h4>
                    </div>
                    <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                      Mandatory
                    </span>
                  </div>

                  {/* Verification Checklist */}
                  <div className="space-y-1 text-[11.5px] text-slate-700 bg-white/70 p-2.5 rounded-xl border border-amber-200/60">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-emerald-600 text-[15px]">check_circle</span>
                      <span>Order ID: <strong>#{activeOrder.orderId}</strong> bill se match karein</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-emerald-600 text-[15px]">check_circle</span>
                      <span><strong>{activeOrder.items?.length || 0} products</strong> packed & sealed hain</span>
                    </div>
                  </div>

                  {/* Photo Capture / Preview Box */}
                  {!pickupProofPreview ? (
                    <div className="bg-white rounded-xl border-2 border-dashed border-amber-300 p-4 text-center space-y-2.5">
                      <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                        <span className="material-symbols-outlined text-[26px]">photo_camera</span>
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">
                          Click Store Invoice Bill or Packed Bag
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Order pick up karne ke liye invoice bill ya packed parcel ki photo zaroori hai
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[17px]">photo_camera</span>
                          <span>Take Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer border border-slate-200"
                        >
                          <span className="material-symbols-outlined text-[17px]">upload_file</span>
                          <span>Gallery</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-emerald-300 p-3 space-y-2.5 shadow-xs">
                      <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-52 bg-slate-900 flex items-center justify-center">
                        <img
                          src={pickupProofPreview}
                          alt="Pickup Invoice Proof"
                          className="max-h-52 w-auto object-contain"
                        />
                        <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-xs">
                          <span className="material-symbols-outlined text-[12px]">done</span>
                          <span>Proof Attached</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-0.5">
                        <span className="truncate max-w-[200px] font-medium text-slate-700">
                          {pickupProofFile?.name || 'Invoice Proof Photo'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPickupProofFile(null);
                            setPickupProofPreview(null);
                          }}
                          className="text-rose-600 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[13px]">replay</span>
                          <span>Retake Photo</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Hidden file inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePickupPhotoSelect}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePickupPhotoSelect}
                  />

                  {/* Confirm Pickup Button */}
                  <button
                    onClick={handleConfirmPickupWithProof}
                    disabled={!pickupProofFile || actionLoadingId === activeOrder._id}
                    className={`w-full py-3.5 rounded-2xl font-bold text-[14px] shadow-lg flex items-center justify-center gap-2 transition-all ${
                      pickupProofFile && actionLoadingId !== activeOrder._id
                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/25 active:scale-95 cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {actionLoadingId === activeOrder._id ? 'sync' : 'inventory_2'}
                    </span>
                    <span>
                      {actionLoadingId === activeOrder._id
                        ? 'Verifying & Confirming Pickup...'
                        : pickupProofFile
                        ? 'Verify & Confirm Order Picked Up'
                        : 'Upload Bill Photo to Confirm Pickup'}
                    </span>
                  </button>
                </div>
              )}

              {/* State 3: PICKED_UP / OUT_FOR_DELIVERY -> Arrived at customer */}
              {['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(activeOrder.orderStatus) && (
                <div className="space-y-2">
                  {activeOrder.riderDetails?.pickupProofImage && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-[11.5px] text-emerald-900">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-emerald-600 text-[16px]">verified</span>
                        <span>Pickup Proof Uploaded & Verified</span>
                      </div>
                      <a
                        href={activeOrder.riderDetails.pickupProofImage}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10.5px] text-emerald-700 font-extrabold underline flex items-center gap-0.5"
                      >
                        <span>View</span>
                        <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                      </a>
                    </div>
                  )}

                  <button
                    onClick={() => handleUpdateStatus('ARRIVED_AT_CUSTOMER')}
                    disabled={actionLoadingId === activeOrder._id}
                    className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">near_me</span>
                    <span>Arrived at Customer Location</span>
                  </button>
                </div>
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
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestRing}
                title="Test order ringtone sound & audio"
                className="text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[13px]">volume_up</span>
                <span>Test Ring</span>
              </button>
              <button
                onClick={fetchDashboardData}
                className="text-[11.5px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                <span>Refresh</span>
              </button>
            </div>
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-slate-400">
                        Order #{String(ord.orderId || ord._id).slice(-6)}
                      </span>
                      {ord.createdAt && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">schedule</span>
                          <span>{formatOrderTime(ord.createdAt)}</span>
                        </span>
                      )}
                      {ord.pickupDistanceKm && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-primary border border-purple-200 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">near_me</span>
                          <span>{ord.pickupDistanceKm} km away</span>
                        </span>
                      )}
                      {ord.isWithin5km && ord.pickupDistanceKm && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Within 5km
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-mono font-bold text-[12px] border border-emerald-200 block">
                        +₹{ord.deliveryPayout || 50} Payout
                      </span>
                      {ord.deliveryDistanceKm && (
                        <span className="text-[9.5px] text-slate-400 font-medium block mt-0.5">
                          {ord.deliveryDistanceKm} km drop
                        </span>
                      )}
                    </div>
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
