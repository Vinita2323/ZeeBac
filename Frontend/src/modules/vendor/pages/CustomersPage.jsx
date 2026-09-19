import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';

const getLoyaltyTier = (visits, totalSpentNum) => {
  if (visits >= 10 || totalSpentNum >= 5000) {
    return { 
      id: 'vip', 
      name: 'VIP Patron', 
      tagBg: 'bg-purple-50 text-purple-700 border-purple-200', 
      icon: 'workspace_premium',
      avatarRing: 'ring-2 ring-purple-400' 
    };
  }
  if (visits >= 5 || totalSpentNum >= 2500) {
    return { 
      id: 'gold', 
      name: 'Gold Member', 
      tagBg: 'bg-amber-50 text-amber-700 border-amber-200', 
      icon: 'military_tech',
      avatarRing: 'ring-2 ring-amber-400' 
    };
  }
  if (visits >= 2) {
    return { 
      id: 'repeat', 
      name: 'Repeat Regular', 
      tagBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      icon: 'verified',
      avatarRing: 'ring-1 ring-emerald-300' 
    };
  }
  return { 
    id: 'new', 
    name: 'New Patron', 
    tagBg: 'bg-blue-50 text-blue-700 border-blue-200', 
    icon: 'person_add',
    avatarRing: 'ring-1 ring-blue-200' 
  };
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all'); // 'all', 'vip', 'repeat', 'new', 'reviewed'
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await VendorAPI.getVendorCustomers();
        if (res.success && Array.isArray(res.data)) {
          const formatted = res.data.map(c => {
            const rawSpent = typeof c.totalSpent === 'number' ? c.totalSpent : parseFloat(c.totalSpent) || 0;
            const visits = c.totalTransactions || 1;
            const tier = getLoyaltyTier(visits, rawSpent);
            const reviewRating = typeof c.reviewRating === 'number' ? c.reviewRating : parseFloat(c.reviewRating) || 0;

            return {
              id: c.customerZeebacId || c._id,
              name: c.customerName || c.customerPhone || 'Valued Customer',
              phone: c.customerPhone || '',
              visits,
              totalSpentRaw: rawSpent,
              totalSpent: `₹${rawSpent.toLocaleString('en-IN')}`,
              lastVisit: c.lastTransactionDate ? new Date(c.lastTransactionDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              }) : 'Recent',
              rating: reviewRating,
              tier,
              avatarBg: 'bg-primary/10 text-primary',
            };
          });
          setCustomers(formatted);
        }
      } catch (err) {
        console.error("Failed to fetch customers", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  // Filtered list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        c.name.toLowerCase().includes(q) || 
        (c.id && c.id.toLowerCase().includes(q)) || 
        (c.phone && c.phone.includes(q));

      let matchesTier = true;
      if (tierFilter === 'vip') matchesTier = c.tier.id === 'vip';
      else if (tierFilter === 'repeat') matchesTier = c.visits >= 2;
      else if (tierFilter === 'new') matchesTier = c.visits === 1;
      else if (tierFilter === 'reviewed') matchesTier = c.rating > 0;

      return matchesSearch && matchesTier;
    });
  }, [customers, searchQuery, tierFilter]);

  // Aggregate Metrics
  const stats = useMemo(() => {
    const total = customers.length;
    const repeatCount = customers.filter(c => c.visits >= 2).length;
    const vipCount = customers.filter(c => c.tier.id === 'vip' || c.tier.id === 'gold').length;
    const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpentRaw || 0), 0);
    return { total, repeatCount, vipCount, totalRevenue };
  }, [customers]);

  return (
    <div className="animate-reveal text-left max-w-5xl mx-auto space-y-6 pb-20">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Customer CRM</span>
      </header>

      {/* Page Title (Desktop) */}
      <div className="hidden md:flex justify-between items-center">
        <div>
          <h1 className="text-title-lg font-display font-black text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">groups</span>
            Customer CRM & Loyalty
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Track customer visits, lifetime spend, verified reviews, and patron loyalty tiers
          </p>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-outline-variant/15 shadow-sm">
          <p className="text-on-surface-variant text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1">Unique Customers</p>
          <p className="text-[20px] sm:text-[24px] font-black text-primary leading-none tracking-tight">{stats.total}</p>
          <span className="text-[9.5px] sm:text-[10px] text-on-surface-variant font-medium mt-1 inline-block">Registered buyers</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-outline-variant/15 shadow-sm">
          <p className="text-emerald-700 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1">Repeat Regulars</p>
          <p className="text-[20px] sm:text-[24px] font-black text-emerald-600 leading-none tracking-tight">{stats.repeatCount}</p>
          <span className="text-[9.5px] sm:text-[10px] text-emerald-700/80 font-medium mt-1 inline-block">2+ store visits</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-outline-variant/15 shadow-sm">
          <p className="text-purple-700 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1">VIP & Gold Patrons</p>
          <p className="text-[20px] sm:text-[24px] font-black text-purple-600 leading-none tracking-tight">{stats.vipCount}</p>
          <span className="text-[9.5px] sm:text-[10px] text-purple-700/80 font-medium mt-1 inline-block">High-value loyalty</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-outline-variant/15 shadow-sm">
          <p className="text-on-surface-variant text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1">Total Client Spend</p>
          <p className="text-[18px] sm:text-[22px] font-black text-gray-900 leading-none tracking-tight truncate">₹{stats.totalRevenue.toLocaleString('en-IN')}</p>
          <span className="text-[9.5px] sm:text-[10px] text-on-surface-variant font-medium mt-1 inline-block">Lifetime volume</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-outline-variant/15 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
          <input 
            type="text" 
            placeholder="Search by name, Zeebac ID, or mobile number..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-xl outline-none text-[13px] text-on-surface placeholder:text-outline font-medium"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-[16px] material-symbols-outlined"
            >
              close
            </button>
          )}
        </div>

        {/* Tier Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'all', label: 'All Customers' },
            { id: 'vip', label: 'VIP / Gold' },
            { id: 'repeat', label: 'Regulars (2+)' },
            { id: 'new', label: 'New Patrons' },
            { id: 'reviewed', label: 'Left Review ⭐' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setTierFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                tierFilter === f.id 
                  ? 'bg-primary text-white shadow-xs' 
                  : 'bg-surface-container-low border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Cards List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-outline-variant/15 p-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-[13px] font-bold text-on-surface-variant">Loading customer transaction data...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-outline-variant/15 p-12 text-center space-y-2">
            <span className="material-symbols-outlined text-outline text-[42px]">person_search</span>
            <p className="text-[14px] font-bold text-on-surface">No matching customers found</p>
            <p className="text-[12px] text-on-surface-variant max-w-xs mx-auto">
              {searchQuery ? 'Try adjusting your search query or filter criteria.' : 'Transactions logged through your QR or Cashier will appear here.'}
            </p>
          </div>
        ) : (
          filteredCustomers.map(customer => (
            <div 
              key={customer.id} 
              className="bg-white rounded-2xl border border-outline-variant/15 shadow-sm p-4 md:p-5 hover:border-primary/40 transition-all text-left"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-[16px] ${customer.avatarBg} ${customer.tier.avatarRing} shrink-0`}>
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-[14px] text-on-surface truncate">{customer.name}</h4>
                      
                      {/* Loyalty Tier Badge */}
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 shrink-0 ${customer.tier.tagBg}`}>
                        <span className="material-symbols-outlined text-[13px]">{customer.tier.icon}</span>
                        {customer.tier.name}
                      </span>
                    </div>

                    <p className="font-label-mono text-[11px] text-on-surface-variant mt-0.5 flex items-center gap-2">
                      <span>ID: {customer.id}</span>
                      {customer.phone && <span>• {customer.phone}</span>}
                    </p>
                  </div>
                </div>

                {/* Review Star Rating Badge (from MongoDB Review collection) */}
                <div className="shrink-0 text-right">
                  {customer.rating > 0 ? (
                    <div 
                      className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full text-[11px] font-black border border-amber-200 shadow-2xs" 
                      title={`Customer rated your store ${customer.rating.toFixed(1)} / 5`}
                    >
                      <span className="material-symbols-outlined text-[14px] text-amber-500" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
                      <span>{customer.rating.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-on-surface-variant/70 font-bold bg-surface-container-low px-2 py-0.5 rounded-md border border-outline-variant/10">
                      No review yet
                    </span>
                  )}
                </div>
              </div>
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-outline-variant/10 text-center bg-surface-container-lowest/50 rounded-xl p-2.5">
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Visits</p>
                  <p className="font-black text-on-surface text-[15px]">{customer.visits}</p>
                </div>
                <div className="border-x border-outline-variant/10">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Lifetime Spend</p>
                  <p className="font-black text-primary text-[15px]">{customer.totalSpent}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Last Seen</p>
                  <p className="font-medium text-on-surface text-[12px]">{customer.lastVisit}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
