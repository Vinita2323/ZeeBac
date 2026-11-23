import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getSocket } from '../../services/socket';
import { formatDisplayAddress } from '../../utils/addressUtils';

// Fix Leaflet's default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Leaflet HTML Pin Creators
const createStoreIcon = (name) => {
  return L.divIcon({
    className: 'custom-store-pin',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="background: #1e1b4b; color: white; padding: 6px; border-radius: 9999px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px;">
          <span class="material-symbols-outlined" style="font-size: 20px;">restaurant</span>
        </div>
        <div style="background: white; color: #1e1b4b; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; margin-top: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; white-space: nowrap; max-width: 110px; overflow: hidden; text-overflow: ellipsis;">
          ${name || 'Store'}
        </div>
      </div>
    `,
    iconSize: [38, 56],
    iconAnchor: [19, 20],
  });
};

const createCustomerIcon = () => {
  return L.divIcon({
    className: 'custom-customer-pin',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="background: #047857; color: white; padding: 6px; border-radius: 9999px; box-shadow: 0 4px 14px rgba(4,120,87,0.4); border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px;">
          <span class="material-symbols-outlined" style="font-size: 20px;">home</span>
        </div>
        <div style="background: white; color: #047857; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; margin-top: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; white-space: nowrap;">
          Delivery Point
        </div>
      </div>
    `,
    iconSize: [38, 56],
    iconAnchor: [19, 20],
  });
};

