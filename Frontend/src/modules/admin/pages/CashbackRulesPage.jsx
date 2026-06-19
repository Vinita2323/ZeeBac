import { useState, useEffect } from 'react';

export default function CashbackRulesPage() {
  const [globalMax, setGlobalMax] = useState(15);
  const [firstPurchaseEnabled, setFirstPurchaseEnabled] = useState(true);
  const [referralEnabled, setReferralEnabled] = useState(false);
  const [localShopEnabled, setLocalShopEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="space-y-2 mb-6">
          <div className="h-8 bg-outline-variant/20 rounded w-48"></div>
          <div className="h-4 bg-outline-variant/10 rounded w-64"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-outline-variant/5 p-6 space-y-4">
              <div className="h-6 bg-outline-variant/10 rounded w-32"></div>
              <div className="h-16 bg-outline-variant/5 rounded w-full"></div>
            </div>
            <div className="bg-white rounded-xl border border-outline-variant/5 p-6 space-y-6">
              <div className="h-6 bg-outline-variant/10 rounded w-40"></div>
              {[1,2,3].map(i => <div key={i} className="h-12 bg-outline-variant/5 rounded w-full"></div>)}
            </div>
          </div>
          <div className="space-y-6">
            <div className="h-64 bg-outline-variant/10 rounded-xl w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div>
        <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Cashback Rules Engine</h1>
        <p className="text-body-md text-on-surface-variant">Configure platform-wide reward limits and operational policies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Configuration Settings */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white p-6 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h3 className="font-title-lg font-bold text-on-surface mb-4">Global Limits</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[14px] font-bold text-on-surface-variant">Maximum Vendor Cashback allowed (%)</label>
                  <span className="font-display text-[24px] font-black text-primary">{globalMax}%</span>
                </div>
                <input 
                  type="range" 
                  min="1" max="50" 
                  value={globalMax} 
                  onChange={(e) => setGlobalMax(e.target.value)}
                  className="w-full h-2 bg-surface-container-low rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[12px] text-on-surface-variant mt-2">Vendors cannot set their store cashback rate higher than this global limit.</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h3 className="font-title-lg font-bold text-on-surface mb-6">Program Toggles</h3>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[15px] font-bold text-on-surface">First Purchase Bonus</h4>
                  <p className="text-[12px] text-on-surface-variant">Automatically double the cashback on a user's first platform transaction.</p>
                </div>
                <button 
                  onClick={() => setFirstPurchaseEnabled(!firstPurchaseEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${firstPurchaseEnabled ? 'bg-primary' : 'bg-outline-variant/30'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${firstPurchaseEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[15px] font-bold text-on-surface">Referral Program</h4>
                  <p className="text-[12px] text-on-surface-variant">Give ₹50 bonus when a referred user makes their first transaction.</p>
                </div>
                <button 
                  onClick={() => setReferralEnabled(!referralEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${referralEnabled ? 'bg-primary' : 'bg-outline-variant/30'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${referralEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[15px] font-bold text-on-surface">Local Shop Mode (No Receipt)</h4>
                  <p className="text-[12px] text-on-surface-variant">Allow unverified local vendors to accept face-to-face payments with 0% cashback.</p>
                </div>
                <button 
                  onClick={() => setLocalShopEnabled(!localShopEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${localShopEnabled ? 'bg-primary' : 'bg-outline-variant/30'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${localShopEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                </button>
              </div>
            </div>
            
          </div>

          <div className="flex justify-end">
            <button className="h-12 px-8 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-md active:scale-[0.98]">
              Save Configuration
            </button>
          </div>
        </div>

        {/* Right Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-primary text-white p-6 rounded-2xl shadow-lg bg-gradient-to-br from-primary to-[#2c006b]">
            <span className="material-symbols-outlined text-[32px] mb-2 text-white/80">info</span>
            <h3 className="font-title-lg font-bold mb-2">Rule Processing Order</h3>
            <p className="text-[13px] text-white/80 leading-relaxed">
              When multiple rules apply to a single transaction, the engine processes them in the following order:
            </p>
            <ol className="list-decimal list-inside mt-4 space-y-2 text-[13px] font-bold text-white/90">
              <li>Local Shop override (forces 0%)</li>
              <li>Global Maximum Cap</li>
              <li>Vendor Custom Rate</li>
              <li>First Purchase Multiplier</li>
            </ol>
          </div>
        </div>

      </div>
    </div>
  );
}
