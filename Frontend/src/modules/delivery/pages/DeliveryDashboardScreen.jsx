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

  // Ringing Order Alert banner & Fullscreen Order Prompt (Image 1)
  const [ringingOrderAlert, setRingingOrderAlert] = useState(null);
  const [selectedOfferModal, setSelectedOfferModal] = useState(false);
  const knownOrderIdsRef = useRef(new Set());
  const initialLoadDoneRef = useRef(false);

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

            {/* Landmark Badges on Map (From Image 11) */}
            <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-xs px-2 py-1 rounded-lg text-[10px] font-bold text-slate-700 shadow-2xs border border-slate-200 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-blue-600">apartment</span>
              <span>Awadh Vihar Yojna</span>
            </div>

            <div className="absolute top-16 right-6 bg-white/90 backdrop-blur-xs px-2 py-1 rounded-lg text-[10px] font-bold text-slate-700 shadow-2xs border border-slate-200 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-purple-600">store</span>
              <span>Lulu Mall Lucknow</span>
            </div>

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
              <span>{isOnline ? 'GPS Active • In Lucknow Zone' : 'GPS Idle • Offline'}</span>
            </div>
          </div>
        </div>

        {/* ─── SLIDING BOTTOM SHEET CONTAINER (From Images 9, 10, 11) ─── */}
        <div className="relative -mt-6 bg-[#f5f6f8] rounded-t-3xl pt-2 px-4 pb-6 space-y-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
          {/* Centered Drag Handle (From Images 9, 10, 11) */}
          <div className="w-10 h-1.5 rounded-full bg-slate-300 mx-auto my-1" />

          {/* ─── REFER & EARN BANNER (From Images 9, 10, 11) ─── */}
          <div
            onClick={() =>
              toast.success('Referral link copied! Earn up to ₹10,500 for onboarding friend riders.')
            }
            className="bg-gradient-to-r from-[#173f7a] to-[#0f2a52] text-white rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div>
              <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-wider">
                REFER & EARN
              </span>
              <h3 className="font-display font-black text-base sm:text-lg text-white mt-1 leading-tight">
                Earn upto ₹10,500 Bonus
              </h3>
              <p className="text-xs text-blue-200 font-bold mt-0.5 flex items-center gap-1 group-hover:text-amber-300 transition-colors">
                <span>Refer now</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
              <span className="material-symbols-outlined text-[32px] text-amber-300">payments</span>
            </div>
          </div>

          {/* ─── CARD 1: GIG DETAILS (From Images 9, 10) ─── */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-2xs">
            {/* Black Header with 'g' icon */}
            <div className="bg-black text-white px-4 py-2.5 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-black text-xs">
                g
              </div>
              <span className="font-display font-black text-sm tracking-tight">Gig details</span>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <h4 className="font-display font-black text-base text-slate-900">
                  Free Gig for you, 1pm - 3pm 🎉
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Special Gig - you can go online even now
                </p>
                <button
                  onClick={() => navigate('/delivery/gigs')}
                  className="text-xs font-bold text-slate-900 hover:text-purple-700 flex items-center gap-0.5 mt-1 cursor-pointer"
                >
                  <span>Know more</span>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
              </div>

              {/* Big Black Button (Image 9) */}
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
                  {isOnline ? 'check_circle' : 'bolt'}
                </span>
                <span>{isOnline ? 'You are Online • Ready for Orders' : 'Book and go online now'}</span>
              </button>
            </div>
          </div>

          {/* ─── CARD 2: TODAY'S PROGRESS (From Images 9, 10) ─── */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-2xs">
            {/* Black Header with Calendar Icon */}
            <div className="bg-black text-white px-4 py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              <span className="font-display font-black text-sm tracking-tight">Today's progress</span>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4 divide-x divide-slate-100">
              {/* Left Column */}
              <div className="space-y-4">
                <div
                  onClick={() => navigate('/delivery/earnings')}
                  className="cursor-pointer group"
                >
                  <span className="text-2xl font-display font-black text-slate-950 block group-hover:text-purple-700 transition-colors">
                    ₹0
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Earnings</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>

                <div>
                  <span className="text-xl font-display font-black text-slate-950 block">
                    {isOnline ? '01:24 hrs' : '00:00 hrs'}
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Sessions</span>
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
                    0.0 km
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>Trips</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>

                <div
                  onClick={() => navigate('/delivery/gigs')}
                  className="cursor-pointer group"
                >
                  <span className="text-xl font-display font-black text-slate-950 block group-hover:text-purple-700 transition-colors">
                    0 Gigs
                  </span>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-0.5 mt-0.5">
                    <span>History</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── CARD 3: ALL OFFERS (From Image 8) ─── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-display font-black text-sm text-slate-900">All offers</h3>
              <button
                onClick={() => setSelectedOfferModal(true)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer"
              >
                <span>See All</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-2xs">
              {/* Black Offer Header */}
              <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
                <div>
                  <h4 className="font-display font-black text-xs sm:text-sm tracking-tight text-white">
                    JOINING_OFFER_FULLDAY
                  </h4>
                  <p className="text-[10px] text-slate-300 font-medium mt-0.5 flex items-center gap-1">
                    <span>Today • 4am - 4am</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 font-bold">Live</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-white block">₹300</span>
                  <span className="text-[10px] text-slate-300 uppercase font-bold">Extra</span>
                </div>
              </div>

              {/* Incentive Slabs Grid (Image 8 Exact Match) */}
              <div className="p-4 space-y-3">
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-500">Incentive</span>
                  <div className="flex items-center gap-6 font-mono text-slate-900">
                    <span>₹40</span>
                    <span>₹70</span>
                    <span>₹115</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs px-2 text-slate-600 font-medium">
                  <span>Gigs</span>
                  <div className="flex items-center gap-8">
                    <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>2</span>
                    <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>2</span>
                    <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>3</span>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                <div className="flex items-center justify-between text-xs px-2 text-slate-600 font-medium">
                  <span>Orders</span>
                  <div className="flex items-center gap-7">
                    <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>10</span>
                    <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>15</span>
                    <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>20</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedOfferModal(true)}
                  className="w-full mt-2 py-2.5 rounded-xl border border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-display font-black text-xs transition-all cursor-pointer shadow-2xs"
                >
                  View details
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

          {/* ─── AVAILABLE DELIVERY REQUESTS (If any) ─── */}
          {availableOrders.length > 0 && !activeOrder && (
            <div className="space-y-2.5 pt-2">
              <h3 className="font-display font-black text-sm text-slate-900 px-1">
                Nearby Orders Available ({availableOrders.length})
              </h3>
              {availableOrders.map((ord) => (
                <div
                  key={ord._id}
                  onClick={() => setRingingOrderAlert(ord)}
                  className="bg-white rounded-3xl p-4 border border-slate-100 shadow-2xs hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                        +₹{ord.deliveryPayout || 60}
                      </span>
                      <span className="text-xs font-black text-slate-900">
                        {ord.vendor?.storeName || ord.vendorName || 'Store Order'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                      {ord.pickupDistanceKm ? `${ord.pickupDistanceKm} km pickup` : 'Ready for pickup'} • Drop in Lucknow
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptOrder(ord._id);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all cursor-pointer shadow-2xs"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ─── FULLSCREEN INCOMING ORDER PROMPT (From Image 1) ─── */}
      {ringingOrderAlert && !activeOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom duration-200">
            {/* Top Deny Button (From Image 1) */}
            <div className="flex items-center justify-between pb-2">
              <span className="px-3 py-1 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-800 text-xs font-black">
                New order
              </span>
              <button
                onClick={() => setRingingOrderAlert(null)}
                className="px-3 py-1 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-black flex items-center gap-1 cursor-pointer"
              >
                <span>✕</span>
                <span>Deny</span>
              </button>
            </div>

            {/* Estimated Earnings & Distance (From Image 1) */}
            <div className="my-3 text-center sm:text-left">
              <p className="text-xs text-slate-500 font-bold">Estimated earnings</p>
              <h2 className="text-3xl sm:text-4xl font-display font-black text-slate-950 tracking-tight mt-0.5">
                ₹{ringingOrderAlert.deliveryPayout || ringingOrderAlert.payout || '79.14'}
              </h2>
              <p className="text-xs text-slate-600 font-bold mt-1">
                Pickup: {ringingOrderAlert.pickupDistanceKm || '2.55'} kms | Drop: {ringingOrderAlert.deliveryDistanceKm || '9.34'} kms
              </p>
            </div>

            {/* Store Pickup Section (From Image 1) */}
            <div className="space-y-3 my-4">
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="px-2 py-0.5 rounded bg-slate-700 text-white text-[10px] font-black uppercase">
                    Pick up
                  </span>
                  <span className="text-[11px] text-slate-400 font-bold">
                    ⏱ 5 mins away
                  </span>
                </div>
                <h4 className="font-display font-black text-sm text-slate-950">
                  {ringingOrderAlert.vendor?.storeName || ringingOrderAlert.storeName || 'Time And Tales'}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {formatAddress(ringingOrderAlert.vendor?.address || ringingOrderAlert.vendorAddress) ||
                    '114, Idgah Hills, Near St. Joseph School, Kohefiza, Bhopal'}
                </p>
              </div>

              {/* Customer Drop Section */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <span className="px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-black uppercase">
                  Customer Drop
                </span>
                <h4 className="font-display font-black text-sm text-slate-950 mt-1">
                  {ringingOrderAlert.deliveryAddress?.receiverName || ringingOrderAlert.user?.name || 'Customer'}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {formatAddress(ringingOrderAlert.deliveryAddress) || 'Customer Home Delivery, Gomti Nagar, Lucknow'}
                </p>
              </div>
            </div>

            {/* Accept Order Button Slider (From Image 1) */}
            <button
              onClick={() => handleAcceptOrder(ringingOrderAlert._id || ringingOrderAlert.orderId)}
              disabled={actionLoadingId === (ringingOrderAlert._id || ringingOrderAlert.orderId)}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-base shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <div className="w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </div>
              <span>
                {actionLoadingId === (ringingOrderAlert._id || ringingOrderAlert.orderId)
                  ? 'Accepting Order...'
                  : 'Accept order'}
              </span>
            </button>
          </div>
        </div>
      )}

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

      {/* ─── ALL OFFERS MODAL (From Image 8) ─── */}
      {selectedOfferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">Joining Offer Details</h3>
              <button
                onClick={() => setSelectedOfferModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <p>• Slabs unlock automatically upon completing minimum gig hours and drop counts.</p>
              <p>• Tier 1: 10 orders = ₹40 Extra</p>
              <p>• Tier 2: 15 orders = ₹70 Extra</p>
              <p>• Tier 3: 20 orders = ₹115 Extra</p>
              <p className="font-bold text-emerald-700 pt-2">Bonuses are directly deposited into your Pocket nightly!</p>
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
