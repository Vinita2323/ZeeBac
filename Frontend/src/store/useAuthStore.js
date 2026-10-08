import { create } from 'zustand';

// ─── Auth Store ─────────────────────────────────────────────────────────────
// Multi-role session management: Customer, Vendor, and Admin sessions
// are stored independently so they NEVER overwrite or log out each other
// on the same phone/browser!
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_STORAGE = {
  customer: {
    user: 'zeebac_customer_user',
    token: 'zeebac_customer_token',
    refresh: 'zeebac_customer_refresh_token',
    balance: 'zeebac_wallet_balance',
  },
  vendor: {
    user: 'zeebac_vendor_user',
    token: 'zeebac_vendor_token',
    refresh: 'zeebac_vendor_refresh_token',
    balance: 'vendor_balance',
  },
  admin: {
    user: 'zeebac_admin_user',
    token: 'zeebac_admin_token',
    refresh: 'zeebac_admin_refresh_token',
    balance: null,
  }
};

// The app-open lock screen is gated on the "Biometric Security" toggle alone,
// NOT on hasPin — a PIN can exist purely as a withdrawal/change-PIN credential
// (see SecurityPinModal's "Secures withdrawals & biometrics" copy) without the
// user ever having opted into an app-open lock. Treating hasPin as its own
// trigger meant turning the biometric toggle off didn't stop the PIN prompt
// on every app open, which looked like a broken "off" switch.
const hasSecurityEnabled = (user) => {
  const role = user?.role || user?.userType;
  if (role !== 'customer' && role !== 'vendor') return false;
  return Boolean(user?.security?.biometricEnabled);
};

const UNLOCK_GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes

const getUnlockKey = (role = null) => {
  return role ? `zeebac_${role}_last_unlocked_at` : 'zeebac_app_last_unlocked_at';
};

const isWithinUnlockGracePeriod = (role = null) => {
  try {
    const key = getUnlockKey(role);
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw && !role) {
      const fallback = localStorage.getItem('zeebac_app_last_unlocked_at') || sessionStorage.getItem('zeebac_app_last_unlocked_at');
      if (!fallback) return false;
      const ts = parseInt(fallback, 10);
      return !isNaN(ts) && (Date.now() - ts) < UNLOCK_GRACE_PERIOD_MS;
    }
    if (!raw) return false;
    const timestamp = parseInt(raw, 10);
    if (isNaN(timestamp)) return false;
    return (Date.now() - timestamp) < UNLOCK_GRACE_PERIOD_MS;
  } catch {
    return false;
  }
};

const markUnlockedThisSession = (role = null) => {
  try {
    const now = String(Date.now());
    const key = getUnlockKey(role);
    localStorage.setItem(key, now);
    sessionStorage.setItem(key, now);
    localStorage.setItem('zeebac_app_last_unlocked_at', now);
    sessionStorage.setItem('zeebac_app_last_unlocked_at', now);
  } catch { /* ignore */ }
};

const clearUnlockedThisSession = (role = null) => {
  try {
    if (!role || role === 'all') {
      localStorage.removeItem('zeebac_app_last_unlocked_at');
      localStorage.removeItem('zeebac_customer_last_unlocked_at');
      localStorage.removeItem('zeebac_vendor_last_unlocked_at');
      sessionStorage.removeItem('zeebac_app_last_unlocked_at');
      sessionStorage.removeItem('zeebac_customer_last_unlocked_at');
      sessionStorage.removeItem('zeebac_vendor_last_unlocked_at');
    } else {
      const key = getUnlockKey(role);
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      localStorage.removeItem('zeebac_app_last_unlocked_at');
      sessionStorage.removeItem('zeebac_app_last_unlocked_at');
    }
  } catch { /* ignore */ }
};

