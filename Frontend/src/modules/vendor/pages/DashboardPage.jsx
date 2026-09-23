import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, PosAPI, API_BASE_URL } from '../../../services/api';
import useQrCode from '../../../hooks/useQrCode';
import { downloadImage } from '../../../utils/exportUtils';
import StoreStoriesModal from '../components/StoreStoriesModal';
import VendorLoanModal from '../components/VendorLoanModal';
import VendorPayLaterModal from '../components/VendorPayLaterModal';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [showQRModal, setShowQRModal] = useState(false);
  const [showPosModal, setShowPosModal] = useState(false);
  const [showStoriesModal, setShowStoriesModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showPayLaterModal, setShowPayLaterModal] = useState(false);
  const [posAmount, setPosAmount] = useState('1590');
  const [generatedPosBill, setGeneratedPosBill] = useState(null);
  const [isGeneratingPos, setIsGeneratingPos] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const zeebacId = currentUser.zeebacId || 'ZBV-0000';

  // Check for openPayLater query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openPayLater') === 'true') {
      setShowPayLaterModal(true);
    }
  }, []);
  const cashbackRate = currentUser?.cashbackRate ?? dashboardData?.data?.cashbackRate ?? 5;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, txnsRes, reqsRes, subRes] = await Promise.allSettled([
          VendorAPI.getDashboardStats(),
          VendorAPI.getTransactions(),
          VendorAPI.getPendingRequests(),
          VendorAPI.getSubscriptionStatus(),
        ]);

        if (statsRes.status === 'fulfilled') {
          setDashboardData(statsRes.value);
          if (statsRes.value.success && statsRes.value.data?.cashbackRate && !currentUser.cashbackRate) {
            useAuthStore.getState().updateProfile({ cashbackRate: statsRes.value.data.cashbackRate });
          }
        }

        if (subRes.status === 'fulfilled' && subRes.value.success) {
          setSubscriptionInfo(subRes.value.data);
        }

        if (reqsRes.status === 'fulfilled' && reqsRes.value.success) {
          setPendingRequests(reqsRes.value.data);
        }

        if (txnsRes.status === 'fulfilled' && txnsRes.value.success) {
          setRecentTransactions(txnsRes.value.data.slice(0, 5).map(t => ({
            id: t.transactionId,
            customer: t.customerName || t.customerPhone,
            amount: `₹${t.amount.toLocaleString()}`,
            cashback: `₹${t.cashbackAmount?.toLocaleString()}`,
            time: new Date(t.timestamp).toLocaleDateString(),
            status: t.status
          })));
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, [currentUser.cashbackRate]);

  const stats = [
    { label: 'Total Revenue', value: dashboardData ? `₹${dashboardData.data?.totalRevenue?.toLocaleString() || 0}` : '₹0', icon: 'payments', trend: 'All time', color: 'text-green-600', bg: 'bg-green-500/10', link: '/vendor/transactions' },
    { label: 'Cashback Given', value: dashboardData ? `₹${dashboardData.data?.totalCashbackGiven?.toLocaleString() || 0}` : '₹0', icon: 'savings', trend: 'All time', color: 'text-orange-500', bg: 'bg-orange-500/10', link: '/vendor/passbook' },
    { label: 'Total TXNs', value: dashboardData ? dashboardData.data?.totalTransactions || 0 : '0', icon: 'sync_alt', trend: 'All time', color: 'text-primary', bg: 'bg-primary/10', link: '/vendor/transactions' },
    { label: 'Customers', value: dashboardData ? dashboardData.data?.totalCustomers || 0 : '0', icon: 'groups', trend: 'Unique', color: 'text-secondary', bg: 'bg-secondary/10', link: '/vendor/customers' },
  ];

  const handleRequestAction = async (requestId, action) => {
    setIsProcessing(true);
    try {
      const res = await VendorAPI.respondToRequest(requestId, action);
      if (res.success) {
        setPendingRequests(prev => prev.filter(req => req._id !== requestId));
        // Refresh stats
        const statsRes = await VendorAPI.getDashboardStats();
        setDashboardData(statsRes);
      }
    } catch (error) {
      console.error('Failed to process request', error);
      alert(error.response?.data?.message || 'Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGeneratePosBill = async () => {
    if (!posAmount || parseFloat(posAmount) <= 0) return;
    setIsGeneratingPos(true);
    try {
      const res = await PosAPI.createBill(zeebacId, parseFloat(posAmount));
      if (res.success) {
        setGeneratedPosBill(res.data);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate POS Bill');
    } finally {
      setIsGeneratingPos(false);
    }
  };

  return (
    <div className="space-y-6 pt-2 pb-6 text-left">

      {/* Top Section: Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Welcome back</p>
          <h1 className="font-display text-[18px] font-black text-on-surface leading-none tracking-tight">
            {currentUser?.storeName || 'Vendor Store'}
          </h1>
        </div>
      </div>

      {/* Subscription & Store Status Banners */}
      {/* Alert 1: Subscription Required / Store Inactive */}
      {subscriptionInfo?.effectiveStatus === 'NONE' && (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-500/30 rounded-2xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">store_mall_directory</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700">
                  Onboarding Completed
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-700">
                  Store Inactive & Hidden
                </span>
              </div>
              <h3 className="font-bold text-[14px] text-on-surface leading-tight">
                Subscription Required to Go Live
              </h3>
              <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
                Your store is currently hidden from user discovery and cashback issuance is blocked. Choose a subscription plan to make your store live.
              </p>
              <div className="mt-3">
                <button
                  onClick={() => navigate('/vendor/subscription')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-[12px] font-bold rounded-xl shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>Choose Subscription Plan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert 2: Expired in 24h Grace or Expired > 24h */}
      {subscriptionInfo?.effectiveStatus === 'EXPIRED' && (
        <div className={`rounded-2xl p-4 border shadow-sm ${
          subscriptionInfo?.inGracePeriod
            ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border-amber-500/30'
            : 'bg-gradient-to-r from-rose-500/15 via-red-500/10 to-rose-500/5 border-rose-500/30'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              subscriptionInfo?.inGracePeriod ? 'bg-amber-500/20 text-amber-700' : 'bg-rose-500/20 text-rose-700'
            }`}>
              <span className="material-symbols-outlined text-[22px]">
                {subscriptionInfo?.inGracePeriod ? 'hourglass_top' : 'block'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  subscriptionInfo?.inGracePeriod ? 'bg-amber-500/20 text-amber-700' : 'bg-rose-500/20 text-rose-700'
                }`}>
                  Subscription Expired
                </span>
                {subscriptionInfo?.inGracePeriod ? (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-700">
                    24h Grace Period ({subscriptionInfo.hoursRemainingInGrace}h remaining)
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-700">
                    Store Hidden & Inactive
                  </span>
                )}
              </div>
              <h3 className="font-bold text-[14px] text-on-surface leading-tight">
                {subscriptionInfo?.inGracePeriod
                  ? 'Cashback Blocked • Store visible in 24h Grace Period'
                  : 'Store Inactive • Hidden from Users'}
              </h3>
              <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
                {subscriptionInfo?.inGracePeriod
                  ? 'Your subscription expired but your store is temporarily visible for 24 hours. Customer cashback is blocked. Renew immediately to prevent your store from being hidden.'
                  : 'Your subscription expired over 24 hours ago. Your store is completely hidden from user search and map listings, and cashback is blocked.'}
              </p>
              <div className="mt-3">
                <button
                  onClick={() => navigate('/vendor/subscription')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white text-[12px] font-bold rounded-xl shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">autorenew</span>
                  <span>Renew Subscription Plan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert 3: Active Subscription & Zero Wallet Warning */}
      {subscriptionInfo?.effectiveStatus === 'ACTIVE' && (
        <div className="space-y-2">
          {/* Active plan chip */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <div>
                <p className="text-[12px] font-bold text-emerald-800 flex items-center gap-1.5">
                  <span>Subscription Active</span>
                  <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-700 px-1.5 py-0.5 rounded">
                    {subscriptionInfo.planType} Plan
                  </span>
                </p>
                {subscriptionInfo.expiresAt && (
                  <p className="text-[10px] text-emerald-700/80">
                    Renews on {new Date(subscriptionInfo.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/vendor/subscription')}
              className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Manage
            </button>
          </div>

          {/* Zero Wallet Warning */}
          {Number(subscriptionInfo.walletBalance) <= 0 && (
            <div className="bg-gradient-to-r from-amber-500/15 via-red-500/10 to-amber-500/5 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-on-surface">Cashback wallet balance is ₹0</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Cashback is currently blocked for customers. Recharge your cashback wallet to enable cashback distribution.
                </p>
                <button
                  onClick={() => navigate('/vendor/wallet')}
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">add_circle</span>
                  <span>Recharge Wallet</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 24-Hour Store Stories Widget (Instagram Style) */}
      <div className="rounded-2xl p-3.5 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-amber-500/10 border border-purple-500/20 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2px] flex-shrink-0 shadow-sm">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-pink-600 font-bold">
              <span className="material-symbols-outlined text-[22px]">history_toggle_off</span>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-xs text-on-surface flex items-center gap-1.5">
              <span>24h Store Stories</span>
             
            </h3>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Post daily deals & photos to nearby customers
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowStoriesModal(true)}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary/95 hover:to-purple-600/95 text-white font-bold text-xs shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-1 cursor-pointer flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          Add Story
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mx-auto w-full">
        <button
          onClick={() => navigate('/vendor/scan-customer')}
          className="flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-secondary text-white shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center mb-1">
            <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-extrabold leading-tight">Scan Customer</p>
          <p className="text-[7px] sm:text-[8px] text-white/70">Log Cash</p>
        </button>

        <button
          onClick={() => setShowQRModal(true)}
          className="flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-white border border-outline-variant/15 text-on-surface shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-1">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-extrabold leading-tight">Store QR</p>
          <p className="text-[7px] sm:text-[8px] text-on-surface-variant">Counter QR</p>
        </button>

        <button
          onClick={() => setShowPosModal(true)}
          className="flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-gradient-to-br from-[#16082f] via-[#3b0764] to-[#6000da] text-white shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center mb-1">
            <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-extrabold leading-tight">Cash QR</p>
          <p className="text-[7px] sm:text-[8px] text-amber-300 font-bold">&gt; ₹1,000 Instant</p>
        </button>

        <button
          onClick={() => setShowPayLaterModal(true)}
          className="relative flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-[7px] sm:text-[7.5px] uppercase tracking-wider rounded-md shadow-xs pointer-events-none z-10">
            Soon
          </span>
          <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center mb-1 text-amber-300">
            <span className="material-symbols-outlined text-[16px]">credit_score</span>
          </div>
          <p className="text-[10px] sm:text-[11px] font-extrabold leading-tight text-amber-300">Pay Later</p>
          <p className="text-[7px] sm:text-[8px] text-indigo-200">Upto ₹25k</p>
        </button>
      </div>

      {/* Stats Grid - 2x2 Compact on mobile, 4 columns on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            onClick={() => navigate(stat.link)}
            className="bg-white rounded-2xl p-3.5 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] cursor-pointer hover:shadow-md hover:border-primary/20 transition-all active:scale-[0.98]"
          >
            <div className="flex justify-between items-start mb-2">
              <div className={`w-8 h-8 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center`}>
                <span className="material-symbols-outlined text-[16px]">{stat.icon}</span>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${stat.trend === 'Action needed' ? 'bg-orange-100 text-orange-700' : 'bg-surface-container text-on-surface-variant'}`}>
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="text-[10px] sm:text-[11px] font-semibold text-on-surface-variant leading-tight mb-1">{stat.label}</p>
              <h3 className="text-[20px] font-black text-on-surface leading-none tracking-tight">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Vendor Shop & Pay Later Banner (Upto ₹25,000 Credit Limit) */}
      <div 
        onClick={() => setShowPayLaterModal(true)}
        className="bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#2e1065] text-white rounded-2xl p-3 sm:p-4 shadow-xs hover:shadow-md cursor-pointer transition-all active:scale-[0.99] border border-indigo-900/30 relative overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 sm:gap-4 relative z-10">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-amber-300 shrink-0 border border-white/10">
              <span className="material-symbols-outlined text-[19px] sm:text-[22px]">credit_score</span>
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="text-[8px] sm:text-[8.5px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded-full">Coming Soon</span>
                <span className="text-[9.5px] sm:text-[10.5px] font-bold text-indigo-200">Store Working Capital</span>
              </div>
              <p className="text-[12px] sm:text-[13.5px] font-black text-white leading-tight">Shop & Pay Later • Credit Limit Up to ₹25,000</p>
              <p className="text-[9px] sm:text-[10px] text-indigo-200/80 leading-tight mt-0.5 line-clamp-1 sm:line-clamp-none">Maintain 30 days store transactions to unlock limit based on PAN & CIBIL score</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 bg-amber-400 hover:bg-amber-300 text-slate-900 px-2 sm:px-3.5 py-1.5 rounded-xl font-black text-[9.5px] sm:text-[11px] shadow-xs shrink-0 transition-colors">
            <span className="whitespace-nowrap">Check Limit</span>
            <span className="material-symbols-outlined text-[12px] sm:text-[14px]">arrow_forward</span>
          </div>
        </div>
      </div>

      {/* Merchant Business Loan Banner */}
      <div 
        onClick={() => setShowLoanModal(true)}
        className="bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#312e81] text-white rounded-2xl p-3 sm:p-4 shadow-xs hover:shadow-md cursor-pointer transition-all active:scale-[0.99] relative overflow-hidden border border-indigo-900/30"
      >
        <div className="flex items-center justify-between gap-2 sm:gap-4 relative z-10">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
              <span className="material-symbols-outlined text-[19px] sm:text-[22px]">payments</span>
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="text-[8px] sm:text-[8.5px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded-full">Coming Soon</span>
                <span className="text-[9.5px] sm:text-[10.5px] font-bold text-indigo-200">Merchant Capital</span>
              </div>
              <p className="text-[12px] sm:text-[13.5px] font-black text-white leading-tight">Apply for Business Loan up to ₹25L</p>
              <p className="text-[9px] sm:text-[10px] text-indigo-200/90 leading-tight mt-0.5 line-clamp-1 sm:line-clamp-none">0% Property Collateral • Auto daily micro-deduction from sales</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 bg-amber-400 hover:bg-amber-300 text-slate-900 px-2 sm:px-3.5 py-1.5 rounded-xl font-black text-[9.5px] sm:text-[11px] shadow-xs shrink-0 transition-colors">
            <span className="whitespace-nowrap">Apply</span>
            <span className="material-symbols-outlined text-[12px] sm:text-[14px]">arrow_forward</span>
          </div>
        </div>
      </div>

      {/* Action Required (Pending Approvals) - Preserved for Phase 4 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[16px] font-extrabold text-on-surface">Action Required</h3>
          <button
            onClick={() => navigate('/vendor/requests')}
            className="text-[12px] text-primary font-bold cursor-pointer hover:underline"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {pendingRequests.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant text-center py-4">No pending requests</p>
          ) : pendingRequests.slice(0, 3).map(req => (
            <div key={req._id} className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-3 flex gap-3 items-start">
              <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 font-bold border border-orange-100 flex-shrink-0">
                {req.customerId?.name?.charAt(0) || 'C'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-[14px] text-on-surface truncate">{req.customerId?.name || req.customerId?.phone}</h4>
                    {req.billNumber && (
                      <p className="text-[11px] font-mono font-bold text-primary mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">tag</span>
                        <span>Bill No: <span className="bg-primary/10 px-1 py-0.2 rounded font-mono">{req.billNumber}</span></span>
                      </p>
                    )}
                  </div>
                  <p className="font-black text-[14px] text-on-surface">₹{req.amount?.toLocaleString()}</p>
                </div>
                <div className="flex justify-between items-center mt-0.5">
                  <p className="text-[11px] text-on-surface-variant">{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} <span className="mx-1">•</span> Request</p>
                  <p className="text-[10px] text-green-600 font-bold">Estimated CB: ₹{(req.amount * (cashbackRate / 100)).toFixed(2)}</p>
                </div>

                {req.billImageUrl && (
                  <div
                    onClick={() => setViewReceiptUrl(req.billImageUrl)}
                    className="mt-2.5 flex items-center justify-between bg-surface-container-low/50 border border-outline-variant/10 rounded-lg p-1.5 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-1.5 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">View Attached Receipt</span>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-primary">visibility</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    disabled={isProcessing}
                    onClick={() => handleRequestAction(req._id, 'Reject')}
                    className="flex-1 h-8 rounded-lg bg-red-50 text-red-600 font-bold text-[12px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleRequestAction(req._id, 'Approve')}
                    className="flex-1 h-8 rounded-lg bg-primary text-white font-bold text-[12px] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h3 className="font-display text-[16px] font-extrabold text-on-surface">Recent Activity</h3>

        <div className="space-y-3">
          {recentTransactions.map(tx => (
            <div key={tx.id} className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-outline-variant/10 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tx.status === 'Approved' ? 'bg-green-500/10 text-green-600' :
                  tx.status === 'Rejected' ? 'bg-red-500/10 text-red-600' : 'bg-orange-500/10 text-orange-600'
                  }`}>
                  <span className="material-symbols-outlined text-[20px]">{tx.status === 'Approved' ? 'check_circle' : tx.status === 'Rejected' ? 'cancel' : 'pending'}</span>
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-on-surface leading-tight">{tx.customer}</h3>
                  <p className="text-[11px] text-on-surface-variant">{tx.id} • {tx.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-black text-on-surface">{tx.amount}</p>
                <p className={`text-[10px] font-bold ${tx.status === 'Approved' ? 'text-green-600' : 'text-on-surface-variant'}`}>{tx.status}</p>
              </div>
            </div>
          ))}
          {recentTransactions.length === 0 && (
            <div className="text-center py-6 text-on-surface-variant">
              No recent transactions
            </div>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setViewReceiptUrl(null)}>
          <div className="relative max-w-full max-h-full overflow-hidden flex flex-col items-center">
            <button
              onClick={() => setViewReceiptUrl(null)}
              className="absolute top-2 right-2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
            <img
              src={viewReceiptUrl.startsWith('data:') || viewReceiptUrl.startsWith('http') ? viewReceiptUrl : `${API_BASE_URL.replace('/api', '')}${viewReceiptUrl}`}
              alt="Receipt"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-white"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
          <div className="bg-white w-full max-w-[340px] rounded-3xl p-4 sm:p-6 shadow-2xl relative mx-auto">
            <button
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            <div className="flex flex-col items-center pt-2">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-4">
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
              </div>
              <h3 className="font-display font-bold text-[20px] text-on-surface text-center leading-tight">Counter QR</h3>
              <p className="text-[12px] text-on-surface-variant text-center mt-1 mb-2 px-2">
                Scan & Pay via PhonePe, Paytm, GPay or ZeeBac
              </p>

              <div className="flex items-center gap-1.5 justify-center mb-4 flex-wrap">
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">PhonePe</span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Paytm</span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">GPay</span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">ZeeBac</span>
              </div>

              <div className="bg-[#fcfaff] border-2 border-secondary/20 rounded-3xl p-5 w-56 h-56 flex items-center justify-center shadow-inner mb-4">
                {qrImageUrl ? (
                  <img src={qrImageUrl} alt="Store QR" className="w-full h-full object-contain" />
                ) : (
                  <div className={`w-8 h-8 border-2 border-secondary/30 border-t-secondary rounded-full ${qrLoading ? 'animate-spin' : ''}`} />
                )}
              </div>

              <div className="bg-surface-container py-1.5 px-4 rounded-full flex items-center gap-2 mb-4">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Store ID:</span>
                <span className="text-[13px] font-black tracking-widest text-on-surface">{zeebacId}</span>
              </div>

              <button
                onClick={() => qrImageUrl && downloadImage(qrImageUrl, `Zeebac_Counter_QR_${zeebacId}.png`)}
                disabled={!qrImageUrl}
                className="w-full py-2.5 px-4 bg-primary text-white rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Download Counter QR
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* POS Bill Simulator Modal */}
      {showPosModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
          <div className="bg-white w-full max-w-[340px] rounded-3xl p-4 sm:p-6 shadow-2xl relative mx-auto text-left">
            <button
              onClick={() => { setShowPosModal(false); setGeneratedPosBill(null); }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[24px]">qr_code_2</span>
              </div>
              <div>
                <h3 className="font-display font-extrabold text-[16px] text-on-surface leading-tight">Cash Bill Barcode (&gt; ₹1,000)</h3>
                <p className="text-[11px] text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded-full inline-block mt-0.5">Instant Withdrawable Cashback</p>
              </div>
            </div>

            {!generatedPosBill ? (
              <div className="space-y-4 pt-1">
                <p className="text-[12px] text-on-surface-variant leading-snug">
                  Enter cash bill amount above ₹1,000 to generate a one-time barcode. Customer scans it with ZeeBac to earn instant withdrawable cashback.
                </p>

                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Cash Bill Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={posAmount}
                    onChange={(e) => setPosAmount(e.target.value)}
                    placeholder="1500"
                    className="w-full h-12 px-4 bg-[#f3f4f6] rounded-xl outline-none border-2 border-transparent focus:border-[#6000da] text-[18px] font-black text-on-surface"
                  />
                </div>

                {/* Quick amount chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[1200, 1500, 2000, 3000, 5000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPosAmount(String(val))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        posAmount === String(val)
                          ? 'bg-[#6000da] text-white shadow-xs'
                          : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      ₹{val.toLocaleString()}
                    </button>
                  ))}
                </div>

                <div className="bg-purple-50 border border-purple-100 rounded-xl p-2.5 text-[11px] text-purple-900 flex justify-between items-center">
                  <span>Customer Cashback ({cashbackRate}%):</span>
                  <span className="font-black text-purple-700 text-[13px]">
                    ₹{((parseFloat(posAmount) || 0) * (cashbackRate / 100)).toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={handleGeneratePosBill}
                  disabled={isGeneratingPos || !posAmount || parseFloat(posAmount) <= 0}
                  className="w-full h-12 bg-gradient-to-r from-[#16082f] via-[#3b0764] to-[#6000da] text-white font-extrabold text-[14px] rounded-xl shadow-md hover:from-[#16082f] hover:to-[#4c00b0] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingPos ? 'Generating One-Time Barcode...' : 'Generate Cash QR Barcode'}
                </button>
              </div>
            ) : (
              <div className="bg-[#6000da]/5 border border-[#6000da]/20 rounded-2xl p-4 text-center space-y-3">
                <div className="bg-white border-2 border-dashed border-[#6000da]/30 rounded-xl p-4 shadow-sm flex flex-col items-center">
                  <span className="text-[10px] text-[#6000da] font-extrabold uppercase tracking-widest block mb-1">ONE-TIME USABLE CASH QR</span>
                  <span className="text-[10px] text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded-full mb-2">⚡ Instant Withdrawable</span>
                  
                  {/* Scannable Visual QR Code Image */}
                  <div className="w-44 h-44 bg-white border-2 border-[#6000da]/20 rounded-2xl p-2.5 shadow-inner flex items-center justify-center mb-2">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${generatedPosBill.billCode}`}
                      alt="Printed Bill QR Code"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="text-[18px] font-black tracking-widest text-[#16082f] bg-[#6000da]/10 py-1.5 px-4 rounded-lg my-1 select-all w-full font-mono">
                    {generatedPosBill.billCode}
                  </div>
                  <div className="flex justify-between w-full text-[12px] font-bold text-on-surface mt-2 px-1">
                    <span>Bill: ₹{generatedPosBill.amount}</span>
                    <span className="text-green-600 font-black">Cashback: ₹{((generatedPosBill.amount * (generatedPosBill.cashbackRate / 100))).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-tight">
                  Ask customer to scan this QR code with <b>Scan & Pay</b> in ZeeBac App to gain instant withdrawable cashback!
                </p>
                <button
                  onClick={() => setGeneratedPosBill(null)}
                  className="text-[12px] font-bold text-[#6000da] hover:underline cursor-pointer"
                >
                  Generate Another Bill
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Store Stories Modal */}
      <StoreStoriesModal
        isOpen={showStoriesModal}
        onClose={() => setShowStoriesModal(false)}
      />

      {/* Vendor Loan Modal */}
      <VendorLoanModal
        isOpen={showLoanModal}
        onClose={() => setShowLoanModal(false)}
      />

      {/* Vendor Shop & Pay Later Modal (Credit limit up to ₹25,000) */}
      <VendorPayLaterModal
        isOpen={showPayLaterModal}
        onClose={() => setShowPayLaterModal(false)}
      />

    </div>
  );
}
