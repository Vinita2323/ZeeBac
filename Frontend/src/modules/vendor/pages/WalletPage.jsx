import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, OrderAPI } from '../../../services/api';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import useLanguageStore from '../../../store/useLanguageStore';

export default function WalletPage() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const globalBalance = useAuthStore((state) => state.walletBalance);
  const updateBalance = useAuthStore((state) => state.updateBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};

  const [wallet, setWallet] = useState(null);
  const [totalCashbackGiven, setTotalCashbackGiven] = useState(0);
  const [savedUpiId, setSavedUpiId] = useState('');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [showClaimSuccessModal, setShowClaimSuccessModal] = useState(false);

  // Form states
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [claimPoints, setClaimPoints] = useState('');
  const [claimUpiId, setClaimUpiId] = useState('');
  const [newUpiInput, setNewUpiInput] = useState('');
  const [claimReceipt, setClaimReceipt] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [upiError, setUpiError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Direct UPI Intent Purchase State
  const [upiPurchaseData, setUpiPurchaseData] = useState(null);
  const [purchaseUtr, setPurchaseUtr] = useState('');
  const [isVerifyingUtr, setIsVerifyingUtr] = useState(false);
  const [copyVpaSuccess, setCopyVpaSuccess] = useState(false);

  const [smartSettlement, setSmartSettlement] = useState(null);

  const fetchWallet = async () => {
    try {
      const res = await VendorAPI.getWallet();
      if (res.success && res.data) {
        setWallet(res.data.wallet);
        const upi = res.data.upiId || res.data.bankDetails?.upiId || '';
        setSavedUpiId(upi);
        setClaimUpiId(upi);
        if (res.data.smartSettlement) {
          setSmartSettlement(res.data.smartSettlement);
        }
        updateBalance(res.data.wallet.balance);

        const formattedLedger = (res.data.ledger || []).map((act) => ({
          id: act._id,
          title: act.description || act.category,
          type: act.type,
          amount: `${act.type === 'credit' ? '+' : '-'}${Number(act.amount || 0).toLocaleString()} Pts`,
          status: 'Completed',
          date: new Date(act.timestamp || act.createdAt).toLocaleDateString(),
          utr: act.adminTransactionId || null,
        }));
        setActivities(formattedLedger);
      }
    } catch (err) {
      console.error('Failed to fetch wallet', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const totalPoints = wallet ? (wallet.balance || 0) : (globalBalance || 0);
  const redeemedPoints = wallet?.redeemedPoints || 0;
  const purchasedPoints = wallet?.purchasedPoints !== undefined
    ? wallet.purchasedPoints
    : Math.max(0, totalPoints - redeemedPoints);

  // ─── PURCHASE ZEEBAC POINTS VIA DIRECT UPI INTENT ───
  const handleGeneratePurchaseIntent = async () => {
    const pts = Number(purchaseAmount);
    if (!pts || pts <= 0) return;
    setIsProcessing(true);

    try {
      const res = await OrderAPI.createVendorCashbackReserveUpiIntent(pts);
      if (!res.success) {
        alert(res.message || 'Failed to generate UPI payment intent');
        return;
      }
      setUpiPurchaseData(res.data);
      setPurchaseUtr('');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Error generating UPI payment intent');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyPurchaseUtr = async () => {
    const cleanUtr = (purchaseUtr || '').trim();
    if (!cleanUtr || cleanUtr.length !== 12 || !/^\d{12}$/.test(cleanUtr)) {
      alert('Please enter a valid 12-digit UPI Reference ID (UTR)');
      return;
    }

    setIsVerifyingUtr(true);
    try {
      const res = await OrderAPI.claimVendorCashbackReserveUpi(cleanUtr, upiPurchaseData.amount);
      if (res.success) {
        setShowPurchaseModal(false);
        setUpiPurchaseData(null);
        setPurchaseAmount('');
        setPurchaseUtr('');
        setActionSuccess(`🎉 ${upiPurchaseData.amount} Zeebac Points purchased and added to your wallet!`);
        setTimeout(() => setActionSuccess(''), 6000);
        await fetchWallet();
      } else {
        alert(res.message || 'Verification failed. Please re-check UTR.');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to verify UTR. Check if already used.');
    } finally {
      setIsVerifyingUtr(false);
    }
  };

  // ─── CLAIM PURCHASED POINTS TO UPI ───
  const handleClaimPoints = async (e) => {
    if (e) e.preventDefault();
    const pts = Number(claimPoints);
    if (!pts || pts <= 0) {
      alert('Please enter valid points to claim');
      return;
    }

    if (pts > purchasedPoints) {
      alert(`Aap maximum ${purchasedPoints} purchased points hi claim kar sakte hain. Customer redeemed points claim nahi kiye ja sakte.`);
      return;
    }

    const upiTarget = (claimUpiId || savedUpiId || '').trim();
    if (!upiTarget || !upiTarget.includes('@')) {
      alert('Please enter a valid UPI ID (e.g. yourname@upi) to claim points.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await VendorAPI.requestWithdrawal(pts, upiTarget);
      if (res.success) {
        setClaimReceipt({
          points: pts,
          upiId: upiTarget,
          netPayout: pts,
          referenceId: res.data?._id || `CLM-${Date.now()}`,
          createdAt: new Date(),
        });
        setSavedUpiId(upiTarget);
        setShowClaimModal(false);
        setClaimPoints('');
        setShowClaimSuccessModal(true);
        await fetchWallet();
      } else {
        alert(res.message || 'Failed to claim points');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Error processing points claim');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── QUICK UPDATE UPI ID ───
  const handleSaveUpiId = async (e) => {
    e.preventDefault();
    const cleanUpi = (newUpiInput || '').trim();
    if (!cleanUpi || !cleanUpi.includes('@')) {
      setUpiError('Please enter a valid UPI ID (e.g. mobile@upi or name@bank)');
      return;
    }

    setIsProcessing(true);
    setUpiError('');
    try {
      const res = await VendorAPI.updateUpiId(cleanUpi);
      if (res.success) {
        setSavedUpiId(cleanUpi);
        setClaimUpiId(cleanUpi);
        setShowUpiModal(false);
        setActionSuccess(`🎉 Payout UPI ID updated to ${cleanUpi}`);
        setTimeout(() => setActionSuccess(''), 5000);
      } else {
        setUpiError(res.message || 'Failed to update UPI ID');
      }
    } catch (err) {
      setUpiError(err.response?.data?.message || 'Error updating UPI ID');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="animate-reveal text-left pb-20">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-xs mb-3 sm:mb-4">
          <button
            onClick={() => safeNavigateBack(navigate, '/vendor')}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Zeebac Points Wallet</span>
        </header>

        {/* Success Alert Banner */}
        {actionSuccess && (
          <div className="p-4 mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 animate-reveal">
            <span className="material-symbols-outlined text-emerald-600 text-[24px]">verified</span>
            <div className="flex-1 text-[13.5px] font-semibold">{actionSuccess}</div>
          </div>
        )}

        <div className="space-y-6 pt-2 pb-6">
          {/* Main Top Cards Section */}
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            {/* Balance Card — Points Wallet (Points Only, No Rupees!) */}
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-md bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] min-h-[190px] flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-xl -mb-10 -ml-10 pointer-events-none" />

                {/* Card Header */}
                <div className="relative z-10 flex justify-between items-start">
                  <div className="flex items-center gap-1.5 opacity-90">
                    <span className="material-symbols-outlined text-[16px]">stars</span>
                    <span className="text-[11px] font-bold tracking-wider uppercase">ZEEBAC POINTS WALLET</span>
                  </div>
                  <span className="material-symbols-outlined text-[18px] opacity-60">shield_lock</span>
                </div>

                {/* Points Balance Amount */}
                <div className="relative z-10 my-2">
                  <p className="text-[11px] uppercase tracking-wider text-purple-200 font-bold">Total Zeebac Points</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <h2 className="text-[34px] font-display font-black leading-none tracking-tight">
                      {loading ? '...' : Math.floor(totalPoints).toLocaleString('en-IN')}
                    </h2>
                    <span className="text-sm font-extrabold text-purple-200 uppercase tracking-wider">Points</span>
                  </div>
                  <p className="text-[10px] text-purple-200/90 mt-1">
                    Purchased points customer shopping cashback ke liye use hote hain aur merchant unhe kabhi bhi UPI par claim kar sakta hai.
                  </p>
                </div>

                {/* Points Breakdown: Purchased (Claimable) vs Redeemed (Non-claimable) */}
                <div className="relative z-10 mt-1 pt-2 border-t border-white/15 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur-xs">
                    <p className="text-[9.5px] uppercase tracking-wider text-emerald-300 font-black flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Purchased (Claimable)
                    </p>
                    <p className="text-[14px] font-mono font-black text-white mt-0.5">
                      {Math.floor(purchasedPoints).toLocaleString('en-IN')} Pts
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-xl px-2.5 py-1.5 backdrop-blur-xs">
                    <p className="text-[9.5px] uppercase tracking-wider text-amber-300 font-black flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Redeemed (Non-claimable)
                    </p>
                    <p className="text-[14px] font-mono font-black text-white mt-0.5">
                      {Math.floor(redeemedPoints).toLocaleString('en-IN')} Pts
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="relative z-10 flex justify-between items-end opacity-80 pt-1 text-[10px]">
                  <div className="tracking-wider font-mono">UPI: {savedUpiId || 'Not set'}</div>
                  <div className="font-bold uppercase tracking-wider">{currentUser?.storeName || 'Vendor Store'}</div>
                </div>
              </div>

              {/* Quick Actions: Purchase Points | Claim Points | Passbook */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  onClick={() => {
                    setPurchaseAmount('');
                    setUpiPurchaseData(null);
                    setShowPurchaseModal(true);
                  }}
                  className="py-2.5 px-1 sm:px-2 bg-primary text-white rounded-xl font-bold active:scale-[0.97] transition-all shadow-md shadow-primary/20 flex flex-col items-center justify-center gap-0.5 text-[10.5px] sm:text-[11px] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                  Purchase Points
                </button>

                <button
                  onClick={() => {
                    setClaimPoints('');
                    setClaimUpiId(savedUpiId);
                    setShowClaimModal(true);
                  }}
                  className="py-2.5 px-1 sm:px-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-xs hover:bg-purple-50/50 flex flex-col items-center justify-center gap-0.5 text-[10.5px] sm:text-[11px] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                  Claim Points
                </button>

                <button
                  onClick={() => navigate('/vendor/passbook')}
                  className="py-2.5 px-1 sm:px-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-xs hover:bg-purple-50/50 flex flex-col items-center justify-center gap-0.5 text-[10.5px] sm:text-[11px] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  {t('Passbook')}
                </button>
              </div>
            </div>

            {/* Payout UPI ID Card (No traditional bank account details) */}
            <div className="bg-white rounded-3xl p-5 border border-outline-variant/15 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-gray-900">Payout UPI ID</h4>
                      <p className="text-[11px] text-gray-500">Purchased points direct aapki UPI ID par claim hote hain</p>
                    </div>
                  </div>
                  {savedUpiId ? (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      Active
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      Not Linked
                    </span>
                  )}
                </div>

                {savedUpiId ? (
                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 text-[12.5px]">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Claim Mode:</span>
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">bolt</span>
                        Instant UPI Transfer
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Registered UPI ID:</span>
                      <span className="font-mono font-black text-purple-800 text-[14px]">
                        {savedUpiId}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-gray-200/60 text-[11px] text-gray-500 space-y-0.5">
                      <p className="text-emerald-700 font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">verified</span>
                        Claimable Purchased Points: {Math.floor(purchasedPoints).toLocaleString('en-IN')} Pts
                      </p>
                      <p className="text-amber-700 font-medium">
                        • Customer redeemed points ({Math.floor(redeemedPoints).toLocaleString('en-IN')} Pts) claim nahi ho sakte.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-5 px-3 bg-purple-50/50 rounded-2xl border border-dashed border-purple-200 text-center space-y-1">
                    <p className="text-[13px] font-bold text-purple-900">No UPI ID Linked</p>
                    <p className="text-[11.5px] text-gray-500 max-w-[280px] mx-auto">
                      Points claim karne ke liye apni UPI ID (e.g. mobile@upi ya name@bank) yahan add karein.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewUpiInput(savedUpiId || '');
                  setUpiError('');
                  setShowUpiModal(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[13px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {savedUpiId ? 'edit' : 'add_circle'}
                </span>
                <span>{savedUpiId ? 'Change Payout UPI ID' : 'Add Payout UPI ID'}</span>
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ─── ZEEBAC SMART CASHBACK & SETTLEMENT SYSTEM LEDGER ───────── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-3xl p-5 border border-purple-200/80 shadow-md shadow-purple-900/5 max-w-4xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-700 to-indigo-800 text-white flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">swap_horizontal_circle</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-black text-[16px] text-slate-900">Smart Cashback & Settlement Ledger</h3>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Automatic</span>
                  </div>
                  <p className="text-[11.5px] text-slate-500">
                    Redemption Capacity = Issued + ₹1,000 Additional Limit • Net Balance = Issued - Redeemed
                  </p>
                </div>
              </div>

              {/* Settlement Status Pill */}
              <div>
                {smartSettlement?.settlementStatus === 'MERCHANT_OWES_ZEEBAC' ? (
                  <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Merchant owes Zeebac: ₹{smartSettlement.netSettlementBalance}</span>
                  </span>
                ) : smartSettlement?.settlementStatus === 'ZEEBAC_OWES_MERCHANT' ? (
                  <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Zeebac owes Merchant: ₹{Math.abs(smartSettlement.netSettlementBalance)}</span>
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Settled / No Dues</span>
                  </span>
                )}
              </div>
            </div>

            {/* 4 Core Settlement Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* 1. Cashback Issued */}
              <div className="bg-purple-50/60 rounded-2xl p-3.5 border border-purple-100">
                <div className="flex items-center justify-between text-purple-900 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Cashback Issued</span>
                  <span className="material-symbols-outlined text-[17px] text-purple-700">send_money</span>
                </div>
                <p className="text-[20px] font-black font-mono text-purple-950">
                  {(smartSettlement?.cashbackIssued || 0).toLocaleString('en-IN')} Pts
                </p>
                <p className="text-[10px] text-purple-700/80 mt-0.5">Given to customers on shopping</p>
              </div>

              {/* 2. Cashback Redeemed */}
              <div className="bg-indigo-50/60 rounded-2xl p-3.5 border border-indigo-100">
                <div className="flex items-center justify-between text-indigo-900 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Cashback Redeemed</span>
                  <span className="material-symbols-outlined text-[17px] text-indigo-700">shopping_bag</span>
                </div>
                <p className="text-[20px] font-black font-mono text-indigo-950">
                  {(smartSettlement?.cashbackRedeemed || 0).toLocaleString('en-IN')} Pts
                </p>
                <p className="text-[10px] text-indigo-700/80 mt-0.5">Points used at your store</p>
              </div>

              {/* 3. Total Redemption Capacity */}
              <div className="bg-emerald-50/60 rounded-2xl p-3.5 border border-emerald-100">
                <div className="flex items-center justify-between text-emerald-900 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Total Capacity</span>
                  <span className="material-symbols-outlined text-[17px] text-emerald-700">verified</span>
                </div>
                <p className="text-[20px] font-black font-mono text-emerald-950">
                  {(smartSettlement?.totalCapacity || 1000).toLocaleString('en-IN')} Pts
                </p>
                <p className="text-[10px] text-emerald-700/80 mt-0.5">Issued + 1,000 Admin Limit</p>
              </div>

              {/* 4. Remaining Capacity */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200">
                <div className="flex items-center justify-between text-slate-800 mb-1">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Remaining Limit</span>
                  <span className="material-symbols-outlined text-[17px] text-slate-600">lock_open</span>
                </div>
                <p className="text-[20px] font-black font-mono text-slate-900">
                  {(smartSettlement?.remainingCapacity || 0).toLocaleString('en-IN')} Pts
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Customer can redeem till 0</p>
              </div>
            </div>

            {/* View Date-wise Cashback History & Details Link */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-[11.5px] text-slate-500 font-medium">Detailed date-wise breakdown of issued & redeemed cashback</span>
              <button
                type="button"
                onClick={() => navigate('/vendor/passbook?tab=cashback')}
                className="text-[12px] font-bold text-primary hover:text-purple-800 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>View Date-Wise Cashback History & Filters</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* Wallet Activity */}
          <div className="space-y-3 max-w-4xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[18px] font-extrabold text-on-surface">Recent Points Activity</h3>
              <button onClick={() => navigate('/vendor/passbook')} className="text-[14px] text-primary font-medium hover:underline cursor-pointer">
                {t('See All')}
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
              {loading ? (
                <div className="py-6 text-center text-on-surface-variant">Loading...</div>
              ) : activities.length === 0 ? (
                <div className="py-6 text-center text-on-surface-variant text-[13px]">No points activity yet.</div>
              ) : (
                activities.map((act, index) => (
                  <div
                    key={act.id}
                    className={`p-3 flex items-center justify-between active:bg-surface-container-low/50 transition-colors ${
                      index !== activities.length - 1 ? 'border-b border-outline-variant/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          act.type === 'credit'
                            ? 'bg-green-50'
                            : 'bg-red-50'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[20px] ${
                            act.type === 'credit'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {act.type === 'credit' ? 'arrow_downward' : 'arrow_upward'}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-[13px] text-on-surface">{act.title}</p>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">{act.date}</p>
                        {act.utr && (
                          <p className="text-[11px] font-bold text-primary/70 bg-primary/5 px-2 py-0.5 rounded-md inline-block mt-0.5">
                            Ref: {act.utr}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-black text-[14px] ${act.type === 'credit' ? 'text-green-600' : 'text-on-surface'}`}>
                        {act.amount}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-outline mt-0.5">{act.status}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 1. PURCHASE ZEEBAC POINTS MODAL (DIRECT UPI INTENT) ─── */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!isProcessing && !isVerifyingUtr) { setShowPurchaseModal(false); setUpiPurchaseData(null); } }} />
          <div className="relative bg-white w-full max-w-[420px] rounded-3xl p-4 sm:p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90dvh] overflow-y-auto text-left">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-display text-[18px] font-black text-on-surface">Purchase Zeebac Points</h3>
                <p className="text-[11px] text-gray-500">1 Point = ₹1 • Instant Activation via Direct UPI</p>
              </div>
              <button
                onClick={() => { if (!isProcessing && !isVerifyingUtr) { setShowPurchaseModal(false); setUpiPurchaseData(null); } }}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {!upiPurchaseData ? (
              <div className="space-y-4">
                <div className="bg-purple-50 p-3 rounded-2xl border border-purple-100 text-[11.5px] text-purple-900 leading-snug">
                  Purchased points aapke wallet me add honge jise aap customer shopping cashback ke liye use kar sakte hain ya kabhi bhi apni UPI ID par claim kar sakte hain.
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Enter Points to Purchase</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={purchaseAmount}
                      onChange={(e) => setPurchaseAmount(e.target.value)}
                      placeholder="0"
                      min="1"
                      disabled={isProcessing}
                      className="w-full px-4 py-3 bg-surface-container-low border-2 border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all text-[24px] font-black text-primary placeholder-primary/30 disabled:opacity-50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-100 px-2 py-1 rounded-md">
                      Points
                    </span>
                  </div>
                  {Number(purchaseAmount) > 0 && (
                    <p className="text-[11.5px] text-emerald-700 font-bold">
                      Payable Amount: ₹{Number(purchaseAmount).toLocaleString('en-IN')} (1 Point = ₹1.00)
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Quick Select</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[500, 1000, 2500, 5000].map((pts) => (
                      <button
                        key={pts}
                        onClick={() => setPurchaseAmount(String(pts))}
                        className="py-2 rounded-xl border border-outline-variant/20 hover:border-primary hover:bg-primary/5 font-bold text-[12px] text-on-surface transition-colors cursor-pointer"
                      >
                        +{pts} Pts
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGeneratePurchaseIntent}
                  disabled={!purchaseAmount || Number(purchaseAmount) <= 0 || isProcessing}
                  className={`w-full py-3.5 rounded-xl font-bold text-[14px] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    purchaseAmount && !isProcessing
                      ? 'bg-primary text-white shadow-lg shadow-primary/30 active:scale-[0.98]'
                      : 'bg-surface-container-high text-on-surface-variant/50'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating Direct UPI Intent...</span>
                    </>
                  ) : (
                    <>Pay ₹{purchaseAmount || '0'} for {purchaseAmount || '0'} Points</>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-purple-50 p-3 rounded-2xl text-center border border-purple-100">
                  <p className="text-[10.5px] uppercase tracking-wider font-extrabold text-purple-900">Purchase Amount</p>
                  <p className="font-display font-black text-[24px] text-primary">₹{upiPurchaseData.amount} ({upiPurchaseData.amount} Points)</p>
                  <p className="text-[11px] text-slate-600">To: {upiPurchaseData.payeeName}</p>
                </div>

                {/* Direct App Button */}
                <a
                  href={upiPurchaseData.upiUri}
                  className="w-full py-3 px-4 rounded-xl btn-primary-gradient text-white font-bold text-[13px] flex items-center justify-center gap-2 shadow-md shadow-primary/25 text-center cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
                </a>

                {/* 12-digit UTR submit */}
                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                  <label className="text-[11px] font-bold text-gray-800">Enter 12-digit UPI Reference ID (UTR):</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={12}
                      value={purchaseUtr}
                      onChange={(e) => setPurchaseUtr(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 523412349876"
                      className="flex-1 h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-[12px] text-gray-900 focus:bg-white outline-none"
                    />
                    <button
                      onClick={handleVerifyPurchaseUtr}
                      disabled={isVerifyingUtr || purchaseUtr.length !== 12}
                      className="px-4 h-10 rounded-xl btn-primary-gradient text-white font-bold text-[12px] shrink-0 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isVerifyingUtr ? 'Verifying...' : 'Verify & Credit'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 2. CLAIM PURCHASED POINTS TO UPI MODAL ─── */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && setShowClaimModal(false)} />
          <div className="relative bg-white w-full max-w-[420px] rounded-3xl p-4 sm:p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90dvh] overflow-y-auto text-left">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-display text-[18px] font-black text-on-surface">Claim Zeebac Points</h3>
                <p className="text-[11px] text-gray-500">Direct UPI Transfer • 1 Point = ₹1</p>
              </div>
              <button
                onClick={() => !isProcessing && setShowClaimModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleClaimPoints} className="space-y-4">
              {/* Points Eligibility Notice */}
              <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-emerald-900">Claimable Purchased Points:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">{Math.floor(purchasedPoints)} Points</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-medium text-slate-500">Customer Redeemed Points:</span>
                  <span className="font-mono font-bold text-slate-600">{Math.floor(redeemedPoints)} Points</span>
                </div>
                <p className="text-[10px] text-emerald-800 font-medium pt-1 border-t border-emerald-200/60 leading-snug">
                  ⚠️ Note: Sirf aapke dwara purchase kiye gaye points hi UPI par claim honge. Customers dwara redeem kiye gaye points claim nahi honge.
                </p>
              </div>

              {/* Destination UPI ID Field */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                  Transfer to UPI ID:
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-purple-700 material-symbols-outlined text-[18px]">
                    account_balance_wallet
                  </span>
                  <input
                    type="text"
                    required
                    value={claimUpiId}
                    onChange={(e) => setClaimUpiId(e.target.value.trim())}
                    placeholder="e.g. mobile@upi or name@okaxis"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 focus:bg-white outline-none"
                  />
                </div>
              </div>

              {/* Points to Claim */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <label className="font-bold text-gray-700 uppercase tracking-wider">Points to Claim:</label>
                  {purchasedPoints > 0 && (
                    <button
                      type="button"
                      onClick={() => setClaimPoints(String(Math.floor(purchasedPoints)))}
                      className="text-purple-700 font-bold hover:underline cursor-pointer"
                    >
                      Claim All ({Math.floor(purchasedPoints)} Pts)
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={purchasedPoints}
                    required
                    value={claimPoints}
                    onChange={(e) => setClaimPoints(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-2xl text-[22px] font-black text-on-surface outline-none focus:border-primary focus:bg-white transition-all placeholder:text-outline-variant/30"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-100 px-2 py-1 rounded-md">
                    Points
                  </span>
                </div>

                {Number(claimPoints) > purchasedPoints && (
                  <p className="text-[11px] text-rose-600 font-bold">
                    ⚠️ Aap maximum {purchasedPoints} purchased points hi claim kar sakte hain. Customer redeemed points claim nahi ho sakte.
                  </p>
                )}

                {Number(claimPoints) > 0 && Number(claimPoints) <= purchasedPoints && (
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[12px] flex justify-between items-center">
                    <span className="text-slate-600 font-medium">Net UPI Payout:</span>
                    <span className="font-mono font-black text-emerald-600 text-sm">
                      ₹{Number(claimPoints).toLocaleString('en-IN')}.00
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!claimPoints || Number(claimPoints) <= 0 || Number(claimPoints) > purchasedPoints || !claimUpiId || isProcessing}
                className="w-full py-3.5 rounded-xl font-bold text-[14px] bg-primary text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Claim...</span>
                  </>
                ) : (
                  <>Claim {claimPoints || '0'} Points to UPI</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── 3. CLAIM SUCCESS RECEIPT MODAL ─── */}
      {showClaimSuccessModal && claimReceipt && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowClaimSuccessModal(false)} />
          <div className="relative bg-white w-full max-w-[420px] rounded-3xl p-6 shadow-2xl z-10 flex flex-col items-center text-center space-y-4 animate-slideUp">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>

            <div>
              <h3 className="font-display text-[22px] font-black text-gray-900 leading-tight">
                Points Claim Submitted!
              </h3>
              <p className="text-[12.5px] text-gray-500 mt-1">
                Aapke {claimReceipt.points} Zeebac Points direct aapki UPI ID par transfer kar diye gaye hain.
              </p>
            </div>

            {/* Receipt Card */}
            <div className="w-full bg-[#fcfaff] border border-purple-100 rounded-2xl p-4 text-left space-y-2.5 text-[12.5px]">
              <div className="flex justify-between items-center pb-2 border-b border-purple-100 text-[11px] font-bold text-gray-400 uppercase">
                <span>Receipt Ref</span>
                <span className="font-mono text-purple-700">{claimReceipt.referenceId?.toString().slice(-8)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Points Claimed:</span>
                <span className="font-bold text-gray-900 font-mono">{claimReceipt.points} Points</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Payout Mode:</span>
                <span className="font-bold text-purple-700">Instant UPI Transfer</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Destination UPI:</span>
                <span className="font-mono font-bold text-gray-900">{claimReceipt.upiId}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                <span className="font-black text-gray-900 text-sm">Net Transfer Amount:</span>
                <span className="font-black font-mono text-[18px] text-emerald-600">₹{claimReceipt.netPayout}.00</span>
              </div>
            </div>

            <button
              onClick={() => setShowClaimSuccessModal(false)}
              className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl text-[14px] transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              Done & Return to Wallet
            </button>
          </div>
        </div>
      )}

      {/* ─── 4. EDIT / ADD PAYOUT UPI ID MODAL ─── */}
      {showUpiModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && setShowUpiModal(false)} />
          <div className="relative bg-white w-full max-w-[400px] rounded-3xl p-5 shadow-2xl z-10 flex flex-col animate-slideUp text-left space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
                </div>
                <h3 className="font-display text-[16px] font-black text-gray-900">
                  {savedUpiId ? 'Update Payout UPI ID' : 'Add Payout UPI ID'}
                </h3>
              </div>
              <button
                onClick={() => !isProcessing && setShowUpiModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {upiError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[12px] font-medium">
                {upiError}
              </div>
            )}

            <form onSubmit={handleSaveUpiId} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                  Enter Your UPI ID:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newUpiInput}
                  onChange={(e) => setNewUpiInput(e.target.value.trim())}
                  placeholder="e.g. 9876543210@upi or name@okaxis"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 focus:bg-white outline-none"
                />
                <p className="text-[10.5px] text-gray-400 mt-1">
                  Jab aap Zeebac points claim karenge, paise direct isi UPI ID par credit honge.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpiModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !newUpiInput.trim() || !newUpiInput.includes('@')}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold text-xs shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? 'Saving...' : 'Save UPI ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
