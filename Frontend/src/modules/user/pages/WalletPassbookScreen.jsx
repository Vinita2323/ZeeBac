import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';

export default function WalletPassbookScreen() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filters = ['All', 'Credited', 'Debited', 'Pending'];

  const transactions = [
    {
      id: 1,
      name: "Apple Premium Reseller",
      time: "Oct 24, 2023 • 14:30",
      amount: "-$129.00",
      type: "Debited",
      status: "Completed",
      icon: "shopping_bag"
    },
    {
      id: 2,
      name: "L'Artusi Restaurant",
      time: "Oct 23, 2023 • 20:15",
      amount: "+$12.50",
      type: "Credited",
      status: "Completed",
      icon: "restaurant"
    },
    {
      id: 3,
      name: "Cashout Transfer to Bank",
      time: "Oct 20, 2023 • 09:00",
      amount: "-$50.00",
      type: "Debited",
      status: "Completed",
      icon: "account_balance"
    },
    {
      id: 4,
      name: "Shell Gas Station",
      time: "Just now",
      amount: "+$4.20",
      type: "Credited",
      status: "Pending",
      icon: "local_gas_station"
    }
  ];

  // Filtering transactions
  const filteredTx = transactions.filter(tx => {
    const matchesFilter = activeFilter === 'All' || tx.type === activeFilter || (activeFilter === 'Pending' && tx.status === 'Pending');
    const matchesSearch = tx.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      
      {/* Header with Search and Filter tab */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm space-y-md">
        <div className="flex items-center gap-xs">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <div className="flex-grow relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
            <input 
              className="w-full h-11 pl-10 pr-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-body-lg font-body-lg placeholder:text-outline transition-all"
              placeholder="Search statements..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-sm overflow-x-auto pb-1 scroll-hide">
          {filters.map((fil) => (
            <button
              key={fil}
              onClick={() => setActiveFilter(fil)}
              className={`px-4 py-2 rounded-full font-title-md text-[13px] whitespace-nowrap cursor-pointer transition-colors ${
                activeFilter === fil 
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {fil}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg text-left">
        <div className="space-y-md">
          {filteredTx.length > 0 ? (
            filteredTx.map((tx) => {
              return (
                <div 
                  key={tx.id}
                  className="glass-card rounded-2xl p-sm border border-outline-variant/30 flex items-center gap-md"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    tx.type === 'Credited' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                  }`}>
                    <span className="material-symbols-outlined">{tx.icon}</span>
                  </div>
                  <div className="flex-grow text-left space-y-0.5">
                    <h4 className="font-title-md text-on-surface font-bold text-body-lg">{tx.name}</h4>
                    <p className="text-caption text-on-surface-variant text-[12px]">{tx.time}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-black text-body-lg ${
                      tx.type === 'Credited' ? 'text-green-600' : 'text-red-600'
                    }`}>{tx.amount}</p>
                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      tx.status === 'Pending' 
                        ? 'bg-amber-100 text-amber-700' 
                        : tx.type === 'Credited' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>{tx.status}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-20 text-center space-y-xs animate-reveal">
              <span className="material-symbols-outlined text-outline text-[48px]">history</span>
              <p className="font-title-md text-on-surface font-bold">No statements found</p>
              <p className="text-body-sm text-on-surface-variant">Try selecting other filters or queries</p>
            </div>
          )}
        </div>
      </main>

      {/* Shared Bottom NavBar */}
      <BottomNavBar />
    </div>
  );
}
