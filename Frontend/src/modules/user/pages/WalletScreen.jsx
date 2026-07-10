import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';

export default function WalletScreen() {
  const navigate = useNavigate();
  const authBalance = useAuthStore((state) => state.walletBalance);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  
  const [balance, setBalance] = useState(0);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subView, setSubView] = useState(null); // 'cashout' | 'perks'
  const [withdrawals, setWithdrawals] = useState([]);

  // Fetch real wallet and activities
  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await UserAPI.getMyWallet();
        if (res.success) {
          const realBalance = res.data.wallet?.balance || 0;
          useAuthStore.getState().updateBalance(realBalance);
          setBalance(realBalance);

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
            icon: entry.type === 'credit' ? 'redeem' : 'payments'
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

    if (subView === 'cashout') {
      UserAPI.getUserWithdrawals().then(res => {
        if(res.success) setWithdrawals(res.data);
      }).catch(console.error);
    }
  }, [subView]);

  if (subView === 'cashout') {
    return <CashoutSubView balance={balance} currentUser={currentUser} withdrawals={withdrawals} onBack={() => setSubView(null)} setBalance={setBalance} />;
  }

  if (subView === 'perks') {
    return <PerksSubView balance={balance} activities={activities} onBack={() => setSubView(null)} />;
  }
  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm justify-between">
        <div className="flex items-center gap-xs">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Rewards Wallet</span>
        </div>
      </header>

      {/* Main body content */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
        {/* Available rewards banner card */}
        <div className="bg-white border border-outline-variant/30 rounded-[2rem] p-lg shadow-md text-center space-y-md relative overflow-hidden">
          <div className="space-y-sm">
            <p className="font-caption text-[11px] text-on-surface-variant uppercase tracking-widest leading-none">Total Cashback Reward</p>
            <h2 className="text-[44px] font-display font-black text-primary leading-none">₹{balance.toFixed(2)}</h2>
          </div>

          {/* Quick buttons */}
          <div className="grid grid-cols-3 gap-sm pt-sm border-t border-outline-variant/10">
            <button 
              onClick={() => navigate('/passbook')}
              className="flex flex-col items-center gap-xs cursor-pointer hover:opacity-85 active:scale-95"
            >
              <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">history</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant">History</span>
            </button>
            <button 
              onClick={() => setSubView('cashout')}
              className="flex flex-col items-center gap-xs cursor-pointer hover:opacity-85 active:scale-95"
            >
              <div className="w-11 h-11 bg-secondary/10 rounded-full flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">account_balance</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant">Cashout</span>
            </button>
            <button 
              onClick={() => setSubView('perks')}
              className="flex flex-col items-center gap-xs cursor-pointer hover:opacity-85 active:scale-95"
            >
              <div className="w-11 h-11 bg-green-500/10 rounded-full flex items-center justify-center text-green-600">
                <span className="material-symbols-outlined text-[20px]">stars</span>
              </div>
              <span className="font-label-mono text-[10px] text-on-surface-variant">Perks</span>
            </button>
          </div>
        </div>

        {/* Cashback Requests History Link Banner */}
        <div 
          onClick={() => navigate('/passbook')}
          className="bg-white border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">history_edu</span>
            </div>
            <div className="text-left">
              <p className="font-title-md text-on-surface font-extrabold text-body-sm leading-none">Cashback Requests</p>
              <p className="font-caption text-[11px] text-on-surface-variant mt-1.5">View status of submitted bills & receipts</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline text-body-lg">chevron_right</span>
        </div>

        {/* Recent rewards transaction list */}
        <div className="space-y-md">
          <h3 className="font-display text-title-md text-on-surface font-extrabold">Recent Wallet Activity</h3>
          
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
                  <h4 className="font-title-md text-on-surface font-bold text-body-lg">{act.name}</h4>
                  <p className="text-caption text-on-surface-variant text-[12px]">{act.time}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display font-black text-body-lg ${
                    act.status === 'Credited' ? 'text-green-600' : 'text-red-600'
                  }`}>{act.amount}</p>
                  <span className="text-[10px] uppercase font-semibold text-outline tracking-wider">{act.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}

// ─── Phase A: Cashout SubView ───
function CashoutSubView({ balance, currentUser, withdrawals, onBack, setBalance }) {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null); // { success, isAuto, amount, message }
  const [errorMsg, setErrorMsg] = useState('');
  
  const bankDetails = currentUser?.bankDetails || {};
  const hasBank = !!bankDetails.accountNumber || !!bankDetails.upiId;
  const AUTO_LIMIT = 5000;

  const handleWithdraw = async () => {
    setErrorMsg('');
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount < 50) {
      setErrorMsg('Minimum withdrawal amount ₹50 hai');
      return;
    }
    if (numAmount > balance) {
      setErrorMsg('Balance insufficient hai');
      return;
    }
    if (!hasBank) {
      setErrorMsg('Pehle Profile me bank account link karo');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await UserAPI.requestWithdrawal(numAmount);
      if (res.success) {
        const isAuto = numAmount <= AUTO_LIMIT;
        setBalance(prev => prev - numAmount);
        setResult({ success: true, isAuto, amount: numAmount });
      } else {
        setErrorMsg(res.message || 'Kuch galat hua, dobara try karo');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Server error, dobara try karo');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Success State ───
  if (result?.success) {
    return (
      <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
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
              <p className="text-on-surface-variant text-[14px] mt-2 leading-relaxed">
                {result.isAuto
                  ? `₹${result.amount.toFixed(2)} aapke bank account me 1-2 ghante me transfer ho jayega.`
                  : `₹${result.amount.toFixed(2)} ka withdrawal request receive ho gaya. ₹5,000 se zyada ke withdrawals Admin review karte hain — 24-48 ghante me process hoga.`
                }
              </p>
            </div>

            {/* Amount Badge */}
            <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[18px] ${result.isAuto ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
              <span className="material-symbols-outlined text-[20px]">
                {result.isAuto ? 'account_balance' : 'pending'}
              </span>
              ₹{result.amount.toFixed(2)} — {result.isAuto ? 'Auto Approved' : 'Pending Review'}
            </div>

            {/* Info Box */}
            <div className={`rounded-2xl p-4 text-left text-[12px] leading-relaxed ${result.isAuto ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-orange-50 border border-orange-100 text-orange-800'}`}>
              {result.isAuto ? (
                <>
                  <p className="font-bold mb-1">ℹ️ Auto-Approved kyun hua?</p>
                  <p>₹5,000 tak ke withdrawals turant process hote hain bina Admin review ke. Paisa aapke registered bank/UPI me bheja jayega.</p>
                </>
              ) : (
                <>
                  <p className="font-bold mb-1">⚠️ Admin Review kyun?</p>
                  <p>₹5,000 se zyada ke withdrawals security ke liye manually review kiye jaate hain. Aapko notification milegi jab approve ho.</p>
                </>
              )}
            </div>

            <button
              onClick={onBack}
              className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Wallet Par Wapas Jao
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm justify-between">
        <div className="flex items-center gap-xs">
          <button onClick={onBack} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Cashout to Bank</span>
        </div>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl space-y-lg text-left">
        {/* Balance Card */}
        <div className="bg-white border border-outline-variant/30 rounded-3xl p-lg shadow-sm text-center">
          <p className="font-label-mono text-[12px] text-on-surface-variant tracking-wider">AVAILABLE FOR CASHOUT</p>
          <h2 className="text-[40px] font-display font-black text-primary mt-2">₹{balance.toFixed(2)}</h2>
        </div>

        {/* Auto-Approve Info Banner */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-3 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-green-600 text-[18px] mt-0.5 flex-shrink-0">bolt</span>
          <div>
            <p className="text-[12px] font-bold text-green-800">≤ ₹5,000 → Instant Auto-Approved</p>
            <p className="text-[11px] text-green-700 mt-0.5">> ₹5,000 → Admin review (24-48 hrs)</p>
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-sm">
          <label className="font-label-mono text-body-sm tracking-wider text-on-surface-variant">CASHOUT AMOUNT</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-title-lg text-on-surface-variant font-bold">₹</span>
            <input 
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setErrorMsg(''); }}
              placeholder="0.00"
              className="w-full h-16 pl-10 pr-24 bg-white border border-outline-variant/30 rounded-2xl text-title-lg font-bold text-on-surface focus:outline-none focus:border-primary/50 shadow-inner"
            />
            <button 
              onClick={() => setAmount(balance)}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary/10 text-primary text-label-sm font-bold rounded-lg active:scale-95"
            >
              MAX
            </button>
          </div>

          {/* Live Status Pill */}
          {amount && parseFloat(amount) >= 50 && (
            <div className={`flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full w-fit ${parseFloat(amount) <= AUTO_LIMIT ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              <span className="material-symbols-outlined text-[14px]">
                {parseFloat(amount) <= AUTO_LIMIT ? 'bolt' : 'pending'}
              </span>
              {parseFloat(amount) <= AUTO_LIMIT ? 'Instant Auto-Approved' : 'Admin Review Required'}
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
        </div>

        {/* Destination Account */}
        <div className="space-y-sm">
          <label className="font-label-mono text-body-sm tracking-wider text-on-surface-variant">DESTINATION ACCOUNT</label>
          {hasBank ? (
            <div className="bg-white border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#420093]/10 flex items-center justify-center text-[#420093]">
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
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
              <p className="text-red-600 text-body-sm font-bold">No Bank Account Linked</p>
              <p className="text-[11px] text-red-500/80 mt-1">Please link a bank account in your Profile first.</p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button 
          onClick={handleWithdraw}
          disabled={!hasBank || isProcessing || !amount || parseFloat(amount) < 50 || parseFloat(amount) > balance}
          className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
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
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-10">
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-[#103a5c] to-[#1e5d90] text-white pt-12 pb-6 px-6 rounded-b-[3rem] shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center gap-xs relative z-10 mb-4">
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="font-display text-title-md font-bold ml-1">Your Perks</span>
        </div>

        <div className="relative z-10 text-center space-y-1 mt-4">
          <div className="inline-block px-3 py-1 bg-white/10 rounded-full border border-white/20 mb-2">
            <span className="text-[11px] font-bold tracking-widest uppercase">🔥 5-Day Streak</span>
          </div>
          <h2 className="text-[32px] font-display font-black leading-tight">Reward Hub</h2>
          <p className="text-white/80 text-body-sm">Keep shopping to unlock exclusive perks</p>
        </div>
      </div>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-8 -mt-4 relative z-20">
        
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
