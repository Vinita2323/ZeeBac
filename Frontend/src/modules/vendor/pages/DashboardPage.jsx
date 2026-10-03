import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, PosAPI, API_BASE_URL } from '../../../services/api';
import useQrCode from '../../../hooks/useQrCode';
import { downloadImage, shareContent } from '../../../utils/exportUtils';
import StoreStoriesModal from '../components/StoreStoriesModal';
import VendorLoanModal from '../components/VendorLoanModal';
import VendorPayLaterModal from '../components/VendorPayLaterModal';
import SalesAnalyticsModal from '../components/SalesAnalyticsModal';
import { getSocket } from '../../../services/socket';
import useLanguageStore from '../../../store/useLanguageStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const [showQRModal, setShowQRModal] = useState(false);
  const [showPosModal, setShowPosModal] = useState(false);
  const [showStoriesModal, setShowStoriesModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showPayLaterModal, setShowPayLaterModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
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

  const fetchQrToken = useCallback(async () => {
    try {
      const res = await VendorAPI.getQrToken();
      if (res && res.data) return res;
      throw new Error('No QR token received');
    } catch (err) {
      console.warn('Vendor QR token API failed, using store fallback:', err);
      const payeeVpa = currentUser?.bankDetails?.upiId || `${currentUser?.phone || 'vendor'}@upi`;
      const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(currentUser?.storeName || 'ZeeBac Store')}&tr=${zeebacId}&tn=Zeebac%20Cashback&cu=INR`;
      return {
        data: {
          token: `zeebac://vendor/${zeebacId}`,
          upiUri,
          expiresIn: 3600,
        },
      };
    }
  }, [currentUser?.bankDetails?.upiId, currentUser?.phone, currentUser?.storeName, zeebacId]);

  const { qrImageUrl, isLoading: qrLoading, refresh: refreshQr } = useQrCode(fetchQrToken, true);

  useEffect(() => {
    if (showQRModal && !qrImageUrl && !qrLoading) {
      refreshQr();
    }
  }, [showQRModal, qrImageUrl, qrLoading, refreshQr]);

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
          const raw = reqsRes.value.data || [];
          const seenBills = new Set();
          const seenCashCustomers = new Set();
          const deduplicated = raw.filter(r => {
            if (r.paymentMethod === 'Cash' || r.requestType === 'cash_claim') {
              const custId = r.customerId?._id || r.customerId?.id || r.customerId?.phone || r.customerId?.name;
              if (custId) {
                if (seenCashCustomers.has(String(custId))) return false;
                seenCashCustomers.add(String(custId));
              }
              return true;
            }
            if (!r.billNumber) return true;
            const key = String(r.billNumber).trim().toUpperCase();
            if (seenBills.has(key)) return false;
            seenBills.add(key);
            return true;
          });
          setPendingRequests(deduplicated);
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

  // Real-time socket sync for new incoming cash requests with OTP
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewCashRequest = (data) => {
      setPendingRequests(prev => {
        // Filter out any older pending requests from the same customer or with the same requestId
        const newCustId = data.customerId?._id || data.customerId || data.customerName;
        const filtered = prev.filter(r => {
          if (r._id === data.requestId) return false;
          if (r.paymentMethod === 'Cash' || r.requestType === 'cash_claim') {
            const prevCustId = r.customerId?._id || r.customerId?.id || r.customerId?.phone || r.customerId?.name;
            if (prevCustId && newCustId && String(prevCustId) === String(newCustId)) {
              return false;
            }
          }
          return true;
        });

        const newReq = {
          _id: data.requestId,
          amount: data.amount,
          cashbackAmount: data.cashbackAmount,
          verificationCode: data.verificationCode,
          customerId: typeof data.customerId === 'object' && data.customerId?.name ? data.customerId : { name: data.customerName, _id: data.customerId },
          paymentMethod: data.paymentMethod || 'Cash',
          status: 'Pending',
          createdAt: new Date().toISOString()
        };
        return [newReq, ...filtered];
      });
    };

    const handleCashVerified = (data) => {
      setPendingRequests(prev => prev.filter(r => r._id !== data.requestId && r.verificationCode !== data.verificationCode));
    };

    socket.on('new_cash_request', handleNewCashRequest);
    socket.on('cash_request_verified', handleCashVerified);

    return () => {
      socket.off('new_cash_request', handleNewCashRequest);
      socket.off('cash_request_verified', handleCashVerified);
    };
  }, []);

  const todaySales = dashboardData?.data?.todaySales || {
    total: 0,
    cash: 0,
    digital: 0,
    transactions: 0
  };

  const stats = [
    {
      id: 'total-revenue',
      label: t('Total Revenue'),
      value: dashboardData ? `₹${dashboardData.data?.totalRevenue?.toLocaleString('en-IN') || 0}` : '₹0',
      icon: 'account_balance',
      trend: t('All time'),
      link: '/vendor/transactions'
    },
    {
      id: 'today-sales',
      label: t("Today's Sale") || "Today's Sale",
      value: `₹${(todaySales.total || 0).toLocaleString('en-IN')}`,
      icon: 'point_of_sale',
      trend: t('Today') || 'Today',
      isLive: true,
      cash: todaySales.cash || 0,
      digital: todaySales.digital || 0,
      onClick: () => setShowSalesModal(true)
    },
    {
      id: 'cashback-given',
      label: t('Cashback Given'),
      value: dashboardData ? `₹${dashboardData.data?.totalCashbackGiven?.toLocaleString('en-IN') || 0}` : '₹0',
      icon: 'savings',
      trend: t('All time'),
      link: '/vendor/passbook'
    },
    {
      id: 'customers',
      label: t('Customers'),
      value: dashboardData ? (dashboardData.data?.totalCustomers || 0).toLocaleString('en-IN') : '0',
      icon: 'groups',
      trend: t('Unique'),
      link: '/vendor/customers'
    },
  ];

  const handleRequestAction = async (requestId, action) => {
    setIsProcessing(true);
    try {
      const targetReq = pendingRequests.find(req => req._id === requestId);
      const targetBillNumber = targetReq?.billNumber ? String(targetReq.billNumber).trim().toUpperCase() : null;
      const targetCustId = targetReq?.customerId?._id || targetReq?.customerId?.id || targetReq?.customerId?.name;
      const isCash = targetReq?.paymentMethod === 'Cash' || targetReq?.requestType === 'cash_claim';

      const res = await VendorAPI.respondToRequest(requestId, action);
      if (res.success) {
        setPendingRequests(prev => prev.filter(req => {
          if (req._id === requestId) return false;
          if (targetBillNumber && req.billNumber && String(req.billNumber).trim().toUpperCase() === targetBillNumber) {
            return false;
          }
          if (isCash && targetCustId) {
            const cId = req.customerId?._id || req.customerId?.id || req.customerId?.name;
            if (cId && String(cId) === String(targetCustId)) return false;
          }
          return true;
        }));
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
    <div className="space-y-5 sm:space-y-6 pt-1 pb-8 text-left">

      {/* Top Section: Greeting & Store Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-primary/10">
        <div>
          <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">{t('Welcome back')}</p>
          <h1 className="font-display text-[20px] sm:text-[22px] font-black text-on-surface leading-none tracking-tight">
            {currentUser?.storeName || 'Vendor Store'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[11.5px] font-mono font-bold flex items-center gap-1.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            {zeebacId}
          </span>
        </div>
      </div>

      {/* Subscription & Store Status Banners */}
      {/* Alert 1: Subscription Required / Store Inactive */}
      {subscriptionInfo?.effectiveStatus === 'NONE' && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 rounded-2xl p-4 sm:p-4.5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">store_mall_directory</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800">
                  Onboarding Completed
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-800">
                  Store Inactive
                </span>
              </div>
              <h3 className="font-bold text-[14px] text-on-surface leading-tight">
                Subscription Required to Go Live
              </h3>
              <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
                Your store is currently hidden from customer discovery and cashback issuance is paused. Choose a plan to activate your store.
              </p>
              <div className="mt-3">
                <button
                  onClick={() => navigate('/vendor/subscription')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white text-[12px] font-bold rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  <span>Choose Subscription Plan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert 2: Expired in 24h Grace or Expired > 24h */}
      {subscriptionInfo?.effectiveStatus === 'EXPIRED' && (
        <div className={`rounded-2xl p-4 sm:p-4.5 border shadow-xs ${
          subscriptionInfo?.inGracePeriod
            ? 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/25'
            : 'bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/25'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              subscriptionInfo?.inGracePeriod ? 'bg-amber-500/15 text-amber-700' : 'bg-rose-500/15 text-rose-700'
            }`}>
              <span className="material-symbols-outlined text-[20px]">
                {subscriptionInfo?.inGracePeriod ? 'hourglass_top' : 'block'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  subscriptionInfo?.inGracePeriod ? 'bg-amber-500/15 text-amber-800' : 'bg-rose-500/15 text-rose-800'
                }`}>
                  Subscription Expired
                </span>
                {subscriptionInfo?.inGracePeriod && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800">
                    24h Grace ({subscriptionInfo.hoursRemainingInGrace}h left)
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
                  ? 'Your subscription expired. Renew promptly to keep your store discoverable.'
                  : 'Your subscription expired over 24 hours ago. Renew to reactivate your store.'}
              </p>
              <div className="mt-3">
                <button
                  onClick={() => navigate('/vendor/subscription')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white text-[12px] font-bold rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">autorenew</span>
                  <span>Renew Subscription</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert 3: Active Subscription & Zero Wallet Warning */}
      {subscriptionInfo?.effectiveStatus === 'ACTIVE' && (
        <div className="space-y-2.5">
          {/* Active plan chip */}
          <div className="bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent border border-primary/20 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <div>
                <p className="text-[12px] font-bold text-on-surface flex items-center gap-1.5">
                  <span>Subscription Active</span>
                  <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md">
                    {subscriptionInfo.planType} Plan
                  </span>
                </p>
                {subscriptionInfo.expiresAt && (
                  <p className="text-[10.5px] text-on-surface-variant mt-0.5">
                    Renews on {new Date(subscriptionInfo.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/vendor/subscription')}
              className="text-[11.5px] font-bold text-primary hover:underline cursor-pointer"
            >
              Manage
            </button>
          </div>

          {/* Zero Wallet Warning */}
          {Number(subscriptionInfo.walletBalance) <= 0 && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3 sm:p-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-on-surface">Cashback wallet balance is ₹0</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Recharge your cashback wallet to enable instant cashback issuance for customers.
                </p>
                <button
                  onClick={() => navigate('/vendor/wallet')}
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined text-[13px]">add_circle</span>
                  <span>Recharge Wallet</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Store Stories Widget - Aesthetic & Theme-Colored */}
      <div className="bg-gradient-to-r from-primary/[0.07] via-white to-primary/[0.02] border border-primary/20 rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_12px_rgba(96,0,218,0.04)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#16082f] to-[#6000da] p-0.5 flex-shrink-0 shadow-sm">
            <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center text-primary font-bold">
              <span className="material-symbols-outlined text-[22px]">auto_stories</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-[13.5px] text-on-surface leading-tight">Store Stories</h3>
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                24h Deals
              </span>
            </div>
            <p className="text-[11.5px] text-on-surface-variant mt-0.5 truncate">
              Post daily offers, deals & photos to attract nearby customers
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowStoriesModal(true)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white font-bold text-[12px] shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0 ml-2"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>Add Story</span>
        </button>
      </div>

      {/* Quick Actions Toolbar - Aesthetic, Theme-Branded & Responsive (2x2 mobile, 4-col desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mx-auto w-full">
        {/* 1. Scan Customer */}
        <button
          onClick={() => navigate('/vendor/scan-customer')}
          className="group relative flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-2xl bg-white border border-primary/15 hover:border-primary/40 shadow-[0_2px_10px_rgba(96,0,218,0.03)] hover:shadow-[0_4px_16px_rgba(96,0,218,0.08)] active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all flex items-center justify-center mb-2 shadow-xs">
            <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
          </div>
          <p className="text-[12px] sm:text-[13px] font-bold text-on-surface leading-tight group-hover:text-primary transition-colors">Scan Customer</p>
          <p className="text-[10px] sm:text-[10.5px] text-on-surface-variant font-medium mt-0.5">Log Cash CB</p>
        </button>

        {/* 2. Store QR */}
        <button
          onClick={() => setShowQRModal(true)}
          className="group relative flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-2xl bg-white border border-primary/15 hover:border-primary/40 shadow-[0_2px_10px_rgba(96,0,218,0.03)] hover:shadow-[0_4px_16px_rgba(96,0,218,0.08)] active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all flex items-center justify-center mb-2 shadow-xs">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
          </div>
          <p className="text-[12px] sm:text-[13px] font-bold text-on-surface leading-tight group-hover:text-primary transition-colors">Store QR</p>
          <p className="text-[10px] sm:text-[10.5px] text-on-surface-variant font-medium mt-0.5">Counter Standee</p>
        </button>

        {/* 3. Accept Cash (POS) */}
        <button
          onClick={() => setShowPosModal(true)}
          className="group relative flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-2xl bg-white border border-primary/15 hover:border-primary/40 shadow-[0_2px_10px_rgba(96,0,218,0.03)] hover:shadow-[0_4px_16px_rgba(96,0,218,0.08)] active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all flex items-center justify-center mb-2 shadow-xs">
            <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
          </div>
          <p className="text-[12px] sm:text-[13px] font-bold text-on-surface leading-tight group-hover:text-primary transition-colors">Accept Cash</p>
          <p className="text-[10px] sm:text-[10.5px] text-on-surface-variant font-medium mt-0.5">Instant POS</p>
        </button>

        {/* 4. Pay Later */}
        <button
          onClick={() => setShowPayLaterModal(true)}
          className="group relative flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-2xl bg-white border border-primary/15 hover:border-primary/40 shadow-[0_2px_10px_rgba(96,0,218,0.03)] hover:shadow-[0_4px_16px_rgba(96,0,218,0.08)] active:scale-[0.98] transition-all cursor-pointer text-center"
        >
          <span className="absolute top-2 right-2 text-[8px] sm:text-[8.5px] font-extrabold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md uppercase">
            Soon
          </span>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all flex items-center justify-center mb-2 shadow-xs">
            <span className="material-symbols-outlined text-[20px]">credit_score</span>
          </div>
          <p className="text-[12px] sm:text-[13px] font-bold text-on-surface leading-tight group-hover:text-primary transition-colors">Pay Later</p>
          <p className="text-[10px] sm:text-[10.5px] text-on-surface-variant font-medium mt-0.5">Up to ₹25k</p>
        </button>
      </div>

      {/* Stats Grid - Aesthetic Theme Accents & Responsive Layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {stats.map((stat) => (
          <div
            key={stat.id}
            onClick={() => {
              if (stat.onClick) {
                stat.onClick();
              } else if (stat.link) {
                navigate(stat.link);
              }
            }}
            className={`bg-white rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(22,8,47,0.03)] hover:shadow-md transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between group ${
              stat.id === 'today-sales'
                ? 'border-primary/35 ring-1 ring-primary/20 bg-gradient-to-br from-white via-white to-primary/[0.04]'
                : 'border-primary/15 hover:border-primary/35'
            }`}
          >
            <div>
              <div className="flex justify-between items-start mb-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center shadow-2xs">
                  <span className="material-symbols-outlined text-[18px]">{stat.icon}</span>
                </div>
                <span className={`text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  stat.isLive
                    ? 'text-primary bg-primary/10 border border-primary/25'
                    : 'text-on-surface-variant bg-surface-container'
                }`}>
                  {stat.isLive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  )}
                  {stat.trend}
                </span>
              </div>
              <p className="text-[11px] sm:text-[11.5px] font-bold text-on-surface-variant leading-tight mb-1">{stat.label}</p>
              <h3 className="text-[20px] sm:text-[22px] font-black text-on-surface leading-none tracking-tight">{stat.value}</h3>
            </div>

            {stat.id === 'today-sales' && (
              <div className="mt-3 pt-2.5 border-t border-primary/10 flex items-center justify-between text-[11px] font-medium">
                <span className="flex items-center gap-1 text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>{t('Cash')}: <strong className="text-on-surface font-bold">₹{(stat.cash || 0).toLocaleString('en-IN')}</strong></span>
                </span>
                <span className="flex items-center gap-1 text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span>{t('Digital')}: <strong className="text-on-surface font-bold">₹{(stat.digital || 0).toLocaleString('en-IN')}</strong></span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Credit & Working Capital Services - Signature Theme Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {/* Card 1: Shop & Pay Later */}
        <div 
          onClick={() => setShowPayLaterModal(true)}
          className="group bg-gradient-to-br from-[#16082f] via-[#1f0a42] to-[#2e0075] text-white rounded-2xl p-4 sm:p-5 border border-primary/30 shadow-[0_4px_20px_rgba(22,8,47,0.12)] relative overflow-hidden cursor-pointer hover:border-primary/60 transition-all active:scale-[0.99] flex flex-col justify-between"
        >
          <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-[#6000da]/25 blur-2xl pointer-events-none"></div>

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[20px]">credit_score</span>
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider bg-white/15 text-purple-100 px-2.5 py-0.5 rounded-full border border-white/15 backdrop-blur-sm">
                Coming Soon
              </span>
            </div>
            <div className="mt-3">
              <h4 className="font-extrabold text-[15px] text-white leading-tight">Shop & Pay Later</h4>
              <p className="text-[12px] text-purple-200/80 mt-1 leading-relaxed">
                Instant working capital credit limit up to ₹25,000 for your daily store purchases & stock.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between relative z-10">
            <span className="text-[11px] font-semibold text-purple-200/90">Credit Limit: Up to ₹25k</span>
            <div className="px-3.5 py-1.5 rounded-xl bg-white text-[#16082f] font-bold text-[11.5px] shadow-sm group-hover:bg-purple-50 transition-colors flex items-center gap-1 shrink-0">
              <span>Check Limit</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* Card 2: Merchant Business Loan */}
        <div 
          onClick={() => setShowLoanModal(true)}
          className="group bg-gradient-to-br from-[#16082f] via-[#1f0a42] to-[#2e0075] text-white rounded-2xl p-4 sm:p-5 border border-primary/30 shadow-[0_4px_20px_rgba(22,8,47,0.12)] relative overflow-hidden cursor-pointer hover:border-primary/60 transition-all active:scale-[0.99] flex flex-col justify-between"
        >
          <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-[#6000da]/25 blur-2xl pointer-events-none"></div>

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[20px]">payments</span>
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider bg-white/15 text-purple-100 px-2.5 py-0.5 rounded-full border border-white/15 backdrop-blur-sm">
                Coming Soon
              </span>
            </div>
            <div className="mt-3">
              <h4 className="font-extrabold text-[15px] text-white leading-tight">Merchant Business Loan</h4>
              <p className="text-[12px] text-purple-200/80 mt-1 leading-relaxed">
                Unsecured business growth capital up to ₹25L with 0% property collateral & micro-deductions.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between relative z-10">
            <span className="text-[11px] font-semibold text-purple-200/90">0% Property Collateral</span>
            <div className="px-3.5 py-1.5 rounded-xl bg-white text-[#16082f] font-bold text-[11.5px] shadow-sm group-hover:bg-purple-50 transition-colors flex items-center gap-1 shrink-0">
              <span>Apply Loan</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Required (Pending Approvals) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[16px] font-bold text-on-surface">{t('Action Required')}</h3>
          <button
            onClick={() => navigate('/vendor/requests')}
            className="text-[12px] text-primary font-bold cursor-pointer hover:underline"
          >
            {t('View All')}
          </button>
        </div>

        <div className="space-y-3">
          {pendingRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-primary/10 p-6 text-center shadow-[0_2px_8px_rgba(22,8,47,0.02)]">
              <p className="text-[12px] text-on-surface-variant">{t('No pending requests')}</p>
            </div>
          ) : pendingRequests.slice(0, 3).map(req => {
            const isPendingCashOtp = !!(req.verificationCode && req.status === 'Pending');
            const isApproved = req.status === 'Approved';

            return (
              <div 
                key={req._id} 
                className="bg-white rounded-2xl border border-primary/15 shadow-[0_2px_12px_rgba(22,8,47,0.03)] p-4 sm:p-4.5 transition-all"
              >
                <div className="flex gap-3.5 items-start">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
                    {req.customerId?.name?.charAt(0) || 'C'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-[14px] text-on-surface truncate">
                            {req.customerId?.name || req.customerId?.phone}
                          </h4>
                          {isPendingCashOtp && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[9.5px] font-bold uppercase tracking-wider">
                              Cash OTP
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9.5px] font-bold uppercase tracking-wider">
                              Verified
                            </span>
                          )}
                        </div>
                        {req.billNumber && (
                          <p className="text-[11px] font-mono font-medium text-on-surface-variant mt-0.5 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">tag</span>
                            <span>Bill No: <span className="text-on-surface font-bold">{req.billNumber}</span></span>
                          </p>
                        )}
                      </div>
                      
                      {/* Highlighted Amount */}
                      <div className="text-right">
                        <span className="text-[9.5px] font-bold text-on-surface-variant uppercase block">
                          {t('Bill Amount')}
                        </span>
                        <p className="font-mono font-black text-[16px] text-on-surface">
                          ₹{req.amount?.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-1.5">
                      <p className="text-[11px] text-on-surface-variant">
                        {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} <span className="mx-1">•</span> <span className="font-bold text-primary">{req.paymentMethod === 'Cash' || req.requestType === 'cash_claim' || !req.paymentMethod || String(req.paymentMethod).toLowerCase().includes('cash') ? t('Cash transaction') : t('Digital transaction')}</span>
                      </p>
                      <span className="text-[10.5px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-md border border-primary/20">
                        {t('Cashback')}: ₹{(req.amount * (cashbackRate / 100)).toFixed(2)}
                      </span>
                    </div>

                    {/* Highlighted OTP Container with Theme Color */}
                    {req.verificationCode && req.status === 'Pending' && (
                      <div className="mt-3 bg-gradient-to-r from-primary/[0.08] to-primary/[0.03] border border-primary/25 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div>
                          <span className="inline-block px-2 py-0.5 bg-primary text-white text-[9.5px] font-extrabold uppercase rounded-md tracking-wider">
                            {t('Customer OTP Code')}
                          </span>
                          <p className="text-[11.5px] font-semibold text-on-surface mt-1">{t('Tell code to customer')}</p>
                        </div>
                        <span className="text-[22px] font-mono font-black text-primary tracking-[0.25em] bg-white px-3.5 py-1.5 rounded-xl border border-primary/25 shadow-xs select-all">
                          {req.verificationCode}
                        </span>
                      </div>
                    )}

                    {req.billImageUrl && (
                      <div
                        onClick={() => setViewReceiptUrl(req.billImageUrl)}
                        className="mt-3 flex items-center justify-between bg-primary/[0.04] border border-primary/15 rounded-xl p-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center gap-1.5 text-on-surface">
                          <span className="material-symbols-outlined text-[15px] text-primary">receipt_long</span>
                          <span className="text-[11px] font-bold">View Attached Receipt</span>
                        </div>
                        <span className="material-symbols-outlined text-[16px] text-primary">visibility</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-3.5">
                      <button
                        disabled={isProcessing}
                        onClick={() => handleRequestAction(req._id, 'Reject')}
                        className="flex-1 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {t('Reject')}
                      </button>
                      <button
                        disabled={isProcessing}
                        onClick={() => handleRequestAction(req._id, 'Approve')}
                        className="flex-1 h-9 rounded-xl bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white font-bold text-[12px] active:scale-95 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {t('Approve')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h3 className="font-display text-[16px] font-bold text-on-surface">{t('Recent Activity')}</h3>

        <div className="space-y-2.5">
          {recentTransactions.map(tx => (
            <div key={tx.id} className="flex items-center justify-between bg-white p-3.5 sm:p-4 rounded-2xl border border-primary/10 shadow-[0_2px_8px_rgba(22,8,47,0.02)] hover:border-primary/25 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  tx.status === 'Approved'
                    ? 'bg-emerald-50 text-emerald-600'
                    : tx.status === 'Rejected'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-primary/10 text-primary'
                }`}>
                  <span className="material-symbols-outlined text-[19px]">
                    {tx.status === 'Approved' ? 'check_circle' : tx.status === 'Rejected' ? 'cancel' : 'pending'}
                  </span>
                </div>
                <div>
                  <h3 className="text-[13.5px] font-bold text-on-surface leading-tight">{tx.customer}</h3>
                  <p className="text-[11px] text-on-surface-variant">{tx.id} • {tx.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[15px] font-bold text-on-surface">{tx.amount}</p>
                <p className={`text-[10.5px] font-bold ${
                  tx.status === 'Approved' ? 'text-emerald-600' : 'text-on-surface-variant'
                }`}>{tx.status}</p>
              </div>
            </div>
          ))}
          {recentTransactions.length === 0 && (
            <div className="bg-white rounded-2xl border border-primary/10 p-6 text-center text-on-surface-variant text-xs">
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

            <div className="flex flex-col items-center pt-1">
              <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-800 mb-3">
                <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
              </div>
              <h3 className="font-display font-bold text-[18px] text-slate-900 text-center leading-tight">Counter QR Standee</h3>
              <p className="text-[12px] text-slate-500 text-center mt-1 mb-2.5 px-2">
                Scan & Pay via PhonePe, Paytm, GPay or ZeeBac
              </p>

              <div className="flex items-center gap-1.5 justify-center mb-4 flex-wrap">
                <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">UPI</span>
                <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">PhonePe</span>
                <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">Paytm</span>
                <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">GPay</span>
                <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 font-semibold">ZeeBac</span>
              </div>

              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 w-56 h-56 flex flex-col items-center justify-center shadow-inner mb-3 relative overflow-hidden">
                {qrImageUrl ? (
                  <img src={qrImageUrl} alt="Store QR" className="w-full h-full object-contain" />
                ) : qrLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-7 h-7 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
                    <span className="text-[11px] font-medium text-slate-500">Generating QR...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center p-2">
                    <span className="material-symbols-outlined text-rose-500 text-[24px]">error</span>
                    <span className="text-[11px] text-rose-600 font-medium">Failed to load QR</span>
                    <button
                      onClick={refreshQr}
                      className="px-3 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-slate-100 py-1 px-3 rounded-full flex items-center gap-2 mb-4">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Store ID:</span>
                <span className="text-[11.5px] font-mono font-bold text-slate-900">{zeebacId}</span>
              </div>

              <div className="flex gap-2 w-full">
                <button
                  onClick={() => qrImageUrl && downloadImage(qrImageUrl, `Zeebac_Counter_QR_${zeebacId}.png`)}
                  disabled={!qrImageUrl}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>Download</span>
                </button>
                <button
                  onClick={() => qrImageUrl && shareContent(qrImageUrl, `${currentUser?.storeName || 'ZeeBac Store'} QR`, `Pay at ${currentUser?.storeName || 'my store'} (${zeebacId}) to earn instant cashback!`)}
                  disabled={!qrImageUrl}
                  className="flex-1 py-2.5 px-3 bg-white hover:bg-primary/5 text-primary border border-primary/30 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[15px]">share</span>
                  <span>Share</span>
                </button>
              </div>
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
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
              </div>
              <div>
                <h3 className="font-display font-bold text-[16px] text-on-surface leading-tight">Cash Bill Barcode (&gt; ₹1,000)</h3>
                <p className="text-[10.5px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md inline-block mt-0.5">Instant Withdrawable Cashback</p>
              </div>
            </div>

            {!generatedPosBill ? (
              <div className="space-y-3.5 pt-1">
                <p className="text-[12px] text-on-surface-variant leading-snug">
                  Enter cash bill amount above ₹1,000 to generate a one-time barcode for the customer to scan for instant cashback.
                </p>

                <div>
                  <label className="text-[10.5px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Cash Bill Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={posAmount}
                    onChange={(e) => setPosAmount(e.target.value)}
                    placeholder="1500"
                    className="w-full h-11 px-3.5 bg-surface-container-low rounded-xl outline-none border border-primary/20 focus:border-primary text-[17px] font-black text-on-surface"
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
                          ? 'bg-primary text-white shadow-xs'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      ₹{val.toLocaleString()}
                    </button>
                  ))}
                </div>

                <div className="bg-primary/[0.04] border border-primary/15 rounded-xl p-2.5 text-[11.5px] text-on-surface flex justify-between items-center">
                  <span>Customer Cashback ({cashbackRate}%):</span>
                  <span className="font-black text-primary text-[13px]">
                    ₹{((parseFloat(posAmount) || 0) * (cashbackRate / 100)).toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={handleGeneratePosBill}
                  disabled={isGeneratingPos || !posAmount || parseFloat(posAmount) <= 0}
                  className="w-full h-11 bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white font-bold text-[13px] rounded-xl shadow-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingPos ? 'Generating Barcode...' : 'Generate Cash QR Barcode'}
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-3">
                <div className="bg-white border border-dashed border-slate-300 rounded-xl p-3.5 shadow-xs flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">ONE-TIME CASH QR</span>
                  <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full mb-2">⚡ Instant Withdrawable</span>
                  
                  {/* Scannable Visual QR Code Image */}
                  <div className="w-40 h-40 bg-white border border-slate-200 rounded-xl p-2 shadow-inner flex items-center justify-center mb-2">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${generatedPosBill.billCode}`}
                      alt="Printed Bill QR Code"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="text-[16px] font-bold tracking-widest text-slate-900 bg-slate-100 py-1.5 px-3 rounded-lg my-1 select-all w-full font-mono">
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
                  className="text-[12px] font-semibold text-slate-800 hover:underline cursor-pointer"
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

      {/* Sales & Collections Analytics Modal */}
      <SalesAnalyticsModal
        isOpen={showSalesModal}
        onClose={() => setShowSalesModal(false)}
        initialData={dashboardData?.data}
        storeName={currentUser?.storeName || 'Vendor Store'}
      />

    </div>
  );
}
