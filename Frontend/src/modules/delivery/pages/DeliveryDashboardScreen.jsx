import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import DeliveryTopBar from '../components/DeliveryTopBar';
import { toast } from 'react-hot-toast';
import { getSocket } from '../../../services/socket';
import {
  startRiderOrderContinuousAlarm,
  stopRiderOrderContinuousAlarm,
  formatOrderTime,
} from '../../../utils/voiceUtils';

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

// Available Shift / Gig Definitions (matching DeliveryGigsScreen)
const GIG_SLOTS = [
  { id: 'slot_1', time: '06:00 AM - 11:00 AM', label: 'Morning Breakfast Rush', bonus: '+₹40/hr guarantee' },
  { id: 'slot_2', time: '11:00 AM - 04:00 PM', label: 'Lunch & Groceries Peak', bonus: 'High Demand' },
  { id: 'slot_3', time: '04:00 PM - 09:00 PM', label: 'Evening Peak Surge', bonus: '+₹20 extra per order', isHot: true },
  { id: 'slot_4', time: '09:00 PM - 12:00 AM', label: 'Late Night Express', bonus: '+₹30 extra per order', isHot: true },
];

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

  // 4-Digit Pickup OTP & Delivery OTP inputs
  const [pickupOtpDigits, setPickupOtpDigits] = useState(['', '', '', '']);
  const [deliveryOtpDigits, setDeliveryOtpDigits] = useState(['', '', '', '']);
  const [isVerifyingPickupOtp, setIsVerifyingPickupOtp] = useState(false);
  const [isVerifyingDeliveryOtp, setIsVerifyingDeliveryOtp] = useState(false);
  const [deliveryCashConfirmed, setDeliveryCashConfirmed] = useState(false);

  // Checklist of collected items at store
  const [checkedItems, setCheckedItems] = useState({});

  // Reject / Pass Modal
  const [rejectOrderId, setRejectOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('Too far from pickup');

  // Pickup Proof Photo (Optional)
  const [pickupProofFile, setPickupProofFile] = useState(null);
  const [pickupProofPreview, setPickupProofPreview] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Incoming Order Alert (Zomato New Order Alert Sheet with sound & vibration)
  const [ringingOrderAlert, setRingingOrderAlert] = useState(null);
  const [orderCountdown, setOrderCountdown] = useState(45);
  const [selectedOfferModal, setSelectedOfferModal] = useState(false);
  const [deliverySuccessModal, setDeliverySuccessModal] = useState(null);
  const knownOrderIdsRef = useRef(new Set());
  const initialLoadDoneRef = useRef(false);

  // Booked gigs state from localStorage
  const [bookedGigs, setBookedGigs] = useState(() => {
    try {
      const saved = localStorage.getItem('zeebac_booked_gigs');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Calculate current active gig slot
  const currentHour = new Date().getHours();
  const currentSlotId =
    currentHour >= 6 && currentHour < 11
      ? 'slot_1'
      : currentHour >= 11 && currentHour < 16
      ? 'slot_2'
      : currentHour >= 16 && currentHour < 21
      ? 'slot_3'
      : 'slot_4';
  const currentGigSlot = GIG_SLOTS.find((s) => s.id === currentSlotId) || GIG_SLOTS[1];
  const todayKey = `${new Date().getDate()}_${new Date().getMonth()}`;
  const isCurrentSlotBooked = Boolean(bookedGigs[`${todayKey}_${currentSlotId}`]);

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

  // Floating Cash In Hand & Settlement State
  const [cashInHand, setCashInHand] = useState(0);
  const [maxCashLimit, setMaxCashLimit] = useState(1500);
  const [isCashLimitReached, setIsCashLimitReached] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositMethod, setDepositMethod] = useState('EARNINGS_DEDUCTION'); // 'EARNINGS_DEDUCTION' | 'UPI'
  const [depositAmount, setDepositAmount] = useState('');
  const [depositUtr, setDepositUtr] = useState('');

  // Working Area & Zone State
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [zonesList, setZonesList] = useState([]);
  const [selectedCity, setSelectedCity] = useState('Lucknow');
  const [isUpdatingZone, setIsUpdatingZone] = useState(false);

  const fetchZones = async (city) => {
    try {
      const res = await DeliveryAPI.getZones({ city: city || selectedCity });
      if (res.success && res.data) {
        setZonesList(res.data.zones || []);
        if (res.data.currentCity) setSelectedCity(res.data.currentCity);
      }
    } catch (err) {
      console.error('Error fetching zones', err);
    }
  };

  const handleSelectZone = async (zone) => {
    setIsUpdatingZone(true);
    try {
      const res = await DeliveryAPI.updateWorkingZone({
        zoneName: zone.name,
        zoneId: zone._id || zone.zoneId,
        city: selectedCity,
      });
      if (res.success) {
        toast.success(`📍 Working zone set to ${zone.name} (${zone.demandBadge || zone.demandLevel})`);
        setShowZoneModal(false);
        fetchDashboardData();
      }
    } catch (err) {
      toast.error('Failed to change zone');
    } finally {
      setIsUpdatingZone(false);
    }
  };

  // Rider location coordinates (Default Indore Central)
  const [riderCoords, setRiderCoords] = useState({ lat: 22.7176, lng: 75.8720 });
  const watchIdRef = useRef(null);

  // OTP Input references
  const pickupOtpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const deliveryOtpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Zomato 45s countdown timer & continuous loud ringing chime
  useEffect(() => {
    if (!ringingOrderAlert) {
      stopRiderOrderContinuousAlarm();
      setOrderCountdown(45);
      return;
    }

    setOrderCountdown(45);
    const storeName = ringingOrderAlert.vendor?.storeName || ringingOrderAlert.storeName || 'Store';
    const payout = ringingOrderAlert.deliveryPayout || ringingOrderAlert.payout || 40;
    startRiderOrderContinuousAlarm({ storeName, payout });

    const timer = setInterval(() => {
      setOrderCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          stopRiderOrderContinuousAlarm();
          setRingingOrderAlert(null);
          return 45;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      stopRiderOrderContinuousAlarm();
    };
  }, [ringingOrderAlert]);

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
        if (res.data.cashInHand !== undefined) {
          setCashInHand(Number(res.data.cashInHand));
        }
        if (res.data.maxCashLimit !== undefined) {
          setMaxCashLimit(Number(res.data.maxCashLimit));
        }
        if (res.data.isCashLimitReached !== undefined) {
          setIsCashLimitReached(Boolean(res.data.isCashLimitReached));
        }

        // Ring audio alarm for online rider when new orders arrive
        if (isOnline && !res.data.activeOrder && initialLoadDoneRef.current) {
          const newlyArrived = incomingList.filter(
            (o) => !knownOrderIdsRef.current.has(o._id)
          );
          if (newlyArrived.length > 0) {
            const latest = newlyArrived[0];
            setRingingOrderAlert(latest);
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
        setRingingOrderAlert(data.order || data);
      }
      fetchDashboardData();
    };

    // Server switched this rider offline after inactivity
    const handleAutoOffline = (data) => {
      setOnlineStatus(false);
      setRingingOrderAlert(null);
      toast(data?.message || 'You were set Offline due to inactivity.', { icon: '⏸️' });
    };

    // Admin assigned an order to this rider, or the store changed / cancelled the current one
    const handleAssigned = (data) => {
      setRingingOrderAlert(null);
      toast.success(data?.message || 'A new delivery was assigned to you');
      fetchDashboardData();
    };
    const handleOrderChanged = (data) => {
      if (data?.message) toast(data.message, { icon: 'ℹ️' });
      fetchDashboardData();
    };

    socket.on('delivery:new_order', handleNewOrder);
    socket.on('delivery:auto_offline', handleAutoOffline);
    socket.on('delivery:assigned', handleAssigned);
    socket.on('order:status_update', handleOrderChanged);
    socket.on('order:cancelled', handleOrderChanged);
    return () => {
      socket.off('delivery:new_order', handleNewOrder);
      socket.off('delivery:auto_offline', handleAutoOffline);
      socket.off('delivery:assigned', handleAssigned);
      socket.off('order:status_update', handleOrderChanged);
      socket.off('order:cancelled', handleOrderChanged);
    };
  }, [isOnline, activeOrder, fetchDashboardData, setOnlineStatus]);

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

  // 1-Tap Book Current Gig Slot
  const handleBookCurrentGig = () => {
    const key = `${todayKey}_${currentSlotId}`;
    const next = { ...bookedGigs, [key]: true };
    setBookedGigs(next);
    try {
      localStorage.setItem('zeebac_booked_gigs', JSON.stringify(next));
    } catch {}
    toast.success(`🎉 Gig Booked: ${currentGigSlot.label} (${currentGigSlot.time})`);
  };

  // Toggle availability (Online / Offline)
  const handleToggleOnline = async () => {
    if (isOnline && activeOrder) {
      toast.error('You cannot go offline while delivering an active order!');
      return;
    }

    const nextStatus = !isOnline;

    // Block going online if floating cash limit exceeded
    if (nextStatus && (isCashLimitReached || cashInHand >= maxCashLimit)) {
      toast.error(`🚨 Cash Limit Reached (₹${cashInHand} / ₹${maxCashLimit}). Pehle Admin ko cash deposit karein taaki online orders shuru ho sakein.`);
      setDepositAmount(String(cashInHand));
      setShowDepositModal(true);
      return;
    }

    setIsTogglingOnline(true);

    // If going online and no gig is booked, auto-book the current open slot
    if (nextStatus && !isCurrentSlotBooked) {
      handleBookCurrentGig();
    }

    try {
      const res = await DeliveryAPI.toggleAvailability({ isOnline: nextStatus });
      if (res.success) {
        setOnlineStatus(nextStatus);
        toast.success(
          nextStatus
            ? '🟢 You are now ONLINE! Ready to receive orders.'
            : '⚪ You are now OFFLINE. Shift ended.'
        );
        fetchDashboardData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update availability status');
      if (err.response?.data?.message?.includes?.('limit')) {
        setShowDepositModal(true);
      }
    } finally {
      setIsTogglingOnline(false);
    }
  };

  // Settle / Deposit Cash In Hand
  const handleDepositCash = async (e) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount) || cashInHand;
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid deposit amount');
      return;
    }
    if (amt > cashInHand) {
      toast.error(`Deposit amount cannot exceed current cash in hand (₹${cashInHand})`);
      return;
    }
    const currentEarnings = rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0;
    if (depositMethod === 'EARNINGS_DEDUCTION' && amt > currentEarnings) {
      toast.error(`Insufficient pocket earnings (₹${currentEarnings}) to settle ₹${amt}. Please select UPI.`);
      return;
    }
    if (depositMethod === 'UPI' && !depositUtr.trim()) {
      toast.error('Please enter the UPI Reference ID / UTR Number');
      return;
    }

    setDepositSubmitting(true);
    try {
      const res = await DeliveryAPI.depositCash({
        amount: amt,
        paymentMethod: depositMethod,
        referenceId: depositMethod === 'UPI' ? depositUtr.trim() : undefined,
        notes: depositMethod === 'EARNINGS_DEDUCTION'
          ? 'Settled via Pocket Earnings deduction'
          : `Online UPI transfer (Ref: ${depositUtr.trim()})`,
      });
      if (res.success) {
        toast.success(res.message || '🎉 Cash deposit settled successfully!');
        setShowDepositModal(false);
        setDepositAmount('');
        setDepositUtr('');
        if (res.data) {
          setCashInHand(res.data.cashInHand ?? 0);
          setIsCashLimitReached(res.data.isCashLimitReached ?? false);
          if (res.data.totalEarnings !== undefined) {
            updateRider({ totalEarnings: res.data.totalEarnings });
          }
        }
        fetchDashboardData();
      } else {
        toast.error(res.message || 'Deposit failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to settle cash');
    } finally {
      setDepositSubmitting(false);
    }
  };

  // Accept Order (Stops ringing and starts live delivery journey)
  const handleAcceptOrder = async (orderId) => {
    stopRiderOrderContinuousAlarm();
    setActionLoadingId(orderId);
    try {
      const res = await DeliveryAPI.acceptOrder(orderId);
      if (res.success) {
        toast.success('🎉 Order accepted! Proceed to pickup store.');
        setActiveOrder(res.data.order);
        setAvailableOrders((prev) => prev.filter((o) => o._id !== orderId));
        setRingingOrderAlert(null);
        setPickupOtpDigits(['', '', '', '']);
        setDeliveryOtpDigits(['', '', '', '']);
        setCheckedItems({});
        setDeliveryCashConfirmed(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not accept order');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject / Pass Order
  const handleRejectOrder = async () => {
    if (!rejectOrderId) return;
    stopRiderOrderContinuousAlarm();
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

  // Stepper Status Transition (ARRIVED_AT_PICKUP, ARRIVED_AT_CUSTOMER)
  const handleUpdateStatus = async (newStatus) => {
    if (!activeOrder) return;
    setActionLoadingId(activeOrder._id);
    try {
      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, { status: newStatus });
      if (res.success) {
        toast.success(res.message || 'Status updated');
        setActiveOrder(res.data.order);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update order status');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Step 2: Confirm Store Pickup via 4-Digit Pickup OTP
  const handleVerifyPickupOtp = async () => {
    const enteredOtp = pickupOtpDigits.join('').trim();
    if (enteredOtp.length !== 4) {
      toast.error('Please enter the 4-digit Pickup OTP provided by the merchant');
      return;
    }

    setIsVerifyingPickupOtp(true);
    try {
      let dataToSend;
      if (pickupProofFile) {
        dataToSend = new FormData();
        dataToSend.append('status', 'PICKED_UP');
        dataToSend.append('pickupOtp', enteredOtp);
        dataToSend.append('pickupProof', pickupProofFile);
      } else {
        dataToSend = {
          status: 'PICKED_UP',
          pickupOtp: enteredOtp,
        };
      }

      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, dataToSend);
      if (res.success) {
        toast.success('🎉 Pickup Verified! Now delivering to customer.');
        setActiveOrder(res.data.order);
        setPickupProofFile(null);
        setPickupProofPreview(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid Pickup OTP! Ask merchant for 4-digit code.');
    } finally {
      setIsVerifyingPickupOtp(false);
    }
  };

  // Step 4: Complete Delivery via 4-Digit Customer Delivery OTP
  const handleVerifyDeliveryOtp = async (e) => {
    if (e) e.preventDefault();
    const enteredOtp = deliveryOtpDigits.join('').trim();
    if (enteredOtp.length !== 4) {
      toast.error('Please enter the 4-digit Delivery OTP given by customer');
      return;
    }

    const isCod =
      activeOrder?.paymentMethod === 'CASH' ||
      activeOrder?.paymentMethod === 'COD' ||
      activeOrder?.paymentStatus === 'PENDING';
    if (isCod && !deliveryCashConfirmed) {
      toast.error('Please confirm you have collected cash payment from customer!');
      return;
    }

    setIsVerifyingDeliveryOtp(true);
    try {
      const res = await DeliveryAPI.updateOrderStatus(activeOrder._id, {
        status: 'DELIVERED',
        deliveryOtp: enteredOtp,
      });

      if (res.success) {
        const earned = res.data.earnedAmount || activeOrder.deliveryPayout || 40;
        setDeliverySuccessModal({
          orderId: activeOrder.orderId || activeOrder._id,
          earnedAmount: earned,
          customerName: activeOrder.customerName || 'Customer',
          storeName: activeOrder.storeName || activeOrder.vendor?.storeName || 'Store',
        });
        setActiveOrder(null);
        setDeliveryOtpDigits(['', '', '', '']);
        setPickupOtpDigits(['', '', '', '']);
        if (res.data.totalEarnings !== undefined) {
          updateRider({ totalEarnings: res.data.totalEarnings });
        }
        fetchDashboardData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid Delivery OTP! Ask customer for correct 4-digit OTP.');
    } finally {
      setIsVerifyingDeliveryOtp(false);
    }
  };

  // OTP digit keyboard handler
  const handleDigitChange = (index, value, digitsArray, setDigitsArray, refsArray) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digitsArray];
      next[index] = '';
      setDigitsArray(next);
      return;
    }

    // Support paste of 4 digits
    if (cleaned.length === 4) {
      const parts = cleaned.split('').slice(0, 4);
      setDigitsArray(parts);
      refsArray[3]?.current?.focus();
      return;
    }

    const next = [...digitsArray];
    next[index] = cleaned.slice(-1);
    setDigitsArray(next);

    // Auto-advance
    if (index < 3 && cleaned.length > 0) {
      refsArray[index + 1]?.current?.focus();
    }
  };

  const handleDigitKeyDown = (index, e, digitsArray, refsArray) => {
    if (e.key === 'Backspace' && !digitsArray[index] && index > 0) {
      refsArray[index - 1]?.current?.focus();
    }
  };

  const openMaps = (address, label = '') => {
    const query = encodeURIComponent(`${label ? label + ', ' : ''}${address}`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-24 font-sans relative">
      {/* ─── Top Header (Zomato Rider Style) ─── */}
      <DeliveryTopBar
        onToggleOnline={handleToggleOnline}
        isTogglingOnline={isTogglingOnline}
        activeOrder={activeOrder}
      />

      <main className="max-w-[480px] mx-auto text-left relative">
        {/* ─── TOP MAP CANVAS ─── */}
        <div className="relative h-48 sm:h-56 w-full bg-slate-200 overflow-hidden border-b border-slate-100">
          <div className="absolute inset-0 bg-[#e5e9ec] flex items-center justify-center">
            {/* Vector Map Roads */}
            <svg className="w-full h-full opacity-60" viewBox="0 0 500 300" preserveAspectRatio="none">
              <path d="M-20,120 Q180,60 300,140 T520,100" fill="none" stroke="#ffffff" strokeWidth="24" />
              <path d="M-20,120 Q180,60 300,140 T520,100" fill="none" stroke="#fbd38d" strokeWidth="12" />
              <path d="M120,-20 L220,320" fill="none" stroke="#ffffff" strokeWidth="18" />
              <path d="M380,-20 L300,320" fill="none" stroke="#ffffff" strokeWidth="14" />
            </svg>

            {/* Rider Location Pin */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <div className="relative">
                {isOnline && (
                  <span className="absolute -inset-4 rounded-full bg-emerald-500/30 animate-ping" />
                )}
                <div className={`w-9 h-9 rounded-full ${isOnline ? 'bg-emerald-600' : 'bg-slate-700'} border-2 border-white text-white flex items-center justify-center shadow-lg`}>
                  <span className="material-symbols-outlined text-[20px]">two_wheeler</span>
                </div>
              </div>
            </div>

            {/* Working Area / Zone Selector Chip */}
            <button
              onClick={() => {
                fetchZones(riderDetails?.workingCity || riderDetails?.city || selectedCity);
                setShowZoneModal(true);
              }}
              className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-full text-[11px] font-black text-slate-800 shadow-md flex items-center gap-1.5 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all cursor-pointer active:scale-95 z-10"
              title="Change Delivery Zone"
            >
              <span className="material-symbols-outlined text-[15px] text-emerald-600">near_me</span>
              <span>{riderDetails?.workingZone || 'Gomti Nagar'}</span>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-black">🔥</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">expand_more</span>
            </button>

            {/* Live GPS & Zone Badge */}
            <div className="absolute bottom-3 left-4 bg-white/95 backdrop-blur-xs px-3 py-1 rounded-full text-[10px] font-black text-slate-700 shadow-xs flex items-center gap-1.5 border border-slate-200">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{isOnline ? `GPS Active • ${riderDetails?.workingZone || riderDetails?.city || 'Gomti Nagar'}` : 'GPS Idle • Offline'}</span>
            </div>
          </div>
        </div>

        {/* ─── SLIDING DASHBOARD CONTENT ─── */}
        <div className="relative -mt-5 bg-[#f5f6f8] rounded-t-3xl pt-2 px-3 sm:px-4 pb-6 space-y-3.5 shadow-[0_-8px_25px_rgba(0,0,0,0.06)]">
          <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto my-1" />

          {/* ─── CASH IN HAND LIMIT ALERT BANNER ─── */}
          {(isCashLimitReached || cashInHand >= maxCashLimit) ? (
            <div className="bg-rose-50 border-2 border-rose-400 rounded-3xl p-4 text-rose-950 shadow-md">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                  <span className="material-symbols-outlined text-[24px]">lock_clock</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white">
                      ORDERS PAUSED
                    </span>
                    <span className="text-[11px] font-mono font-black text-rose-700">
                      ₹{cashInHand.toLocaleString('en-IN')} / ₹{maxCashLimit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <h4 className="font-display font-black text-sm text-rose-900 mt-1">
                    Cash-In-Hand Limit Reached!
                  </h4>
                  <p className="text-xs text-rose-800 font-medium mt-0.5 leading-snug">
                    Aapke paas limit se zyada COD cash jama hai. Naye orders pause hain aur online toggle blocked hai jab tak aap Admin ko cash deposit nahi kar dete.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDepositAmount(String(cashInHand));
                        setShowDepositModal(true);
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-display font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      <span>Deposit ₹{cashInHand} Now</span>
                    </button>
                    <span className="text-[10px] text-rose-600 font-bold">
                      1-Tap Pocket or UPI
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : cashInHand > 0 ? (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                </div>
                <div className="truncate">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    COD Cash in Hand: ₹{cashInHand.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-600">
                    Remaining limit: ₹{Math.max(0, maxCashLimit - cashInHand).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDepositAmount(String(cashInHand));
                  setShowDepositModal(true);
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              >
                Deposit
              </button>
            </div>
          ) : null}

          {/* ─── DUTY / ONLINE-OFFLINE CARD (Zomato Partner) ─── */}
          <div className={`rounded-3xl p-4 transition-all border shadow-sm ${
            isOnline
              ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white border-emerald-500'
              : 'bg-white text-slate-900 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  isOnline ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  <span className="material-symbols-outlined text-[22px]">
                    {isOnline ? 'sensors' : 'power_settings_new'}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-base leading-tight">
                      {isOnline ? 'You are Online' : 'You are Offline'}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-300 animate-ping' : 'bg-slate-400'}`} />
                  </div>
                  <p className={`text-xs mt-0.5 ${isOnline ? 'text-emerald-100 font-medium' : 'text-slate-500'}`}>
                    {isOnline ? 'Searching nearby orders... Keep app open' : 'Go online to receive delivery requests'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleOnline}
                disabled={isTogglingOnline}
                className={`px-4 py-2 rounded-xl font-display font-black text-xs shadow-md active:scale-95 transition-all cursor-pointer ${
                  isOnline
                    ? 'bg-white text-emerald-800 hover:bg-emerald-50'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {isTogglingOnline ? 'Updating...' : isOnline ? 'Go Offline' : 'Go Online'}
              </button>
            </div>
          </div>

          {/* ─── GIG BOOKING & SHIFT STATUS BANNER ─── */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isCurrentSlotBooked ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
              }`}>
                <span className="material-symbols-outlined text-[20px]">
                  {isCurrentSlotBooked ? 'event_available' : 'schedule'}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {isCurrentSlotBooked ? 'ACTIVE GIG BOOKED' : 'CURRENT SHIFT'}
                  </span>
                  {isCurrentSlotBooked && (
                    <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[9px] font-black uppercase">
                      Confirmed
                    </span>
                  )}
                </div>
                <h4 className="font-display font-black text-xs sm:text-sm text-slate-900 truncate">
                  {currentGigSlot.label}
                </h4>
                <p className="text-[11px] text-slate-500 truncate font-medium">
                  {currentGigSlot.time} • {currentGigSlot.bonus}
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
              {!isCurrentSlotBooked && (
                <button
                  type="button"
                  onClick={handleBookCurrentGig}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-black active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  Book Slot
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/delivery/gigs')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
              >
                Gigs ➔
              </button>
            </div>
          </div>

          {/* ─── TODAY'S METRICS SUMMARY ─── */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white rounded-2xl p-3 border border-slate-100 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Today's Pay</span>
              <span className="text-lg font-display font-black text-emerald-600">
                ₹{todayStats.todayEarnings}
              </span>
            </div>
            <div className="bg-white rounded-2xl p-3 border border-slate-100 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Drops</span>
              <span className="text-lg font-display font-black text-slate-900">
                {todayStats.todayDeliveriesCount}
              </span>
            </div>
            <div className="bg-white rounded-2xl p-3 border border-slate-100 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Distance</span>
              <span className="text-lg font-display font-black text-blue-600">
                {todayStats.todayDistanceKm} km
              </span>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              ACTIVE ORDER WORKFLOW (4 Sequential Zomato Partner Steps)
          ═══════════════════════════════════════════════════════════════ */}
          {activeOrder && (() => {
            const status = activeOrder.orderStatus;
            const itemsList = Array.isArray(activeOrder.items) ? activeOrder.items : [];
            const isCod =
              activeOrder.paymentMethod === 'CASH' ||
              activeOrder.paymentMethod === 'COD' ||
              activeOrder.paymentStatus === 'PENDING';
            const orderTotal = activeOrder.finalPayableAmount || activeOrder.totalAmount || 0;

            const isStep1 = status === 'RIDER_ASSIGNED';
            const isStep2 = status === 'ARRIVED_AT_PICKUP';
            const isStep3 = status === 'OUT_FOR_DELIVERY' || status === 'PICKED_UP';
            const isStep4 = status === 'ARRIVED_AT_CUSTOMER';

            const storeName = activeOrder.vendor?.storeName || activeOrder.vendorName || 'Partner Store';
            const storeAddr = resolveStoreAddress(activeOrder);
            const storePhone = activeOrder.vendor?.phone || activeOrder.vendorPhone;

            const customerName = activeOrder.customerName || activeOrder.deliveryAddress?.receiverName || 'Customer';
            const customerAddr = resolveCustomerAddress(activeOrder);
            const customerPhone = activeOrder.customerPhone || activeOrder.deliveryAddress?.receiverPhone;

            return (
              <div className="bg-white rounded-3xl border-2 border-emerald-500 shadow-xl overflow-hidden animate-in fade-in">
                {/* Stepper Progress Bar */}
                <div className="bg-slate-900 text-white p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      {isStep1 && 'Step 1 of 4: Head to Store'}
                      {isStep2 && 'Step 2 of 4: Verify & Pickup OTP'}
                      {isStep3 && 'Step 3 of 4: Deliver to Customer'}
                      {isStep4 && 'Step 4 of 4: Customer OTP Handover'}
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      #{String(activeOrder.orderId || activeOrder._id).slice(-6)}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="h-1.5 rounded-full bg-emerald-400" />
                    <div className={`h-1.5 rounded-full ${isStep2 || isStep3 || isStep4 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                    <div className={`h-1.5 rounded-full ${isStep3 || isStep4 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                    <div className={`h-1.5 rounded-full ${isStep4 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-4">
                  {/* ────────────────────────────────────────────────────────
                      STEP 1: HEADING TO STORE (Customer details locked)
                  ──────────────────────────────────────────────────────── */}
                  {isStep1 && (
                    <div className="space-y-4">
                      {/* Store Card */}
                      <div className="bg-purple-50/80 rounded-2xl p-4 border border-purple-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-black uppercase tracking-wider text-purple-700 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px]">storefront</span>
                            <span>Pickup Restaurant</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-200/80 text-purple-900 text-[10px] font-black">
                            {activeOrder.pickupDistanceKm || '1.0'} km away
                          </span>
                        </div>

                        <div>
                          <h3 className="font-display font-black text-base text-slate-900">{storeName}</h3>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{storeAddr}</p>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openMaps(storeAddr, storeName)}
                            className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-display font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-700/20 active:scale-95 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">navigation</span>
                            <span>Navigate to Store</span>
                          </button>
                          {storePhone && (
                            <a
                              href={`tel:${storePhone}`}
                              className="px-3.5 py-2.5 rounded-xl bg-white border border-purple-300 text-purple-800 font-bold text-xs flex items-center justify-center gap-1 active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[16px]">call</span>
                              <span>Call</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Items Preview */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                          Items to Collect ({itemsList.length})
                        </span>
                        <div className="space-y-1">
                          {itemsList.map((itm, i) => (
                            <div key={i} className="text-xs font-semibold text-slate-800 flex justify-between">
                              <span>• {itm.name || itm.title}</span>
                              <span className="font-mono font-bold">×{itm.quantity || 1}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Privacy Note: Customer locked */}
                      <div className="p-3 rounded-2xl bg-slate-100 border border-dashed border-slate-300 flex items-center gap-2 text-slate-600 text-xs">
                        <span className="material-symbols-outlined text-[18px] text-slate-500 shrink-0">lock</span>
                        <span className="text-[11px] font-medium leading-tight">
                          Customer drop address and phone will unlock once you collect the parcel with Pickup OTP.
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('ARRIVED_AT_PICKUP')}
                        disabled={actionLoadingId === activeOrder._id}
                        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-sm sm:text-base shadow-lg shadow-emerald-600/30 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">location_on</span>
                        <span>{actionLoadingId === activeOrder._id ? 'Updating...' : 'Reached Store 📍'}</span>
                      </button>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────
                      STEP 2: AT STORE - VERIFY ITEMS & ENTER STORE PICKUP OTP
                  ──────────────────────────────────────────────────────── */}
                  {isStep2 && (
                    <div className="space-y-4">
                      <div className="bg-amber-50 rounded-2xl p-3.5 border border-amber-300">
                        <h4 className="font-display font-black text-sm text-amber-950 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-amber-700">inventory_2</span>
                          <span>Verify Order Items with Kitchen / Counter</span>
                        </h4>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          Tick each item as you pack it into your delivery bag:
                        </p>

                        <div className="mt-2.5 space-y-1.5">
                          {itemsList.map((itm, i) => {
                            const isChecked = Boolean(checkedItems[i]);
                            return (
                              <label
                                key={i}
                                className={`flex items-center gap-2.5 p-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                                  isChecked ? 'bg-amber-100 text-amber-950 line-through' : 'bg-white text-slate-800'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() =>
                                    setCheckedItems((prev) => ({ ...prev, [i]: !prev[i] }))
                                  }
                                  className="w-4 h-4 rounded text-amber-600 accent-amber-600"
                                />
                                <span className="flex-1">{itm.name || itm.title}</span>
                                <span className="font-mono">×{itm.quantity || 1}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Store Pickup OTP Input Box */}
                      <div className="bg-gradient-to-b from-purple-50 to-white rounded-2xl p-4 border-2 border-purple-300 text-center space-y-3">
                        <div>
                          <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 text-[10px] font-black uppercase tracking-wider">
                            MANDATORY PICKUP OTP
                          </span>
                          <h3 className="font-display font-black text-base text-slate-900 mt-1">
                            Ask Restaurant for 4-Digit Pickup OTP
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Restaurant partner screen displays this 4-digit code.
                          </p>
                        </div>

                        {/* 4 Digit Boxes */}
                        <div className="flex justify-center gap-2.5 pt-1">
                          {pickupOtpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={pickupOtpRefs[idx]}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              value={digit}
                              onChange={(e) =>
                                handleDigitChange(idx, e.target.value, pickupOtpDigits, setPickupOtpDigits, pickupOtpRefs)
                              }
                              onKeyDown={(e) =>
                                handleDigitKeyDown(idx, e, pickupOtpDigits, pickupOtpRefs)
                              }
                              className="w-12 h-14 text-center font-mono font-black text-2xl text-purple-950 bg-white border-2 border-purple-300 rounded-xl focus:border-purple-600 focus:ring-2 focus:ring-purple-400 outline-none shadow-xs"
                            />
                          ))}
                        </div>

                        <p className="text-[10.5px] text-slate-400 font-medium">
                          (Testing fallback: 1234 or code shown on store dashboard)
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyPickupOtp}
                        disabled={isVerifyingPickupOtp || pickupOtpDigits.join('').length !== 4}
                        className={`w-full py-4 rounded-2xl font-display font-black text-sm sm:text-base shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                          pickupOtpDigits.join('').length === 4
                            ? 'bg-purple-700 hover:bg-purple-800 text-white shadow-purple-700/30'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">verified</span>
                        <span>{isVerifyingPickupOtp ? 'Verifying OTP...' : 'Verify OTP & Start Delivery 🚀'}</span>
                      </button>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────
                      STEP 3: OUT FOR DELIVERY - CUSTOMER DETAILS UNLOCKED!
                  ──────────────────────────────────────────────────────── */}
                  {isStep3 && (
                    <div className="space-y-4">
                      {/* Customer Full Delivery Card */}
                      <div className="bg-emerald-50/80 rounded-2xl p-4 border border-emerald-300 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px] text-emerald-600">home_pin</span>
                            <span>Deliver to Customer (Unlocked)</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-950 text-[10.5px] font-black">
                            {activeOrder.deliveryDistanceKm || '2.0'} km drop
                          </span>
                        </div>

                        <div>
                          <h3 className="font-display font-black text-base text-slate-900">{customerName}</h3>
                          <p className="text-xs text-slate-700 font-medium mt-0.5 leading-relaxed">
                            {customerAddr}
                          </p>
                        </div>

                        {/* Payment Type Alert */}
                        <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                          isCod
                            ? 'bg-amber-100/80 text-amber-950 border-amber-300'
                            : 'bg-emerald-100 text-emerald-950 border-emerald-300'
                        }`}>
                          <span className="material-symbols-outlined text-[18px]">
                            {isCod ? 'payments' : 'check_circle'}
                          </span>
                          <span>
                            {isCod
                              ? `💵 Cash on Delivery: Collect ₹${orderTotal} from Customer`
                              : '🟢 Online Paid: Do NOT collect cash from customer'}
                          </span>
                        </div>

                        {activeOrder.orderNotes && (
                          <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs">
                            📝 <b>Customer Note:</b> {activeOrder.orderNotes}
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openMaps(customerAddr, customerName)}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">navigation</span>
                            <span>Navigate to Customer</span>
                          </button>
                          {customerPhone && (
                            <a
                              href={`tel:${customerPhone}`}
                              className="px-4 py-2.5 rounded-xl bg-white border border-emerald-400 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1 active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[16px]">call</span>
                              <span>Call Customer</span>
                            </a>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('ARRIVED_AT_CUSTOMER')}
                        disabled={actionLoadingId === activeOrder._id}
                        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-sm sm:text-base shadow-lg shadow-emerald-600/30 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">location_on</span>
                        <span>{actionLoadingId === activeOrder._id ? 'Updating...' : 'Reached Customer Location 📍'}</span>
                      </button>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────
                      STEP 4: AT CUSTOMER - VERIFY 4-DIGIT DELIVERY OTP
                  ──────────────────────────────────────────────────────── */}
                  {isStep4 && (
                    <div className="space-y-4">
                      {/* COD Cash Collection Confirmation */}
                      {isCod && (
                        <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-2">
                          <div className="flex items-center gap-2 text-amber-950 font-display font-black text-sm">
                            <span className="material-symbols-outlined text-[20px] text-amber-700">payments</span>
                            <span>Collect ₹{orderTotal} Cash</span>
                          </div>
                          <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl cursor-pointer text-xs font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={deliveryCashConfirmed}
                              onChange={(e) => setDeliveryCashConfirmed(e.target.checked)}
                              className="w-4 h-4 rounded text-amber-600 accent-amber-600"
                            />
                            <span>I have collected exact ₹{orderTotal} cash from customer</span>
                          </label>
                        </div>
                      )}

                      {/* Customer Delivery OTP Box */}
                      <div className="bg-gradient-to-b from-emerald-50 to-white rounded-2xl p-4 border-2 border-emerald-300 text-center space-y-3">
                        <div>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-950 text-[10px] font-black uppercase tracking-wider">
                            CUSTOMER DELIVERY OTP
                          </span>
                          <h3 className="font-display font-black text-base text-slate-900 mt-1">
                            Ask Customer for 4-Digit Delivery Code
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Customer can see this code on their live ZeeBac order screen.
                          </p>
                        </div>

                        {/* 4 Digit Boxes */}
                        <div className="flex justify-center gap-2.5 pt-1">
                          {deliveryOtpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={deliveryOtpRefs[idx]}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              value={digit}
                              onChange={(e) =>
                                handleDigitChange(idx, e.target.value, deliveryOtpDigits, setDeliveryOtpDigits, deliveryOtpRefs)
                              }
                              onKeyDown={(e) =>
                                handleDigitKeyDown(idx, e, deliveryOtpDigits, deliveryOtpRefs)
                              }
                              className="w-12 h-14 text-center font-mono font-black text-2xl text-emerald-950 bg-white border-2 border-emerald-300 rounded-xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-400 outline-none shadow-xs"
                            />
                          ))}
                        </div>

                        <p className="text-[10.5px] text-slate-400 font-medium">
                          (Testing fallback: 1234 or code shown on customer app)
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyDeliveryOtp}
                        disabled={
                          isVerifyingDeliveryOtp ||
                          deliveryOtpDigits.join('').length !== 4 ||
                          (isCod && !deliveryCashConfirmed)
                        }
                        className={`w-full py-4 rounded-2xl font-display font-black text-sm sm:text-base shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                          deliveryOtpDigits.join('').length === 4 && (!isCod || deliveryCashConfirmed)
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">verified_user</span>
                        <span>{isVerifyingDeliveryOtp ? 'Verifying OTP...' : 'Complete Delivery & Collect Earnings 🎉'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════════════════
              AVAILABLE NEARBY ORDERS (Zomato Privacy: Customer Masked)
          ═══════════════════════════════════════════════════════════════ */}
          {availableOrders.length > 0 && !activeOrder && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="font-display font-black text-sm text-slate-900">
                    Nearby Store Orders ({availableOrders.length})
                  </h3>
                </div>
                <span className="text-[10.5px] font-bold text-slate-400 uppercase">
                  {riderDetails?.city || 'Indore'}
                </span>
              </div>

              {availableOrders.map((ord) => {
                const storeName = ord.vendor?.storeName || ord.vendorName || ord.storeName || 'Store Order';
                const storeAddr = resolveStoreAddress(ord);
                const dropLocality = ord.deliveryAddress?.area || ord.deliveryAddress?.city || 'Drop Locality';
                const itemsCount = ord.items?.length || 1;
                const isPrepaid = ord.paymentStatus === 'PAID' || (ord.paymentMethod && ord.paymentMethod !== 'CASH' && ord.paymentMethod !== 'COD');
                const payout = ord.deliveryPayout || 40;

                return (
                  <div
                    key={ord._id}
                    onClick={() => setRingingOrderAlert(ord)}
                    className="bg-white rounded-3xl p-4 border border-slate-200 hover:border-emerald-500 shadow-xs transition-all cursor-pointer space-y-3 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full bg-emerald-600 text-white font-display font-black text-sm">
                        +₹{payout} Guaranteed
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {isPrepaid ? '🟢 Online Paid' : '💵 Cash on Delivery'}
                      </span>
                    </div>

                    {/* Store Pickup & General Drop Summary */}
                    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-600 shrink-0 mt-0.5">storefront</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 block truncate">{storeName}</span>
                          <span className="text-[11px] text-slate-500 block truncate">{storeAddr}</span>
                        </div>
                      </div>

                      <div className="w-0.5 h-2 border-l border-dashed border-slate-300 ml-2" />

                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-rose-500 shrink-0 mt-0.5">home_pin</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-700 block truncate">Drop: {dropLocality} (~{ord.deliveryDistanceKm || 2.0} km)</span>
                          <span className="text-[10px] text-slate-400 block">🔒 Exact address unlocks after accept</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 font-semibold">
                        🛍️ {itemsCount} {itemsCount === 1 ? 'item' : 'items'} • {ord.pickupDistanceKm ? `${ord.pickupDistanceKm} km pickup` : 'Near you'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptOrder(ord._id);
                        }}
                        disabled={actionLoadingId === ord._id}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        Accept Order
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* When Online but no orders */}
          {isOnline && !activeOrder && availableOrders.length === 0 && (
            <div className="bg-white rounded-3xl p-6 text-center border border-slate-200 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[24px] animate-spin">radar</span>
              </div>
              <h4 className="font-display font-black text-sm text-slate-900">
                Waiting for store orders...
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Your GPS is live. As soon as a customer orders from a nearby store in Indore, it will ring right here!
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ═════════════════════════════════════════════════════════════════════
          ZOMATO INCOMING ORDER ALERT MODAL (Customer details locked before accept!)
      ═════════════════════════════════════════════════════════════════════ */}
      {ringingOrderAlert && !activeOrder && (() => {
        const orderIdToAccept = ringingOrderAlert._id || ringingOrderAlert.orderId;
        const payoutAmount = ringingOrderAlert.deliveryPayout || ringingOrderAlert.payout || 40;
        const pickupDist = ringingOrderAlert.pickupDistanceKm !== undefined && ringingOrderAlert.pickupDistanceKm !== null
          ? ringingOrderAlert.pickupDistanceKm
          : '0.8';
        const dropDist = ringingOrderAlert.deliveryDistanceKm !== undefined && ringingOrderAlert.deliveryDistanceKm !== null
          ? ringingOrderAlert.deliveryDistanceKm
          : '2.0';
        const totalTripKm = ((parseFloat(pickupDist) || 0) + (parseFloat(dropDist) || 0)).toFixed(1);

        const storeName = ringingOrderAlert.vendor?.storeName || ringingOrderAlert.storeName || 'Partner Store';
        const storeAddress = resolveStoreAddress(ringingOrderAlert);
        const dropLocality = ringingOrderAlert.deliveryAddress?.area || ringingOrderAlert.deliveryAddress?.city || 'Delivery Locality';

        const itemsList = Array.isArray(ringingOrderAlert.items) ? ringingOrderAlert.items : [];
        const itemCount = itemsList.reduce((acc, itm) => acc + (itm.quantity || 1), 0) || itemsList.length || 1;
        const orderTotal = ringingOrderAlert.finalPayableAmount || ringingOrderAlert.totalAmount || 0;
        const isPrepaid = ringingOrderAlert.paymentStatus === 'PAID' || (ringingOrderAlert.paymentMethod && ringingOrderAlert.paymentMethod !== 'CASH' && ringingOrderAlert.paymentMethod !== 'COD');

        return (
          <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-hidden animate-in fade-in">
            <div className="w-full max-w-md bg-[#111827] text-white rounded-t-[32px] sm:rounded-[32px] shadow-[0_-12px_45px_rgba(0,0,0,0.6)] border border-slate-700/60 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
              {/* Header Ribbon */}
              <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
                  </span>
                  <div>
                    <span className="font-display font-black text-xs uppercase tracking-wider block leading-tight">
                      NEW ORDER ALERT
                    </span>
                    <span className="text-[10px] text-white/90 font-medium">
                      Instant Delivery Request
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/25 text-white font-mono font-bold text-xs">
                    <span className="material-symbols-outlined text-[15px] text-amber-300 animate-spin">timelapse</span>
                    <span className="text-amber-300 font-black">{orderCountdown}s</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      stopRiderOrderContinuousAlarm();
                      setRingingOrderAlert(null);
                    }}
                    className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    ✕ Pass
                  </button>
                </div>
              </div>

              {/* Earnings & Distance Overview */}
              <div className="p-4 sm:p-5 bg-gradient-to-b from-[#1f2937] to-[#111827] border-b border-slate-800 shrink-0">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      GUARANTEED TRIP PAYOUT
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-4xl sm:text-5xl font-display font-black text-emerald-400 tracking-tight">
                        ₹{payoutAmount}
                      </span>
                      <span className="text-xs font-bold text-emerald-400/80 uppercase">
                        Net Earnings
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-slate-400 block">
                      #{String(ringingOrderAlert.orderId || ringingOrderAlert._id).slice(-6)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase mt-1 inline-block">
                      {itemCount} {itemCount === 1 ? 'Item' : 'Items'} • ₹{orderTotal}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800 text-center">
                  <div className="bg-slate-800/70 rounded-xl p-2 border border-slate-700/60">
                    <span className="text-[9.5px] text-slate-400 font-bold block uppercase">Pickup</span>
                    <span className="text-xs font-black text-white">{pickupDist} km</span>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-2 border border-slate-700/60">
                    <span className="text-[9.5px] text-slate-400 font-bold block uppercase">Drop Leg</span>
                    <span className="text-xs font-black text-white">{dropDist} km</span>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-2 border border-slate-700/60">
                    <span className="text-[9.5px] text-slate-400 font-bold block uppercase">Total Trip</span>
                    <span className="text-xs font-black text-amber-300">{totalTripKm} km</span>
                  </div>
                </div>
              </div>

              {/* Route Timeline: STORE REVEALED, CUSTOMER PROTECTED */}
              <div className="overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3.5 flex-1 divide-y divide-slate-800/60">
                {/* Node 1: Pickup Store (Fully Shown) */}
                <div className="flex gap-3 items-start pt-1">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                      <span className="material-symbols-outlined text-[18px]">storefront</span>
                    </div>
                    <div className="w-0.5 h-10 border-l-2 border-dashed border-slate-600 my-1" />
                  </div>

                  <div className="flex-1 min-w-0 bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                        PICKUP STORE • {pickupDist} km away
                      </span>
                    </div>
                    <h4 className="font-display font-black text-sm text-white mt-0.5 truncate">
                      {storeName}
                    </h4>
                    <p className="text-[11.5px] text-slate-300 font-medium leading-relaxed mt-0.5">
                      {storeAddress}
                    </p>
                  </div>
                </div>

                {/* Node 2: Customer Drop (Masked Locality Only) */}
                <div className="flex gap-3 items-start pt-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center font-black shrink-0">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                  </div>

                  <div className="flex-1 min-w-0 bg-slate-800/40 rounded-2xl p-3 border border-slate-700/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                        CUSTOMER DROP • {dropDist} km leg
                      </span>
                      <span className="text-[9.5px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        🔒 Address Protected
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-sm text-slate-200">
                      Drop Area: {dropLocality}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium leading-tight">
                      Customer name, contact number, and exact house address will be displayed once you accept this order.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 pt-3 bg-[#111827] border-t border-slate-800 shrink-0 space-y-2">
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, (orderCountdown / 45) * 100))}%` }}
                  />
                </div>

                <button
                  type="button"
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
                  onClick={() => {
                    stopRiderOrderContinuousAlarm();
                    setRingingOrderAlert(null);
                  }}
                  className="w-full py-1 text-center text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Pass this order (Offer to next partner)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═════════════════════════════════════════════════════════════════════
          DELIVERY CELEBRATION MODAL
      ═════════════════════════════════════════════════════════════════════ */}
      {deliverySuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl shadow-inner">
              🎉
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Order Completed Successfully
              </span>
              <h3 className="font-display font-black text-2xl text-slate-900 mt-2">
                +₹{deliverySuccessModal.earnedAmount}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Credited directly to your Zeebac Delivery Pocket!
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-left text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Order</span>
                <span className="font-mono font-bold text-slate-900">#{String(deliverySuccessModal.orderId).slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pickup Store</span>
                <span className="font-bold text-slate-900">{deliverySuccessModal.storeName}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDeliverySuccessModal(null)}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-sm shadow-lg shadow-emerald-600/30 active:scale-95 cursor-pointer"
            >
              Ready for Next Order 🚀
            </button>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          DEPOSIT FLOATING CASH MODAL (Zomato Partner Cash Settlement)
      ═════════════════════════════════════════════════════════════════════ */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 border border-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <span className="material-symbols-outlined text-[20px]">payments</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-slate-900 leading-tight">
                    Deposit Floating Cash
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Settle COD Cash With Admin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Cash in Hand Info Box */}
            <div className={`p-3.5 rounded-2xl border ${
              isCashLimitReached || cashInHand >= maxCashLimit
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold">Total Cash with You:</span>
                <span className="font-mono font-black text-lg">₹{cashInHand.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1 pt-1 border-t border-slate-200/50">
                <span>Max Cash Limit:</span>
                <span className="font-bold">₹{maxCashLimit.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setDepositMethod('EARNINGS_DEDUCTION');
                  const cap = Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0));
                  if (Number(depositAmount) > cap) setDepositAmount(cap > 0 ? String(cap) : '');
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  depositMethod === 'EARNINGS_DEDUCTION'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
                <span>From Pocket</span>
              </button>
              <button
                type="button"
                onClick={() => setDepositMethod('UPI')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  depositMethod === 'UPI'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">qr_code_2</span>
                <span>Online UPI</span>
              </button>
            </div>

            {/* Method 1: Pocket Deduction */}
            {depositMethod === 'EARNINGS_DEDUCTION' && (
              <div className="space-y-3 bg-purple-50/60 p-3 rounded-2xl border border-purple-100 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Your Available Pocket:</span>
                  <span className="font-mono font-black text-purple-900 text-sm">
                    ₹{(rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Max you can settle from pocket:</span>
                  <span className="font-mono font-black text-slate-900 text-sm">₹{Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)).toLocaleString('en-IN')}</span>
                </div>
                {(rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0) <= 0 ? (
                  <p className="text-[11px] text-rose-700 font-semibold leading-snug">
                    Pocket balance ₹0 hai. Cash deposit karne ke liye Online UPI use karein.
                  </p>
                ) : (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0) < cashInHand ? (
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Pocket se max ₹{(rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0).toLocaleString('en-IN')} settle hoga. Baaki ₹{Math.round((cashInHand - (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) * 100) / 100} ke liye{' '}
                    <button type="button" onClick={() => setDepositMethod('UPI')} className="font-black text-emerald-700 underline cursor-pointer">
                      Online UPI
                    </button>{' '}
                    use karein.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Aapke pocket balance me se cash amount turant deduct ho jayegi aur Cash in Hand clear ho jayega.
                  </p>
                )}
              </div>
            )}

            {/* Method 2: Online UPI */}
            {depositMethod === 'UPI' && (
              <div className="space-y-3 bg-emerald-50/60 p-3 rounded-2xl border border-emerald-100 text-xs">
                <div>
                  <span className="text-slate-600 font-bold block text-[10px] uppercase">Admin UPI ID:</span>
                  <div className="flex items-center justify-between mt-1 bg-white p-2 rounded-xl border border-emerald-200">
                    <span className="font-mono font-black text-emerald-900 text-xs select-all">
                      zeebac.delivery@upi
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText?.('zeebac.delivery@upi');
                        toast.success('UPI ID copied to clipboard!');
                      }}
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    UPI Transaction UTR / Ref ID:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 331204987612"
                    value={depositUtr}
                    onChange={(e) => setDepositUtr(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-mono font-bold outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleDepositCash} className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <label className="font-bold text-slate-700">Amount to Settle (₹):</label>
                  <button
                    type="button"
                    onClick={() => setDepositAmount(String((depositMethod === 'EARNINGS_DEDUCTION' ? Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) : cashInHand)))}
                    className="text-purple-700 font-black hover:underline cursor-pointer"
                  >
                    {depositMethod === 'EARNINGS_DEDUCTION' ? 'Use full pocket' : 'Settle All'} (₹{(depositMethod === 'EARNINGS_DEDUCTION' ? Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) : cashInHand)})
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="1"
                    max={(depositMethod === 'EARNINGS_DEDUCTION' ? Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) : cashInHand)}
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder={`e.g. ${cashInHand}`}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold font-mono outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2">
                {[...new Set([500, 1000, (depositMethod === 'EARNINGS_DEDUCTION' ? Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) : cashInHand)])].filter((amt) => amt > 0 && amt <= (depositMethod === 'EARNINGS_DEDUCTION' ? Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) : cashInHand)).map((amt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDepositAmount(String(amt))}
                    className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={depositSubmitting || (depositMethod === 'EARNINGS_DEDUCTION' ? Math.min(cashInHand, (rider?.totalEarnings ?? riderDetails?.totalEarnings ?? 0)) : cashInHand) <= 0}
                className="w-full py-3 rounded-2xl bg-slate-950 hover:bg-black text-white font-display font-black text-xs shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>
                  {depositSubmitting
                    ? 'Processing Deposit...'
                    : `Settle ₹${depositAmount || cashInHand} Cash`}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── WORKING AREA / ZONE SELECTOR MODAL ─── */}
      {showZoneModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom duration-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Delivery Zone & Demand Clusters
                </span>
                <h3 className="font-display font-black text-base text-slate-900 mt-1">
                  Choose Your Working Area
                </h3>
              </div>
              <button
                onClick={() => setShowZoneModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* City Selector Tabs */}
            <div className="flex gap-2 pt-3 shrink-0">
              {['Lucknow', 'Indore'].map((cityName) => (
                <button
                  key={cityName}
                  onClick={() => {
                    setSelectedCity(cityName);
                    fetchZones(cityName);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    selectedCity.toLowerCase() === cityName.toLowerCase()
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📍 {cityName}
                </button>
              ))}
            </div>

            {/* Zones List */}
            <div className="mt-3 space-y-2.5 overflow-y-auto pr-1 flex-1">
              {zonesList.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">Loading zones...</p>
              ) : (
                zonesList.map((zone) => {
                  const isCurrent =
                    (riderDetails?.workingZone || '').toLowerCase() === zone.name.toLowerCase();

                  return (
                    <div
                      key={zone.zoneId || zone._id}
                      onClick={() => handleSelectZone(zone)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isCurrent
                          ? 'bg-emerald-50/80 border-emerald-400 shadow-2xs ring-1 ring-emerald-400'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-display font-black text-xs text-slate-900">
                            {zone.name}
                          </h4>
                          {zone.surgeBonus > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-black uppercase">
                              +₹{zone.surgeBonus} Surge
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase">
                              Active
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                          {zone.demandBadge || zone.demandLevel || 'High Demand 🔥'}
                        </p>

                        {zone.localities?.length > 0 && (
                          <p className="text-[10px] text-slate-400 font-medium mt-1 line-clamp-1">
                            {zone.localities.join(', ')}
                          </p>
                        )}
                      </div>

                      <button
                        disabled={isUpdatingZone}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                          isCurrent
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white'
                        }`}
                      >
                        {isCurrent ? 'Selected ✓' : 'Select'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-2 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowZoneModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
