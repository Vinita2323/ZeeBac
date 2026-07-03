import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';

export default function FindVendorScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [foundVendor, setFoundVendor] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    setError('');
    setFoundVendor(null);
    setIsSearching(true);
    try {
      const res = await UserAPI.lookupVendor(query);
      if (res.success) setFoundVendor(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'No vendor found. Please check and try again.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-on-surface flex flex-col font-body-lg">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 flex items-center border-b border-outline-variant/10 shadow-sm">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 transition-all cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-2">Find Vendor</span>
      </header>

      <main className="flex-1 max-w-[440px] mx-auto w-full px-5 py-6 flex flex-col text-left">

        {/* Search Section */}
        <div className="space-y-2 mb-6">
          <h1 className="text-[22px] font-black text-on-surface tracking-tight">Enter Vendor Details</h1>
          <p className="text-[13px] text-on-surface-variant">Enter a vendor's Zeebac ID (e.g., ZBV-1234) or their registered phone number.</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant">search</span>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(''); setFoundVendor(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ZBV-1234 or 9876543210"
              className="w-full h-[56px] pl-12 pr-4 bg-white border-2 border-outline-variant/20 rounded-xl outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] text-body-lg font-bold transition-all uppercase"
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className={`w-full h-[52px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              query.trim()
                ? 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98]'
                : 'bg-outline-variant/40 text-on-surface/30 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">person_search</span>
            Search Vendor
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px] font-medium flex items-start gap-2 animate-reveal">
            <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
            {error}
          </div>
        )}

        {/* Found Vendor Card */}
        {foundVendor && (
          <div className="mt-6 animate-reveal">
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Vendor Found</p>
            <div className="bg-white rounded-2xl border border-outline-variant/15 p-5 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0">
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[16px] font-black text-on-surface truncate">{foundVendor.storeName}</h2>
                  <p className="text-[12px] text-on-surface-variant">{foundVendor.category}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded">{foundVendor.zeebacId}</span>
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{foundVendor.cashbackRate || 10}% cashback</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px] text-on-surface-variant mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">phone</span>
                  +91 {foundVendor.phone}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                  {foundVendor.pincode || 'N/A'}
                </div>
              </div>

              <button
                onClick={() => navigate('/pay-vendor', { state: { vendor: foundVendor } })}
                className="w-full h-[48px] rounded-xl bg-primary text-white font-title-md shadow-lg hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">payments</span>
                Pay & Earn Cashback
              </button>
            </div>
          </div>
        )}

        <div className="mt-8">
          <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Recent Transactions</p>
          <p className="text-[13px] text-on-surface-variant/60 text-center py-6">
            Your recent vendor payments will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
