import { create } from 'zustand';

// ─── Auth Store ─────────────────────────────────────────────────────────────
// Centralized authentication & session state.
// Replaces all scattered localStorage.getItem('zeebac_current_user') calls.

// PIN/biometric is a customer & vendor feature only — admin sessions
// authenticate with a password every time already, so they're excluded.
const hasSecurityEnabled = (user) => {
  const role = user?.role || user?.userType;
  if (role !== 'customer' && role !== 'vendor') return false;
  return Boolean(user?.security?.hasPin || user?.security?.biometricEnabled);
};

// Tracks "already unlocked" with a 5-minute grace period across tabs and app switching.
// Once a user successfully enters their PIN/biometric (or logs in), they are not
// prompted again for 5 minutes (300,000 ms), regardless of tab switching, minimization, or navigation.
const UNLOCK_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const LAST_UNLOCKED_AT_KEY = 'zeebac_app_last_unlocked_at';

const isWithinUnlockGracePeriod = () => {
  try {
    const raw = localStorage.getItem(LAST_UNLOCKED_AT_KEY) || sessionStorage.getItem(LAST_UNLOCKED_AT_KEY);
    if (!raw) return false;
    const timestamp = parseInt(raw, 10);
    if (isNaN(timestamp)) return false;
    return (Date.now() - timestamp) < UNLOCK_GRACE_PERIOD_MS;
  } catch {
    return false;
  }
};

const markUnlockedThisSession = () => {
  try {
    const now = String(Date.now());
    localStorage.setItem(LAST_UNLOCKED_AT_KEY, now);
    sessionStorage.setItem(LAST_UNLOCKED_AT_KEY, now);
  } catch { /* ignore */ }
};

const clearUnlockedThisSession = () => {
  try {
    localStorage.removeItem(LAST_UNLOCKED_AT_KEY);
    sessionStorage.removeItem(LAST_UNLOCKED_AT_KEY);
  } catch { /* ignore */ }
};

const useAuthStore = create((set, get) => ({
  // ── State ──
  currentUser: null,        // { role, name, phone, email, storeName, ... }
  accessToken: null,
  isAuthenticated: false,
  walletBalance: 0,
  isAppLocked: false,       // App-open PIN/biometric gate — see AppLockScreen

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
          // Runs on every fresh page load, including a plain refresh — only
          // actually gate if security is enabled and the 5-minute unlock window has expired.
          isAppLocked: hasSecurityEnabled(user) && !isWithinUnlockGracePeriod(),
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

    markUnlockedThisSession(); // just verified identity via OTP — don't immediately re-gate
    set({
      currentUser: userData,
      accessToken: accessToken,
      isAuthenticated: true,
      walletBalance: balance,
      isAppLocked: false,
    });

    // Fetch live balance from backend immediately on login
    get().fetchWalletBalance();
  },

  // Re-gate on resume (App.jsx calls this on visibility resume) —
  // respects the 5-minute grace period: if user entered PIN/biometric within the last 5 minutes,
  // tab switching or navigation will NOT re-prompt for PIN/biometric.
  lockApp: (force = false) => {
    if (!hasSecurityEnabled(get().currentUser)) return;
    if (!force && isWithinUnlockGracePeriod()) {
      return; // Within 5-minute unlock window — keep app unlocked!
    }
    clearUnlockedThisSession();
    set({ isAppLocked: true });
  },
  unlockApp: () => {
    markUnlockedThisSession(); // Grants fresh 5-minute unlock access
    set({ isAppLocked: false });
  },

  setAccessToken: (token) => {
    localStorage.setItem('zeebac_access_token', token);
    set({ accessToken: token });
  },

  // Log out and clear all persisted session data immediately
  logout: () => {
    const token = localStorage.getItem('zeebac_access_token');
    clearUnlockedThisSession();

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
      isAppLocked: false,
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
      if (role === 'admin' || role === 'super_admin') return get().walletBalance;
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
