import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI } from '../../../services/api';

export default function WalletPage() {
  const navigate = useNavigate();
  // We'll sync the fetched balance to the store, but also keep local state
  const globalBalance = useAuthStore((state) => state.walletBalance);
  const updateBalance = useAuthStore((state) => state.updateBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};

  const [wallet, setWallet] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [addAmount, setAmount] = useState(''); // Used for both add and withdraw
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await VendorAPI.getWallet();
        if (res.success) {
          setWallet(res.data.wallet);
          // Sync with global store just in case
          updateBalance(res.data.wallet.balance);
          
          const formattedLedger = res.data.ledger.map(act => ({
            id: act._id,
            title: act.description || act.category,
            type: act.type, // 'credit' or 'debit'
            amount: `${act.type === 'credit' ? '+' : '-'}₹${act.amount.toLocaleString()}`,
            status: 'Completed',
            date: new Date(act.timestamp).toLocaleDateString()
          }));
          setActivities(formattedLedger);
        }
      } catch (err) {
        console.error("Failed to fetch wallet", err);
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, []);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
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
        alert("Razorpay SDK failed to load. Are you online?");
        setIsProcessing(false);
        return;
      }

      // 1. Create order
      const orderRes = await VendorAPI.createRazorpayOrder(addAmount);
      if (!orderRes.success) {
        alert("Failed to create order");
        setIsProcessing(false);
        return;
      }

      const { order } = orderRes;

      // 2. Setup Razorpay options
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID, 
        amount: order.amount,
        currency: order.currency,
        name: "ZeeBac Wallet",
        description: "Wallet Recharge",
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await VendorAPI.verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: addAmount
            });

            if (verifyRes.success) {
              alert(`₹${addAmount} added successfully!`);
              window.location.reload();
            } else {
              alert("Payment verification failed");
            }
          } catch (err) {
            console.error(err);
            alert("Error verifying payment");
          }
        },
        prefill: {
          name: "Vendor",
          contact: "9999999999"
        },
        theme: {
          color: "#7E3AF2"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
        alert("Payment failed");
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setIsProcessing(false);
      setShowAddModal(false);
      setAmount('');
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!addAmount || Number(addAmount) <= 0) return;
    if (Number(addAmount) > wallet?.balance) {
      alert("Insufficient balance");
      return;
    }
    
    setIsProcessing(true);
    try {
      const res = await VendorAPI.requestWithdrawal(Number(addAmount));
      if (res.success) {
        alert(`Withdrawal request for ₹${addAmount} submitted successfully!`);
        window.location.reload();
      } else {
        alert(res.message || "Failed to submit withdrawal");
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Error submitting withdrawal request");
    } finally {
      setIsProcessing(false);
      setShowWithdrawModal(false);
      setAmount('');
    }
  };

  const displayBalance = wallet ? wallet.balance : globalBalance;
  const totalEarned = wallet ? wallet.totalEarned : 0;
  const totalWithdrawn = wallet ? wallet.totalWithdrawn : 0;

  return (
    <>
      <div className="animate-reveal text-left pb-20">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Wallet</span>
      </header>

      <div className="space-y-6 pt-2 pb-6">

      {/* Constrain width on desktop so the card doesn't become massive */}
      <div className="md:max-w-[400px] space-y-4">
        {/* Balance Card — physical card style */}
        <div className="relative overflow-hidden rounded-2xl p-4.5 text-white shadow-md bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] aspect-[2.1/1] flex flex-col justify-between">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-xl -mb-10 -ml-10 pointer-events-none" />
          
          {/* Card Header */}
          <div className="relative z-10 flex justify-between items-start">
            <div className="flex items-center gap-1 opacity-80">
              <span className="material-symbols-outlined text-[14px]">account_balance_wallet</span>
              <span className="text-[10px] font-bold tracking-wider uppercase">Cashback Wallet</span>
            </div>
            <span className="material-symbols-outlined text-[18px] opacity-50">contactless</span>
          </div>

          {/* Balance Amount */}
          <div className="relative z-10 my-1">
            <h2 className="text-[28px] font-display font-black leading-none tracking-tight">
              {loading ? '...' : `₹${displayBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </h2>
          </div>

          {/* Card Footer */}
          <div className="relative z-10 flex justify-between items-end opacity-70">
            <div className="text-[9px] tracking-widest font-mono">**** **** 9921</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">{currentUser?.storeName || 'Vendor Store'}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex-1 py-2 bg-primary text-white rounded-xl font-bold active:scale-[0.97] transition-all shadow-md shadow-primary/20 flex flex-col items-center justify-center gap-0.5 text-[10.5px]"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add Funds
          </button>
          
          <button 
            onClick={() => setShowWithdrawModal(true)}
            className="flex-1 py-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm flex flex-col items-center justify-center gap-0.5 text-[10.5px]"
          >
            <span className="material-symbols-outlined text-[18px]">account_balance</span>
            Withdraw
          </button>

          <button 
            onClick={() => navigate('/vendor/passbook')}
            className="flex-1 py-2 bg-white text-primary rounded-xl font-bold active:scale-[0.97] transition-all border border-outline-variant/10 shadow-sm flex flex-col items-center justify-center gap-0.5 text-[10.5px]"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            Ledger
          </button>
        </div>
      </div>

      {/* Stats Row - Compact */}
      <div className="grid grid-cols-2 gap-3">
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[18px] font-extrabold text-on-surface">Recent Activity</h3>
          <button onClick={() => navigate('/vendor/passbook')} className="text-[14px] text-primary font-medium hover:underline cursor-pointer">See All</button>
        </div>

        <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
          {loading ? (
             <div className="py-6 text-center text-on-surface-variant">Loading...</div>
          ) : activities.length === 0 ? (
             <div className="py-6 text-center text-on-surface-variant text-[13px]">No wallet activity yet.</div>
          ) : activities.map((act, index) => (
            <div key={act.id} className={`p-3 flex items-center justify-between active:bg-surface-container-low/50 transition-colors ${
              index !== activities.length - 1 ? 'border-b border-outline-variant/5' : ''
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  act.type === 'credit' ? 'bg-green-50' :
                  act.type === 'cashout' ? 'bg-primary/5' :
                  'bg-red-50'
                }`}>
                  <span className={`material-symbols-outlined text-[20px] ${
                    act.type === 'credit' ? 'text-green-600' :
                    act.type === 'cashout' ? 'text-primary' : 'text-red-600'
                  }`}>
                    {act.type === 'credit' ? 'arrow_downward' :
                     act.type === 'cashout' ? 'account_balance' : 'arrow_upward'}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-[13px] text-on-surface">{act.title}</p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">{act.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-black text-[14px] ${act.type === 'credit' ? 'text-green-600' : 'text-on-surface'}`}>{act.amount}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-outline mt-0.5">{act.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
      </div>

      {/* Add Funds Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && setShowAddModal(false)} />
          <div className="relative bg-white w-full max-w-[400px] rounded-3xl p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-[22px] font-black text-on-surface">Add Funds</h3>
              <button onClick={() => !isProcessing && setShowAddModal(false)} className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors active:scale-95">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-6">
              {/* Amount Input */}
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

              {/* Mock Payment Methods */}
              <div className="space-y-3">
                <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Pay Via UPI</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setAmount('1000')} className="py-2.5 rounded-xl border border-outline-variant/20 hover:border-primary hover:bg-primary/5 font-bold text-[14px] text-on-surface transition-colors">+ ₹1,000</button>
                  <button onClick={() => setAmount('5000')} className="py-2.5 rounded-xl border border-outline-variant/20 hover:border-primary hover:bg-primary/5 font-bold text-[14px] text-on-surface transition-colors">+ ₹5,000</button>
                </div>
              </div>

              {/* Action Button */}
              <button 
                onClick={handleConfirmAddFunds}
                disabled={!addAmount || isProcessing}
                className={`w-full py-4 rounded-xl font-bold text-[16px] transition-all flex items-center justify-center gap-2 ${
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
                  <>
                    Proceed to Pay {addAmount ? `₹${addAmount}` : ''}
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 animate-reveal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isProcessing && setShowWithdrawModal(false)} />
          <div className="relative bg-white w-full max-w-[400px] rounded-3xl p-6 shadow-2xl z-10 flex flex-col animate-slideUp max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-[22px] font-black text-on-surface">Withdraw Funds</h3>
              <button onClick={() => !isProcessing && setShowWithdrawModal(false)} className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors active:scale-95">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-surface-container-low p-4 rounded-xl flex justify-between items-center">
                <span className="text-[12px] font-bold text-on-surface-variant">Available Balance</span>
                <span className="text-[16px] font-black text-primary">₹{wallet?.balance.toLocaleString()}</span>
              </div>
              
              {/* Amount Input */}
              <div className="space-y-2">
                <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Withdraw Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[24px] font-black text-primary">₹</span>
                  <input 
                    type="number" 
                    value={addAmount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl py-4 pl-12 pr-4 text-[24px] font-black text-on-surface outline-none focus:border-primary focus:bg-white transition-all placeholder:text-outline-variant/30"
                  />
                </div>
              </div>

              <div className="text-[11px] text-on-surface-variant/70 text-center">
                Withdrawals are processed within 24-48 business hours to your registered bank account.
              </div>

              <button 
                onClick={handleConfirmWithdraw}
                disabled={!addAmount || isProcessing || Number(addAmount) > wallet?.balance}
                className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all flex items-center justify-center gap-2
                  ${!addAmount || isProcessing || Number(addAmount) > wallet?.balance
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
                    <span className="material-symbols-outlined text-[20px]">account_balance</span>
                    Withdraw ₹{addAmount || '0'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
