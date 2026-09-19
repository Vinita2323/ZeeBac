import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI } from '../../../services/api';
import VendorLoanModal from '../components/VendorLoanModal';

export default function WalletPage() {
  const navigate = useNavigate();
  const globalBalance = useAuthStore((state) => state.walletBalance);
  const updateBalance = useAuthStore((state) => state.updateBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};

  const [wallet, setWallet] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [addAmount, setAmount] = useState(''); // Used for both add and withdraw
  const [isProcessing, setIsProcessing] = useState(false);

  // Bank Form & OTP State
  const [bankForm, setBankForm] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    upiId: '',
  });
  const [bankOtp, setBankOtp] = useState('');
  const [bankStep, setBankStep] = useState('FORM'); // 'FORM' | 'OTP'
  const [bankError, setBankError] = useState('');
  const [bankSuccess, setBankSuccess] = useState('');
  const [isBankLoading, setIsBankLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const fetchWallet = async () => {
    try {
      const res = await VendorAPI.getWallet();
      if (res.success) {
        setWallet(res.data.wallet);
        if (res.data.bankDetails) {
          setBankDetails(res.data.bankDetails);
        }
        if (res.data.phone) {
          setMaskedPhone(res.data.phone);
        }
        updateBalance(res.data.wallet.balance);

        const formattedLedger = res.data.ledger.map((act) => ({
          id: act._id,
          title: act.description || act.category,
          type: act.type, // 'credit' or 'debit'
          amount: `${act.type === 'credit' ? '+' : '-'}₹${act.amount.toLocaleString()}`,
          status: 'Completed',
          date: new Date(act.timestamp).toLocaleDateString(),
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

  // Timer countdown for resend OTP
  useEffect(() => {
    let timer;
    if (resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleConfirmAddFunds = async () => {
    if (!addAmount || Number(addAmount) <= 0) return;
    setIsProcessing(true);

    try {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        alert('Razorpay SDK failed to load. Are you online?');
        setIsProcessing(false);
        return;
      }

      const orderRes = await VendorAPI.createRazorpayOrder(addAmount);
      if (!orderRes.success) {
        alert('Failed to create order');
        setIsProcessing(false);
        return;
      }

      const { order } = orderRes;

      const options = {
        key: order.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'ZeeBac Wallet',
        description: 'Wallet Recharge',
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await VendorAPI.verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: addAmount,
            });

            if (verifyRes.success) {
              alert(`₹${addAmount} added successfully!`);
              window.location.reload();
            } else {
              alert('Payment verification failed');
            }
          } catch (err) {
            console.error(err);
            alert('Error verifying payment');
          }
        },
        prefill: {
          name: currentUser.ownerName || currentUser.storeName || 'Vendor',
          contact: currentUser.phone || '9999999999',
        },
        theme: {
          color: '#7E3AF2',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function () {
        alert('Payment failed');
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      alert('Something went wrong');
    } finally {
      setIsProcessing(false);
      setShowAddModal(false);
      setAmount('');
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!addAmount || Number(addAmount) <= 0) return;
    if (Number(addAmount) > wallet?.balance) {
      alert('Insufficient balance');
      return;
    }
    if (!bankDetails?.accountNumber || !bankDetails?.ifscCode) {
      alert('Please link your bank account first before requesting a withdrawal.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await VendorAPI.requestWithdrawal(Number(addAmount));
      if (res.success) {
        alert(`Withdrawal request for ₹${addAmount} submitted successfully!`);
        window.location.reload();
      } else {
        alert(res.message || 'Failed to submit withdrawal');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Error submitting withdrawal request');
    } finally {
      setIsProcessing(false);
      setShowWithdrawModal(false);
      setAmount('');
    }
  };

  // ─── Bank Account Management Handlers ───
  const handleOpenBankModal = () => {
    setBankForm({
      accountHolderName: bankDetails?.accountHolderName || currentUser.ownerName || currentUser.storeName || '',
      bankName: bankDetails?.bankName || '',
      accountNumber: bankDetails?.accountNumber || '',
      confirmAccountNumber: bankDetails?.accountNumber || '',
      ifscCode: bankDetails?.ifscCode || '',
      upiId: bankDetails?.upiId || '',
    });
    setBankOtp('');
    setBankStep('FORM');
    setBankError('');
    setShowBankModal(true);
  };

  const handleSendBankOtp = async (e) => {
    e?.preventDefault();
    setBankError('');

    // Client-side validations
    if (!bankForm.accountHolderName.trim()) {
      setBankError('Please enter Account Holder Name');
      return;
    }
    if (!bankForm.bankName.trim()) {
      setBankError('Please enter Bank Name');
      return;
    }
    const cleanAcc = bankForm.accountNumber.trim();
    if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18 || !/^\d+$/.test(cleanAcc)) {
      setBankError('Please enter a valid Account Number (9 to 18 digits)');
      return;
    }
    if (cleanAcc !== bankForm.confirmAccountNumber.trim()) {
      setBankError('Account numbers do not match. Please re-check.');
      return;
    }
    const cleanIfsc = bankForm.ifscCode.trim().toUpperCase();
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!cleanIfsc || !ifscRegex.test(cleanIfsc)) {
      setBankError('Please enter a valid 11-character IFSC Code (e.g. HDFC0000123)');
      return;
    }

    setIsBankLoading(true);
    try {
      const res = await VendorAPI.sendBankOtp();
      if (res.success) {
        if (res.maskedPhone) {
          setMaskedPhone(res.maskedPhone);
        }
        setBankStep('OTP');
        setResendCountdown(30);
      } else {
        setBankError(res.message || 'Failed to send verification OTP.');
      }
    } catch (err) {
      setBankError(err.response?.data?.message || 'Failed to send verification code. Please try again.');
    } finally {
      setIsBankLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || isBankLoading) return;
    setIsBankLoading(true);
    setBankError('');
    try {
      const res = await VendorAPI.sendBankOtp();
      if (res.success) {
        setResendCountdown(30);
      } else {
        setBankError(res.message || 'Failed to resend OTP.');
      }
    } catch (err) {
      setBankError(err.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setIsBankLoading(false);
    }
  };

  const handleVerifyBankOtp = async (e) => {
    e?.preventDefault();
    if (!bankOtp.trim() || bankOtp.trim().length < 4) {
      setBankError('Please enter the 4-digit verification code');
      return;
    }

    setIsBankLoading(true);
    setBankError('');
    try {
      const payload = {
        accountHolderName: bankForm.accountHolderName.trim(),
        bankName: bankForm.bankName.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        ifscCode: bankForm.ifscCode.trim().toUpperCase(),
        upiId: bankForm.upiId.trim(),
        otp: bankOtp.trim(),
      };
      const res = await VendorAPI.verifyAndSaveBankAccount(payload);
      if (res.success) {
        setBankDetails(res.data.bankDetails);
        setBankSuccess('🎉 Bank account verified and linked successfully!');
        setShowBankModal(false);
        setTimeout(() => setBankSuccess(''), 5000);
      } else {
        setBankError(res.message || 'Failed to verify bank account.');
      }
    } catch (err) {
      setBankError(err.response?.data?.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setIsBankLoading(false);
    }
  };

  const displayBalance = wallet ? wallet.balance : globalBalance;
  const totalEarned = wallet ? wallet.totalEarned : 0;
  const totalWithdrawn = wallet ? wallet.totalWithdrawn : 0;

  return (
    <>
      <div className="animate-reveal text-left pb-20">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Wallet & Payouts</span>
        </header>

        {/* Success Alert Banner */}
        {bankSuccess && (
          <div className="p-4 mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 animate-reveal">
            <span className="material-symbols-outlined text-emerald-600 text-[24px]">verified</span>
            <div className="flex-1 text-[13.5px] font-semibold">{bankSuccess}</div>
          </div>
        )}

        <div className="space-y-6 pt-2 pb-6">
          {/* Main Top Cards Section */}
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            {/* Balance Card — physical card style */}
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-md bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] min-h-[170px] flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-xl -mb-10 -ml-10 pointer-events-none" />

                {/* Card Header */}
                <div className="relative z-10 flex justify-between items-start">
                  <div className="flex items-center gap-1.5 opacity-90">
                    <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                    <span className="text-[11px] font-bold tracking-wider uppercase">Cashback Wallet</span>
                  </div>
                  <span className="material-symbols-outlined text-[18px] opacity-60">contactless</span>
                </div>

                {/* Balance Amount */}
                <div className="relative z-10 my-2">
                  <p className="text-[11px] uppercase tracking-wider text-purple-200 font-bold">Available Balance</p>
                  <h2 className="text-[30px] font-display font-black leading-none tracking-tight mt-0.5">
                    {loading ? '...' : `₹${displayBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </h2>
                </div>

                {/* Card Footer */}
                <div className="relative z-10 flex justify-between items-end opacity-80 pt-1">
                  <div className="text-[10px] tracking-widest font-mono">**** **** 9921</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider">{currentUser?.storeName || 'Vendor Store'}</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="py-2.5 px-1 sm:px-2 bg-primary text-white rounded-xl font-bold active:scale-[0.97] transition-all shadow-md shadow-primary/20 flex flex-col items-center justify-center gap-0.5 text-[10.5px] sm:text-[11px] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Add Funds
                </button>

                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="py-2.5 px-1 sm:px-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm hover:bg-purple-50/50 flex flex-col items-center justify-center gap-0.5 text-[10.5px] sm:text-[11px] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">account_balance</span>
                  Withdraw
                </button>

                <button
                  onClick={() => navigate('/vendor/passbook')}
                  className="py-2.5 px-1 sm:px-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm hover:bg-purple-50/50 flex flex-col items-center justify-center gap-0.5 text-[10.5px] sm:text-[11px] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  Ledger
                </button>
              </div>
            </div>

            {/* Linked Bank Account Card */}
            <div className="bg-white rounded-3xl p-5 border border-outline-variant/15 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">account_balance</span>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-gray-900">Payout Bank Account</h4>
                      <p className="text-[11px] text-gray-500">Withdrawal money is transferred here</p>
                    </div>
                  </div>
                  {bankDetails?.accountNumber ? (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      Verified
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      Not Linked
                    </span>
                  )}
                </div>

                {bankDetails?.accountNumber ? (
                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 text-[12.5px]">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Bank Name:</span>
                      <span className="font-bold text-gray-900">{bankDetails.bankName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Account Number:</span>
                      <span className="font-mono font-black text-gray-900">
                        •••• •••• {bankDetails.accountNumber.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">IFSC Code:</span>
                      <span className="font-mono font-bold text-purple-700">{bankDetails.ifscCode}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Account Holder:</span>
                      <span className="font-bold text-gray-800">{bankDetails.accountHolderName}</span>
                    </div>
                    {bankDetails.upiId && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-medium">UPI ID:</span>
                        <span className="font-mono text-gray-700">{bankDetails.upiId}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 px-3 bg-purple-50/50 rounded-2xl border border-dashed border-purple-200 text-center space-y-1">
                    <p className="text-[13px] font-bold text-purple-900">No Bank Account Linked</p>
                    <p className="text-[11.5px] text-gray-500 max-w-[280px] mx-auto">
                      Link your bank account with mobile OTP verification to securely withdraw your earnings.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenBankModal}
                className="w-full py-2.5 px-4 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[13px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {bankDetails?.accountNumber ? 'edit' : 'add_circle'}
                </span>
                <span>{bankDetails?.accountNumber ? 'Update Bank Account' : 'Add Bank Account'}</span>
              </button>
            </div>
          </div>

          {/* Merchant Working Capital Banner */}
          <div 
            onClick={() => setShowLoanModal(true)}
            className="bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 cursor-pointer hover:shadow-lg transition-all active:scale-[0.99] border border-indigo-900/50 max-w-4xl"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
                <span className="material-symbols-outlined text-[22px]">payments</span>
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-black uppercase bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">Coming Soon</span>
                  <span className="text-[11px] font-bold text-indigo-200">Merchant Capital</span>
                </div>
                <p className="text-[13px] font-bold text-white mt-0.5 leading-tight truncate">Need Working Capital? Apply for Business Loan (Up to ₹25L)</p>
                <p className="text-[11px] text-indigo-200/80 mt-0.5 leading-tight">0% Property Collateral • Auto daily micro-deduction from sales</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-1.5 rounded-xl font-bold text-xs shrink-0 self-start sm:self-auto transition-colors">
              <span>Apply</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </div>
          </div>

          {/* Stats Row - Compact */}
          <div className="grid grid-cols-2 gap-3 max-w-4xl">
            <div className="bg-white rounded-2xl p-3 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-on-surface-variant font-bold text-[9px] uppercase tracking-wider">Earnings</span>
                <div className="w-5.5 h-5.5 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px]">trending_up</span>
                </div>
              </div>
              <p className="text-[16px] font-black text-on-surface leading-none tracking-tight">₹{totalEarned.toLocaleString()}</p>
              <p className="text-[9px] font-medium text-on-surface-variant mt-1">All Time</p>
            </div>

            <div className="bg-white rounded-2xl p-3 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-on-surface-variant font-bold text-[9px] uppercase tracking-wider">Cashback Sent</span>
                <div className="w-5.5 h-5.5 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px]">redeem</span>
                </div>
              </div>
              <p className="text-[16px] font-black text-on-surface leading-none tracking-tight">₹{totalWithdrawn.toLocaleString()}</p>
              <p className="text-[9px] font-medium text-on-surface-variant mt-1">All Time</p>
            </div>
          </div>

          {/* Wallet Activity */}
          <div className="space-y-3 max-w-4xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[18px] font-extrabold text-on-surface">Recent Activity</h3>
              <button onClick={() => navigate('/vendor/passbook')} className="text-[14px] text-primary font-medium hover:underline cursor-pointer">
                See All
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
              {loading ? (
                <div className="py-6 text-center text-on-surface-variant">Loading...</div>
              ) : activities.length === 0 ? (
                <div className="py-6 text-center text-on-surface-variant text-[13px]">No wallet activity yet.</div>
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
                            : act.type === 'cashout'
                            ? 'bg-primary/5'
                            : 'bg-red-50'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[20px] ${
                            act.type === 'credit'
                              ? 'text-green-600'
                              : act.type === 'cashout'
                              ? 'text-primary'
                              : 'text-red-600'
                          }`}
                        >
                          {act.type === 'credit' ? 'arrow_downward' : act.type === 'cashout' ? 'account_balance' : 'arrow_upward'}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-[13px] text-on-surface">{act.title}</p>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">{act.date}</p>
                        {act.utr && (
                          <p className="text-[11px] font-bold text-primary/70 bg-primary/5 px-2 py-0.5 rounded-md inline-block mt-0.5">
                            UTR: {act.utr}
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

      {/* ─── ADD FUNDS MODAL ─── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && setShowAddModal(false)} />
          <div className="relative bg-white w-full max-w-[400px] rounded-3xl p-4 sm:p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-[22px] font-black text-on-surface">Add Funds</h3>
              <button
                onClick={() => !isProcessing && setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Enter Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[24px] font-black text-primary">₹</span>
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    disabled={isProcessing}
                    className="w-full pl-11 pr-4 py-4 bg-surface-container-low border-2 border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all text-[24px] font-black text-primary placeholder-primary/30 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Quick Select</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setAmount('1000')} className="py-2.5 rounded-xl border border-outline-variant/20 hover:border-primary hover:bg-primary/5 font-bold text-[14px] text-on-surface transition-colors cursor-pointer">+ ₹1,000</button>
                  <button onClick={() => setAmount('5000')} className="py-2.5 rounded-xl border border-outline-variant/20 hover:border-primary hover:bg-primary/5 font-bold text-[14px] text-on-surface transition-colors cursor-pointer">+ ₹5,000</button>
                </div>
              </div>

              <button
                onClick={handleConfirmAddFunds}
                disabled={!addAmount || isProcessing}
                className={`w-full py-4 rounded-xl font-bold text-[16px] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  addAmount && !isProcessing
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 active:scale-[0.98]'
                    : 'bg-surface-container-high text-on-surface-variant/50'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>Proceed to Pay {addAmount ? `₹${addAmount}` : ''}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── WITHDRAW FUNDS MODAL ─── */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && setShowWithdrawModal(false)} />
          <div className="relative bg-white w-full max-w-[420px] rounded-3xl p-4 sm:p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-[22px] font-black text-on-surface">Withdraw Funds</h3>
              <button
                onClick={() => !isProcessing && setShowWithdrawModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-5">
              <div className="bg-surface-container-low p-4 rounded-2xl flex justify-between items-center">
                <span className="text-[12px] font-bold text-on-surface-variant">Available Balance</span>
                <span className="text-[18px] font-black text-primary">₹{(wallet?.balance || 0).toLocaleString()}</span>
              </div>

              {/* Bank Account Destination */}
              {bankDetails?.accountNumber ? (
                <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl space-y-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Destination Bank Account
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-200/70 text-emerald-900 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">verified</span> Verified
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[20px]">account_balance</span>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[13.5px] font-bold text-gray-900 leading-snug">
                        {bankDetails.accountHolderName || 'Account Holder'}
                      </p>
                      <p className="text-[12px] font-medium text-gray-700">
                        {bankDetails.bankName}
                      </p>
                      <div className="flex items-center gap-2 text-[11.5px] font-mono text-gray-600">
                        <span>A/C: •••• {bankDetails.accountNumber.slice(-4)}</span>
                        <span>·</span>
                        <span>IFSC: {bankDetails.ifscCode}</span>
                      </div>
                      {bankDetails.upiId && (
                        <p className="text-[11px] font-mono text-gray-500">
                          UPI: {bankDetails.upiId}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-emerald-200/60 flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    <span>Payout will be sent strictly to this verified bank account.</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-[13px]">
                    <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
                    <span>Bank Account Required</span>
                  </div>
                  <p className="text-[11.5px] text-amber-700">
                    You must link and verify your bank account with OTP before requesting a withdrawal.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWithdrawModal(false);
                      handleOpenBankModal();
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-[12px] transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    Link Bank Account Now
                  </button>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Withdraw Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[24px] font-black text-primary">₹</span>
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={!bankDetails?.accountNumber || isProcessing}
                    className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl py-3.5 pl-12 pr-4 text-[22px] font-black text-on-surface outline-none focus:border-primary focus:bg-white transition-all placeholder:text-outline-variant/30 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="text-[11px] text-on-surface-variant/70 text-center">
                Withdrawals are processed to your linked bank account within 24-48 business hours.
              </div>

              <button
                onClick={handleConfirmWithdraw}
                disabled={!addAmount || isProcessing || Number(addAmount) > (wallet?.balance || 0) || !bankDetails?.accountNumber}
                className={`w-full py-3.5 rounded-2xl font-bold text-[14.5px] transition-all flex items-center justify-center gap-2 cursor-pointer
                  ${
                    !addAmount || isProcessing || Number(addAmount) > (wallet?.balance || 0) || !bankDetails?.accountNumber
                      ? 'bg-surface-container text-on-surface/40 cursor-not-allowed'
                      : 'bg-primary text-white hover:shadow-lg active:scale-[0.98]'
                  }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">account_balance</span>
                    Withdraw ₹{addAmount || '0'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD / UPDATE BANK ACCOUNT MODAL WITH OTP VERIFICATION ─── */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-3 sm:p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isBankLoading && setShowBankModal(false)} />
          <div className="relative bg-white w-full max-w-[440px] rounded-3xl p-4 sm:p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90dvh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">account_balance</span>
                </div>
                <div>
                  <h3 className="font-display text-[18px] font-black text-gray-900">
                    {bankStep === 'FORM' ? (bankDetails?.accountNumber ? 'Update Bank Account' : 'Link Bank Account') : 'Verify Mobile OTP'}
                  </h3>
                  <p className="text-[11.5px] text-gray-500">
                    {bankStep === 'FORM' ? 'Secure bank details for withdrawal payouts' : 'Two-step security verification'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isBankLoading && setShowBankModal(false)}
                disabled={isBankLoading}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Error Message */}
            {bankError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[12px] font-medium flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-red-500 shrink-0">error</span>
                <span>{bankError}</span>
              </div>
            )}

            {/* STEP 1: Bank Details Form */}
            {bankStep === 'FORM' && (
              <form onSubmit={handleSendBankOtp} className="space-y-3.5 text-left">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Account Holder Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={bankForm.accountHolderName}
                    onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value })}
                    placeholder="e.g. Ramesh Kumar Sharma"
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] font-medium focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                    placeholder="e.g. State Bank of India, HDFC Bank, ICICI"
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] font-medium focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Account Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value.replace(/\D/g, '') })}
                      placeholder="9-18 digits"
                      maxLength={18}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] font-mono focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Confirm Account *
                    </label>
                    <input
                      type="password"
                      required
                      value={bankForm.confirmAccountNumber}
                      onChange={(e) => setBankForm({ ...bankForm, confirmAccountNumber: e.target.value.replace(/\D/g, '') })}
                      placeholder="Re-enter number"
                      maxLength={18}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] font-mono focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      IFSC Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={bankForm.ifscCode}
                      onChange={(e) => setBankForm({ ...bankForm, ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] font-mono uppercase focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      UPI ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={bankForm.upiId}
                      onChange={(e) => setBankForm({ ...bankForm, upiId: e.target.value })}
                      placeholder="name@upi"
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] font-medium focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                {/* Security notice */}
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-start gap-2.5 text-[11.5px] text-purple-900">
                  <span className="material-symbols-outlined text-[18px] text-purple-600 shrink-0 mt-0.5">verified_user</span>
                  <span>
                    To protect your payouts, a 4-digit verification code will be sent to your registered mobile number{' '}
                    <strong>{maskedPhone || 'registered phone'}</strong>.
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isBankLoading}
                    className="w-full py-3 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-[0.98] text-white font-bold text-[14px] transition-all shadow-md shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isBankLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Continue to OTP Verification</span>
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: OTP Verification Form */}
            {bankStep === 'OTP' && (
              <form onSubmit={handleVerifyBankOtp} className="space-y-4 text-left">
                <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 mx-auto flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-[20px]">sms</span>
                  </div>
                  <p className="text-[13px] font-bold text-gray-900">Enter Verification Code</p>
                  <p className="text-[12px] text-gray-600">
                    We sent a 4-digit code to{' '}
                    <strong className="text-purple-700">{maskedPhone || 'your registered number'}</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 text-center">
                    4-Digit OTP
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={4}
                    value={bankOtp}
                    onChange={(e) => setBankOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • •"
                    className="w-48 mx-auto block h-14 text-center rounded-2xl border-2 border-purple-300 text-[26px] font-black tracking-[12px] text-purple-900 focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-500/15"
                  />
                </div>

                <div className="flex items-center justify-between text-[12px] px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setBankStep('FORM');
                      setBankError('');
                    }}
                    className="text-gray-500 hover:text-gray-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Edit Bank Details
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCountdown > 0 || isBankLoading}
                    className="text-purple-700 font-bold hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
                  >
                    {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend Code'}
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isBankLoading || bankOtp.length < 4}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-[14px] transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isBankLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying OTP & Saving...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Verify & Link Account</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Vendor Loan Modal */}
      <VendorLoanModal
        isOpen={showLoanModal}
        onClose={() => setShowLoanModal(false)}
      />
    </>
  );
}
