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
  
  const bankDetails = currentUser?.bankDetails || {};
  const hasBank = !!bankDetails.accountNumber || !!bankDetails.upiId;

  const handleWithdraw = async () => {
    if (!amount || isNaN(amount) || amount < 50) return alert("Minimum withdrawal is ₹50");
    if (amount > balance) return alert("Insufficient balance");
    if (!hasBank) return alert("Please link a bank account first");

    setIsProcessing(true);
    try {
      const res = await UserAPI.requestWithdrawal(amount);
      if (res.success) {
        alert("Withdrawal request submitted successfully!");
        setBalance(prev => prev - amount);
        onBack();
      } else {
        alert(res.message || "Failed to submit request");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit request");
    } finally {
      setIsProcessing(false);
    }
  };

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

        {/* Amount Input */}
        <div className="space-y-sm">
          <label className="font-label-mono text-body-sm tracking-wider text-on-surface-variant">CASHOUT AMOUNT</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-title-lg text-on-surface-variant font-bold">₹</span>
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
          <p className="text-[11px] text-on-surface-variant/80 ml-2">Min ₹50 · Usually takes 1-2 hours</p>
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
          disabled={!hasBank || isProcessing || !amount || amount < 50 || amount > balance}
          className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
        >
          {isProcessing ? 'Processing...' : 'Confirm Cashout'}
          {!isProcessing && <span className="material-symbols-outlined">arrow_forward</span>}
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
                      {tx.status}
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
  const txCount = activities.length;
  const nextMilestone = 5;
  const progress = Math.min((txCount / nextMilestone) * 100, 100);

  // Generate some dummy scratch cards based on activity count
  const scratchCards = Array.from({ length: 4 }).map((_, i) => ({
    id: i,
    isUnlocked: i < txCount,
    isScratched: false,
    reward: i === 0 ? '₹15' : i === 1 ? '₹5' : '₹50'
  }));

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
        
        {/* Milestone Card */}
        <div className="bg-white rounded-3xl p-5 border border-outline-variant/20 shadow-md">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-bold text-body-lg text-on-surface">Weekly Milestone</h3>
              <p className="text-[12px] text-on-surface-variant">Shop at {nextMilestone - txCount > 0 ? nextMilestone - txCount : 0} more stores to unlock a Mystery Box!</p>
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
            <span>{txCount} payments</span>
            <span>{nextMilestone} payments</span>
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
                  card.isUnlocked 
                    ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/20 cursor-pointer' 
                    : 'bg-surface-container-low border-2 border-dashed border-outline-variant/30 text-on-surface-variant opacity-60'
                }`}
                onClick={() => {
                  if (card.isUnlocked) alert(`You won ${card.reward}! (Scratch animation placeholder)`);
                }}
              >
                {card.isUnlocked ? (
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

        {/* Partner Offers */}
        <div className="space-y-4">
          <h3 className="font-display text-title-md font-extrabold text-on-surface px-1">Partner Offers</h3>
          <div className="flex gap-4 overflow-x-auto pb-4 px-1 snap-x no-scrollbar">
            {/* Offer 1 */}
            <div className="min-w-[240px] bg-white border border-outline-variant/20 rounded-3xl p-4 shadow-sm snap-start flex-shrink-0">
              <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold mb-3">Z</div>
              <h4 className="font-bold text-body-md">Zomato Pro</h4>
              <p className="text-[12px] text-on-surface-variant mt-1 mb-3">Get 3 months free with 500 ZeeBac points</p>
              <button className="text-[12px] font-bold text-primary bg-primary/10 px-4 py-1.5 rounded-lg w-full">Claim Now</button>
            </div>
            {/* Offer 2 */}
            <div className="min-w-[240px] bg-white border border-outline-variant/20 rounded-3xl p-4 shadow-sm snap-start flex-shrink-0">
              <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white font-bold mb-3">S</div>
              <h4 className="font-bold text-body-md">Swiggy Instamart</h4>
              <p className="text-[12px] text-on-surface-variant mt-1 mb-3">Flat ₹100 off on your next grocery order</p>
              <button className="text-[12px] font-bold text-primary bg-primary/10 px-4 py-1.5 rounded-lg w-full">Claim Now</button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
