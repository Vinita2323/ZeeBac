// ─── API Service Layer ──────────────────────────────────────────────────────
// Production API Client configured with Axios, JWT Interceptors & Token Refresh
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import useAuthStore from '../store/useAuthStore.js';

const rawApiUrl = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? `${window.location.protocol}//${window.location.host}/api` : 'http://localhost:5000/api');
export const SERVER_URL = rawApiUrl.replace(/\/api\/?$/, '');
export const API_BASE_URL = `${SERVER_URL}/api`;

// Safely resolves media URLs from Cloudinary, external HTTPS, data URIs, or server uploads
export const getMediaUrl = (url) => {
  if (!url) return '';
  if (typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${SERVER_URL}${cleanPath}`;
};

// ─── Axios Instance & Interceptors ──────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken || localStorage.getItem('zeebac_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 413) {
      if (typeof error.response.data !== 'object' || !error.response.data?.message) {
        error.response.data = {
          message: 'The uploaded file or total request size is too large (exceeds server limit). Please select smaller files (under 5MB each).'
        };
      }
    }
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('zeebac_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
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
    const res = await apiClient.post('/auth/vendor-app/login', data);
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
  // Vendor onboarding — Step 1 (account creation). Issues tokens immediately
  // so Steps 2-4 can be saved via VendorApplicationAPI as an authenticated vendor.
  vendorRegister: async (data) => {
    const res = await apiClient.post('/auth/vendor/register', data);
    return res.data;
  },
  getVendorCategories: async () => {
    const res = await apiClient.get('/auth/vendor/categories');
    return res.data;
  },
  getCashbackRules: async () => {
    const res = await apiClient.get('/auth/vendor/cashback-rules');
    return res.data;
  },
  logout: async () => {
    try {
      await apiClient.post('/auth/logout').catch(() => {});
    } finally {
      useAuthStore.getState().logout();
    }
  },
  getMe: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  }
};

// ── Admin Service ──
export const AdminAPI = {
  saveAdminFcmToken: async (token) => {
    const res = await apiClient.post('/admin/fcm-token', { token });
    return res.data;
  },
  getDashboardStats: async () => {
    const res = await apiClient.get('/admin/dashboard/stats');
    return res.data;
  },
  getVendors: async (applicationStatus = '', page = 1, search = '') => {
    const res = await apiClient.get(`/admin/vendors?applicationStatus=${applicationStatus}&page=${page}&search=${encodeURIComponent(search)}`);
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
  rejectVendor: async (id, reasonCategory, comment = '') => {
    const res = await apiClient.patch(`/admin/vendors/${id}/reject`, { reasonCategory, comment });
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
  // Payouts & Withdrawals
  getPendingPayouts: async () => {
    const res = await apiClient.get('/admin/payouts/pending');
    return res.data;
  },
  refundTransaction: async (txnId, reason = '') => {
    const res = await apiClient.post(`/admin/transactions/${txnId}/refund`, { reason });
    return res.data;
  },
  processPayout: async (id, data) => {
    const res = await apiClient.post(`/admin/payouts/${id}/process`, data);
    return res.data;
  },
  // Phase 8
  getReferralStats: async () => {
    const res = await apiClient.get('/admin/referrals/stats');
    return res.data;
  },
  // Phase A: Cashback Rules
  getCashbackRules: async () => {
    const res = await apiClient.get('/admin/cashback-rules');
    return res.data;
  },
  createCashbackRule: async (data) => {
    const res = await apiClient.post('/admin/cashback-rules', data);
    return res.data;
  },
  updateCashbackRule: async (id, data) => {
    const res = await apiClient.put(`/admin/cashback-rules/${id}`, data);
    return res.data;
  },
  deleteCashbackRule: async (id) => {
    const res = await apiClient.delete(`/admin/cashback-rules/${id}`);
    return res.data;
  },
  // Phase B: Transactions
  getAllTransactions: async (page = 1, status = '', search = '', sortBy = 'newest') => {
    const res = await apiClient.get(
      `/admin/transactions?page=${page}&limit=20&status=${status}&search=${encodeURIComponent(search)}&sortBy=${sortBy}`
    );
    return res.data;
  },
  // Phase C: Analytics
  getRevenueAnalytics: async () => {
    const res = await apiClient.get('/admin/analytics/revenue');
    return res.data;
  },
  getUserAnalytics: async () => {
    const res = await apiClient.get('/admin/analytics/users');
    return res.data;
  },
  getTopVendors: async () => {
    const res = await apiClient.get('/admin/analytics/top-vendors');
    return res.data;
  },
  getVendorCategoryBreakdown: async () => {
    const res = await apiClient.get('/admin/analytics/categories');
    return res.data;
  },
  // Phase E: Wallet Monitor
  getWalletStats: async () => {
    const res = await apiClient.get('/admin/wallet/stats');
    return res.data;
  },
  getAllWalletTransactions: async (page = 1, type = 'All', search = '', sortBy = 'newest') => {
    const res = await apiClient.get(
      `/admin/wallet/transactions?page=${page}&limit=20&type=${type}&search=${encodeURIComponent(search)}&sortBy=${sortBy}`
    );
    return res.data;
  },
  // Phase F: Fraud Detection
  getFraudAlerts: async () => {
    const res = await apiClient.get('/admin/fraud/alerts');
    return res.data;
  },
  // Phase G: Support Tickets
  getAllTickets: async (status = 'All', userType = 'All', search = '') => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (userType) params.append('userType', userType);
    if (search) params.append('search', search);
    const res = await apiClient.get(`/admin/support/tickets?${params.toString()}`);
    return res.data;
  },
  replyToTicket: async (id, replyMessage, status = 'Resolved') => {
    const res = await apiClient.put(`/admin/support/tickets/${id}/reply`, { replyMessage, status });
    return res.data;
  },
  closeTicket: async (id) => {
    const res = await apiClient.put(`/admin/support/tickets/${id}/close`);
    return res.data;
  },
  // FAQ Management
  getFaqs: async (target = 'all', category = 'All', status = 'all', search = '') => {
    const params = new URLSearchParams();
    if (target && target !== 'all') params.append('target', target);
    if (category && category !== 'All') params.append('category', category);
    if (status && status !== 'all') params.append('status', status);
    if (search) params.append('search', search);
    const res = await apiClient.get(`/admin/faqs?${params.toString()}`);
    return res.data;
  },
  createFaq: async (faqData) => {
    const res = await apiClient.post('/admin/faqs', faqData);
    return res.data;
  },
  updateFaq: async (id, faqData) => {
    const res = await apiClient.put(`/admin/faqs/${id}`, faqData);
    return res.data;
  },
  deleteFaq: async (id) => {
    const res = await apiClient.delete(`/admin/faqs/${id}`);
    return res.data;
  },
  toggleFaq: async (id) => {
    const res = await apiClient.patch(`/admin/faqs/${id}/toggle`);
    return res.data;
  },
  // Phase H: Peak Activity Heatmap
  // Phase H: Peak Activity Heatmap
  getPeakActivityHours: async () => {
    const res = await apiClient.get('/admin/analytics/peak-hours');
    return res.data;
  },
  // Rewards & Offers
  getRewardConfig: async () => {
    const res = await apiClient.get('/admin/rewards/config');
    return res.data;
  },
  updateRewardConfig: async (data) => {
    const res = await apiClient.put('/admin/rewards/config', data);
    return res.data;
  },
  getPartnerOffers: async () => {
    const res = await apiClient.get('/admin/rewards/offers');
    return res.data;
  },
  createPartnerOffer: async (data) => {
    const res = await apiClient.post('/admin/rewards/offers', data);
    return res.data;
  },
  updatePartnerOffer: async (id, data) => {
    const res = await apiClient.put(`/admin/rewards/offers/${id}`, data);
    return res.data;
  },
  deletePartnerOffer: async (id) => {
    const res = await apiClient.delete(`/admin/rewards/offers/${id}`);
    return res.data;
  },
  // Subscriptions (Admin)
  getSubscriptionPlans: async () => {
    const res = await apiClient.get('/admin/subscription-plans');
    return res.data;
  },
  createSubscriptionPlan: async (data) => {
    const res = await apiClient.post('/admin/subscription-plans', data);
    return res.data;
  },
  updateSubscriptionPlan: async (id, data) => {
    const res = await apiClient.put(`/admin/subscription-plans/${id}`, data);
    return res.data;
  },
  deleteSubscriptionPlan: async (id) => {
    const res = await apiClient.delete(`/admin/subscription-plans/${id}`);
    return res.data;
  },
  activateVendorSubscription: async (vendorId, data = {}) => {
    const res = await apiClient.post(`/admin/vendors/${vendorId}/activate-subscription`, data);
    return res.data;
  },
  getSubscriptionPayments: async (page = 1, paymentStatus = '', paymentMethod = '') => {
    let url = `/admin/subscription-payments?page=${page}`;
    if (paymentStatus) url += `&paymentStatus=${paymentStatus}`;
    if (paymentMethod) url += `&paymentMethod=${paymentMethod}`;
    const res = await apiClient.get(url);
    return res.data;
  },
};

// ── Vendor Service ──
export const VendorAPI = {
  getProfile: async () => {
    const res = await apiClient.get('/vendor/me');
    return res.data;
  },
  // Signed, short-lived QR payload — render locally (e.g. via the `qrcode`
  // package), never send it to a third-party QR-image service.
  getQrToken: async () => {
    const res = await apiClient.get('/vendor/qr-token');
    return res.data;
  },
  updateProfile: async (data) => {
    const res = await apiClient.put('/vendor/me', data);
    return res.data;
  },
  // Onboarding application (Steps 2-4 + resubmission) — formData is a FormData
  // instance, may contain plain fields, JSON-stringified nested objects
  // (address, businessHours), and files.
  saveApplicationDraft: async (formData) => {
    const res = await apiClient.patch('/vendor/application/draft', formData);
    return res.data;
  },
  submitApplication: async (formData) => {
    const res = await apiClient.post('/vendor/application/submit', formData);
    return res.data;
  },
  resubmitApplication: async (formData) => {
    const res = await apiClient.post('/vendor/application/resubmit', formData);
    return res.data;
  },
  getDashboardStats: async () => {
    const res = await apiClient.get('/vendor/dashboard/stats');
    return res.data;
  },
  // Phase 3B: Products
  getProducts: async () => {
    const res = await apiClient.get('/vendor/products');
    return res.data;
  },
  createProduct: async (formData) => {
    // using formData, so don't pass standard json. Axios interceptor usually handles this.
    // wait, we need to let axios set the multipart/form-data boundary, so we don't set Content-Type manually.
    const res = await apiClient.post('/vendor/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  updateProduct: async (id, data) => {
    // If it's a FormData object (when updating image), use multipart, else json
    const isFormData = data instanceof FormData;
    const res = await apiClient.put(`/vendor/products/${id}`, data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
    return res.data;
  },
  deleteProduct: async (id) => {
    const res = await apiClient.delete(`/vendor/products/${id}`);
    return res.data;
  },
  // Storefront Media
  getMedia: async () => {
    const res = await apiClient.get('/vendor/media');
    return res.data;
  },
  uploadMedia: async (data) => {
    const res = await apiClient.post('/vendor/media', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  deleteMedia: async (id) => {
    const res = await apiClient.delete(`/vendor/media/${id}`);
    return res.data;
  },
  // Promotions
  getPromotions: async () => {
    const res = await apiClient.get('/vendor/promotions');
    return res.data;
  },
  createPromotion: async (data) => {
    const res = await apiClient.post('/vendor/promotions', data);
    return res.data;
  },
  togglePromotion: async (id) => {
    const res = await apiClient.put(`/vendor/promotions/${id}`);
    return res.data;
  },
  deletePromotion: async (id) => {
    const res = await apiClient.delete(`/vendor/promotions/${id}`);
    return res.data;
  },
  // Phase 3C: Transaction & Wallet
  lookupCustomerByPhone: async (phone) => {
    console.log(`[Frontend API] Calling /vendor/customers/${phone}`);
    try {
      const res = await apiClient.get(`/vendor/customers/${phone}`);
      console.log(`[Frontend API] Success response:`, res.data);
      return res.data;
    } catch (err) {
      console.error(`[Frontend API] Error:`, err.response?.data || err.message);
      throw err;
    }
  },
  logPurchase: async (data) => {
    const res = await apiClient.post('/vendor/transactions/log', data);
    return res.data;
  },
  getTransactions: async () => {
    const res = await apiClient.get('/vendor/transactions');
    return res.data;
  },
  getWallet: async () => {
    const res = await apiClient.get('/vendor/wallet');
    return res.data;
  },
  getPendingRequests: async () => {
    const res = await apiClient.get('/vendor/requests/pending');
    return res.data;
  },
  respondToRequest: async (requestId, action) => {
    const res = await apiClient.post(`/vendor/requests/${requestId}/respond`, { action });
    return res.data;
  },
  holdRequest: async (requestId, reason) => {
    const res = await apiClient.post(`/vendor/requests/${requestId}/hold`, { reason });
    return res.data;
  },
  unholdRequest: async (requestId) => {
    const res = await apiClient.post(`/vendor/requests/${requestId}/unhold`);
    return res.data;
  },
  generatePosBill: async (data) => {
    const res = await apiClient.post('/pos/create-bill', data);
    return res.data;
  },
  createRazorpayOrder: async (amount) => {
    const res = await apiClient.post('/vendor/wallet/create-order', { amount });
    return res.data;
  },
  verifyRazorpayPayment: async (paymentData) => {
    const res = await apiClient.post('/vendor/wallet/verify-payment', paymentData);
    return res.data;
  },
  // Phase 3D: Final Dashboard & Withdrawals
  getDashboardStats: async () => {
    const res = await apiClient.get('/vendor/dashboard/stats');
    return res.data;
  },
  getVendorCustomers: async () => {
    const res = await apiClient.get('/vendor/customers/list');
    return res.data;
  },
  requestWithdrawal: async (amount) => { const res = await apiClient.post('/vendor/wallet/withdraw', { amount }); return res.data; },

  // Reviews
  getMyReviews: async () => { const res = await apiClient.get('/vendor/reviews'); return res.data; },
  replyToReview: async (reviewId, text) => { const res = await apiClient.post(`/vendor/reviews/${reviewId}/reply`, { text }); return res.data; },

  // Support
  createSupportTicket: async (subject, message) => {
    const res = await apiClient.post('/vendor/support', { subject, message });
    return res.data;
  },
  getMySupportTickets: async () => {
    const res = await apiClient.get('/vendor/support');
    return res.data;
  },
  // Subscriptions (Vendor)
  getSubscriptionPlans: async () => {
    const res = await apiClient.get('/vendor/subscription/plans');
    return res.data;
  },
  getSubscriptionStatus: async () => {
    const res = await apiClient.get('/vendor/subscription/status');
    return res.data;
  },
  createSubscriptionRazorpayOrder: async (data) => {
    const res = await apiClient.post('/vendor/subscription/create-order', data);
    return res.data;
  },
  verifySubscriptionRazorpayPayment: async (data) => {
    const res = await apiClient.post('/vendor/subscription/verify-payment', data);
    return res.data;
  },
  cancelSubscriptionRazorpayOrder: async (data) => {
    const res = await apiClient.post('/vendor/subscription/cancel-order', data);
    return res.data;
  },
  paySubscriptionFromWallet: async (data) => {
    const res = await apiClient.post('/vendor/subscription/pay-from-wallet', data);
    return res.data;
  },
  subscribePlan: async (planType) => {
    const res = await apiClient.post('/vendor/subscription/subscribe', { planType });
    return res.data;
  },
  // Bank Account Management with OTP Verification
  getBankAccount: async () => {
    const res = await apiClient.get('/vendor/bank-account');
    return res.data;
  },
  sendBankOtp: async () => {
    const res = await apiClient.post('/vendor/bank-account/send-otp');
    return res.data;
  },
  verifyAndSaveBankAccount: async (bankData) => {
    const res = await apiClient.post('/vendor/bank-account/verify', bankData);
    return res.data;
  },
};

// ─── Customer API ───
export const UserAPI = {
  getProfile: async () => {
    const res = await apiClient.get('/user/me');
    return res.data;
  },
  // Signed, short-lived QR payload — render locally, never send it to a
  // third-party QR-image service.
  getQrToken: async () => {
    const res = await apiClient.get('/user/qr-token');
    return res.data;
  },
  updateProfile: async (data) => {
    const res = await apiClient.put('/user/me', data);
    return res.data;
  },
  updateLocation: async (data) => {
    const res = await apiClient.put('/user/location', data);
    return res.data;
  },
  sendBankOtp: async () => {
    const res = await apiClient.post('/user/bank-account/send-otp');
    return res.data;
  },
  updateLinkedAccount: async (data) => {
    const res = await apiClient.put('/user/me/linked-account', data);
    return res.data;
  },
  // Vendor Lookup
  lookupVendor: async (query) => {
    const res = await apiClient.get(`/user/vendors/${encodeURIComponent(query)}`);
    return res.data;
  },
  // Create Transaction (Customer pays vendor - Cash)
  createTransaction: async (data) => {
    const res = await apiClient.post('/user/transactions', data);
    return res.data;
  },
  // Razorpay Flow
  createRazorpayOrder: async (amount, vendorZeebacId) => {
    const res = await apiClient.post('/user/transactions/razorpay/order', { amount, vendorZeebacId });
    return res.data;
  },
  verifyRazorpayAndCreateTransaction: async (data) => {
    const res = await apiClient.post('/user/transactions/razorpay/verify', data);
    return res.data;
  },
  processWalletPayment: async (data) => {
    const res = await apiClient.post('/user/pay-via-wallet', data);
    return res.data;
  },
  // POS Flow: Claim printed bill QR (ZEEBAC-89214)
  claimPosBill: async (billCode) => {
    const res = await apiClient.post('/pos/claim', { billCode });
    return res.data;
  },
  // Cash claim OTP verification flow
  verifyCashbackRequestCode: async (requestId, code) => {
    const res = await apiClient.post(`/user/cashback-requests/${requestId}/verify-code`, { code });
    return res.data;
  },
  // UPI Flow: Claim cashback via 12-digit UPI Reference ID / UTR (e.g. GPay)
  claimUpiCashback: async (utr) => {
    const res = await apiClient.post('/user/transactions/claim-upi-utr', { utr });
    return res.data;
  },
  getNearbyVendors: async (lat, lng, radius = 10000) => {
    const res = await apiClient.get(`/user/vendors/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    return res.data;
  },
  getRecentVendors: async () => {
    const res = await apiClient.get('/user/recent-vendors');
    return res.data;
  },
  searchVendors: async (query, lat, lng) => {
    let url = `/user/vendors/search?q=${encodeURIComponent(query)}`;
    if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
    const res = await apiClient.get(url);
    return res.data;
  },
  getVendorMedia: async (vendorId) => {
    const res = await apiClient.get(`/user/vendors/${vendorId}/media`);
    return res.data;
  },
  getVendorPromotions: async (vendorId) => {
    const res = await apiClient.get(`/user/vendors/${vendorId}/promotions`);
    return res.data;
  },
  getCategories: async () => {
    const res = await apiClient.get('/user/vendors/categories');
    return res.data;
  },
  getVendorsByCategory: async (category, lat, lng) => {
    let url = `/user/vendors/category/${encodeURIComponent(category)}`;
    if (lat && lng) url += `?lat=${lat}&lng=${lng}`;
    const res = await apiClient.get(url);
    return res.data;
  },
  getVendorDetails: async (query) => {
    const res = await apiClient.get(`/user/vendors/${encodeURIComponent(query)}`);
    return res.data;
  },
  toggleFavorite: async (vendorId) => {
    const res = await apiClient.post(`/user/favorites/${vendorId}`);
    return res.data;
  },
  getFavorites: async () => {
    const res = await apiClient.get('/user/favorites');
    return res.data;
  },
  // Phase 4D: Wallet & Passbook
  getMyWallet: async () => {
    const res = await apiClient.get('/user/wallet');
    return res.data;
  },
  getMyTransactions: async () => {
    const res = await apiClient.get('/user/transactions');
    return res.data;
  },
  requestWithdrawal: async (amount) => {
    const res = await apiClient.post('/user/wallet/withdraw', { amount });
    return res.data;
  },
  getUserWithdrawals: async () => {
    const res = await apiClient.get('/user/wallet/withdrawals');
    return res.data;
  },
  // Mobile Recharge (Wallet Balance)
  getRechargePlans: async (operator = 'Jio', circle = 'Delhi NCR') => {
    const res = await apiClient.get(`/user/recharge/plans?operator=${encodeURIComponent(operator)}&circle=${encodeURIComponent(circle)}`);
    return res.data;
  },
  processMobileRecharge: async (data) => {
    const res = await apiClient.post('/user/recharge/process', data);
    return res.data;
  },
  getMyRecharges: async () => {
    const res = await apiClient.get('/user/recharge/history');
    return res.data;
  },
  // Security: PIN & Biometrics
  setupSecurityPin: async (pin, currentPin = null) => {
    const res = await apiClient.post('/user/security/setup-pin', { pin, currentPin });
    return res.data;
  },
  toggleBiometricSecurity: async (enabled, credentialId = null) => {
    const res = await apiClient.post('/user/security/toggle-biometric', { enabled, credentialId });
    return res.data;
  },
  verifySecurityPin: async (pin) => {
    const res = await apiClient.post('/user/security/verify-pin', { pin });
    return res.data;
  },
  // Phase 4E
  updateProfile: async (data) => {
    const res = await apiClient.put('/user/me', data);
    return res.data;
  },
  // `data` must be a FormData instance (a real bill photo is now mandatory
  // and goes through multer, not a base64 string in a JSON body).
  createCashbackRequest: async (data) => {
    const res = await apiClient.post('/user/cashback-requests', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
  getMyCashbackRequests: async () => {
    const res = await apiClient.get('/user/cashback-requests');
    return res.data;
  },
  // Phase H: Support
  createSupportTicket: async (subject, message) => {
    const res = await apiClient.post('/support', { subject, message });
    return res.data;
  },
  getMySupportTickets: async () => {
    const res = await apiClient.get('/support');
    return res.data;
  },
  getCashbackRequestById: async (id) => {
    const res = await apiClient.get(`/user/cashback-requests/${id}`);
    return res.data;
  },
  getVendorProducts: async (vendorId) => {
    const res = await apiClient.get(`/user/vendors/${vendorId}/products`);
    return res.data;
  },
  // Reviews
  getVendorReviews: async (vendorId) => {
    const res = await apiClient.get(`/user/vendors/${vendorId}/reviews`);
    return res.data;
  },
  createReview: async (vendorId, data) => {
    const res = await apiClient.post(`/user/vendors/${vendorId}/reviews`, data);
    return res.data;
  },
  deleteReview: async (vendorId) => {
    const res = await apiClient.delete(`/user/vendors/${vendorId}/reviews`);
    return res.data;
  },
  // Referrals
  getMyReferrals: async () => {
    const res = await apiClient.get('/user/referrals');
    return res.data;
  },
  // Rewards & Offers
  getRewardsData: async () => {
    const res = await apiClient.get('/user/rewards-data');
    return res.data;
  },
  claimScratchCard: async () => {
    const res = await apiClient.post('/user/rewards/scratch');
    return res.data;
  }
};

export const ChatAPI = {
  getConversations: async () => {
    const res = await apiClient.get('/chat/conversations');
    return res.data;
  },
  getOrCreateConversation: async (data) => {
    // data: { vendorId } for customer, { customerId } for vendor
    const res = await apiClient.post('/chat/conversations', data);
    return res.data;
  },
  getMessages: async (conversationId, page = 1) => {
    const res = await apiClient.get(`/chat/conversations/${conversationId}/messages?page=${page}&limit=50`);
    return res.data;
  },
  uploadChatImage: async (file) => {
    const formData = new FormData();
    formData.append('chatImage', file);
    const res = await apiClient.post('/chat/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  }
};

// ── Notification API ──
export const NotificationAPI = {
  getAll: async (page = 1) => {
    const res = await apiClient.get(`/notifications?page=${page}`);
    return res.data;
  },
  getUnreadCount: async () => {
    const res = await apiClient.get('/notifications/unread-count');
    return res.data;
  },
  markRead: async (id) => {
    const res = await apiClient.patch(`/notifications/${id}/read`);
    return res.data;
  },
  markAllRead: async () => {
    const res = await apiClient.patch('/notifications/read-all');
    return res.data;
  },
};

export const PosAPI = {
  createBill: async (vendorZeebacId, amount, billCode) => {
    const res = await apiClient.post('/pos/create-bill', { vendorZeebacId, amount, billCode });
    return res.data;
  },
  getBillStatus: async (billCode) => {
    const res = await apiClient.get(`/pos/bill/${encodeURIComponent(billCode)}`);
    return res.data;
  }
};

// ── 24-Hour Instagram Stories API ──
export const StoryAPI = {
  createStory: async (formData) => {
    const res = await apiClient.post('/stories', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
  getActiveStories: async (lat, lng, radius = 10000) => {
    let url = '/stories/active';
    if (lat && lng) {
      url += `?lat=${lat}&lng=${lng}&radius=${radius}`;
    }
    const res = await apiClient.get(url);
    return res.data;
  },
  getVendorStories: async (vendorId) => {
    const res = await apiClient.get(`/stories/vendor/${vendorId}`);
    return res.data;
  },
  getMyStories: async () => {
    const res = await apiClient.get('/stories/my');
    return res.data;
  },
  recordStoryView: async (storyId) => {
    const res = await apiClient.post(`/stories/${storyId}/view`);
    return res.data;
  },
  getStoryViewers: async (storyId) => {
    const res = await apiClient.get(`/stories/${storyId}/viewers`);
    return res.data;
  },
  deleteStory: async (storyId) => {
    const res = await apiClient.delete(`/stories/${storyId}`);
    return res.data;
  },
};

// ── Support & FAQ Service ──
export const SupportAPI = {
  getFaqs: async (target = 'all', category = 'All', search = '') => {
    const params = new URLSearchParams();
    if (target && target !== 'all') params.append('target', target);
    if (category && category !== 'All') params.append('category', category);
    if (search) params.append('search', search);
    const res = await apiClient.get(`/support/faqs?${params.toString()}`);
    return res.data;
  },
};

