import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNavigateBack, useBackableSubview } from '../../../utils/navigationUtils';
import { UserAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';
import { verifyBiometricCredential } from '../../../utils/biometric.util';
import LoanComingSoonModal from '../components/LoanComingSoonModal';
import useLanguageStore from '../../../store/useLanguageStore';
import FourDigitPinInput from '../../../components/common/FourDigitPinInput';
import QRCode from 'qrcode';

export default function WalletScreen() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const location = useLocation();
  const authBalance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  
  const [balance, setBalance] = useState(0);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subView, setSubView] = useState(location.state?.subView || null); // 'cashout' | 'perks' | 'recharge' | 'addFunds'
  const [withdrawals, setWithdrawals] = useState([]);
  const [pendingCashRequest, setPendingCashRequest] = useState(null);
  const [showUtrModal, setShowUtrModal] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState('');
  const [isClaimingUtr, setIsClaimingUtr] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);

  useEffect(() => {
    if (location.state?.subView) {
      setSubView(location.state.subView);
    }
  }, [location.state]);

  // Make the browser/hardware back button close an open subview one step at
  // a time instead of jumping straight past Wallet to the previous route.
  useBackableSubview(subView, setSubView);


  // Fetch real wallet and activities
  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await UserAPI.getMyWallet();
        if (res.success) {
          const realBalance = res.data.wallet?.balance || 0;
          const realLocked = res.data.lockedBalance || 0;
          const realWithdrawable = res.data.withdrawableBalance !== undefined ? res.data.withdrawableBalance : Math.max(0, realBalance - realLocked);
          useAuthStore.getState().updateBalance(realBalance);
          setBalance(realBalance);
          setLockedBalance(realLocked);
          setWithdrawableBalance(realWithdrawable);

          // Animate balance
          let start = Math.max(0, realBalance - 100);
          const duration = 1200;
          const stepTime = 30;
          const steps = duration / stepTime;
          const increment = (realBalance - start) / steps;
          
          let currentStep = 0;
          const timer = setInterval(() => {
            currentStep++;
            start += increment;
            if (currentStep >= steps) {
              clearInterval(timer);
              setBalance(realBalance);
            } else {
              setBalance(start);
            }
          }, stepTime);

          const formatted = (res.data.ledger || []).slice(0, 5).map(entry => ({
            id: entry._id,
            name: entry.description,
            time: new Date(entry.createdAt).toLocaleString(),
            amount: entry.type === 'credit' ? `+₹${entry.amount.toFixed(2)}` : `-₹${entry.amount.toFixed(2)}`,
            status: entry.type === 'credit' ? 'Credited' : 'Debited',
            icon: entry.type === 'credit' ? 'redeem' : 'payments',
            utr: entry.adminTransactionId || null,
          }));
          setActivities(formatted);
        }
      } catch (err) {
        console.error('Failed to load wallet', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWallet();

    UserAPI.getMyCashbackRequests().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        const pending = res.data.find(r => r.status === 'Pending' && (r.requestType === 'cash_claim' || r.paymentMethod === 'Cash'));
        setPendingCashRequest(pending || null);
      }
    }).catch(() => {});

    if (subView === 'cashout') {
      UserAPI.getUserWithdrawals().then(res => {
        if(res.success) setWithdrawals(res.data);
      }).catch(console.error);
    }
  }, [subView]);

  const handleClaimUtr = async () => {
    if (!utrInput.trim() || isClaimingUtr) return;
    setIsClaimingUtr(true);
    setUtrError('');
    try {
      const res = await UserAPI.claimUpiCashback(utrInput.trim());
      if (res.success) {
        useAuthStore.getState().updateBalance(res.data.newWalletBalance);
        setShowUtrModal(false);
        navigate('/transaction-success', {
          state: {
            vendorName: res.data.vendorName,
            amount: res.data.amount,
            cashback: res.data.cashbackEarned,
            transactionId: res.data.transactionId,
          }
        });
      }
    } catch (err) {
      setUtrError(err.response?.data?.message || err.message || 'No payment found matching this UPI UTR.');
    } finally {
      setIsClaimingUtr(false);
    }
  };

  if (subView === 'addFunds') {
    return (
      <AddFundsSubView
        balance={balance}
        currentUser={currentUser}
        onBack={() => window.history.back()}
        setBalance={setBalance}
        onSuccess={(newBal, newTx) => {
          setBalance(newBal);
          useAuthStore.getState().updateBalance(newBal);
          if (newTx) {
            setActivities(prev => [newTx, ...prev]);
          }
        }}
      />
    );
  }

  if (subView === 'recharge') {
    return (
      <RechargeSubView
        balance={balance}
        currentUser={currentUser}
        onBack={() => window.history.back()}
        setBalance={setBalance}
        onRechargeSuccess={(newBal, newTx) => {
          setBalance(newBal);
          useAuthStore.getState().updateBalance(newBal);
          if (newTx) {
            setActivities(prev => [newTx, ...prev]);
          }
        }}
      />
    );
  }

  if (subView === 'cashout') {
    return (
      <CashoutSubView 
        balance={balance} 
        lockedBalance={lockedBalance}
        withdrawableBalance={withdrawableBalance}
        currentUser={currentUser} 
        withdrawals={withdrawals}
        onBack={() => window.history.back()}
        setBalance={setBalance}
        setWithdrawableBalance={setWithdrawableBalance}
      />
    );
  }

  if (subView === 'perks') {
    return <PerksSubView balance={balance} activities={activities} onBack={() => window.history.back()} />;
  }
  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button 
              onClick={() => safeNavigateBack(navigate, '/home')}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-1">{t('Rewards Wallet')}</span>
          </div>
        </div>
      </header>

      {/* Main body content */}
      <main className="flex-grow app-container px-container-margin py-lg space-y-lg text-left">
        
        {/* Active Pending Cash OTP Banner */}
        {pendingCashRequest && (
          <div 
            onClick={() => navigate(`/request/${pendingCashRequest._id}`)}
            className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white rounded-2xl p-4 shadow-lg cursor-pointer active:scale-[0.99] transition-transform flex items-center justify-between gap-3 border border-purple-400/30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">pin</span>
              </div>
              <div className="min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full font-bold">
                    Pending Cash OTP
                  </span>
                  <span className="text-[11px] text-purple-200">30 min validity</span>
                </div>
                <p className="font-extrabold text-[14px] mt-0.5 truncate">
                  ₹{pendingCashRequest.amount} at {pendingCashRequest.vendorId?.storeName || pendingCashRequest.vendorName || 'Store'}
                </p>
                <p className="text-[11px] text-white/80">Tap to enter the 4-digit code told by shopkeeper (e.g. Z516)</p>
              </div>
            </div>
            <span className="bg-white text-purple-800 text-xs font-black px-3 py-2 rounded-xl shrink-0 shadow-sm flex items-center gap-1">
              <span>Enter OTP</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </span>
          </div>
        )}

        {/* Available rewards banner card */}
        <div className="bg-white border border-outline-variant/30 rounded-[2rem] p-lg shadow-md text-center space-y-md relative overflow-hidden">
          <div className="space-y-sm">
            <p className="font-caption text-[11px] text-on-surface-variant uppercase tracking-widest leading-none">{t('Total Cashback Reward')}</p>
            <h2 className="text-[44px] font-display font-black text-primary leading-none">₹{balance.toFixed(2)}</h2>
            {lockedBalance > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-[11px] font-bold">
                <span className="material-symbols-outlined text-[14px]">lock_clock</span>
                <span>₹{lockedBalance.toFixed(2)} {t('locked (24-hr)')} · {t('Withdrawable:')} ₹{withdrawableBalance.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Add Money Primary Button */}
          <div className="pt-0.5">
            <button
              onClick={() => setSubView('addFunds')}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-indigo-600 text-white font-bold text-[13px] flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span>{t('Add Money to Wallet')}</span>
              <span className="ml-auto text-[10px] bg-white/20 backdrop-blur-xs text-white px-2.5 py-0.5 rounded-full font-mono uppercase font-bold tracking-wider">0% Extra Charge</span>
            </button>
          </div>

          {/* Quick buttons (Add Money, Withdrawal, Perks, History) */}
          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-outline-variant/10">
            <button 
              onClick={() => setSubView('addFunds')}
              className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-85 active:scale-95 group"
            >
              <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-sm">
                <span className="material-symbols-outlined text-[20px]">add_card</span>
              </div>
              <span className="font-label-mono text-[10px] text-primary font-bold">{t('Add Fund')}</span>
            </button>
            <button 
              onClick={() => setSubView('cashout')}
              className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-85 active:scale-95 group"
            >
              <div className="w-11 h-11 bg-secondary/10 rounded-full flex items-center justify-center text-secondary group-hover:scale-105 transition-transform shadow-sm">
                <span className="material-symbols-outlined text-[20px]">account_balance</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant font-bold">{t('Withdrawal')}</span>
            </button>
            <button 
              onClick={() => setSubView('perks')}
              className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-85 active:scale-95 group"
            >
              <div className="w-11 h-11 bg-green-500/10 rounded-full flex items-center justify-center text-green-600 group-hover:scale-105 transition-transform shadow-sm">
                <span className="material-symbols-outlined text-[20px]">stars</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant font-bold">{t('Rewards')}</span>
            </button>
            <button 
              onClick={() => navigate('/passbook')}
              className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-85 active:scale-95 group"
            >
              <div className="w-11 h-11 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform shadow-sm">
                <span className="material-symbols-outlined text-[20px]">history</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant font-medium">{t('History')}</span>
            </button>
          </div>
        </div>

        {/* Cashback Requests History Link Banner */}
        <div 
          onClick={() => navigate('/profile', { state: { subView: 'audits' } })}
          className="bg-white border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">history_edu</span>
            </div>
            <div className="text-left">
              <p className="font-title-md text-on-surface font-extrabold text-body-sm leading-none">{t('Cashback Requests')}</p>
              <p className="font-caption text-[11px] text-on-surface-variant mt-1.5">{t('View status of submitted bills & receipts')}</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline text-body-lg">chevron_right</span>
        </div>

        {/* Recent rewards transaction list */}
        <div className="space-y-md">
          <h3 className="font-display text-title-md text-on-surface font-extrabold">{t('Recent Wallet Activity')}</h3>
          
          {activities.length === 0 ? (
            <div className="glass-card rounded-2xl py-8 px-4 flex flex-col items-center text-center gap-1.5">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-primary text-[24px]">receipt_long</span>
              </div>
              <p className="font-bold text-on-surface text-[13.5px]">{t('No activity yet')}</p>
              <p className="text-on-surface-variant text-[12px] max-w-[220px]">{t('Your cashback credits and cashouts will show up here')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-md">
              {activities.map((act) => (
                <div
                  key={act.id}
                  className="glass-card rounded-2xl p-sm border border-outline-variant/30 flex items-center gap-md"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    act.status === 'Credited' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                  }`}>
                    <span className="material-symbols-outlined">{act.icon}</span>
                  </div>
                  <div className="flex-grow text-left space-y-0.5">
                    <h4 className="font-title-md text-on-surface font-bold text-body-lg">{t(act.name)}</h4>
                    <p className="text-caption text-on-surface-variant text-[12px]">{act.time}</p>
                    {act.utr && (
                      <p className="text-[11px] font-bold text-primary/70 bg-primary/5 px-2 py-0.5 rounded-md inline-block mt-0.5">
                        UTR: {act.utr}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-black text-body-lg ${
                      act.status === 'Credited' ? 'text-green-600' : 'text-red-600'
                    }`}>{act.amount}</p>
                    <span className="text-[10px] uppercase font-semibold text-outline tracking-wider">{t(act.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* UTR Claim Modal */}
        {showUtrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-reveal">
            <div className="bg-white w-full max-w-[340px] rounded-3xl p-5 shadow-2xl relative text-left">
              <button
                onClick={() => setShowUtrModal(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>

              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[24px]">receipt_long</span>
              </div>

              <h3 className="font-display font-bold text-[18px] text-on-surface leading-tight">{t('Claim UPI Cashback')}</h3>
              <p className="text-[12px] text-on-surface-variant mt-1 mb-4 leading-relaxed">
                {t("If Google Pay or your UPI app didn't share your contact number, enter the 12-digit UPI Reference No. (UTR) from your payment receipt to claim your cashback!")}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    {t('12-Digit UPI Ref No. / UTR')}
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={utrInput}
                    onChange={(e) => { setUtrInput(e.target.value.trim()); setUtrError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleClaimUtr()}
                    placeholder="e.g. 425512345678"
                    className="w-full h-12 px-4 bg-[#f3f4f6] rounded-xl outline-none border-2 border-transparent focus:border-primary text-[15px] font-bold text-on-surface tracking-wider transition-all"
                  />
                </div>

                {utrError && (
                  <p className="text-red-500 text-[11px] font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {utrError}
                  </p>
                )}

                <button
                  onClick={handleClaimUtr}
                  disabled={!utrInput.trim() || isClaimingUtr}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClaimingUtr ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">redeem</span>
                      {t('Verify & Claim Cashback')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Loan Coming Soon Modal */}
      <LoanComingSoonModal
        isOpen={showLoanModal}
        onClose={() => setShowLoanModal(false)}
      />

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}

// ─── Phase A: Cashout SubView ───
function CashoutSubView({ 
  balance, 
  lockedBalance = 0, 
  withdrawableBalance = balance, 
  currentUser, 
  withdrawals, 
  onBack, 
  setBalance,
  setWithdrawableBalance
}) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null); // { success, isAuto, amount, message }
  const [errorMsg, setErrorMsg] = useState('');
  
  // Biometric & PIN Security States
  const isSecurityProtected = Boolean(currentUser?.security?.biometricEnabled || currentUser?.security?.hasPin);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [authMode, setAuthMode] = useState('biometric'); // 'biometric' | 'pin'
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [isVerifyingSecurity, setIsVerifyingSecurity] = useState(false);

  const bankDetails = currentUser?.bankDetails || {};
  const hasBank = !!bankDetails.accountNumber || !!bankDetails.upiId;
  const AUTO_LIMIT = 5000;

  const validateInput = () => {
    setErrorMsg('');
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount < 50) {
      setErrorMsg('Minimum withdrawal amount is ₹50');
      return false;
    }
    if (numAmount > withdrawableBalance) {
      if (lockedBalance > 0) {
        setErrorMsg(`₹${lockedBalance.toFixed(2)} is locked under 24-hour verification or vendor hold. Max available to withdraw is ₹${withdrawableBalance.toFixed(2)}`);
      } else {
        setErrorMsg('Insufficient withdrawable balance');
      }
      return false;
    }
    if (!hasBank) {
      setErrorMsg('Please link a bank account in Profile first');
      return false;
    }
    return true;
  };

  const executeWithdrawal = async () => {
    const numAmount = parseFloat(amount);
    setIsProcessing(true);
    try {
      const res = await UserAPI.requestWithdrawal(numAmount);
      if (res.success) {
        const isAuto = numAmount <= AUTO_LIMIT;
        setBalance(prev => Math.max(0, prev - numAmount));
        if (setWithdrawableBalance) {
          setWithdrawableBalance(prev => Math.max(0, prev - numAmount));
        }
        const grossAmount = numAmount;
        const withdrawalFixedFee = 5;
        const platformFeePercent = 2;
        const platformFeeAmount = Math.round(((grossAmount * platformFeePercent) / 100) * 100) / 100;
        const totalFee = res.data?.feeAmount ?? Math.round((withdrawalFixedFee + platformFeeAmount) * 100) / 100;
        const baseFee = Math.round((totalFee / 1.18) * 100) / 100;
        const gstAmount = res.data?.gstAmount ?? Math.round((totalFee - baseFee) * 100) / 100;
        const netPayout = res.data?.netPayout ?? Math.max(0, Math.round((grossAmount - totalFee) * 100) / 100);

        setResult({ 
          success: true, 
          isAuto, 
          amount: numAmount,
          grossAmount,
          withdrawalFee: res.data?.withdrawalFee ?? withdrawalFixedFee,
          platformFee: res.data?.platformFee ?? platformFeeAmount,
          feeAmount: totalFee,
          baseFee,
          gstAmount,
          netPayout,
          bankName: bankDetails?.bankName,
          accountNumber: bankDetails?.accountNumber,
          upiId: bankDetails?.upiId,
          referenceId: res.data?._id || `WTH-${Date.now()}`
        });
      } else {
        setErrorMsg(res.message || 'Something went wrong, please try again');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Server error, please try again');
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerBiometricPrompt = async () => {
    setIsVerifyingSecurity(true);
    setAuthError('');
    try {
      const bioRes = await verifyBiometricCredential(currentUser?.security?.biometricCredentialId);
      if (bioRes.success) {
        setShowSecurityModal(false);
        await executeWithdrawal();
      } else {
        setAuthError(bioRes.error || 'Biometric validation failed. Use your PIN.');
        setAuthMode('pin');
      }
    } catch (err) {
      setAuthError('Biometric verification failed. Please enter your PIN.');
      setAuthMode('pin');
    } finally {
      setIsVerifyingSecurity(false);
    }
  };

  const handleWithdrawClick = async () => {
    if (!validateInput()) return;

    if (isSecurityProtected) {
      setAuthPin('');
      setAuthError('');
      if (currentUser?.security?.biometricEnabled) {
        setAuthMode('biometric');
        setShowSecurityModal(true);
        // Call synchronously within the click handler — browsers (notably iOS
        // Safari) require WebAuthn prompts to fire within the user-activation
        // window, which a setTimeout callback falls outside of.
        triggerBiometricPrompt();
      } else {
        setAuthMode('pin');
        setShowSecurityModal(true);
      }
    } else {
      await executeWithdrawal();
    }
  };

  const handleVerifyPinAndWithdraw = async (e) => {
    e.preventDefault();
    if (!authPin.trim()) return;

    setIsVerifyingSecurity(true);
    setAuthError('');
    try {
      const res = await UserAPI.verifySecurityPin(authPin.trim());
      if (res.success) {
        setShowSecurityModal(false);
        await executeWithdrawal();
      } else {
        setAuthError(res.message || 'Incorrect PIN. Try again.');
      }
    } catch (err) {
      setAuthError(err.response?.data?.message || err.message || 'Incorrect Security PIN / Password.');
    } finally {
      setIsVerifyingSecurity(false);
    }
  };

  // ─── Success State ───
  if (result?.success) {
    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
        <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
          <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Cashout to Bank</span>
        </header>

        <main className="flex-grow flex items-center justify-center px-container-margin py-xl">
          <div className="w-full max-w-[360px] text-center space-y-6">
            {/* Success Icon */}
            <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center shadow-lg ${result.isAuto ? 'bg-green-500' : 'bg-orange-400'}`}>
              <span className="material-symbols-outlined text-white text-[52px]">
                {result.isAuto ? 'check_circle' : 'schedule'}
              </span>
            </div>

            {/* Title */}
            <div>
              <h2 className="font-display text-[22px] font-black text-on-surface">
                {result.isAuto ? '✅ Withdrawal Successful!' : '⏳ Request Submitted!'}
              </h2>
              <p className="text-on-surface-variant text-[13px] mt-1.5 leading-relaxed">
                {result.isAuto
                  ? `₹${(result.netPayout ?? result.amount).toFixed(2)} will be transferred to your bank account within 1-2 hours.`
                  : `Your request has been received. Withdrawals are verified by Admin and processed within 24-48 hours.`
                }
              </p>
            </div>

            {/* Itemized Receipt Card */}
            <div className="bg-white border border-outline-variant/30 rounded-2xl p-4 text-left space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                <span>Receipt Summary</span>
                <span className="font-mono text-purple-700">{result.referenceId ? String(result.referenceId).slice(-8) : 'PROCESSED'}</span>
              </div>

              <div className="space-y-1.5 text-[12.5px]">
                <div className="flex justify-between text-gray-600">
                  <span>Gross Cashout:</span>
                  <span className="font-bold text-gray-900 font-mono">₹{(result.grossAmount ?? result.amount).toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-gray-600">
                  <span>Withdrawal Fee:</span>
                  <span className="font-mono text-gray-800 font-semibold">₹{(result.withdrawalFee ?? 5).toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-gray-600">
                  <span>Platform Fee (2%):</span>
                  <span className="font-mono text-gray-800 font-semibold">₹{(result.platformFee ?? 0).toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-rose-600 font-semibold pt-1 border-t border-gray-100">
                  <span>Total Fee Deduction:</span>
                  <span className="font-mono">-₹{(result.feeAmount ?? 0).toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                  <span className="font-black text-gray-900 text-[13.5px]">Net Bank Transfer:</span>
                  <span className="font-black font-mono text-[19px] text-emerald-600">
                    ₹{(result.netPayout ?? result.amount).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Destination Account */}
              <div className="bg-purple-50/60 rounded-xl p-2.5 border border-purple-100/70 text-[11.5px] space-y-1 mt-2">
                <div className="flex items-center gap-1.5 text-purple-900 font-bold">
                  <span className="material-symbols-outlined text-[15px] text-purple-600">account_balance</span>
                  <span>Destination Account</span>
                </div>
                <div className="text-gray-600 pl-5">
                  <p className="font-semibold text-gray-800">{result.bankName || 'Verified Bank'}</p>
                  <p className="font-mono text-[11px] text-gray-500">
                    {result.accountNumber ? `A/C: •••• ${result.accountNumber.slice(-4)}` : result.upiId || 'Direct Bank Transfer'}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={onBack}
              className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Back to Wallet
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer">
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-1">Cashout to Bank</span>
          </div>
        </div>
      </header>

      <main className="flex-grow app-container px-container-margin py-xl space-y-lg text-left">
        {/* Balance Card */}
        <div className="bg-white border border-outline-variant/30 rounded-3xl p-lg shadow-sm text-center">
          <p className="font-label-mono text-[12px] text-on-surface-variant tracking-wider">AVAILABLE FOR CASHOUT</p>
          <h2 className="text-[40px] font-display font-black text-primary mt-2">₹{withdrawableBalance.toFixed(2)}</h2>
          {lockedBalance > 0 && (
            <p className="text-[12px] text-on-surface-variant font-medium pt-1">
              Total Wallet Balance: ₹{balance.toFixed(2)}
            </p>
          )}
        </div>

        {/* 24-hr Security Lock Banner */}
        {lockedBalance > 0 && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-left">
            <span className="material-symbols-outlined text-amber-700 text-[20px] mt-0.5 flex-shrink-0">lock_clock</span>
            <div>
              <p className="text-[12px] font-bold text-amber-900">
                ₹{lockedBalance.toFixed(2)} Under 24-Hour Security Lock
              </p>
              <p className="text-[11px] text-amber-800/90 mt-0.5 leading-snug">
                Cashback earned from cash requests is locked for 24 hours to prevent fraud or abuse. Once 24 hours elapse, it automatically becomes withdrawable.
              </p>
            </div>
          </div>
        )}

        {/* Admin Review Info Banner */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-3 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-orange-600 text-[18px] mt-0.5 flex-shrink-0">info</span>
          <div>
            <p className="text-[12px] font-bold text-orange-800">100% Secure Manual Processing</p>
            <p className="text-[11px] text-orange-700 mt-0.5">All withdrawals are reviewed by Admin (24-48 hrs)</p>
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-sm">
          <label className="font-label-mono text-body-sm tracking-wider text-on-surface-variant">CASHOUT AMOUNT</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-title-lg text-on-surface-variant font-bold">₹</span>
            <input 
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('.') && val.split('.')[1].length > 2) return;
                setAmount(val);
                setErrorMsg('');
              }}
              placeholder="0.00"
              className="w-full h-16 pl-10 pr-24 bg-white border border-outline-variant/30 rounded-2xl text-title-lg font-bold text-on-surface focus:outline-none focus:border-primary/50 shadow-inner"
            />
            <button 
              onClick={() => setAmount((Math.round(withdrawableBalance * 100) / 100).toFixed(2))}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary/10 text-primary text-label-sm font-bold rounded-lg active:scale-95 cursor-pointer"
            >
              MAX
            </button>
          </div>

          {/* Live Status Pill */}
          {amount && parseFloat(amount) >= 50 && (
            <div className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full w-fit bg-orange-100 text-orange-700">
              <span className="material-symbols-outlined text-[14px]">
                pending
              </span>
              Admin Review Required
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-red-500 text-[16px]">error</span>
              <p className="text-[12px] font-bold text-red-600">{errorMsg}</p>
            </div>
          )}

          <p className="text-[11px] text-on-surface-variant/80 ml-2">Min ₹50 · Auto-approve up to ₹5,000</p>

          {/* Live Fee & GST Breakdown Card */}
          {parseFloat(amount) > 0 && (() => {
            const numVal = parseFloat(amount);
            const withdrawalFixedFee = 5;
            const platformFeeAmount = Math.round(((numVal * 0.02)) * 100) / 100;
            const totalFee = Math.round((withdrawalFixedFee + platformFeeAmount) * 100) / 100;
            const netPayout = Math.max(0, Math.round((numVal - totalFee) * 100) / 100);

            return (
              <div className="bg-gradient-to-br from-purple-50/80 via-white to-indigo-50/80 border border-purple-200/80 rounded-2xl p-4 text-left space-y-2.5 shadow-sm mt-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider pb-1.5 border-b border-purple-100">
                  <span className="flex items-center gap-1 text-purple-900">
                    <span className="material-symbols-outlined text-[15px] text-purple-600">receipt_long</span>
                    Cashout Breakdown
                  </span>
                </div>

                <div className="flex justify-between text-[13px] text-gray-700">
                  <span>Requested Amount:</span>
                  <span className="font-bold text-gray-900 font-mono">₹{numVal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-[13px] text-gray-700">
                  <span>Withdrawal Fee:</span>
                  <span className="font-bold text-rose-600 font-mono">-₹{withdrawalFixedFee.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-[13px] text-gray-700">
                  <span>Platform Fee (2%):</span>
                  <span className="font-bold text-rose-600 font-mono">-₹{platformFeeAmount.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-[13px] text-rose-600 font-bold pt-1 border-t border-purple-100">
                  <span>Total Fee Deduction:</span>
                  <span className="font-mono font-bold">-₹{totalFee.toFixed(2)}</span>
                </div>

                <div className="pt-2 border-t border-purple-200 flex justify-between items-center">
                  <div>
                    <span className="text-[13px] font-black text-gray-900 block leading-tight">Net Bank Payout:</span>
                    <span className="text-[10.5px] text-emerald-600 font-bold">Credited to linked bank account</span>
                  </div>
                  <span className="font-display font-black text-[22px] text-emerald-600 font-mono">
                    ₹{netPayout.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Destination Account */}
        <div className="space-y-sm">
          <label className="font-label-mono text-body-sm tracking-wider text-on-surface-variant">DESTINATION ACCOUNT</label>
          {hasBank ? (
            <div className="bg-white border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed]">
                  <span className="material-symbols-outlined text-[20px]">account_balance</span>
                </div>
                <div>
                  <p className="font-bold text-body-md leading-tight">{bankDetails.bankName || 'Linked Bank'}</p>
                  <p className="font-label-mono text-[11px] text-on-surface-variant mt-1">
                    {bankDetails.accountNumber ? `•••• ${bankDetails.accountNumber.slice(-4)}` : bankDetails.upiId}
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-green-500">check_circle</span>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center space-y-2.5">
              <div>
                <p className="text-red-600 text-body-sm font-bold">No Bank Account Linked</p>
                <p className="text-[11px] text-red-500/80 mt-1">Link a bank account to receive your cashout.</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/profile', { state: { openLinkedAccounts: true } })}
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Add Bank Account
              </button>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button 
          onClick={handleWithdrawClick}
          disabled={!hasBank || isProcessing || !amount || parseFloat(amount) < 50 || parseFloat(amount) > withdrawableBalance}
          className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:active:scale-100 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Confirm Cashout
              <span className="material-symbols-outlined">arrow_forward</span>
            </>
          )}
        </button>

        {/* History */}
        {withdrawals.length > 0 && (
          <div className="pt-6 space-y-4">
            <h3 className="font-display text-title-md font-extrabold text-on-surface">Recent Cashouts</h3>
            <div className="space-y-3">
              {withdrawals.slice(0, 5).map(tx => (
                <div key={tx._id} className="bg-white p-3 rounded-xl border border-outline-variant/20 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.status === 'Success' ? 'bg-green-100 text-green-600' : tx.status === 'Pending' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}`}>
                      <span className="material-symbols-outlined text-[16px]">
                        {tx.status === 'Success' ? 'done' : tx.status === 'Pending' ? 'schedule' : 'close'}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-body-sm">Bank Transfer</p>
                      <p className="text-[10px] text-on-surface-variant">{new Date(tx.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-body-sm">₹{tx.amount.toFixed(2)}</p>
                    <p className={`text-[10px] font-bold ${tx.status === 'Success' ? 'text-green-600' : tx.status === 'Pending' ? 'text-orange-600' : 'text-red-600'}`}>
                      {tx.status === 'Success' ? '✅ Processed' : tx.status === 'Pending' ? '⏳ Pending' : '❌ Failed'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Verification Modal (Biometrics / PIN Fallback) */}
        {showSecurityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-reveal">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
              <div className="flex items-center justify-between pb-1 border-b border-outline-variant/10">
                <div className="flex items-center gap-2 text-left">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">
                      {authMode === 'biometric' ? 'fingerprint' : 'lock'}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-[15px] text-on-surface">Security Authorization</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSecurityModal(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              {/* Amount badge */}
              <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-2xl">
                <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Withdrawing</p>
                <p className="text-[26px] font-black text-primary">₹{parseFloat(amount || 0).toFixed(2)}</p>
                <p className="text-[10px] text-on-surface-variant font-medium">To {bankDetails.bankName || 'Linked Bank'}</p>
              </div>

              {authMode === 'biometric' ? (
                <div className="space-y-4 py-2">
                  <div className="w-20 h-20 rounded-full bg-purple-100 text-[#7c3aed] flex items-center justify-center mx-auto shadow-inner">
                    <span className="material-symbols-outlined text-[44px] animate-pulse">fingerprint</span>
                  </div>
                  <div>
                    <p className="font-bold text-[14px] text-on-surface">Touch Fingerprint or Face ID</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">Authorize transfer on your device</p>
                  </div>

                  {authError && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium text-left">
                      {authError}
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={triggerBiometricPrompt}
                      disabled={isVerifyingSecurity}
                      className="w-full h-11 bg-primary text-white rounded-xl font-bold text-[13px] shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isVerifyingSecurity ? (
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">fingerprint</span>
                          Verify with Biometrics
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setAuthMode('pin'); setAuthError(''); setAuthPin(''); }}
                      className="w-full h-10 border border-outline-variant/30 text-on-surface font-bold text-[12px] rounded-xl hover:bg-gray-50 active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">pin</span>
                      Use PIN / Password Instead
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleVerifyPinAndWithdraw} className="space-y-3.5 py-1 text-left">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-center">
                      Enter 4-Digit Security PIN
                    </label>
                    <FourDigitPinInput
                      value={authPin}
                      onChange={(val) => { setAuthPin(val); setAuthError(''); }}
                      autoFocus={true}
                      hasError={Boolean(authError)}
                      idPrefix="user-wallet-pin"
                    />
                  </div>

                  {authError && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium text-left">
                      {authError}
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      disabled={isVerifyingSecurity || authPin.length !== 4}
                      className="w-full h-11 bg-primary text-white rounded-xl font-bold text-[13px] shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isVerifyingSecurity ? (
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Verify & Confirm Cashout'
                      )}
                    </button>

                    {currentUser?.security?.biometricEnabled && (
                      <button
                        type="button"
                        onClick={() => { setAuthMode('biometric'); setAuthError(''); }}
                        className="w-full py-1 text-[11px] text-primary font-bold hover:underline cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">fingerprint</span>
                        Switch back to Biometrics
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Phase B: Perks SubView ───
function PerksSubView({ balance, activities, onBack }) {
  const [txCount, setTxCount] = useState(0);
  const [config, setConfig] = useState({ milestoneInterval: 5, minScratchReward: 5, maxScratchReward: 50 });
  const [scratchCardsClaimed, setScratchCardsClaimed] = useState(0);
  const [isScratching, setIsScratching] = useState(false);

  useEffect(() => {
    // Fetch transactions for count
    UserAPI.getMyTransactions().then(res => {
      if (res.success) {
        setTxCount(res.data.length);
      }
    }).catch(console.error);
    
    // Fetch dynamic rewards config
    UserAPI.getRewardsData().then(res => {
      if (res.success && res.data) {
        setConfig(res.data.config);
        setScratchCardsClaimed(res.data.scratchCardsClaimed || 0);
      }
    }).catch(console.error);
  }, []);

  const interval = config.milestoneInterval || 5;
  const currentCycleProgress = txCount % interval;
  const progress = (currentCycleProgress / interval) * 100;
  const remainingForNext = interval - currentCycleProgress;

  // Earned scratch cards is how many times they hit the interval
  const unlockedCardsCount = Math.floor(txCount / interval);

  const unclaimedCount = Math.max(0, unlockedCardsCount - scratchCardsClaimed);
  
  // Always show at least 4 cards visually, filling the grid row
  const totalCardsToShow = Math.max(4, unclaimedCount + (4 - (unclaimedCount % 4 || 4))); 
  const scratchCards = Array.from({ length: totalCardsToShow }).map((_, i) => {
    const logicalIndex = scratchCardsClaimed + i;
    return {
      id: logicalIndex,
      isUnlocked: logicalIndex < unlockedCardsCount,
      isScratched: false,
      reward: null
    };
  });

  const handleScratch = async (card) => {
    if (!card.isUnlocked || card.isScratched || isScratching) return;
    setIsScratching(true);
    try {
      const res = await UserAPI.claimScratchCard();
      if (res.success) {
        setScratchCardsClaimed(res.data.scratchCardsClaimed);
        alert(`🎉 You won ₹${res.data.rewardAmount}! Added to your wallet.`);
      } else {
        alert(res.message || 'Failed to scratch card');
      }
    } catch (err) {
      console.error(err);
      alert('Error scratching card');
    } finally {
      setIsScratching(false);
    }
  };

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-10">
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-[#7c3aed] via-[#9333ea] to-[#a855f7] text-white pt-12 pb-6 px-6 rounded-b-[3rem] shadow-lg shadow-primary/20 relative overflow-hidden">
        <div className="app-container relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-xs relative z-10 mb-4">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <span className="font-display text-title-md font-bold ml-1">Your Rewards</span>
          </div>

          <div className="relative z-10 text-center space-y-1 mt-4">
            <div className="inline-block px-3 py-1 bg-white/10 rounded-full border border-white/20 mb-2">
              <span className="text-[11px] font-bold tracking-widest uppercase">🔥 5-Day Streak</span>
            </div>
            <h2 className="text-[32px] font-display font-black leading-tight">Reward Hub</h2>
            <p className="text-white/80 text-body-sm">Keep shopping to unlock exclusive rewards</p>
          </div>
        </div>
      </div>

      <main className="flex-grow app-container px-container-margin py-lg space-y-8 -mt-4 relative z-20">
        
        {config.isActive === false ? (
          <div className="bg-white rounded-3xl p-8 border border-outline-variant/20 shadow-md text-center">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant/50 mb-4">stars</span>
            <h3 className="font-bold text-lg text-on-surface mb-2">Rewards Unavailable</h3>
            <p className="text-sm text-on-surface-variant">The rewards program is currently paused. Please check back later!</p>
          </div>
        ) : (
          <>
            {/* Milestone Card */}
            <div className="bg-white rounded-3xl p-5 border border-outline-variant/20 shadow-md">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-body-lg text-on-surface">Scratch Card Milestone</h3>
                  <p className="text-[12px] text-on-surface-variant">Shop at {remainingForNext} more stores to unlock a Scratch Card!</p>
                </div>
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-500">
                  <span className="material-symbols-outlined">redeem</span>
                </div>
              </div>
              <div className="h-2.5 bg-surface-container-low rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-bold text-on-surface-variant">
                <span>0 payments</span>
                <span>{interval} payments</span>
              </div>
            </div>

            {/* Scratch Cards */}
            <div className="space-y-4">
              <h3 className="font-display text-title-md font-extrabold text-on-surface px-1">Scratch Cards</h3>
              <div className="grid grid-cols-2 gap-4">
                {scratchCards.map(card => (
                  <div 
                    key={card.id}
                    className={`aspect-square rounded-3xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden transition-transform active:scale-95 ${
                      card.isScratched
                        ? 'bg-surface-container border border-outline-variant/30 text-primary'
                        : card.isUnlocked 
                          ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/20 cursor-pointer' 
                          : 'bg-surface-container-low border-2 border-dashed border-outline-variant/30 text-on-surface-variant opacity-60'
                    }`}
                    onClick={() => handleScratch(card)}
                  >
                    {card.isScratched ? (
                      <>
                        <span className="material-symbols-outlined text-[32px] mb-2 text-primary">check_circle</span>
                        <span className="font-bold text-body-sm text-primary">Claimed</span>
                      </>
                    ) : card.isUnlocked ? (
                      <>
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-50 mix-blend-overlay" />
                        <span className="material-symbols-outlined text-[32px] mb-2 relative z-10">star</span>
                        <span className="font-bold text-body-sm relative z-10">Tap to Scratch</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">lock</span>
                        <span className="font-bold text-[11px] px-2">Locked</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

// ─── SUBVIEW 3: MOBILE RECHARGE (WALLET BALANCE) ───
function RechargeSubView({ balance, currentUser, onBack, setBalance, onRechargeSuccess }) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [operator, setOperator] = useState('Jio');
  const [circle, setCircle] = useState('Delhi NCR');
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Security Auth Modal State
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [authMode, setAuthMode] = useState('biometric');
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [isVerifyingSecurity, setIsVerifyingSecurity] = useState(false);

  const isSecurityProtected = !!currentUser?.security?.hasPin || !!currentUser?.security?.biometricEnabled;

  const OPERATORS = [
    { name: 'Jio', bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-500', badge: 'True 5G' },
    { name: 'Airtel', bg: 'bg-red-600', text: 'text-red-600', border: 'border-red-500', badge: 'Airtel 5G Plus' },
    { name: 'Vi', bg: 'bg-amber-600', text: 'text-amber-600', border: 'border-amber-500', badge: 'Hero Unlimited' },
    { name: 'BSNL', bg: 'bg-sky-600', text: 'text-sky-600', border: 'border-sky-500', badge: 'Best Value' },
  ];

  const CIRCLES = [
    'Delhi NCR', 'Mumbai', 'Maharashtra & Goa', 'UP East', 'UP West',
    'Karnataka', 'Tamil Nadu', 'Punjab', 'Rajasthan', 'Kolkata', 'Gujarat'
  ];

  // Fetch plans when operator or circle changes
  useEffect(() => {
    const fetchPlans = async () => {
      setIsLoadingPlans(true);
      try {
        const res = await UserAPI.getRechargePlans(operator, circle);
        if (res.success) {
          setPlans(res.data);
          if (!selectedPlan && res.data.length > 0) {
            setSelectedPlan(res.data.find(p => p.amount === 239) || res.data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load recharge plans', err);
      } finally {
        setIsLoadingPlans(false);
      }
    };
    fetchPlans();
  }, [operator, circle]);

  // Current amount to pay (either selected plan or custom amount)
  const currentAmount = customAmount ? parseFloat(customAmount) : (selectedPlan ? selectedPlan.amount : 0);
  const isBalanceSufficient = balance >= currentAmount && currentAmount > 0;
  const isNumberValid = mobileNumber.length === 10 && /^[6-9]\d{9}$/.test(mobileNumber);

  // Filter plans by category tab
  const filteredPlans = activeTab === 'All' 
    ? plans 
    : plans.filter(p => p.category.toLowerCase().includes(activeTab.toLowerCase()));

  // Quick fill user's registered phone
  const handleUseMyNumber = () => {
    if (currentUser?.phone) {
      const clean = currentUser.phone.replace(/\D/g, '').slice(-10);
      if (clean.length === 10) {
        setMobileNumber(clean);
        setErrorMsg('');
      }
    }
  };

  const executeRecharge = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const payload = {
        mobileNumber,
        operator,
        circle,
        amount: currentAmount,
        planDetails: selectedPlan ? {
          planName: `${operator} ₹${selectedPlan.amount}`,
          validity: selectedPlan.validity,
          data: selectedPlan.data,
          talktime: selectedPlan.talktime,
          description: selectedPlan.description,
        } : {
          planName: `${operator} ₹${currentAmount}`,
          description: `Custom Top-up recharge of ₹${currentAmount}`,
        },
      };

      const res = await UserAPI.processMobileRecharge(payload);
      if (res.success) {
        const newBal = res.data.newBalance;
        setBalance(newBal);
        
        const newTx = {
          id: res.data.recharge._id,
          name: `Mobile Recharge - ${operator} (${mobileNumber})`,
          time: new Date().toLocaleString(),
          amount: `-₹${currentAmount.toFixed(2)}`,
          status: 'Debited',
          icon: 'phone_android',
          utr: res.data.recharge.operatorRefNumber,
        };

        if (onRechargeSuccess) {
          onRechargeSuccess(newBal, newTx);
        }

        setReceipt(res.data.recharge);
      } else {
        setErrorMsg(res.message || 'Recharge failed. Please try again.');
      }
    } catch (err) {
      console.error('Recharge error:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to complete recharge.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRechargeClick = async () => {
    if (!isNumberValid) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9)');
      return;
    }
    if (!currentAmount || currentAmount < 1) {
      setErrorMsg('Please select a valid recharge plan or enter an amount');
      return;
    }
    if (!isBalanceSufficient) {
      setErrorMsg(`Insufficient wallet balance. You have ₹${balance.toFixed(2)}, need ₹${currentAmount.toFixed(2)}.`);
      return;
    }

    // Check Security Protection
    if (isSecurityProtected) {
      setAuthPin('');
      setAuthError('');
      if (currentUser?.security?.biometricEnabled) {
        setAuthMode('biometric');
        setShowSecurityModal(true);
        // Call synchronously within the click handler — browsers (notably iOS
        // Safari) require WebAuthn prompts to fire within the user-activation
        // window, which a setTimeout callback falls outside of.
        (async () => {
          try {
            setIsVerifyingSecurity(true);
            const bioRes = await verifyBiometricCredential(currentUser?.security?.biometricCredentialId);
            if (bioRes.success) {
              setShowSecurityModal(false);
              await executeRecharge();
            } else {
              setAuthError(bioRes.error || 'Biometric validation failed. Please enter your PIN.');
              setAuthMode('pin');
            }
          } catch (e) {
            setAuthError('Biometric verification failed. Please enter your PIN.');
            setAuthMode('pin');
          } finally {
            setIsVerifyingSecurity(false);
          }
        })();
      } else {
        setAuthMode('pin');
        setShowSecurityModal(true);
      }
    } else {
      await executeRecharge();
    }
  };

  const handleVerifyPinAndRecharge = async (e) => {
    e.preventDefault();
    if (!authPin.trim()) return;

    setIsVerifyingSecurity(true);
    setAuthError('');
    try {
      const res = await UserAPI.verifySecurityPin(authPin.trim());
      if (res.success) {
        setShowSecurityModal(false);
        await executeRecharge();
      } else {
        setAuthError(res.message || 'Incorrect PIN. Try again.');
      }
    } catch (err) {
      setAuthError(err.response?.data?.message || err.message || 'Incorrect Security PIN.');
    } finally {
      setIsVerifyingSecurity(false);
    }
  };

  // ─── Success Receipt View ───
  if (receipt) {
    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm">
          <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold">Recharge Receipt</span>
          <div className="w-10"></div>
        </header>

        <main className="flex-grow flex items-center justify-center px-container-margin py-xl">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-outline-variant/20 text-center space-y-5 animate-in zoom-in-95 duration-200">
            {/* Animated Success Icon */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <span className="material-symbols-outlined text-3xl">check_circle</span>
            </div>

            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Payment Completed
              </span>
              <h2 className="text-2xl font-black text-on-surface mt-1.5">Recharge Successful!</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Paid directly from your cashback wallet</p>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Recharge Amount</span>
                <span className="text-lg font-black text-primary font-display">₹{receipt.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Mobile Number</span>
                <span className="font-mono font-bold text-slate-800">+91 {receipt.mobileNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Operator & Circle</span>
                <span className="font-semibold text-slate-800">{receipt.operator} • {receipt.circle}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Reference ID</span>
                <span className="font-mono font-semibold text-primary text-[11px]">{receipt.operatorRefNumber}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-slate-500">New Wallet Balance</span>
                <span className="font-bold text-emerald-700 font-mono">₹{balance.toFixed(2)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setReceipt(null);
                  setSelectedPlan(null);
                  setCustomAmount('');
                }}
                className="w-full h-12 rounded-xl btn-primary-gradient text-white font-bold text-sm shadow-md active:scale-98 transition-transform cursor-pointer"
              >
                Recharge Another Number
              </button>
              <button
                onClick={onBack}
                className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
              >
                Back to Wallet
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-10">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-1">Mobile Recharge</span>
          </div>
          <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-primary px-3 py-1 rounded-full text-xs font-bold shadow-sm">
            <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
            <span>₹{balance.toFixed(2)}</span>
          </div>
        </div>
      </header>

      <main className="flex-grow app-container px-container-margin py-lg space-y-5 text-left">
        {/* Error banner */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <span className="material-symbols-outlined text-base shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Mobile Number Input Card */}
        <div className="bg-white rounded-2xl p-4 border border-outline-variant/30 shadow-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <label className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">
              Mobile Number
            </label>
            {currentUser?.phone && (
              <button 
                type="button"
                onClick={handleUseMyNumber}
                className="text-[11px] text-primary font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">person</span>
                Use My Number
              </button>
            )}
          </div>

          <div className="flex items-center bg-slate-50 border border-outline-variant/40 rounded-xl px-3 h-12 focus-within:bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <span className="text-sm font-bold text-slate-500 mr-2 border-r border-slate-300 pr-2">+91</span>
            <input 
              type="tel"
              maxLength={10}
              value={mobileNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                setMobileNumber(val);
                setErrorMsg('');
              }}
              placeholder="Enter 10-digit mobile number"
              className="w-full bg-transparent outline-none font-mono font-bold text-base text-on-surface tracking-wider placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
            />
            {mobileNumber.length === 10 && (
              <span className="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>
            )}
          </div>
        </div>

        {/* 2. Operator & Circle Selector */}
        <div className="bg-white rounded-2xl p-4 border border-outline-variant/30 shadow-sm space-y-3">
          <label className="text-caption font-bold uppercase tracking-wider text-on-surface-variant block">
            Select Telecom Operator
          </label>

          <div className="grid grid-cols-4 gap-2">
            {OPERATORS.map((op) => {
              const isSelected = operator === op.name;
              return (
                <button
                  key={op.name}
                  type="button"
                  onClick={() => {
                    setOperator(op.name);
                    setSelectedPlan(null);
                    setCustomAmount('');
                  }}
                  className={`py-2.5 px-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border cursor-pointer ${
                    isSelected 
                      ? `${op.border} bg-purple-50/70 ring-2 ring-primary/25 shadow-sm` 
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full ${op.bg} text-white flex items-center justify-center font-black text-xs shadow-sm`}>
                    {op.name.charAt(0)}
                  </span>
                  <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-slate-800'}`}>
                    {op.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Circle Selector */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Telecom Circle</span>
            <select
              value={circle}
              onChange={(e) => setCircle(e.target.value)}
              className="text-xs font-bold text-primary bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            >
              {CIRCLES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. Plans Selector Tabs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">
              Select Recharge Plan
            </label>
            <span className="text-[11px] text-slate-500 font-medium">{filteredPlans.length} plans available</span>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {['All', 'Popular', 'Unlimited', 'Data Add-on', 'Top-up'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Custom Amount Field */}
          <div className="bg-white rounded-xl p-3 border border-outline-variant/30 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 shrink-0">Custom Amount (₹)</span>
            <div className="relative flex-grow max-w-[140px]">
              <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">₹</span>
              <input 
                type="number"
                min="1"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  if (e.target.value) setSelectedPlan(null);
                  setErrorMsg('');
                }}
                placeholder="Enter amount"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-xs font-bold outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Plans Grid */}
          {isLoadingPlans ? (
            <div className="space-y-2 py-4 text-center">
              <span className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
              <p className="text-xs text-slate-500">Fetching {operator} plans...</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {filteredPlans.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id && !customAmount;
                const canAfford = balance >= plan.amount;
                return (
                  <div
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlan(plan);
                      setCustomAmount('');
                      setErrorMsg('');
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left relative ${
                      isSelected
                        ? 'bg-purple-50/80 border-primary ring-2 ring-primary/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-black text-xl text-primary">₹{plan.amount}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {plan.validity}
                        </span>
                        {plan.data !== 'NA' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                            {plan.data}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {!canAfford && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            Low Balance
                          </span>
                        )}
                        <span className={`material-symbols-outlined text-lg ${isSelected ? 'text-primary' : 'text-slate-300'}`}>
                          {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 font-medium mt-1.5 line-clamp-2">
                      {plan.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Payment Breakdown & Confirmation */}
        <div className="bg-white rounded-2xl p-4 border border-outline-variant/30 shadow-sm space-y-3">
          <h4 className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">
            Payment Summary
          </h4>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span>Recharge Pack</span>
              <span className="font-bold text-slate-900">₹{currentAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Current Rewards Balance</span>
              <span className="font-mono font-semibold text-primary">₹{balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 font-bold">
              <span>Remaining Balance After Recharge</span>
              <span className={`font-mono ${isBalanceSufficient ? 'text-emerald-700' : 'text-rose-600'}`}>
                {isBalanceSufficient 
                  ? `₹${(balance - currentAmount).toFixed(2)}`
                  : 'Insufficient Funds'}
              </span>
            </div>
          </div>

          {!isBalanceSufficient && currentAmount > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-[11px] font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-amber-600 shrink-0">warning</span>
              <span>
                Your reward balance is short by ₹{(currentAmount - balance).toFixed(2)}. Earn more cashback by shopping at partner stores!
              </span>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="button"
            onClick={handleRechargeClick}
            disabled={!isNumberValid || !currentAmount || !isBalanceSufficient || isProcessing}
            className={`w-full h-13 rounded-xl font-title-md flex items-center justify-center gap-2 shadow-lg transition-all ${
              isNumberValid && currentAmount > 0 && isBalanceSufficient && !isProcessing
                ? 'btn-primary-gradient text-white active:scale-98 cursor-pointer shadow-primary/25'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {isProcessing ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Processing Recharge...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl">bolt</span>
                <span>Pay ₹{currentAmount > 0 ? currentAmount.toFixed(0) : '0'} with Rewards</span>
              </>
            )}
          </button>
        </div>
      </main>

      {/* ─── SECURITY PIN / BIOMETRIC AUTH MODAL ─── */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 text-primary flex items-center justify-center mx-auto mb-3 shadow-inner">
              <span className="material-symbols-outlined text-2xl">
                {authMode === 'biometric' ? 'fingerprint' : 'lock'}
              </span>
            </div>

            <h3 className="font-display font-black text-lg text-on-surface">
              {authMode === 'biometric' ? 'Biometric Authentication' : 'Enter Security PIN'}
            </h3>
            <p className="text-caption text-on-surface-variant mt-1">
              Confirm mobile recharge of <span className="font-bold text-primary">₹{currentAmount}</span> for <span className="font-bold font-mono">{mobileNumber}</span>
            </p>

            {authError && (
              <div className="text-rose-600 text-xs font-semibold bg-rose-50 border border-rose-100 py-1.5 px-3 rounded-lg my-3">
                {authError}
              </div>
            )}

            {authMode === 'pin' ? (
              <form onSubmit={handleVerifyPinAndRecharge} className="space-y-4 my-4">
                <FourDigitPinInput
                  value={authPin}
                  onChange={(val) => {
                    setAuthPin(val);
                    setAuthError('');
                  }}
                  autoFocus={true}
                  hasError={Boolean(authError)}
                  idPrefix="user-recharge-pin"
                />
                <button
                  type="submit"
                  disabled={authPin.length !== 4 || isVerifyingSecurity}
                  className="w-full h-12 rounded-xl btn-primary-gradient text-white font-bold text-sm shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isVerifyingSecurity ? 'Verifying PIN...' : 'Confirm Recharge'}
                </button>
              </form>
            ) : (
              <div className="py-4 space-y-3">
                <p className="text-xs text-slate-500">Scan your fingerprint or face to authorize payment</p>
                <button
                  type="button"
                  onClick={() => setAuthMode('pin')}
                  className="text-xs text-primary font-bold hover:underline cursor-pointer"
                >
                  Switch to PIN
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setShowSecurityModal(false);
                setAuthError('');
              }}
              className="mt-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SUBVIEW 4: ADD FUNDS TO WALLET (DYNAMIC QR & RAZORPAY) ───
function AddFundsSubView({ balance, currentUser, onBack, setBalance, onSuccess }) {
  const navigate = useNavigate();
  const { t } = useLanguageStore();

  const [amount, setAmount] = useState('500');
  const [paymentMethod, setPaymentMethod] = useState('DYNAMIC_QR'); // 'DYNAMIC_QR' | 'RAZORPAY'
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Dynamic QR Modal State
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState('');
  const [isClaimingUtr, setIsClaimingUtr] = useState(false);

  // Success Receipt State
  const [successReceipt, setSuccessReceipt] = useState(null);

  const amountNum = parseFloat(amount) || 0;
  const isValidAmount = amountNum >= 1;

  // Razorpay Script Loader
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Razorpay Checkout Flow
  const handlePayViaRazorpay = async () => {
    if (!isValidAmount) {
      setErrorMsg('Please enter a valid amount (minimum ₹1).');
      return;
    }
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        setErrorMsg('Razorpay payment gateway failed to load. Please check your internet connection.');
        setIsProcessing(false);
        return;
      }

      const orderRes = await UserAPI.createWalletOrder(amountNum);
      if (!orderRes.success) {
        throw new Error(orderRes.message || 'Could not create recharge order');
      }

      const { order } = orderRes;
      const options = {
        key: order.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'ZeeBac Wallet Top-up',
        description: 'Recharge ZeeBac Wallet Balance',
        order_id: order.id,
        notes: {
          type: 'customer_wallet_recharge',
          purpose: 'Wallet Add Fund',
        },
        handler: async function (response) {
          try {
            setIsProcessing(true);
            const verifyRes = await UserAPI.verifyWalletPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.success) {
              const newBal = verifyRes.data.balance;
              const newTx = {
                id: `TX-${Date.now()}`,
                name: 'Wallet Top-up via Razorpay',
                time: new Date().toLocaleString(),
                amount: `+₹${amountNum.toFixed(2)}`,
                status: 'Credited',
                icon: 'add_card',
                utr: response.razorpay_payment_id,
              };
              onSuccess(newBal, newTx);
              setSuccessReceipt({
                amount: amountNum,
                newBalance: newBal,
                method: 'Razorpay Online Gateway',
                refId: response.razorpay_payment_id,
                date: new Date().toLocaleString(),
              });
            } else {
              setErrorMsg(verifyRes.message || 'Payment verification failed');
            }
          } catch (err) {
            setErrorMsg(err.response?.data?.message || err.message || 'Error verifying Razorpay payment');
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: currentUser.name || 'ZeeBac User',
          contact: currentUser.phone ? String(currentUser.phone).replace(/\D/g, '').slice(-10) : '',
          email: currentUser.email || '',
        },
        theme: {
          color: '#7c3aed',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (res) {
        setErrorMsg(`Payment cancelled or failed: ${res.error?.description || 'Gateway error'}`);
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to initiate Razorpay payment');
      setIsProcessing(false);
    }
  };

  // Dynamic QR Generation Flow
  const handleGenerateDynamicQr = async () => {
    if (!isValidAmount) {
      setErrorMsg('Please enter a valid amount (minimum ₹1).');
      return;
    }
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const res = await UserAPI.getWalletDynamicQr(amountNum);
      if (!res.success) {
        throw new Error(res.message || 'Failed to generate dynamic UPI QR');
      }

      const upiUri = res.data.upiUri;
      const dataUrl = await QRCode.toDataURL(upiUri, {
        width: 320,
        margin: 1,
        color: { dark: '#3b0764', light: '#ffffff' },
      });

      setQrData({
        ...res.data,
        qrImageUrl: dataUrl,
      });
      setUtrInput('');
      setUtrError('');
      setShowQrModal(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to generate Dynamic UPI QR');
    } finally {
      setIsProcessing(false);
    }
  };

  // Claim Dynamic QR Payment via 12-digit UTR
  const handleClaimUtrPayment = async () => {
    const clean = utrInput.trim();
    if (!clean || clean.length !== 12 || !/^\d{12}$/.test(clean)) {
      setUtrError('Please enter a valid 12-digit UPI UTR / Reference ID.');
      return;
    }

    setIsClaimingUtr(true);
    setUtrError('');

    try {
      const res = await UserAPI.claimWalletUpiUtr(clean, amountNum);
      if (res.success) {
        const newBal = res.data.balance;
        const newTx = {
          id: `TX-${Date.now()}`,
          name: 'Wallet Top-up via Dynamic UPI QR',
          time: new Date().toLocaleString(),
          amount: `+₹${amountNum.toFixed(2)}`,
          status: 'Credited',
          icon: 'qr_code_2',
          utr: clean,
        };
        onSuccess(newBal, newTx);
        setShowQrModal(false);
        setSuccessReceipt({
          amount: amountNum,
          newBalance: newBal,
          method: 'Dynamic UPI QR (0% Extra Charge)',
          refId: clean,
          date: new Date().toLocaleString(),
        });
      } else {
        setUtrError(res.message || 'Could not verify UPI payment.');
      }
    } catch (err) {
      setUtrError(err.response?.data?.message || err.message || 'Payment verification failed. Ensure payment is completed.');
    } finally {
      setIsClaimingUtr(false);
    }
  };

  // Copy UPI ID helper
  const handleCopyUpi = () => {
    if (qrData?.payeeVpa) {
      navigator.clipboard.writeText(qrData.payeeVpa);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  // Success Receipt Overlay
  if (successReceipt) {
    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-16">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-xs">
          <div className="app-container flex items-center justify-between">
            <h2 className="font-display text-title-md text-primary font-bold">{t('Recharge Receipt')}</h2>
          </div>
        </header>

        <main className="flex-grow app-container px-container-margin py-xl space-y-6 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-lg animate-bounce">
            <span className="material-symbols-outlined text-[48px]">check_circle</span>
          </div>

          <div className="space-y-1">
            <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-full uppercase tracking-wider">
              {t('Funds Added Successfully')}
            </span>
            <h1 className="text-4xl font-black text-gray-900 pt-2">₹{successReceipt.amount.toFixed(2)}</h1>
            <p className="text-sm text-gray-500">{t('Credited to your ZeeBac Wallet')}</p>
          </div>

          <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-left space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">{t('Updated Balance')}</span>
              <span className="font-bold text-emerald-600 text-sm">₹{successReceipt.newBalance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">{t('Payment Method')}</span>
              <span className="font-medium text-gray-900">{successReceipt.method}</span>
            </div>
            {successReceipt.refId && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">{t('Reference / UTR')}</span>
                <span className="font-mono text-gray-700 font-bold">{successReceipt.refId}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">{t('Merchant Transfer Fee')}</span>
              <span className="font-bold text-emerald-600">₹0.00 (Zero Extra Charge)</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-100">
              <span className="text-gray-500">{t('Date & Time')}</span>
              <span className="text-gray-600">{successReceipt.date}</span>
            </div>
          </div>

          <div className="w-full max-w-sm bg-purple-50 border border-purple-200/60 rounded-xl p-3.5 text-left flex items-start gap-3">
            <span className="material-symbols-outlined text-purple-600 text-[20px] mt-0.5">verified</span>
            <p className="text-xs text-purple-900 leading-relaxed font-medium">
              You can now transfer or pay merchants with your wallet balance with <strong>0% extra fee</strong>!
            </p>
          </div>

          <button
            onClick={onBack}
            className="w-full max-w-sm py-3.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold text-sm shadow-md active:scale-95 transition-all cursor-pointer"
          >
            {t('Back to Wallet')}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-16">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-xs">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <div>
              <span className="font-display text-title-md text-primary font-bold ml-1">{t('Add Money to Wallet')}</span>
              <p className="text-[11px] text-gray-500 ml-1 font-medium">{t('Instant Top-up & 0% Fee Merchant Transfers')}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('Balance')}</span>
            <p className="text-sm font-black text-primary">₹{balance.toFixed(2)}</p>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-grow app-container px-container-margin py-lg space-y-6 text-left max-w-lg mx-auto w-full">
        {/* Amount Input Card */}
        <div className="bg-white border border-outline-variant/30 rounded-3xl p-6 shadow-sm space-y-5 text-center">
          <p className="font-caption text-[11px] text-gray-500 uppercase tracking-widest font-bold">
            {t('Enter Amount to Add')}
          </p>

          <div className="flex items-center justify-center gap-1.5 py-1">
            <span className="text-3xl font-black text-gray-400">₹</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrorMsg('');
              }}
              placeholder="0"
              className="text-4xl font-black text-primary text-center bg-transparent outline-none w-44 placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Quick Amount Pills */}
          <div className="flex flex-wrap gap-2 justify-center pt-1">
            {[100, 200, 500, 1000, 2000].map((pillVal) => (
              <button
                key={pillVal}
                type="button"
                onClick={() => {
                  setAmount(String(pillVal));
                  setErrorMsg('');
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                  amount === String(pillVal)
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                +₹{pillVal}
              </button>
            ))}
          </div>

          {/* Zero Charge Highlight Banner */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3 text-left flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </div>
            <div className="text-[12px] text-emerald-950">
              <strong className="text-emerald-800">{t('Zero Extra Charges on Merchant Transfer')}</strong>
              <p className="text-[11px] text-emerald-700/90 leading-tight mt-0.5">
                {t('Once added, transferring funds to merchants or paying at counters carries 0% extra fee.')}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Methods Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">{t('Choose Payment Method')}</h3>
            <span className="text-[11px] text-emerald-600 font-bold">{t('Direct UPI = 0% Fee')}</span>
          </div>

          {/* Option 1: Dynamic UPI QR (Direct UPI) */}
          <div
            onClick={() => setPaymentMethod('DYNAMIC_QR')}
            className={`bg-white rounded-2xl p-4 border-2 transition-all cursor-pointer relative shadow-xs ${
              paymentMethod === 'DYNAMIC_QR'
                ? 'border-emerald-500 bg-emerald-50/20 shadow-md ring-2 ring-emerald-500/20'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  paymentMethod === 'DYNAMIC_QR' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700'
                }`}>
                  <span className="material-symbols-outlined text-[24px]">qr_code_2</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-[14px] text-gray-900">{t('Dynamic UPI QR')}</h4>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                      {t('0% Extra Charge')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 font-medium">
                    {t('Pay via GPay, PhonePe, Paytm, BHIM or Scan Dynamic QR')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-emerald-700 font-semibold">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      {t('0% Gateway Charges')}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[14px]">bolt</span>
                      {t('Instant Credit')}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[14px]">storefront</span>
                      {t('Free Merchant Transfer')}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                paymentMethod === 'DYNAMIC_QR' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
              }`}>
                {paymentMethod === 'DYNAMIC_QR' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
          </div>

          {/* Option 2: Razorpay Online Gateway */}
          <div
            onClick={() => setPaymentMethod('RAZORPAY')}
            className={`bg-white rounded-2xl p-4 border-2 transition-all cursor-pointer relative shadow-xs ${
              paymentMethod === 'RAZORPAY'
                ? 'border-primary bg-purple-50/20 shadow-md ring-2 ring-primary/20'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  paymentMethod === 'RAZORPAY' ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-700'
                }`}>
                  <span className="material-symbols-outlined text-[24px]">credit_card</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-[14px] text-gray-900">{t('Razorpay Gateway')}</h4>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                      {t('Gateway Charges Apply')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 font-medium">
                    {t('Credit Cards, Debit Cards, NetBanking, Gateway UPI')}
                  </p>
                  {/* Explicit User Warning Required in Prompt */}
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-amber-600 text-[15px] shrink-0 mt-0.5">info</span>
                    <span>
                      {t('Payment gateway charges apply on cards/netbanking via Razorpay gateway. Use Dynamic UPI QR for 0% extra fee.')}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                paymentMethod === 'RAZORPAY' ? 'border-primary bg-primary' : 'border-gray-300'
              }`}>
                {paymentMethod === 'RAZORPAY' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs space-y-2 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>{t('Recharge Amount')}</span>
            <span className="font-bold text-gray-900">₹{amountNum.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('Platform Extra Fee')}</span>
            {paymentMethod === 'DYNAMIC_QR' ? (
              <span className="font-bold text-emerald-600">₹0.00 (0% Fee • Zero Charge)</span>
            ) : (
              <span className="font-bold text-amber-700">{t('Gateway Charges by Bank/PG')}</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('Merchant Transfer Fee')}</span>
            <span className="font-bold text-emerald-600">₹0.00 ({t('Free')})</span>
          </div>
          <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-sm font-bold text-gray-900">
            <span>{t('Total Payable')}</span>
            <span className="text-base font-black text-primary">₹{amountNum.toFixed(2)}</span>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          type="button"
          disabled={!isValidAmount || isProcessing}
          onClick={paymentMethod === 'DYNAMIC_QR' ? handleGenerateDynamicQr : handlePayViaRazorpay}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-indigo-600 text-white font-extrabold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>{t('Processing Recharge...')}</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">
                {paymentMethod === 'DYNAMIC_QR' ? 'qr_code_scanner' : 'credit_card'}
              </span>
              <span>
                {paymentMethod === 'DYNAMIC_QR'
                  ? `Proceed to Add ₹${amountNum.toFixed(2)} via Dynamic QR (0% Fee)`
                  : `Proceed to Pay ₹${amountNum.toFixed(2)} via Razorpay`}
              </span>
            </>
          )}
        </button>

        {/* Option to Scan Vendor QR at physical store */}
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => navigate('/scan-qr')}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-bold hover:underline cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
            <span>{t('At a ZeeBac Partner Store? Scan Merchant Dynamic QR')}</span>
          </button>
        </div>
      </main>

      {/* ─── DYNAMIC UPI QR MODAL ─── */}
      {showQrModal && qrData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-center relative animate-scaleUp">
            {/* Close button */}
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Modal Title */}
            <div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                0% Extra Charge • Free Direct UPI
              </span>
              <h3 className="font-extrabold text-xl text-gray-900 mt-2">{t('Scan & Pay via UPI')}</h3>
              <p className="text-xs text-gray-500">{t('Add money to ZeeBac Wallet instantly')}</p>
            </div>

            {/* Amount Badge */}
            <div className="bg-purple-50 border border-purple-200/80 rounded-2xl py-2 px-4 inline-block">
              <span className="text-xs text-purple-700 font-bold">{t('Amount to Pay:')} </span>
              <span className="text-2xl font-black text-purple-900">₹{qrData.amount.toFixed(2)}</span>
            </div>

            {/* High-Res Dynamic QR Image */}
            <div className="bg-white border-2 border-purple-200 rounded-2xl p-3 shadow-inner inline-block mx-auto">
              <img
                src={qrData.qrImageUrl}
                alt="Dynamic UPI QR"
                className="w-56 h-56 object-contain rounded-lg mx-auto"
              />
              <p className="text-[10px] text-gray-500 font-mono mt-1 font-bold">
                Scan with GPay, PhonePe, Paytm, BHIM
              </p>
            </div>

            {/* UPI ID & Deep-link Action Buttons */}
            <div className="space-y-2">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                <div className="text-left">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">{t('ZeeBac UPI ID')}</span>
                  <span className="font-mono font-bold text-gray-800">{qrData.payeeVpa}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="px-2.5 py-1 bg-primary text-white text-[11px] font-bold rounded-lg hover:opacity-90 active:scale-95 cursor-pointer"
                >
                  {copiedUpi ? t('Copied!') : t('Copy')}
                </button>
              </div>

              {/* Mobile Deep link */}
              <a
                href={qrData.upiUri}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                <span>{t('Pay via UPI App (GPay / PhonePe / Paytm)')}</span>
              </a>
            </div>

            {/* Step 2: UTR Verification */}
            <div className="border-t border-gray-100 pt-4 space-y-2 text-left">
              <label className="text-xs font-bold text-gray-800 block">
                {t('Paid? Enter 12-Digit UPI Reference (UTR) Number:')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={12}
                  value={utrInput}
                  onChange={(e) => {
                    setUtrInput(e.target.value.replace(/\D/g, ''));
                    setUtrError('');
                  }}
                  placeholder="e.g. 423456789012"
                  className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={utrInput.length !== 12 || isClaimingUtr}
                  onClick={handleClaimUtrPayment}
                  className="px-4 py-2 bg-gradient-to-r from-primary to-purple-600 text-white rounded-xl text-xs font-extrabold hover:opacity-95 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                >
                  {isClaimingUtr ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>{t('Verify')}</span>
                  )}
                </button>
              </div>

              {utrError && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1">{utrError}</p>
              )}
              <p className="text-[10px] text-gray-500">
                {t('You can find the 12-digit UPI Transaction / UTR number in your UPI app receipt or bank SMS.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