const readStoredUser = (role) => {
  try {
    const keys = ROLE_STORAGE[role];
    if (!keys) return null;
    const raw = localStorage.getItem(keys.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const useAuthStore = create((set, get) => ({
  // ── Active View State ──
  currentUser: null,        // Currently active user for the active screen
  accessToken: null,        // Currently active token
  isAuthenticated: false,   // True if active user has valid credentials
  walletBalance: 0,
  isAppLocked: false,

  // ── Role-Specific Sessions (Simultaneous multi-login support) ──
  customerUser: null,
  customerToken: null,
  vendorUser: null,
  vendorToken: null,
  adminUser: null,
  adminToken: null,

  // ── Actions ──

  // Hydrate all sessions on startup and choose the active role based on current URL path
  hydrate: (preferredRole = null) => {
    try {
      // 1. Backwards-compatibility: migrate old flat keys if present
      const legacyUserStr = localStorage.getItem('zeebac_current_user');
      const legacyToken = localStorage.getItem('zeebac_access_token');
      const legacyRefresh = localStorage.getItem('zeebac_refresh_token');

      if (legacyUserStr && legacyToken) {
        try {
          const parsed = JSON.parse(legacyUserStr);
          const legacyRole = (parsed.role === 'admin' || parsed.role === 'super_admin')
            ? 'admin'
            : (parsed.role === 'vendor' || parsed.storeName ? 'vendor' : 'customer');
          const targetKeys = ROLE_STORAGE[legacyRole];
          if (targetKeys && !localStorage.getItem(targetKeys.user)) {
            localStorage.setItem(targetKeys.user, legacyUserStr);
            localStorage.setItem(targetKeys.token, legacyToken);
            if (legacyRefresh) localStorage.setItem(targetKeys.refresh, legacyRefresh);
          }
        } catch (_) {}
      }

      // 2. Read role-specific sessions
      const cUser = readStoredUser('customer');
      const cToken = localStorage.getItem(ROLE_STORAGE.customer.token);
      const vUser = readStoredUser('vendor');
      const vToken = localStorage.getItem(ROLE_STORAGE.vendor.token);
      const aUser = readStoredUser('admin');
      const aToken = localStorage.getItem(ROLE_STORAGE.admin.token);

      // 3. Determine active role based on URL or parameter
      let activeRole = preferredRole;
      if (!activeRole && typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path.startsWith('/vendor') || path.startsWith('/vendor-app')) {
          activeRole = 'vendor';
        } else if (path.startsWith('/admin')) {
          activeRole = 'admin';
        } else {
          activeRole = 'customer';
        }
      }
      if (!activeRole) activeRole = 'customer';

      // Pick active user and token based on selected role, or fallback gracefully
      let activeUser = null;
      let activeToken = null;

      if (activeRole === 'vendor' && vUser && vToken) {
        activeUser = vUser;
        activeToken = vToken;
      } else if (activeRole === 'admin' && aUser && aToken) {
        activeUser = aUser;
        activeToken = aToken;
      } else if (activeRole === 'customer' && cUser && cToken) {
        activeUser = cUser;
        activeToken = cToken;
      } else if (cUser && cToken) {
        activeUser = cUser;
        activeToken = cToken;
      } else if (vUser && vToken) {
        activeUser = vUser;
        activeToken = vToken;
      } else if (aUser && aToken) {
        activeUser = aUser;
        activeToken = aToken;
      }

      // Restore wallet balance
      let balance = 0;
      if (activeUser) {
        const activeRoleName = activeUser.role === 'vendor' ? 'vendor' : 'customer';
        const balanceKey = ROLE_STORAGE[activeRoleName]?.balance;
        if (balanceKey) {
          const stored = localStorage.getItem(balanceKey);
          if (stored !== null && !isNaN(parseFloat(stored))) {
            balance = parseFloat(stored);
          }
        }
      }

      // Sync active credentials to legacy keys so third-party utils continue to work
      if (activeUser && activeToken) {
        localStorage.setItem('zeebac_current_user', JSON.stringify(activeUser));
        localStorage.setItem('zeebac_access_token', activeToken);
      }

      set({
        currentUser: activeUser,
        accessToken: activeToken,
        isAuthenticated: Boolean(activeUser && activeToken),
        walletBalance: balance,
        customerUser: cUser,
        customerToken: cToken,
        vendorUser: vUser,
        vendorToken: vToken,
        adminUser: aUser,
        adminToken: aToken,
        isAppLocked: hasSecurityEnabled(activeUser) && !isWithinUnlockGracePeriod(activeRole),
      });

      if (activeUser) {
        get().fetchWalletBalance();
      }
    } catch (e) {
      console.error('Failed to hydrate auth store:', e);
    }
  },

  // Log in a user (saves role-specific tokens so other role sessions are NEVER wiped out)
  login: (userData, accessToken, refreshToken, explicitRole = null) => {
    const rawRole = explicitRole || userData.role || userData.userType || (userData.storeName || userData.ownerName ? 'vendor' : 'customer');
    const role = (rawRole === 'admin' || rawRole === 'super_admin') ? 'admin' : rawRole === 'vendor' ? 'vendor' : 'customer';

    const keys = ROLE_STORAGE[role];
    if (keys) {
      localStorage.setItem(keys.user, JSON.stringify(userData));
      localStorage.setItem(keys.token, accessToken);
      if (refreshToken) localStorage.setItem(keys.refresh, refreshToken);
    }

    // Mirror to active legacy keys
    localStorage.setItem('zeebac_current_user', JSON.stringify(userData));
    localStorage.setItem('zeebac_access_token', accessToken);
    if (refreshToken) localStorage.setItem('zeebac_refresh_token', refreshToken);

    let balance = 0;
    if (keys?.balance) {
      const stored = localStorage.getItem(keys.balance);
      if (stored !== null && !isNaN(parseFloat(stored))) {
        balance = parseFloat(stored);
      }
    }

    markUnlockedThisSession();

    set((state) => ({
      currentUser: userData,
      accessToken: accessToken,
      isAuthenticated: true,
      walletBalance: balance,
      isAppLocked: false,
      ...(role === 'vendor' ? { vendorUser: userData, vendorToken: accessToken } : {}),
      ...(role === 'customer' ? { customerUser: userData, customerToken: accessToken } : {}),
      ...(role === 'admin' ? { adminUser: userData, adminToken: accessToken } : {}),
    }));

    get().fetchWalletBalance();
  },

  // Dynamically sync active role when navigating between routes without logging out anything
  syncRoleForRoute: (pathname) => {
    if (!pathname) return;
    let desiredRole = 'customer';
    if (pathname.startsWith('/vendor') || pathname.startsWith('/vendor-app')) {
      desiredRole = 'vendor';
    } else if (pathname.startsWith('/admin')) {
      desiredRole = 'admin';
    }

    const currentRole = get().currentUser?.role;
    const isCurrentAdmin = currentRole === 'admin' || currentRole === 'super_admin';
    const activeIsDesired = (desiredRole === 'admin' && isCurrentAdmin) || (desiredRole === currentRole);

    if (activeIsDesired && get().currentUser) {
      return;
    }

    const keys = ROLE_STORAGE[desiredRole];
    if (keys) {
      try {
        const userStr = localStorage.getItem(keys.user);
        const token = localStorage.getItem(keys.token);
        if (userStr && token) {
          const user = JSON.parse(userStr);
          let balance = 0;
          if (keys.balance) {
            const stored = localStorage.getItem(keys.balance);
            if (stored !== null && !isNaN(parseFloat(stored))) balance = parseFloat(stored);
          }
          localStorage.setItem('zeebac_current_user', userStr);
          localStorage.setItem('zeebac_access_token', token);
          set({
            currentUser: user,
            accessToken: token,
            isAuthenticated: true,
            walletBalance: balance,
            isAppLocked: hasSecurityEnabled(user) && !isWithinUnlockGracePeriod(desiredRole),
            ...(desiredRole === 'vendor' ? { vendorUser: user, vendorToken: token } : {}),
            ...(desiredRole === 'customer' ? { customerUser: user, customerToken: token } : {}),
            ...(desiredRole === 'admin' ? { adminUser: user, adminToken: token } : {}),
          });
          get().fetchWalletBalance();
        }
      } catch (_) {}
    }
  },

  lockApp: (force = false, role = null) => {
    const targetRole = role || (get().currentUser?.role === 'vendor' ? 'vendor' : 'customer');
    if (!hasSecurityEnabled(get().currentUser)) return;
    if (!force && isWithinUnlockGracePeriod(targetRole)) {
      return;
    }
    clearUnlockedThisSession(targetRole);
    set({ isAppLocked: true });
  },

  unlockApp: (role = null) => {
    const targetRole = role || (get().currentUser?.role === 'vendor' ? 'vendor' : 'customer');
    markUnlockedThisSession(targetRole);
    set({ isAppLocked: false });
  },

  setAccessToken: (token, role = null) => {
    const targetRole = role || (get().currentUser?.role === 'vendor' ? 'vendor' : get().currentUser?.role?.includes('admin') ? 'admin' : 'customer');
    const keys = ROLE_STORAGE[targetRole];
    if (keys) {
      localStorage.setItem(keys.token, token);
    }
    localStorage.setItem('zeebac_access_token', token);
    set((state) => ({
      accessToken: token,
      ...(targetRole === 'vendor' ? { vendorToken: token } : {}),
      ...(targetRole === 'customer' ? { customerToken: token } : {}),
      ...(targetRole === 'admin' ? { adminToken: token } : {}),
    }));
  },

  // Role-specific logout: logging out Vendor preserves Customer session & vice versa!
  logout: (roleToLogout = null) => {
    clearUnlockedThisSession();

    // Default target role to active user's role or path
    let targetRole = roleToLogout;
    if (!targetRole) {
      const activeRole = get().currentUser?.role;
      if (activeRole === 'admin' || activeRole === 'super_admin') targetRole = 'admin';
      else if (activeRole === 'vendor') targetRole = 'vendor';
      else if (typeof window !== 'undefined' && window.location.pathname.startsWith('/vendor')) targetRole = 'vendor';
      else if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) targetRole = 'admin';
      else targetRole = 'customer';
    }

    if (targetRole === 'all') {
      // Clear every session
      Object.values(ROLE_STORAGE).forEach((keys) => {
        localStorage.removeItem(keys.user);
        localStorage.removeItem(keys.token);
        localStorage.removeItem(keys.refresh);
        if (keys.balance) localStorage.removeItem(keys.balance);
      });
      localStorage.removeItem('zeebac_current_user');
      localStorage.removeItem('zeebac_access_token');
      localStorage.removeItem('zeebac_refresh_token');
      localStorage.removeItem('vendor_transactions');
      localStorage.removeItem('zeebac_transactions');
      localStorage.removeItem('user_profile');
      localStorage.removeItem('cashback_requests');

      set({
        currentUser: null,
        accessToken: null,
        isAuthenticated: false,
        walletBalance: 0,
        customerUser: null,
        customerToken: null,
        vendorUser: null,
        vendorToken: null,
        adminUser: null,
        adminToken: null,
        isAppLocked: false,
      });
      return;
    }

    // Clear ONLY the requested role
    const keys = ROLE_STORAGE[targetRole];
    let tokenToRevoke = null;
    if (keys) {
      tokenToRevoke = localStorage.getItem(keys.token);
      localStorage.removeItem(keys.user);
      localStorage.removeItem(keys.token);
      localStorage.removeItem(keys.refresh);
      if (keys.balance) localStorage.removeItem(keys.balance);
      if (targetRole === 'vendor') localStorage.removeItem('vendor_transactions');
      if (targetRole === 'customer') {
        localStorage.removeItem('zeebac_transactions');
        localStorage.removeItem('user_profile');
        localStorage.removeItem('cashback_requests');
      }
    }

    // Keep other role intact!
    const nextVendorUser = targetRole === 'vendor' ? null : (get().vendorUser || readStoredUser('vendor'));
    const nextVendorToken = targetRole === 'vendor' ? null : (get().vendorToken || localStorage.getItem(ROLE_STORAGE.vendor.token));
    const nextCustomerUser = targetRole === 'customer' ? null : (get().customerUser || readStoredUser('customer'));
    const nextCustomerToken = targetRole === 'customer' ? null : (get().customerToken || localStorage.getItem(ROLE_STORAGE.customer.token));
    const nextAdminUser = targetRole === 'admin' ? null : (get().adminUser || readStoredUser('admin'));
    const nextAdminToken = targetRole === 'admin' ? null : (get().adminToken || localStorage.getItem(ROLE_STORAGE.admin.token));

    // Fallback active session if current active was logged out
    let nextActiveUser = null;
    let nextActiveToken = null;

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/vendor') && nextVendorUser) {
      nextActiveUser = nextVendorUser;
      nextActiveToken = nextVendorToken;
    } else if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') && nextAdminUser) {
      nextActiveUser = nextAdminUser;
      nextActiveToken = nextAdminToken;
    } else if (nextCustomerUser) {
      nextActiveUser = nextCustomerUser;
      nextActiveToken = nextCustomerToken;
    } else if (nextVendorUser) {
      nextActiveUser = nextVendorUser;
      nextActiveToken = nextVendorToken;
    } else if (nextAdminUser) {
      nextActiveUser = nextAdminUser;
      nextActiveToken = nextAdminToken;
    }

    if (nextActiveUser && nextActiveToken) {
      localStorage.setItem('zeebac_current_user', JSON.stringify(nextActiveUser));
      localStorage.setItem('zeebac_access_token', nextActiveToken);
    } else {
      localStorage.removeItem('zeebac_current_user');
      localStorage.removeItem('zeebac_access_token');
      localStorage.removeItem('zeebac_refresh_token');
    }

    set({
      currentUser: nextActiveUser,
      accessToken: nextActiveToken,
      isAuthenticated: Boolean(nextActiveUser && nextActiveToken),
      customerUser: nextCustomerUser,
      customerToken: nextCustomerToken,
      vendorUser: nextVendorUser,
      vendorToken: nextVendorToken,
      adminUser: nextAdminUser,
      adminToken: nextAdminToken,
      walletBalance: 0,
      isAppLocked: false,
    });

    if (tokenToRevoke) {
      import('../services/api.js')
        .then(({ apiClient }) => apiClient.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${tokenToRevoke}` } }).catch(() => {}))
        .catch(() => {});
    }
  },

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
    } catch (_) {}
    return get().walletBalance;
  },

  updateProfile: (updates) => {
    const current = get().currentUser;
    if (!current) return;
    const updated = { ...current, ...updates };
    const role = updated.role === 'vendor' ? 'vendor' : updated.role?.includes('admin') ? 'admin' : 'customer';
    const keys = ROLE_STORAGE[role];
    if (keys) {
      localStorage.setItem(keys.user, JSON.stringify(updated));
    }
    localStorage.setItem('zeebac_current_user', JSON.stringify(updated));
    set((state) => ({
      currentUser: updated,
      ...(role === 'vendor' ? { vendorUser: updated } : {}),
      ...(role === 'customer' ? { customerUser: updated } : {}),
      ...(role === 'admin' ? { adminUser: updated } : {}),
    }));
  },
}));

// Hydrate on initial script load
useAuthStore.getState().hydrate();

export default useAuthStore;
