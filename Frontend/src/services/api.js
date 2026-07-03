// ─── API Service Layer ──────────────────────────────────────────────────────
// Centralized mock API functions. 
// When the Node.js/MongoDB backend is ready, replace the mock returns
// with real axios/fetch calls. No component code needs to change.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import useAuthStore from '../store/useAuthStore.js';

// ─── Axios Instance & Interceptors ──────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: 'http://localhost:5000/api',
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('zeebac_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post('http://localhost:5000/api/auth/refresh', { refreshToken });
        useAuthStore.getState().setAccessToken(data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch (err) {
        useAuthStore.getState().logout();
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);

// Simulates network delay (remove when connecting to real backend)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Auth Service (REAL BACKEND INTEGRATION) ──
export const AuthAPI = {
  sendOtp: async (data) => {
    const res = await apiClient.post('/auth/send-otp', data);
    return res.data;
  },
  customerLogin: async (data) => {
    const res = await apiClient.post('/auth/customer/login', data);
    return res.data; // { success, accessToken, refreshToken, user }
  },
  vendorLogin: async (data) => {
    const res = await apiClient.post('/auth/vendor/login', data);
    return res.data;
  },
  adminLogin: async (data) => {
    const res = await apiClient.post('/auth/admin/login', data);
    return res.data;
  },
  customerSignup: async (formData) => {
    // formData must be FormData object if sending files (profilePic)
    const res = await apiClient.post('/auth/customer/signup', formData);
    return res.data;
  },
  vendorSignup: async (formData) => {
    // formData for multi-part document uploads
    const res = await apiClient.post('/auth/vendor/signup', formData);
    return res.data;
  },
  logout: async () => {
    await apiClient.post('/auth/logout');
    useAuthStore.getState().logout();
  },
  getMe: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  }
};

// ── Wallet Service ──
export const walletService = {
  // Mock get balance — will become: axios.get('/api/wallet/balance')
  getBalance: async (role) => {
    await delay(100);
    if (role === 'vendor') {
      return parseFloat(localStorage.getItem('vendor_balance') || '24500');
    }
    return parseFloat(localStorage.getItem('zeebac_wallet_balance') || '1284.50');
  },

  // Mock get transactions — will become: axios.get('/api/wallet/transactions')
  getTransactions: async (role) => {
    await delay(100);
    if (role === 'vendor') {
      return JSON.parse(localStorage.getItem('vendor_transactions') || '[]');
    }
    return JSON.parse(localStorage.getItem('zeebac_transactions') || '[]');
  },
};

// ── Transaction Service ──
export const transactionService = {
  // Mock log purchase — will become: axios.post('/api/transactions', data)
  logPurchase: async (transactionData) => {
    await delay(300);
    const key = transactionData.role === 'vendor' ? 'vendor_transactions' : 'zeebac_transactions';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const newTx = {
      id: `TX-${Date.now().toString(36).toUpperCase()}`,
      ...transactionData,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify([newTx, ...existing]));
    return newTx;
  },
};

// ── Admin Service ──
export const AdminAPI = {
  getDashboardStats: async () => {
    const res = await apiClient.get('/admin/dashboard/stats');
    return res.data;
  },
  getVendors: async (status = '', page = 1) => {
    const res = await apiClient.get(`/admin/vendors?status=${status}&page=${page}`);
    return res.data;
  },
  getVendorById: async (id) => {
    const res = await apiClient.get(`/admin/vendors/${id}`);
    return res.data;
  },
  approveVendor: async (id, cashbackRate) => {
    const res = await apiClient.patch(`/admin/vendors/${id}/approve`, { cashbackRate });
    return res.data;
  },
  rejectVendor: async (id, reason) => {
    const res = await apiClient.patch(`/admin/vendors/${id}/reject`, { reason });
    return res.data;
  },
  getUsers: async (page = 1, search = '') => {
    const res = await apiClient.get(`/admin/users?page=${page}&search=${search}`);
    return res.data;
  },
  suspendUser: async (id) => {
    const res = await apiClient.patch(`/admin/users/${id}/suspend`);
    return res.data;
  },
  unsuspendUser: async (id) => {
    const res = await apiClient.patch(`/admin/users/${id}/unsuspend`);
    return res.data;
  },
};

// ── Vendor Service ──
export const VendorAPI = {
  getProfile: async () => {
    const res = await apiClient.get('/vendor/me');
    return res.data;
  },
  updateProfile: async (data) => {
    const res = await apiClient.put('/vendor/me', data);
    return res.data;
  },
  getDashboardStats: async () => {
    const res = await apiClient.get('/vendor/dashboard/stats');
    return res.data;
  }
};
