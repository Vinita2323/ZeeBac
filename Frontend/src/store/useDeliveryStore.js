import { create } from 'zustand';

const DELIVERY_TOKEN_KEY = 'zeebac_delivery_token';
const DELIVERY_RIDER_KEY = 'zeebac_delivery_rider';

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
    if (token) localStorage.setItem(DELIVERY_TOKEN_KEY, token);
    if (rider) localStorage.setItem(DELIVERY_RIDER_KEY, JSON.stringify(rider));
    set({ rider, token, isOnline: !!rider?.isOnline });
  },

  updateRider: (updates) => {
    const current = get().rider;
    const updated = { ...current, ...updates };
    localStorage.setItem(DELIVERY_RIDER_KEY, JSON.stringify(updated));
    set({ rider: updated, isOnline: updated.isOnline });
  },

  setOnlineStatus: (isOnline) => {
    const current = get().rider;
    const updated = { ...current, isOnline };
    localStorage.setItem(DELIVERY_RIDER_KEY, JSON.stringify(updated));
    set({ isOnline, rider: updated });
  },

  setActiveOrder: (order) => set({ activeOrder: order }),
  setAvailableOrders: (orders) => set({ availableOrders: orders }),

  logout: () => {
    localStorage.removeItem(DELIVERY_TOKEN_KEY);
    localStorage.removeItem(DELIVERY_RIDER_KEY);
    set({ rider: null, token: null, isOnline: false, activeOrder: null, availableOrders: [] });
  },
}));

export default useDeliveryStore;