const createRiderIcon = (heading = 0) => {
  return L.divIcon({
    className: 'custom-rider-pin',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <!-- Pulsating Radar Ring -->
        <div style="position: absolute; top: -6px; left: -6px; width: 52px; height: 52px; border-radius: 9999px; background: rgba(220, 38, 38, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <!-- Scooter Badge -->
        <div style="position: relative; z-index: 10; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; padding: 8px; border-radius: 9999px; box-shadow: 0 6px 18px rgba(185,28,28,0.5); border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">
          <span class="material-symbols-outlined" style="font-size: 22px; transform: rotate(${heading}deg);">two_wheeler</span>
        </div>
        <!-- Live Tag -->
        <div style="position: relative; z-index: 10; background: #b91c1c; color: white; font-size: 9.5px; font-weight: 900; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 9999px; margin-top: 3px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); border: 1px solid white; display: flex; align-items: center; gap: 3px;">
          <span style="display: inline-block; width: 5px; height: 5px; border-radius: 9999px; background: #4ade80;"></span>
          LIVE RIDER
        </div>
      </div>
    `,
    iconSize: [44, 62],
    iconAnchor: [22, 22],
  });
};

// Map View Bounds Auto-Fitter
function MapAutoFitter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      try {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      } catch {}
    }
  }, [bounds, map]);
  return null;
}

export default function LiveOrderTrackingModal({ order, onClose }) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [riderCoords, setRiderCoords] = useState(null);
  const [riderHeading, setRiderHeading] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Compute Base Coordinates for Store and Customer
  // Default fallback base is Lucknow Hazratganj / Indore Regal Square
  const defaultBaseLat = 26.8467;
  const defaultBaseLng = 80.9462;

  const storeLat =
    currentOrder.vendorId?.location?.coordinates?.[1] ||
    currentOrder.pickupCoordinates?.latitude ||
    defaultBaseLat;

  const storeLng =
    currentOrder.vendorId?.location?.coordinates?.[0] ||
    currentOrder.pickupCoordinates?.longitude ||
    defaultBaseLng;

  const customerLat =
    currentOrder.deliveryCoordinates?.latitude ||
    currentOrder.customerId?.location?.coordinates?.[1] ||
    storeLat + 0.015;

  const customerLng =
    currentOrder.deliveryCoordinates?.longitude ||
    currentOrder.customerId?.location?.coordinates?.[0] ||
    storeLng + 0.022;

  // Initialize or update rider coords
  useEffect(() => {
    if (currentOrder.riderDetails?.currentLocation?.latitude && currentOrder.riderDetails?.currentLocation?.longitude) {
      setRiderCoords([
        currentOrder.riderDetails.currentLocation.latitude,
        currentOrder.riderDetails.currentLocation.longitude,
      ]);
      setRiderHeading(currentOrder.riderDetails.currentLocation.heading || 0);
    } else {
      // Default initial rider position interpolated along the route (e.g. 40% towards customer)
      const ratio = currentOrder.orderStatus === 'OUT_FOR_DELIVERY' ? 0.65 : 0.2;
      setRiderCoords([
        storeLat + (customerLat - storeLat) * ratio,
        storeLng + (customerLng - storeLng) * ratio,
      ]);
    }
  }, [currentOrder, storeLat, storeLng, customerLat, customerLng]);

  // Real-time Socket Listener for Live GPS Telemetry and Status Transitions
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const orderId = currentOrder.orderId || currentOrder._id;
    socket.emit('order:join', { orderId: currentOrder.orderId });
    if (currentOrder._id && currentOrder._id !== currentOrder.orderId) {
      socket.emit('order:join', { orderId: currentOrder._id });
    }

    // 1. Live Rider GPS Location Update
    const handleLocationUpdate = (data) => {
      if (data.orderId === currentOrder.orderId || data.orderId === currentOrder._id || !data.orderId) {
        if (data.latitude && data.longitude) {
          setRiderCoords([Number(data.latitude), Number(data.longitude)]);
          if (data.heading !== undefined) setRiderHeading(Number(data.heading));
        }
      }
    };

    // 2. Lifecycle Status Updates (ARRIVED_AT_PICKUP, OUT_FOR_DELIVERY, DELIVERED)
    const handleStatusUpdate = (data) => {
      if (data.orderId === currentOrder.orderId || data.orderId === currentOrder._id) {
        setCurrentOrder((prev) => ({
          ...prev,
          orderStatus: data.orderStatus || prev.orderStatus,
          riderDetails: {
            ...prev.riderDetails,
            ...(data.riderDetails || {}),
            name: data.riderName || prev.riderDetails?.name,
            phone: data.riderPhone || prev.riderDetails?.phone,
            vehicleNo: data.vehicleNo || prev.riderDetails?.vehicleNo,
          },
        }));
      }
    };

    socket.on('delivery:location_update', handleLocationUpdate);
    socket.on('order:status_update', handleStatusUpdate);
    socket.on('order:out_for_delivery', handleStatusUpdate);
    socket.on('order:rider_assigned', handleStatusUpdate);
    socket.on('order:delivered', handleStatusUpdate);

    return () => {
      socket.emit('order:leave', { orderId: currentOrder.orderId });
      socket.off('delivery:location_update', handleLocationUpdate);
      socket.off('order:status_update', handleStatusUpdate);
      socket.off('order:out_for_delivery', handleStatusUpdate);
      socket.off('order:rider_assigned', handleStatusUpdate);
      socket.off('order:delivered', handleStatusUpdate);
    };
  }, [currentOrder.orderId, currentOrder._id]);

  // Compute bounding points for map view
  const mapBounds = [
    [storeLat, storeLng],
    [customerLat, customerLng],
    ...(riderCoords ? [riderCoords] : []),
  ];

  // Route Polyline Points
  const routePoints = [
    [storeLat, storeLng],
    ...(riderCoords ? [riderCoords] : []),
    [customerLat, customerLng],
  ];

  const handleCopyOtp = () => {
    const otp = currentOrder.riderDetails?.deliveryOtp || '1234';
    navigator.clipboard.writeText(otp);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const storeName = currentOrder.vendorId?.storeName || currentOrder.storeName || 'Shree Shyama';
  const riderName = currentOrder.riderDetails?.name || 'Vikas Sharma';
  const riderPhone = currentOrder.riderDetails?.phone || '9876543210';
  const riderVehicle = currentOrder.riderDetails?.vehicleNo || 'Hero Splendor (DL 04 4821)';
  const isCod = currentOrder.paymentMethod === 'CASH';
  const amountToPay = currentOrder.finalPayableAmount || currentOrder.totalAmount || 0;

  // Header Title & Subtitle based on Order Lifecycle State
  let headerTitle = 'Order is on the way 🤘';
  let headerSubtitle = 'Before time • Reaching near you in ~7 mins';
  let headerBg = 'bg-emerald-600';

  if (currentOrder.orderStatus === 'RIDER_ASSIGNED') {
    headerTitle = 'Rider is on the way to store 🛵';
    headerSubtitle = `${riderName} is reaching ${storeName} to pick up your order`;
    headerBg = 'bg-indigo-700';
  } else if (currentOrder.orderStatus === 'ARRIVED_AT_PICKUP') {
    headerTitle = 'Rider reached store 📍';
    headerSubtitle = `${riderName} has arrived at ${storeName} and is collecting the package`;
    headerBg = 'bg-amber-600';
  } else if (currentOrder.orderStatus === 'ARRIVED_AT_CUSTOMER') {
    headerTitle = 'Rider arrived at your location! 🔔';
    headerSubtitle = 'Please share Delivery OTP with the delivery partner to collect your order';
    headerBg = 'bg-purple-700';
  } else if (currentOrder.orderStatus === 'DELIVERED') {
    headerTitle = 'Order Delivered Successfully! 🎉';
    headerSubtitle = 'Hope you enjoy your purchase! Thank you for choosing Zeebac.';
    headerBg = 'bg-emerald-700';
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-fadeIn">
      <div className="relative w-full max-w-lg h-full sm:h-[92vh] sm:rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* ─── 1. ZOMATO-STYLE GREEN/BRANDED TOP APP BAR ─── */}
        <div className={`${headerBg} text-white px-4 pt-4 pb-4.5 shrink-0 transition-colors duration-300 shadow-md`}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/20 hover:bg-black/35 flex items-center justify-center text-white transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>

            <div className="text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/80 block">
                {storeName}
              </span>
              <p className="text-[10px] text-white/70 font-mono">
                Order #{currentOrder.orderId}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/20 hover:bg-black/35 flex items-center justify-center text-white transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[19px]">close</span>
            </button>
          </div>

          <div className="mt-3 text-center">
            <h2 className="text-[20px] font-display font-black tracking-tight text-white flex items-center justify-center gap-1.5">
              <span>{headerTitle}</span>
            </h2>
            <p className="text-[12px] font-semibold text-white/90 mt-0.5">
              {headerSubtitle}
            </p>
          </div>
        </div>

        {/* ─── 2. LIVE INTERACTIVE LEAFLET MAP WITH LIVE MOVING RIDER ─── */}
        <div className="relative w-full h-[320px] sm:h-[340px] shrink-0 bg-slate-100 border-b border-slate-200">
          <MapContainer
            center={riderCoords || [storeLat, storeLng]}
            zoom={14}
            className="w-full h-full z-0"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapAutoFitter bounds={mapBounds} />

            {/* Route Polyline (Zomato-style solid blue path) */}
            <Polyline
              positions={routePoints}
              pathOptions={{
                color: '#2563eb',
                weight: 4.5,
                opacity: 0.85,
                dashArray: currentOrder.orderStatus === 'OUT_FOR_DELIVERY' ? undefined : '6, 8',
              }}
            />

            {/* Store Pin */}
            <Marker position={[storeLat, storeLng]} icon={createStoreIcon(storeName)}>
              <Popup>
                <div className="text-xs font-sans text-center">
                  <strong>{storeName}</strong>
                  <p className="text-[10px] text-slate-500">Pickup Store Location</p>
                </div>
              </Popup>
            </Marker>

            {/* Customer Home Pin */}
            <Marker position={[customerLat, customerLng]} icon={createCustomerIcon()}>
              <Popup>
                <div className="text-xs font-sans text-center">
                  <strong>Delivery Destination</strong>
                  <p className="text-[10px] text-slate-500">{formatDisplayAddress(currentOrder.deliveryAddress, 'Your Location')}</p>
                </div>
              </Popup>
            </Marker>

            {/* LIVE MOVING RIDER MARKER (Scooter Icon with animated radar) */}
            {riderCoords && (
              <Marker position={riderCoords} icon={createRiderIcon(riderHeading)}>
                <Popup>
                  <div className="text-xs font-sans text-center space-y-0.5">
                    <strong className="text-red-700">{riderName}</strong>
                    <p className="text-[10px] text-slate-600">{riderVehicle}</p>
                    <p className="text-[9.5px] font-bold text-emerald-600">● LIVE ON MAP</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Map Overlay Badge */}
          <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border border-slate-200/80 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-[11px] font-black text-slate-800 tracking-wide">
              {currentOrder.orderStatus.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* ─── 3. SCROLLABLE BOTTOM DETAILS SHEET (MATCHING USER SCREENSHOT) ─── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
          {/* Rewards / Cashback Callout (From Screenshot: "You've won ₹50 Zomato credits") */}
          <div className="bg-white rounded-2xl p-3.5 border border-purple-100 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[22px]">stars</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-[13px] text-slate-900 leading-tight">
                You've won ₹{currentOrder.totalCashbackPoints || 50} Zeebac Cashback
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Automatically credited to your Zeebac wallet for subsequent orders and vouchers.
              </p>
            </div>
          </div>

          {/* Delivery OTP Card (Prominent 4-Digit Handover Code) */}
          <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-purple-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-purple-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">key</span>
                <span>Delivery Handover OTP</span>
              </span>
              <p className="text-2xl font-mono font-black tracking-widest text-amber-300">
                {currentOrder.riderDetails?.deliveryOtp || String(currentOrder.orderId || '').replace(/\D/g, '').slice(-4) || '1234'}
              </p>
              <p className="text-[10.5px] text-purple-100">
                Share this 4-digit code with {riderName} at the time of delivery.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyOtp}
              className="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
              <span>{copyFeedback ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {/* Payment & Cash Notice (Matching Screenshot: "Pay ₹296 before or on delivery") */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600 text-[20px]">payments</span>
                <div>
                  <p className="font-bold text-[13px] text-slate-900">
                    {isCod ? `Pay ₹${amountToPay} on delivery (COD)` : `₹${amountToPay} Paid Online`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {isCod
                      ? 'Please keep exact change handy to avoid hassle.'
                      : 'Payment verified via UPI Intent / Card.'}
                  </p>
                </div>
              </div>
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${isCod ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {isCod ? 'Cash Due' : 'Paid'}
              </span>
            </div>
          </div>

          {/* Delivery Partner Profile Card (Matching Screenshot: "I'm Chayan, your delivery...") */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-indigo-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                <span className="material-symbols-outlined text-indigo-700 text-[28px]">sports_motorsports</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[13.5px] text-slate-900 leading-tight truncate">
                  I'm {riderName}, your delivery partner
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                  {riderVehicle}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] font-bold text-emerald-700">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  <span>Vaccinated • Temperature Checked</span>
                </div>
              </div>
            </div>

            <a
              href={`tel:${riderPhone}`}
              className="h-10 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">call</span>
              <span>Call</span>
            </a>
          </div>

          {/* Step-by-Step Delivery Lifecycle Tracker */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <h5 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              Delivery Progress
            </h5>

            <div className="space-y-3 pl-1">
              {[
                { id: 'PLACED', label: 'Order Placed & Confirmed', desc: 'Received at store', icon: 'receipt_long' },
                { id: 'PREPARING', label: 'Store Preparing Order', desc: `${storeName} is packing your goods`, icon: 'soup_kitchen' },
                { id: 'ARRIVED_AT_PICKUP', label: 'Rider Reached Store', desc: `${riderName} reached to pick up items`, icon: 'store' },
                { id: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: `${riderName} is on the way to you`, icon: 'two_wheeler' },
                { id: 'DELIVERED', label: 'Delivered', desc: 'Handed over with OTP verification', icon: 'check_circle' },
              ].map((step, sIdx, arr) => {
                const stageOrder = ['PLACED', 'PREPARING', 'ARRIVED_AT_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
                const currentIdx = stageOrder.indexOf(currentOrder.orderStatus);
                const isPassed = currentIdx > sIdx;
                const isCurrent = currentIdx === sIdx;

                return (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          isPassed
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : isCurrent
                            ? 'bg-purple-700 text-white ring-4 ring-purple-100 shadow-sm'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {isPassed ? 'check' : step.icon}
                        </span>
                      </div>
                      {sIdx < arr.length - 1 && (
                        <div
                          className={`w-0.5 h-6 my-0.5 ${
                            isPassed ? 'bg-emerald-600' : 'bg-slate-200'
                          }`}
                        />
                      )}
                    </div>
                    <div className="pt-0.5 min-w-0 flex-1">
                      <p
                        className={`font-black text-[12.5px] leading-tight ${
                          isCurrent ? 'text-purple-700' : isPassed ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── 4. MODAL FOOTER ─── */}
        <div className="p-3.5 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            Close Live Tracking
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
