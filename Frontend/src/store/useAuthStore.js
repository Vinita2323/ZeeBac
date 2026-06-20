import { create } from 'zustand';

// ─── Auth Store ─────────────────────────────────────────────────────────────
// Centralized authentication & session state.
// Replaces all scattered localStorage.getItem('zeebac_current_user') calls.

const useAuthStore = create((set, get) => ({
  // ── State ──
  currentUser: null,        // { role, name, phone, email, storeName, ... }
  isAuthenticated: false,
  walletBalance: 0,

  // ── Actions ──

  // Called on app boot to restore session from localStorage
  hydrate: () => {
    try {
      const userStr = localStorage.getItem('zeebac_current_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const role = user.role || user.userType;

        // Restore wallet balance based on role
        let balance = 0;
        if (role === 'vendor') {
          balance = parseFloat(localStorage.getItem('vendor_balance') || '24500');
        } else {
          balance = parseFloat(localStorage.getItem('zeebac_wallet_balance') || '1284.50');
        }

        set({
          currentUser: user,
          isAuthenticated: true,
          walletBalance: balance,
        });
      }
    } catch (e) {
      console.error('Failed to hydrate auth store:', e);
    }
  },

  // Log in a user (customer, vendor, or admin)
  login: (userData) => {
    localStorage.setItem('zeebac_current_user', JSON.stringify(userData));
    const role = userData.role || userData.userType;

    let balance = 0;
    if (role === 'vendor') {
      balance = parseFloat(localStorage.getItem('vendor_balance') || '24500');
    } else {
      balance = parseFloat(localStorage.getItem('zeebac_wallet_balance') || '1284.50');
    }

    set({
      currentUser: userData,
      isAuthenticated: true,
      walletBalance: balance,
    });
  },

  // Log out and clear all persisted session data
  logout: () => {
    localStorage.removeItem('zeebac_current_user');
    localStorage.removeItem('vendor_transactions');
    localStorage.removeItem('vendor_balance');
    localStorage.removeItem('zeebac_wallet_balance');
    localStorage.removeItem('zeebac_transactions');
    localStorage.removeItem('user_profile');
    localStorage.removeItem('cashback_requests');

    set({
      currentUser: null,
      isAuthenticated: false,
      walletBalance: 0,
    });
  },

  // Update wallet balance globally (all pages react instantly)
  updateBalance: (newBalance) => {
    const user = get().currentUser;
    const role = user?.role || user?.userType;

    if (role === 'vendor') {
      localStorage.setItem('vendor_balance', String(newBalance));
    } else {
      localStorage.setItem('zeebac_wallet_balance', String(newBalance));
    }

    set({ walletBalance: newBalance });
  },

  // Update profile fields without losing other data
  updateProfile: (updates) => {
    const current = get().currentUser;
    const updated = { ...current, ...updates };
    localStorage.setItem('zeebac_current_user', JSON.stringify(updated));
    set({ currentUser: updated });
  },
}));

// Synchronously hydrate on load to prevent refresh redirects
useAuthStore.getState().hydrate();

export default useAuthStore;
