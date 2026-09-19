import { create } from 'zustand';

// ─── Auth Store ─────────────────────────────────────────────────────────────
// Centralized authentication & session state.
// Replaces all scattered localStorage.getItem('zeebac_current_user') calls.

const useAuthStore = create((set, get) => ({
  // ── State ──
  currentUser: null,        // { role, name, phone, email, storeName, ... }
  accessToken: null,
  isAuthenticated: false,
  walletBalance: 0,

  // ── Actions ──

  // Called on app boot to restore session from localStorage
  hydrate: () => {
    try {
      const userStr = localStorage.getItem('zeebac_current_user');
      const token = localStorage.getItem('zeebac_access_token');
      if (userStr && token) {
        const user = JSON.parse(userStr);
        const role = user.role || user.userType;

        // Restore wallet balance based on role (clean 0 default, purge stale mock values)
        let balance = 0;
        if (role === 'vendor') {
          const stored = localStorage.getItem('vendor_balance');
          if (stored === '24500') {
            localStorage.removeItem('vendor_balance');
          } else if (stored !== null && !isNaN(parseFloat(stored))) {
            balance = parseFloat(stored);
          }
        } else {
          const stored = localStorage.getItem('zeebac_wallet_balance');
          if (stored === '1284.50' || stored === '1284.5') {
            localStorage.removeItem('zeebac_wallet_balance');
          } else if (stored !== null && !isNaN(parseFloat(stored))) {
            balance = parseFloat(stored);
          }
        }

        set({
          currentUser: user,
          accessToken: token,
          isAuthenticated: true,
          walletBalance: balance,
        });

        // Silently sync real-time wallet balance from backend in background
        get().fetchWalletBalance();
      }
    } catch (e) {
      console.error('Failed to hydrate auth store:', e);
    }
  },

  // Log in a user (customer, vendor, or admin)
  login: (userData, accessToken, refreshToken) => {
    localStorage.setItem('zeebac_current_user', JSON.stringify(userData));
    localStorage.setItem('zeebac_access_token', accessToken);
    if (refreshToken) localStorage.setItem('zeebac_refresh_token', refreshToken);
    
    const role = userData.role || userData.userType;

    let balance = 0;
    if (role === 'vendor') {
      const stored = localStorage.getItem('vendor_balance');
      if (stored === '24500') {
        localStorage.removeItem('vendor_balance');
      } else if (stored !== null && !isNaN(parseFloat(stored))) {
        balance = parseFloat(stored);
      }
    } else {
      const stored = localStorage.getItem('zeebac_wallet_balance');
      if (stored === '1284.50' || stored === '1284.5') {
        localStorage.removeItem('zeebac_wallet_balance');
      } else if (stored !== null && !isNaN(parseFloat(stored))) {
        balance = parseFloat(stored);
      }
    }

    set({
      currentUser: userData,
      accessToken: accessToken,
      isAuthenticated: true,
      walletBalance: balance,
    });

    // Fetch live balance from backend immediately on login
    get().fetchWalletBalance();
  },

  setAccessToken: (token) => {
    localStorage.setItem('zeebac_access_token', token);
    set({ accessToken: token });
  },

  // Log out and clear all persisted session data immediately
  logout: () => {
    const token = localStorage.getItem('zeebac_access_token');

    // 1. Immediately wipe all local storage keys
    localStorage.removeItem('zeebac_current_user');
    localStorage.removeItem('zeebac_access_token');
    localStorage.removeItem('zeebac_refresh_token');
    localStorage.removeItem('vendor_transactions');
    localStorage.removeItem('vendor_balance');
    localStorage.removeItem('zeebac_wallet_balance');
    localStorage.removeItem('zeebac_transactions');
    localStorage.removeItem('user_profile');
    localStorage.removeItem('cashback_requests');

    // 2. Immediately reset store state
    set({
      currentUser: null,
      accessToken: null,
      isAuthenticated: false,
      walletBalance: 0,
    });

    // 3. Fire-and-forget backend notification & socket disconnect in background
    if (token) {
      import('../services/api.js')
        .then(({ apiClient }) => apiClient.post('/auth/logout').catch(() => {}))
        .catch(() => {});
      import('../services/socket.js')
        .then(({ disconnectSocket }) => disconnectSocket(true))
        .catch(() => {});
    }
  },

  // Update wallet balance globally (all pages react instantly)
  updateBalance: (newBalance) => {
    const numeric = typeof newBalance === 'number' && !isNaN(newBalance) ? newBalance : parseFloat(newBalance) || 0;
    const user = get().currentUser;
    const role = user?.role || user?.userType;

    if (role === 'vendor') {
      localStorage.setItem('vendor_balance', String(numeric));
    } else {
      localStorage.setItem('zeebac_wallet_balance', String(numeric));
    }

    set({ walletBalance: numeric });
  },

  // Live query of wallet balance from backend MongoDB based on active user role
  fetchWalletBalance: async () => {
    try {
      const user = get().currentUser;
      if (!user) return 0;
      const role = user?.role || user?.userType;
      const { apiClient } = await import('../services/api.js');

      if (role === 'vendor') {
        const res = await apiClient.get('/vendor/wallet');
        if (res.data?.success && res.data?.data?.wallet) {
          const balance = Number(res.data.data.wallet.balance) || 0;
          get().updateBalance(balance);
          return balance;
        }
      } else {
        const res = await apiClient.get('/user/wallet');
        if (res.data?.success && res.data?.data?.wallet) {
          const balance = Number(res.data.data.wallet.balance) || 0;
          get().updateBalance(balance);
          return balance;
        }
      }
    } catch (e) {
      // Gracefully retain existing state on network errors / offline
    }
    return get().walletBalance;
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
