import { useState, useEffect } from 'react';

export default function VendorsPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name_asc');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const vendors = [
    { id: 'V-1042', name: 'Coffee House Central', owner: 'Ramesh K.', category: 'Food & Beverage', aadhaar: 'XXXX-XXXX-1122', pan: 'ABCDE1234F', status: 'Pending', joined: 'Today' },
    { id: 'V-1043', name: 'Elite Electronics', owner: 'Suresh M.', category: 'Retail', aadhaar: 'XXXX-XXXX-3344', pan: 'XYZDE5678G', status: 'Pending', joined: 'Yesterday' },
    { id: 'V-0921', name: 'Noir Concept Store', owner: 'Karan V.', category: 'Premium Fashion', aadhaar: 'XXXX-XXXX-9988', pan: 'NOIRP9999X', status: 'Verified', joined: 'Oct 12, 2023' },
    { id: 'V-0922', name: 'Fresh Mart', owner: 'Anita S.', category: 'Groceries', aadhaar: 'XXXX-XXXX-5566', pan: 'FMSAA8888B', status: 'Verified', joined: 'Oct 15, 2023' },
    { id: 'V-0923', name: 'Tech Zone', owner: 'Pooja R.', category: 'Electronics', aadhaar: 'XXXX-XXXX-7777', pan: 'TECHP7777T', status: 'Rejected', joined: 'Nov 02, 2023' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <div className="h-8 bg-outline-variant/20 rounded w-48"></div>
            <div className="h-4 bg-outline-variant/10 rounded w-64"></div>
          </div>
          <div className="h-10 bg-outline-variant/10 rounded-xl w-72"></div>
        </div>
        <div className="flex gap-4 border-b border-outline-variant/10 pb-2">
          {[1,2,3,4].map(i => <div key={i} className="h-8 bg-outline-variant/10 rounded w-24"></div>)}
        </div>
        <div className="bg-white rounded-xl border border-outline-variant/5 p-4 space-y-4">
          <div className="h-10 bg-outline-variant/10 rounded w-full"></div>
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-outline-variant/5 rounded w-full"></div>)}
        </div>
      </div>
    );
  }

  let filteredVendors = vendors.filter(v => 
    (activeTab === 'All' || v.status === activeTab) &&
    (v.name.toLowerCase().includes(search.toLowerCase()) || v.owner.toLowerCase().includes(search.toLowerCase()))
  );

  filteredVendors.sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    if (sortBy === 'category') return a.category.localeCompare(b.category);
    return 0;
  });

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Vendor Management</h1>
          <p className="text-body-md text-on-surface-variant">Verify KYC documents and manage vendor accounts</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
            <input 
              type="text" 
              placeholder="Search vendors..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 focus:w-full sm:focus:w-72 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] transition-all duration-300"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px]">sort</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl pl-9 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="category">Category</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px] pointer-events-none">expand_more</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-outline-variant/20">
        {['All', 'Pending', 'Verified', 'Rejected'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-title-md text-[14px] capitalize transition-all border-b-2 ${
              activeTab === tab 
                ? 'border-primary text-primary font-bold' 
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab}
            {tab === 'Pending' && <span className="ml-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">2</span>}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-[#f8f9fc]">
                <th className="p-4 font-bold">Store</th>
                <th className="p-4 font-bold">Category</th>
                <th className="p-4 font-bold">Owner (KYC)</th>
                <th className="p-4 font-bold">Joined</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                  <td className="p-4">
                    <p className="font-bold text-on-surface">{vendor.name}</p>
                    <p className="font-mono text-[11px] text-on-surface-variant mt-0.5">{vendor.id}</p>
                  </td>
                  <td className="p-4 text-on-surface-variant">{vendor.category}</td>
                  <td className="p-4">
                    <p className="font-medium text-on-surface">{vendor.owner}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">Aadhaar: {vendor.aadhaar}</p>
                    <p className="text-[11px] text-on-surface-variant">PAN: {vendor.pan}</p>
                  </td>
                  <td className="p-4 text-on-surface-variant">{vendor.joined}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide
                      ${vendor.status === 'Verified' ? 'bg-green-500/10 text-green-600' : ''}
                      ${vendor.status === 'Pending' ? 'bg-orange-500/10 text-orange-600' : ''}
                      ${vendor.status === 'Rejected' ? 'bg-red-500/10 text-red-600' : ''}
                    `}>
                      {vendor.status}
                    </span>
                  </td>
                  <td className="p-4 flex justify-center gap-2 items-center h-full">
                    {vendor.status === 'Pending' ? (
                      <>
                        <button className="px-3 py-1.5 bg-green-500/10 text-green-600 font-bold text-[12px] rounded-lg hover:bg-green-500 hover:text-white transition-colors cursor-pointer">
                          Approve
                        </button>
                        <button className="px-3 py-1.5 bg-red-500/10 text-red-600 font-bold text-[12px] rounded-lg hover:bg-red-500 hover:text-white transition-colors cursor-pointer">
                          Reject
                        </button>
                      </>
                    ) : (
                      <button className="px-4 py-1.5 bg-primary/10 text-primary font-bold text-[12px] rounded-lg hover:bg-primary hover:text-white transition-colors cursor-pointer">
                        View Details
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredVendors.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant">
                    No vendors found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
