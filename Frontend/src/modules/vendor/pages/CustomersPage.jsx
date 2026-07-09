import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await VendorAPI.getVendorCustomers();
        if (res.success) {
          const formatted = res.data.map(c => ({
            id: c.customerZeebacId || c._id,
            name: c.customerName || c.customerPhone || 'Unknown Customer',
            visits: c.totalTransactions,
            totalSpent: `₹${c.totalSpent.toLocaleString()}`,
            lastVisit: new Date(c.lastTransactionDate).toLocaleDateString(),
            rating: 0, // Mock for now
            avatarBg: 'bg-primary/10 text-primary'
          }));
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

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Customers</span>
      </header>

      <div className="space-y-6 pt-4">

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <p className="text-on-surface-variant text-[11px] font-bold mb-1">Total Unique Customers</p>
          <p className="text-[24px] font-black text-primary leading-none tracking-tight">{customers.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
        <input 
          type="text" 
          placeholder="Search customers..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-outline-variant/10 focus:border-primary rounded-2xl outline-none transition-all text-[14px] font-medium shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
        />
      </div>

      {/* Customer Cards */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-10 font-bold text-on-surface-variant">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-10 font-bold text-on-surface-variant">No customers found</div>
        ) : customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(customer => (
          <div key={customer.id} className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-[18px] ${customer.avatarBg}`}>
                {customer.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[15px] text-on-surface truncate">{customer.name}</h4>
                <p className="font-label-mono text-[11px] text-on-surface-variant mt-0.5">{customer.id}</p>
              </div>
              {customer.rating > 0 && (
                <div className="flex items-center gap-1 text-orange-500 bg-orange-50 px-2 py-1 rounded-full text-[12px] font-bold border border-orange-100">
                  <span className="material-symbols-outlined text-[14px]" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
                  {customer.rating}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-outline-variant/5 text-center">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Visits</p>
                <p className="font-black text-on-surface text-[15px]">{customer.visits}</p>
              </div>
              <div className="border-x border-outline-variant/5">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Spent</p>
                <p className="font-black text-on-surface text-[15px]">{customer.totalSpent}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Last Seen</p>
                <p className="font-medium text-on-surface text-[13px]">{customer.lastVisit}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      </div>

    </div>
  );
}
