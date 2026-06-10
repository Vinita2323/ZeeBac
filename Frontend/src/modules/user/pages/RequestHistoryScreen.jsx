import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNavBar from '../components/common/BottomNavBar';

const INITIAL_MOCK_REQUESTS = [
  {
    id: "CR-904123",
    vendorName: "Noir Concept Store",
    vendorId: "ZB-VND-001",
    amount: "150.00",
    cashbackAmount: "22.50",
    date: "2026-06-08",
    paymentMethod: "Card",
    description: "Autumn coat purchase",
    status: "Approved",
    submittedAt: "Jun 08, 2026 • 10:17 AM",
    billImg: "https://lh3.googleusercontent.com/aida-public/AB6AXuCek6Qqfna9I0EwH5TU1y-WDUo4klPNl2WQ-d-bdDy7I-GqtHDS61K7BrgeDgRhD3ge8p_GN9dJxnxep8XKqjN-CPyGbf9DT9B9WMtJbqyGvdjPWEbQJbLRzgiHPa5y9u2aZhTPhlRoObRoOd6LiaG5Za2ayy-DsNWvSDQNREp-tlP4TfwlIMp1_2Liz0hN1AoiYMj2cCX_KF5wo3yYJmfcqVgDK0zIXptrf-Hsnck4TFfSxW__kbnf7MKIGYvcYkgiLDpMJ285KsZS",
    timeline: [
      { name: "Draft", completed: true, date: "Jun 08, 2026 • 10:15 AM" },
      { name: "Submitted", completed: true, date: "Jun 08, 2026 • 10:17 AM" },
      { name: "Pending Vendor Approval", completed: true, date: "Jun 08, 2026 • 10:17 AM" },
      { name: "Under Verification", completed: true, date: "Jun 08, 2026 • 11:30 AM" },
      { name: "Approved / Rejected", completed: true, date: "Jun 08, 2026 • 02:00 PM" },
      { name: "Wallet Credited", completed: true, date: "Jun 08, 2026 • 02:05 PM" }
    ]
  },
  {
    id: "CR-801293",
    vendorName: "Fresh Foods Organic",
    vendorId: "ZB-VND-002",
    amount: "64.20",
    cashbackAmount: "5.14",
    date: "2026-06-09",
    paymentMethod: "UPI",
    description: "Weekly grocery stock",
    status: "Pending",
    submittedAt: "Jun 09, 2026 • 06:24 PM",
    billImg: "https://lh3.googleusercontent.com/aida-public/AB6AXuCek6Qqfna9I0EwH5TU1y-WDUo4klPNl2WQ-d-bdDy7I-GqtHDS61K7BrgeDgRhD3ge8p_GN9dJxnxep8XKqjN-CPyGbf9DT9B9WMtJbqyGvdjPWEbQJbLRzgiHPa5y9u2aZhTPhlRoObRoOd6LiaG5Za2ayy-DsNWvSDQNREp-tlP4TfwlIMp1_2Liz0hN1AoiYMj2cCX_KF5wo3yYJmfcqVgDK0zIXptrf-Hsnck4TFfSxW__kbnf7MKIGYvcYkgiLDpMJ285KsZS",
    timeline: [
      { name: "Draft", completed: true, date: "Jun 09, 2026 • 06:22 PM" },
      { name: "Submitted", completed: true, date: "Jun 09, 2026 • 06:24 PM" },
      { name: "Pending Vendor Approval", completed: true, date: "Jun 09, 2026 • 06:24 PM" },
      { name: "Under Verification", completed: false },
      { name: "Approved / Rejected", completed: false },
      { name: "Wallet Credited", completed: false }
    ]
  }
];

export default function RequestHistoryScreen() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem('cashback_requests');
    if (stored) {
      setRequests(JSON.parse(stored));
    } else {
      // Seed with initial mock requests
      localStorage.setItem('cashback_requests', JSON.stringify(INITIAL_MOCK_REQUESTS));
      setRequests(INITIAL_MOCK_REQUESTS);
    }
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const filteredRequests = requests.filter(req => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Pending') return req.status === 'Pending' || req.status.startsWith('Pending');
    if (activeTab === 'Approved') return req.status === 'Approved';
    if (activeTab === 'Rejected') return req.status === 'Rejected';
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="bg-green-100 text-green-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Approved</span>;
      case 'Rejected':
        return <span className="bg-red-100 text-red-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Rejected</span>;
      default:
        return <span className="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Pending</span>;
    }
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm justify-between">
        <div className="flex items-center gap-xs">
          <button 
            onClick={() => navigate('/home')}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Cashback Requests</span>
        </div>
        
        <button 
          onClick={() => navigate('/request-cashback')}
          className="w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center cursor-pointer transition-colors"
          title="New Request"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-outline-variant/20 flex justify-around select-none">
        {['All', 'Pending', 'Approved', 'Rejected'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-grow py-3 font-title-md text-[14px] capitalize cursor-pointer border-b-2 text-center transition-all ${
              activeTab === tab 
                ? 'border-primary text-primary font-bold' 
                : 'border-transparent text-on-surface-variant'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main body requests list */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg relative text-left">
        <div className="space-y-md">
          {filteredRequests.length > 0 ? (
            filteredRequests.map((req) => (
              <div 
                key={req.id}
                onClick={() => navigate(`/request/${req.id}`)}
                className="glass-card rounded-2xl p-md border border-outline-variant/30 flex flex-col gap-sm shadow-sm hover:shadow-md cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="text-left space-y-0.5">
                    <h4 className="font-title-md text-on-surface font-extrabold text-body-lg leading-tight">{req.vendorName}</h4>
                    <p className="font-label-mono text-[11px] text-outline">ID: {req.id}</p>
                  </div>
                  {getStatusBadge(req.status)}
                </div>

                <div className="grid grid-cols-2 gap-sm pt-xs border-t border-outline-variant/10 text-body-sm text-on-surface-variant">
                  <div>
                    <p className="font-caption text-[10px] uppercase">Bill Amount</p>
                    <p className="font-bold text-on-surface">${req.amount}</p>
                  </div>
                  <div>
                    <p className="font-caption text-[10px] uppercase text-secondary font-bold">Est. Cashback</p>
                    <p className="font-bold text-secondary">${req.cashbackAmount}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-caption text-outline text-[11px] pt-xs">
                  <span>{new Date(req.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="text-primary font-bold flex items-center gap-[2px]">
                    Track Status <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 text-center space-y-xs">
              <span className="material-symbols-outlined text-outline text-[48px]">receipt_long</span>
              <p className="font-title-md text-on-surface font-bold">No requests found</p>
              <p className="text-body-sm text-on-surface-variant">Try submitting a new bill receipt for validation</p>
            </div>
          )}
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
