import { create } from 'zustand';

const DELIVERY_TOKEN_KEY = 'zeebac_delivery_token';
const DELIVERY_RIDER_KEY = 'zeebac_delivery_rider';

const sanitizeRiderForStorage = (rider) => {
  if (!rider) return null;
  return {
    _id: rider._id,
    id: rider.id || rider._id,
    riderId: rider.riderId,
    name: rider.name,
    phone: rider.phone,
    email: rider.email,
    applicationStatus: rider.applicationStatus,
    isOnline: !!rider.isOnline,
    status: rider.status || 'OFFLINE',
    vehicleType: rider.vehicleType,
    vehicleNo: rider.vehicleNo,
    profileImage: typeof rider.profileImage === 'string' && !rider.profileImage.startsWith('data:') ? rider.profileImage : '',
  };
};

export const useDeliveryStore = create((set, get) => ({
  rider: (() => {
    try {
      const stored = localStorage.getItem(DELIVERY_RIDER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  token: localStorage.getItem(DELIVERY_TOKEN_KEY) || null,
  isOnline: false,
  activeOrder: null,
  availableOrders: [],

  setAuth: (rider, token) => {
    try {
      if (token) localStorage.setItem(DELIVERY_TOKEN_KEY, token);
      if (rider) {
        const safe = sanitizeRiderForStorage(rider);
        localStorage.setItem(DELIVERY_RIDER_KEY, JSON.stringify(safe));
      }
    } catch (err) {
      console.warn('[useDeliveryStore] localStorage quota exceeded, skipping local cache', err);
    }
    set({ rider, token, isOnline: !!rider?.isOnline });
  },

  updateRider: (updates) => {
    const current = get().rider;
    const updated = { ...current, ...updates };
    try {
      const safe = sanitizeRiderForStorage(updated);
      localStorage.setItem(DELIVERY_RIDER_KEY, JSON.stringify(safe));
    } catch (err) {
      console.warn('[useDeliveryStore] localStorage update quota warning', err);
    }
    set({ rider: updated, isOnline: updated.isOnline });
  },

  setOnlineStatus: (isOnline) => {
    const current = get().rider;
    const updated = { ...current, isOnline };
    try {
      const safe = sanitizeRiderForStorage(updated);
      localStorage.setItem(DELIVERY_RIDER_KEY, JSON.stringify(safe));
    } catch (err) {
      console.warn('[useDeliveryStore] localStorage quota warning', err);
    }
    set({ isOnline, rider: updated });
  },

  setActiveOrder: (order) => set({ activeOrder: order }),
  setAvailableOrders: (orders) => set({ availableOrders: orders }),

  logout: () => {
    try {
      localStorage.removeItem(DELIVERY_TOKEN_KEY);
      localStorage.removeItem(DELIVERY_RIDER_KEY);
    } catch {
      // ignore
    }
    set({ rider: null, token: null, isOnline: false, activeOrder: null, availableOrders: [] });
  },
}));

export default useDeliveryStore;
