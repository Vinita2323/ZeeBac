import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryTopBar from '../components/DeliveryTopBar';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';
import { getSocket } from '../../../services/socket';
import { playDeliveryOrderAlarm, formatOrderTime } from '../../../utils/voiceUtils';

const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr.trim();
  if (typeof addr === 'object') {
    if (addr.fullAddress && addr.fullAddress.trim().length > 10) {
      return addr.fullAddress.trim();
    }
    const parts = [
      addr.houseNo,
      addr.street,
      addr.landmark ? `Near ${addr.landmark}` : null,
      addr.city,
      addr.state,
      addr.pincode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
  }
  return String(addr);
};

const resolveStoreAddress = (order) => {
  if (!order) return 'Corporate House, RNT Marg, Regal Square, Indore';
  const vendor = order.vendor || order.vendorId;
  const rawAddr = vendor?.address || order.pickupAddress || order.vendorAddress;
  const formatted = formatAddress(rawAddr);
  if (formatted && formatted.length > 5) return formatted;
  const storeName = vendor?.storeName || order.storeName || 'Partner Store';
  return `${storeName}, Corporate House, RNT Marg, Regal Square, Indore`;
};

const resolveCustomerAddress = (order) => {
  if (!order) return 'Corporate House, RNT Marg, Near Regal Square, Indore - 452001';
  const rawAddr = order.deliveryAddress;
  const formatted = formatAddress(rawAddr);
  if (formatted && formatted.length > 5) return formatted;
  return 'Corporate House, RNT Marg, Near Regal Square, Indore - 452001';
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

  // Ringing Order Alert banner & Fullscreen Order Prompt (Image 1)
  const [ringingOrderAlert, setRingingOrderAlert] = useState(null);
  const [orderCountdown, setOrderCountdown] = useState(45);
  const [selectedOfferModal, setSelectedOfferModal] = useState(false);
  const knownOrderIdsRef = useRef(new Set());
  const initialLoadDoneRef = useRef(false);

  // Zomato-style 45s ticking countdown timer for incoming delivery alerts
  useEffect(() => {
    if (!ringingOrderAlert) {
      setOrderCountdown(45);
      return;
    }
    setOrderCountdown(45);
    const timer = setInterval(() => {
      setOrderCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setRingingOrderAlert(null);
          return 45;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [ringingOrderAlert]);

  // Real dashboard stats & payout config
  const [todayStats, setTodayStats] = useState({
    todayEarnings: 0,
    todayDeliveriesCount: 0,
    todayDistanceKm: 0,
  });
  const [payoutConfig, setPayoutConfig] = useState({
    baseFare: 30,
    perKmRate: 10,
    minPayout: 30,
    surgeBonus: 0,
  });
  const [riderDetails, setRiderDetails] = useState(null);

  // Rider location coordinates
  const [riderCoords, setRiderCoords] = useState({ lat: 26.8467, lng: 80.9462 }); // Default Lucknow

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
        if (res.data.todayStats) {
          setTodayStats(res.data.todayStats);
        }
        if (res.data.payoutConfig) {
          setPayoutConfig(res.data.payoutConfig);
        }
        if (res.data.riderDetails) {
          setRiderDetails(res.data.riderDetails);
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
            setRingingOrderAlert(latest);
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
    const interval = setInterval(fetchDashboardData, 5000);
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
        setRingingOrderAlert(data.order || data);
        toast.success(`🔔 New Delivery Order: +₹${payout} from ${storeName}`, { duration: 6000 });
      }
      fetchDashboardData();
    };

    socket.on('delivery:new_order', handleNewOrder);
    return () => {
      socket.off('delivery:new_order', handleNewOrder);
    };
  }, [isOnline, activeOrder, fetchDashboardData]);

  // GPS Location Tracking when online
  useEffect(() => {
    if (isOnline && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading, speed } = pos.coords;
          setRiderCoords({ lat: latitude, lng: longitude });
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
        toast.success(nextStatus ? '🟢 You are now ONLINE & ready to receive orders!' : '⚪ You are now OFFLINE');
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
        toast.success('🎉 Order accepted! Proceed to pickup store.');
        setActiveOrder(res.data.order);
        setAvailableOrders((prev) => prev.filter((o) => o._id !== orderId));
        setRingingOrderAlert(null);
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
        setRingingOrderAlert(null);
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

  // Update Stepper Status
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
        toast.success(`🎉 Delivery Completed! +₹${res.data.earnedAmount || 50} added to your pocket.`);
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

  const openMaps = (address, label = '') => {
    const query = encodeURIComponent(`${label ? label + ', ' : ''}${address}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans relative">
      {/* ─── Top Header (From Images 5, 6, 7, 9) ─── */}
      <DeliveryTopBar
        onToggleOnline={handleToggleOnline}
        isTogglingOnline={isTogglingOnline}
        activeOrder={activeOrder}
      />

      <main className="max-w-[480px] mx-auto text-left relative">
        {/* ─── TOP MAP VIEW AREA (From Images 1, 11) ─── */}
        <div className="relative h-56 sm:h-64 w-full bg-slate-200 overflow-hidden border-b border-slate-100">
          {/* Simulated Clean Road Map Canvas */}
          <div className="absolute inset-0 bg-[#e5e9ec] flex items-center justify-center">
            {/* Map Roads Vector Simulation */}
            <svg className="w-full h-full opacity-60" viewBox="0 0 500 300" preserveAspectRatio="none">
              <path d="M-20,120 Q180,60 300,140 T520,100" fill="none" stroke="#ffffff" strokeWidth="24" />
              <path d="M-20,120 Q180,60 300,140 T520,100" fill="none" stroke="#fbd38d" strokeWidth="12" />
              <path d="M120,-20 L220,320" fill="none" stroke="#ffffff" strokeWidth="18" />
              <path d="M380,-20 L300,320" fill="none" stroke="#ffffff" strokeWidth="14" />
              <path d="M0,240 Q250,220 500,260" fill="none" stroke="#ffffff" strokeWidth="16" />
            </svg>

            {/* Live Operational Context Badges on Map */}
            {activeOrder ? (
              <>
                <div className="absolute top-6 left-4 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-800 shadow-sm border border-purple-200 flex items-center gap-1.5 max-w-[200px]">
                  <span className="material-symbols-outlined text-[14px] text-purple-700 shrink-0">storefront</span>
                  <span className="truncate">{activeOrder.storeName || 'Pickup Store'}</span>
                </div>
                <div className="absolute top-16 right-4 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-800 shadow-sm border border-emerald-200 flex items-center gap-1.5 max-w-[200px]">
                  <span className="material-symbols-outlined text-[14px] text-emerald-700 shrink-0">home_pin</span>
                  <span className="truncate">{activeOrder.customerName || 'Customer Drop'}</span>
                </div>
              </>
            ) : availableOrders.length > 0 ? (
              <div className="absolute top-6 left-4 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-800 shadow-sm border border-purple-200 flex items-center gap-1.5 max-w-[240px]">
                <span className="material-symbols-outlined text-[14px] text-purple-700 shrink-0">notifications_active</span>
                <span className="truncate">{availableOrders[0]?.storeName || availableOrders[0]?.vendor?.storeName || 'Nearby Orders Ready'}</span>
              </div>
            ) : (
              <div className="absolute top-6 left-4 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-800 shadow-sm border border-slate-200 flex items-center gap-1.5 max-w-[240px]">
                <span className="material-symbols-outlined text-[14px] text-blue-600 shrink-0">near_me</span>
                <span className="truncate">{riderDetails?.city || rider?.address?.city || 'Lucknow Zone'} • Active Fleet Area</span>
              </div>
            )}

            {/* Rider Location Pin with Pulsing Ripple */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="relative">
                {isOnline && (
                  <span className="absolute -inset-4 rounded-full bg-blue-500/30 animate-ping" />
                )}
                <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white text-white flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-[18px]">sports_motorsports</span>
                </div>
              </div>
            </div>

            {/* Live GPS Status Pill */}
            <div className="absolute bottom-3 left-4 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-700 shadow-2xs flex items-center gap-1.5 border border-slate-200">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{isOnline ? `GPS Active • ${riderDetails?.city || rider?.address?.city || 'Active Zone'}` : 'GPS Idle • Offline'}</span>
            </div>
          </div>
        </div>

        {/* ─── SLIDING BOTTOM SHEET CONTAINER (From Images 9, 10, 11) ─── */}
        <div className="relative -mt-6 bg-[#f5f6f8] rounded-t-3xl pt-2 px-4 pb-6 space-y-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
          {/* Centered Drag Handle (From Images 9, 10, 11) */}
          <div className="w-10 h-1.5 rounded-full bg-slate-300 mx-auto my-1" />

          {/* ─── RIDER REFERRAL BANNER ─── */}
          <div
            onClick={() => {
              const code = riderDetails?.riderId || rider?.riderId || rider?.zeebacId || rider?.phone || 'ZBD-RIDER';
              const shareUrl = `${window.location.origin}/delivery/login?ref=${encodeURIComponent(code)}`;
              if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl);
                toast.success(`Referral link copied! Code: ${code}`);
              }
            }}
            className="bg-gradient-to-r from-[#173f7a] to-[#0f2a52] text-white rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div>
              <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-wider">
                RIDER REFERRAL
              </span>
              <h3 className="font-display font-black text-base sm:text-lg text-white mt-1 leading-tight">
                Invite Delivery Partners
              </h3>
              <p className="text-xs text-blue-200 font-bold mt-0.5 flex items-center gap-1 group-hover:text-amber-300 transition-colors">
                <span>Code: {riderDetails?.riderId || rider?.riderId || rider?.zeebacId || 'ZBD-RIDER'} • Tap to copy</span>
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
              <span className="material-symbols-outlined text-[28px] text-amber-300">share</span>
            </div>
          </div>

          {/* ─── CARD 1: LIVE FLEET DUTY STATUS ─── */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-2xs">
            <div className="bg-black text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                <span className="font-display font-black text-sm tracking-tight">
                  {isOnline ? 'Duty Active (Online)' : 'Duty Offline'}
                </span>
              </div>
              <span className="text-[10.5px] font-mono text-slate-300">
                {riderDetails?.city || rider?.address?.city || 'Active Zone'}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <h4 className="font-display font-black text-base text-slate-900">
                  {isOnline ? '🟢 Live and ready to accept store orders' : '⚪ You are currently offline'}
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Payout Rate: ₹{payoutConfig.baseFare} base + ₹{payoutConfig.perKmRate}/km distance on every delivered drop
                </p>
              </div>

              <button
                onClick={handleToggleOnline}
                disabled={isTogglingOnline}
                className={`w-full py-3 rounded-2xl font-display font-black text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 ${
                  isOnline
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-black hover:bg-slate-900 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isOnline ? 'check_circle' : 'power_settings_new'}
                </span>
                <span>{isOnline ? 'You are Online • Tap to go Offline' : 'Go Online to Receive Orders'}</span>
              </button>
            </div>
          </div>

          {/* ─── CARD 2: TODAY'S REAL PROGRESS ─── */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-2xs">
            <div className="bg-black text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                <span className="font-display font-black text-sm tracking-tight">Today's Progress</span>
              </div>
              <span className="text-[10px] text-slate-300 font-bold uppercase">Live Stats</span>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 divide-x divide-slate-100">
              {/* Left Column */}
              <div className="space-y-4">
                <div
                  onClick={() => navigate('/delivery/earnings')}
                  className="cursor-pointer group"
                >
                  <span className="text-2xl font-display font-black text-slate-950 block group-hover:text-purple-700 transition-colors">
                    ₹{todayStats.todayEarnings.toLocaleString('en-IN')}
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Today's Earnings</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>

                <div
                  onClick={() => navigate('/delivery/history')}
                  className="cursor-pointer group"
                >
                  <span className="text-xl font-display font-black text-slate-950 block group-hover:text-purple-700 transition-colors">
                    {todayStats.todayDeliveriesCount} {todayStats.todayDeliveriesCount === 1 ? 'Drop' : 'Drops'}
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Delivered Today</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>
              </div>

              {/* Right Column */}
              <div className="pl-4 space-y-4">
                <div
                  onClick={() => navigate('/delivery/history')}
                  className="cursor-pointer group"
                >
                  <span className="text-2xl font-display font-black text-slate-950 block group-hover:text-purple-700 transition-colors">
                    {todayStats.todayDistanceKm} km
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Distance Covered</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>

                <div
                  onClick={() => navigate('/delivery/profile')}
                  className="cursor-pointer group"
                >
                  <span className="text-xl font-display font-black text-slate-950 block group-hover:text-purple-700 transition-colors">
                    ★ {(riderDetails?.rating || rider?.rating || 5).toFixed(1)}
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Partner Rating</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── CARD 3: LIVE PAYOUT STRUCTURE & RATE CARD ─── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-display font-black text-sm text-slate-900">Live Rate Card & Payouts</h3>
              <button
                onClick={() => setSelectedOfferModal(true)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer"
              >
                <span>Breakdown</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-2xs">
              <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
                <div>
                  <h4 className="font-display font-black text-xs sm:text-sm tracking-tight text-white">
                    STANDARD_PAYOUT_CONFIG
                  </h4>
                  <p className="text-[10px] text-slate-300 font-medium mt-0.5 flex items-center gap-1">
                    <span>Live Fleet Model</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 font-bold">Active</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-white block">₹{payoutConfig.baseFare}</span>
                  <span className="text-[10px] text-slate-300 uppercase font-bold">Base Fare</span>
                </div>
              </div>

              <div className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Guaranteed Base Pay</span>
                  <span className="font-bold text-slate-900">₹{payoutConfig.baseFare} / delivery</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Distance Pay</span>
                  <span className="font-bold text-slate-900">+₹{payoutConfig.perKmRate} per km</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Minimum Guaranteed Floor</span>
                  <span className="font-bold text-slate-900">₹{payoutConfig.minPayout} min per drop</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 font-medium">Surge Bonus</span>
                  <span className={`font-bold ${payoutConfig.surgeBonus > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {payoutConfig.surgeBonus > 0 ? `+₹${payoutConfig.surgeBonus} Active` : 'Standard Rate'}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedOfferModal(true)}
                  className="w-full mt-2 py-2.5 rounded-xl border border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-display font-black text-xs transition-all cursor-pointer shadow-2xs"
                >
                  View full payout policy
                </button>
              </div>
            </div>
          </div>

          {/* ─── ACTIVE ORDER LIFECYCLE CARD (If delivering) ─── */}
          {activeOrder && (
            <div className="bg-white rounded-3xl border-2 border-emerald-500 p-4 sm:p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-black text-xs text-emerald-800 uppercase tracking-wider">
                    Active Delivery In Progress
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-500">
                  #{String(activeOrder.orderId || activeOrder._id).slice(-6)}
                </span>
              </div>

              {activeOrder.deliverySchedule?.deliveryType === 'SCHEDULED' && (
                <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-amber-900 text-xs">
                  <span className="material-symbols-outlined text-amber-700 text-[16px]">calendar_clock</span>
                  <div>
                    <span className="font-black text-[10.5px] uppercase tracking-wide block">Scheduled Delivery</span>
                    <span className="text-[11px] font-bold text-amber-800">
                      📅 {activeOrder.deliverySchedule.scheduledDate || 'Scheduled'} • ⏰ {activeOrder.deliverySchedule.scheduledSlot || 'Slot'}
                    </span>
                  </div>
                </div>
              )}

              {/* Store & Customer Info */}
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase text-purple-700">Pickup Store</span>
                    <button
                      onClick={() => openMaps(formatAddress(activeOrder.vendor?.address || activeOrder.vendorAddress), activeOrder.vendor?.storeName || activeOrder.vendorName)}
                      className="font-bold text-purple-700 hover:underline flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">navigation</span>
                      <span>Navigate</span>
                    </button>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {activeOrder.vendor?.storeName || activeOrder.vendorName || 'Partner Store'}
                  </h4>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    {formatAddress(activeOrder.vendor?.address || activeOrder.vendorAddress)}
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase text-slate-500">Customer Drop</span>
                    <button
                      onClick={() => openMaps(formatAddress(activeOrder.deliveryAddress))}
                      className="font-bold text-slate-700 hover:underline flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">navigation</span>
                      <span>Navigate</span>
                    </button>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {activeOrder.deliveryAddress?.receiverName || activeOrder.user?.name || 'Customer'}
                  </h4>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    {formatAddress(activeOrder.deliveryAddress)}
                  </p>
                </div>
              </div>

              {/* Stepper Buttons */}
              <div>
                {activeOrder.orderStatus === 'RIDER_ASSIGNED' && (
                  <button
                    onClick={() => handleUpdateStatus('ARRIVED_AT_PICKUP')}
                    disabled={actionLoadingId === activeOrder._id}
                    className="w-full py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    Arrived at Pickup Store
                  </button>
                )}

                {activeOrder.orderStatus === 'ARRIVED_AT_PICKUP' && (
                  <div className="space-y-3 bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                    <p className="font-black text-xs text-amber-900">
                      Store Invoice Bill / Parcel Photo Required
                    </p>
                    {!pickupProofPreview ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                          <span>Take Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">upload_file</span>
                          <span>Gallery</span>
                        </button>
                      </div>
                    ) : (
                      <div className="relative rounded-xl overflow-hidden max-h-40 bg-black flex items-center justify-center">
                        <img src={pickupProofPreview} alt="Proof" className="max-h-40 object-contain" />
                        <button
                          type="button"
                          onClick={() => {
                            setPickupProofFile(null);
                            setPickupProofPreview(null);
                          }}
                          className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 text-white text-[10px] rounded-md font-bold"
                        >
                          Retake
                        </button>
                      </div>
                    )}

                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePickupPhotoSelect} />
                    <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickupPhotoSelect} />

                    <button
                      onClick={handleConfirmPickupWithProof}
                      disabled={!pickupProofFile || actionLoadingId === activeOrder._id}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs ${
                        pickupProofFile ? 'bg-amber-600 text-white cursor-pointer' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Confirm Order Picked Up
                    </button>
                  </div>
                )}

                {['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(activeOrder.orderStatus) && (
                  <button
                    onClick={() => handleUpdateStatus('ARRIVED_AT_CUSTOMER')}
                    disabled={actionLoadingId === activeOrder._id}
                    className="w-full py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    Arrived at Customer Location
                  </button>
                )}

                {activeOrder.orderStatus === 'ARRIVED_AT_CUSTOMER' && (
                  <button
                    onClick={() => setShowOtpModal(true)}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg cursor-pointer animate-pulse"
                  >
                    Enter Customer OTP & Complete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── AVAILABLE DELIVERY REQUESTS (Zomato Rider Style) ─── */}
          {availableOrders.length > 0 && !activeOrder && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-display font-black text-sm text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Nearby Orders Available ({availableOrders.length})</span>
                </h3>
                <span className="text-[11px] text-slate-500 font-bold">Tap card to preview</span>
              </div>

              {availableOrders.map((ord) => {
                const isScheduled = ord.deliverySchedule?.deliveryType === 'SCHEDULED';
                const timingLabel = isScheduled
                  ? `📅 Scheduled: ${ord.deliverySchedule?.scheduledSlot || 'Today'}`
                  : `⚡ Instant Drop • ${formatOrderTime(ord.createdAt)}`;
                const storeName = ord.vendor?.storeName || ord.vendorName || ord.storeName || 'Store Order';
                const storeAddr = resolveStoreAddress(ord);
                const custName = ord.customerName || ord.deliveryAddress?.receiverName || 'Customer';
                const custAddr = resolveCustomerAddress(ord);
                const itemsCount = ord.items?.length || 1;
                const isPrepaid = ord.paymentStatus === 'PAID' || (ord.paymentMethod && ord.paymentMethod !== 'CASH' && ord.paymentMethod !== 'COD');
                const payout = ord.deliveryPayout || 40;

                return (
                  <div
                    key={ord._id}
                    onClick={() => setRingingOrderAlert(ord)}
                    className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-slate-100 hover:border-emerald-500 shadow-sm transition-all cursor-pointer space-y-3 group"
                  >
                    {/* Top Row: Payout Badge & Order Type */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-emerald-600 text-white font-display font-black text-sm shadow-xs">
                          +₹{payout}
                        </span>
                        <span className="text-xs font-bold text-slate-600">
                          {isPrepaid ? '🟢 Online Paid' : '💵 Cash On Delivery'}
                        </span>
                      </div>

                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
                        {timingLabel}
                      </span>
                    </div>

                    {/* Zomato-style Route Summary */}
                    <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-600 shrink-0 mt-0.5">storefront</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 block truncate">{storeName}</span>
                          <span className="text-[11px] text-slate-500 block truncate">{storeAddr}</span>
                        </div>
                      </div>

                      <div className="w-0.5 h-2.5 border-l border-dashed border-slate-300 ml-2" />

                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-rose-600 shrink-0 mt-0.5">home_pin</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 block truncate">{custName}</span>
                          <span className="text-[11px] text-slate-500 block truncate">{custAddr}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Row */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 font-semibold">
                        🛍️ {itemsCount} {itemsCount === 1 ? 'item' : 'items'} • {ord.pickupDistanceKm ? `${ord.pickupDistanceKm} km pickup` : 'Near you'}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptOrder(ord._id);
                        }}
                        disabled={actionLoadingId === ord._id}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        <span>{actionLoadingId === ord._id ? 'Accepting...' : 'Accept Order'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ─── ZOMATO RIDER STYLE INCOMING ORDER SHEET (Full responsive overlay, z-[100]) ─── */}
      {ringingOrderAlert && !activeOrder && (() => {
        const orderIdToAccept = ringingOrderAlert._id || ringingOrderAlert.orderId;
        const payoutAmount = ringingOrderAlert.deliveryPayout || ringingOrderAlert.payout || 40;
        const pickupDist = ringingOrderAlert.pickupDistanceKm !== undefined && ringingOrderAlert.pickupDistanceKm !== null
          ? ringingOrderAlert.pickupDistanceKm
          : '0.0';
        const dropDist = ringingOrderAlert.deliveryDistanceKm !== undefined && ringingOrderAlert.deliveryDistanceKm !== null
          ? ringingOrderAlert.deliveryDistanceKm
          : '0.5';
        const totalTripKm = ((parseFloat(pickupDist) || 0) + (parseFloat(dropDist) || 0)).toFixed(1);

        const storeName = ringingOrderAlert.vendor?.storeName || ringingOrderAlert.storeName || 'Store';
        const storeAddress = resolveStoreAddress(ringingOrderAlert);
        const storePhone = ringingOrderAlert.vendor?.phone || ringingOrderAlert.vendorPhone || '';

        const customerName = ringingOrderAlert.customerName || ringingOrderAlert.deliveryAddress?.receiverName || ringingOrderAlert.user?.name || 'Customer';
        const customerAddress = resolveCustomerAddress(ringingOrderAlert);
        const customerPhone = ringingOrderAlert.customerPhone || ringingOrderAlert.deliveryAddress?.receiverPhone || '';

        const itemsList = Array.isArray(ringingOrderAlert.items) ? ringingOrderAlert.items : [];
        const itemCount = itemsList.reduce((acc, itm) => acc + (itm.quantity || 1), 0) || itemsList.length || 1;
        const orderTotal = ringingOrderAlert.finalPayableAmount || ringingOrderAlert.totalAmount || 0;
        const isPrepaid = ringingOrderAlert.paymentStatus === 'PAID' || (ringingOrderAlert.paymentMethod && ringingOrderAlert.paymentMethod !== 'CASH' && ringingOrderAlert.paymentMethod !== 'COD');
        const isScheduled = ringingOrderAlert.deliverySchedule?.deliveryType === 'SCHEDULED';

        return (
          <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-hidden animate-in fade-in">
            <div className="w-full max-w-md bg-[#111827] text-white rounded-t-[32px] sm:rounded-[32px] shadow-[0_-12px_45px_rgba(0,0,0,0.6)] border border-slate-700/60 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
              {/* Header Ribbon (Zomato Rider Style) */}
              <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
                  </span>
                  <div>
                    <span className="font-display font-black text-xs uppercase tracking-wider block leading-tight">
                      NEW ORDER REQUEST
                    </span>
                    <span className="text-[10px] text-white/90 font-medium">
                      {isScheduled ? 'Scheduled Delivery' : 'Instant Flash Delivery'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Countdown Timer Pill */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/25 text-white font-mono font-bold text-xs">
                    <span className="material-symbols-outlined text-[15px] text-amber-300 animate-spin">timelapse</span>
                    <span className="text-amber-300 font-black">{orderCountdown}s</span>
                  </div>

                  {/* Pass / Deny Button */}
                  <button
                    onClick={() => setRingingOrderAlert(null)}
                    className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
                    title="Pass Order"
                  >
                    ✕ Pass
                  </button>
                </div>
              </div>

              {/* Earnings & Trip Metrics Card */}
              <div className="p-4 sm:p-5 bg-gradient-to-b from-[#1f2937] to-[#111827] border-b border-slate-800 shrink-0">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                      TOTAL TRIP PAYOUT
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-4xl sm:text-5xl font-display font-black text-emerald-400 tracking-tight">
                        ₹{payoutAmount}
                      </span>
                      <span className="text-xs font-bold text-emerald-400/80 uppercase tracking-wide">
                        Guaranteed
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-slate-400 block">
                      #{String(ringingOrderAlert.orderId || ringingOrderAlert._id).slice(-6)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10.5px] font-black uppercase mt-1 inline-block">
                      {itemCount} {itemCount === 1 ? 'Item' : 'Items'} • ₹{orderTotal}
                    </span>
                  </div>
                </div>

                {/* Payment Condition Badge */}
                <div className="mt-2.5 flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                    isPrepaid
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                      : 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                  }`}>
                    <span className="material-symbols-outlined text-[15px]">
                      {isPrepaid ? 'check_circle' : 'payments'}
                    </span>
                    <span>
                      {isPrepaid ? 'Prepaid Online • Do not collect cash' : `Cash On Delivery • Collect ₹${orderTotal} from customer`}
                    </span>
                  </span>
                </div>

                {/* 3 Metrics Pills */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800">
                  <div className="bg-slate-800/70 rounded-xl p-2 text-center border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Pickup Leg</span>
                    <span className="text-xs font-black text-white">{pickupDist} km</span>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-2 text-center border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Drop Leg</span>
                    <span className="text-xs font-black text-white">{dropDist} km</span>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-2 text-center border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Trip</span>
                    <span className="text-xs font-black text-amber-300">{totalTripKm} km</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Route Timeline (Zomato Visual Route Map) */}
              <div className="overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3.5 flex-1 divide-y divide-slate-800/60 hide-scrollbar">
                {/* Node 1: Pickup Store */}
                <div className="flex gap-3 items-start pt-1">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-md shadow-emerald-500/20">
                      <span className="material-symbols-outlined text-[18px]">storefront</span>
                    </div>
                    <div className="w-0.5 h-10 border-l-2 border-dashed border-slate-600 my-1" />
                  </div>

                  <div className="flex-1 min-w-0 bg-slate-800/50 rounded-2xl p-3 border border-slate-700/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <span>PICKUP STORE</span>
                        <span>•</span>
                        <span>{pickupDist} km away</span>
                      </span>
                      {storePhone && (
                        <a href={`tel:${storePhone}`} className="text-xs text-slate-400 hover:text-white flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-700/50">
                          <span className="material-symbols-outlined text-[13px]">call</span>
                          <span>Call</span>
                        </a>
                      )}
                    </div>

                    <h4 className="font-display font-black text-sm text-white mt-0.5 truncate">
                      {storeName}
                    </h4>
                    <p className="text-[11.5px] text-slate-300 font-medium leading-relaxed mt-0.5">
                      {storeAddress}
                    </p>

                    {itemsList.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap gap-1.5">
                        {itemsList.map((item, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-200 text-[11px] font-semibold border border-slate-700">
                            {item.name || item.title || 'Item'} × {item.quantity || 1}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Node 2: Customer Drop */}
                <div className="flex gap-3 items-start pt-3">
                  <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center font-black shrink-0 shadow-md shadow-rose-500/20">
                    <span className="material-symbols-outlined text-[18px]">home_pin</span>
                  </div>

                  <div className="flex-1 min-w-0 bg-slate-800/50 rounded-2xl p-3 border border-slate-700/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                        <span>CUSTOMER DROP</span>
                        <span>•</span>
                        <span>{dropDist} km leg</span>
                      </span>
                      {customerPhone && (
                        <a href={`tel:${customerPhone}`} className="text-xs text-slate-400 hover:text-white flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-700/50">
                          <span className="material-symbols-outlined text-[13px]">call</span>
                          <span>Call</span>
                        </a>
                      )}
                    </div>

                    <h4 className="font-display font-black text-sm text-white mt-0.5 truncate">
                      {customerName}
                    </h4>
                    <p className="text-[11.5px] text-slate-300 font-medium leading-relaxed mt-0.5">
                      {customerAddress}
                    </p>

                    {ringingOrderAlert.orderNotes && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium">
                        📝 Delivery Note: {ringingOrderAlert.orderNotes}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sticky Action Footer (Zomato Big Accept Button) */}
              <div className="p-4 pt-3 bg-[#111827] border-t border-slate-800 shrink-0 space-y-2">
                {/* Visual Timer Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, (orderCountdown / 45) * 100))}%` }}
                  />
                </div>

                <button
                  onClick={() => handleAcceptOrder(orderIdToAccept)}
                  disabled={actionLoadingId === orderIdToAccept}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-600 text-white font-display font-black text-base sm:text-lg shadow-xl shadow-emerald-500/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-black/25 text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px] animate-pulse">arrow_forward</span>
                  </div>
                  <span className="tracking-wide">
                    {actionLoadingId === orderIdToAccept ? 'Accepting Order...' : `ACCEPT ORDER (${orderCountdown}s)`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRingingOrderAlert(null)}
                  className="w-full py-1 text-center text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Pass this order (Offer to other partners)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── OTP VERIFICATION MODAL ─── */}
      {showOtpModal && activeOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[32px]">pin</span>
            </div>
            <h3 className="font-display font-black text-lg text-slate-900">
              Customer Delivery OTP
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ask the customer for the 4-digit secret delivery code to confirm drop-off.
            </p>

            <form onSubmit={handleCompleteDelivery} className="mt-4 space-y-4">
              <input
                type="text"
                maxLength={6}
                value={deliveryOtpInput}
                onChange={(e) => setDeliveryOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="• • • •"
                className="w-48 mx-auto text-center font-mono text-2xl tracking-[0.5em] py-2.5 rounded-2xl border-2 border-emerald-500 outline-none font-black"
                autoFocus
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingOtp || !deliveryOtpInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md"
                >
                  {isVerifyingOtp ? 'Verifying...' : 'Verify & Drop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── RATE CARD & PAYOUT BREAKDOWN MODAL ─── */}
      {selectedOfferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">Fleet Payout Policy</h3>
              <button
                onClick={() => setSelectedOfferModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-xs text-slate-600">
              <p>• <strong>Base Fare:</strong> ₹{payoutConfig.baseFare} guaranteed for pickup and drop.</p>
              <p>• <strong>Distance Pay:</strong> ₹{payoutConfig.perKmRate} per km based on Google GPS distance between store and customer.</p>
              <p>• <strong>Customer Tips:</strong> 100% of customer tip amount is directly credited to your Pocket balance.</p>
              <p>• <strong>COD Orders:</strong> Collect exact cash from customer; cash holding limit is up to ₹2,000.</p>
              <p className="font-bold text-emerald-700 pt-1">Payouts are credited in real-time upon customer OTP verification.</p>
            </div>
            <button
              onClick={() => setSelectedOfferModal(false)}
              className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
