// ─── API Service Layer ──────────────────────────────────────────────────────
// Centralized mock API functions. 
// When the Node.js/MongoDB backend is ready, replace the mock returns
// with real axios/fetch calls. No component code needs to change.
// ─────────────────────────────────────────────────────────────────────────────

// Simulates network delay (remove when connecting to real backend)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Auth Service ──
export const authService = {
  // Mock login — will become: axios.post('/api/auth/login', { phone, pin })
  login: async (phone, pin) => {
    await delay(300);
    const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
    const user = users.find((u) => u.phone === phone);
    if (!user) throw new Error('No account found with this number.');
    // In production, PIN verification happens server-side
    return user;
  },

  // Mock OTP verify — will become: axios.post('/api/auth/verify-otp', { phone, otp })
  verifyOTP: async (phone, otp) => {
    await delay(300);
    // For mock, any 4-digit OTP works
    if (otp.length !== 4) throw new Error('Please enter a valid 4-digit OTP.');
    const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
    const user = users.find((u) => u.phone === phone);
    return user || null;
  },

  // Mock signup — will become: axios.post('/api/auth/signup', userData)
  signup: async (userData) => {
    await delay(300);
    const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
    const exists = users.find((u) => u.phone === userData.phone);
    if (exists) throw new Error('An account with this number already exists.');
    users.push(userData);
    localStorage.setItem('zeebac_users', JSON.stringify(users));
    return userData;
  },
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
