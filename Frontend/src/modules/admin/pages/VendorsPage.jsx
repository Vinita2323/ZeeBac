import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminAPI } from '../../../services/api';
import ApproveDialog from '../components/vendors/ApproveDialog';
import RejectDialog from '../components/vendors/RejectDialog';

const TABS = [
  { key: '', label: 'All' },
  { key: 'PENDING_REVIEW', label: 'Pending' },
  { key: 'RESUBMITTED', label: 'Resubmitted' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

const STATUS_BADGE = {
  DRAFT: 'bg-gray-100 text-gray-500',
  PENDING_REVIEW: 'bg-amber-500/10 text-amber-600',
  RESUBMITTED: 'bg-blue-500/10 text-blue-600',
  APPROVED: 'bg-green-500/10 text-green-600',
  REJECTED: 'bg-red-500/10 text-red-600',
};

export default function VendorsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const initialSearch = queryParams.get('search') || '';

  const [activeTab, setActiveTab] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const fetchVendors = async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getVendors(activeTab, 1, search);
      setVendors(res.data || []);
    } catch (error) {
      console.error('Failed to fetch vendors', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingCount = async () => {
    try {
      const res = await AdminAPI.getVendors('PENDING_REVIEW', 1, '');
      setPendingCount(res.meta?.total ?? (res.data || []).length);
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    const timer = setTimeout(() => { fetchVendors(); }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, search]);

  useEffect(() => { fetchPendingCount(); }, [vendors.length]);

  const handleExport = () => {
    if (vendors.length === 0) return alert('No vendors to export.');
    const headers = ["Zeebac ID", "Store Name", "Owner Name", "Category", "Cashback Rate", "Phone", "Status", "Resubmissions", "Joined"];
    const rows = vendors.map(v => [
      v.zeebacId, v.storeName, v.ownerName, v.category, v.cashbackRate ? `${v.cashbackRate}%` : '—', v.phone, v.applicationStatus, v.resubmissionCount || 0, new Date(v.createdAt).toLocaleDateString()
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c ?? ''}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Vendors_${activeTab || 'All'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleApproveConfirm = async (cashbackRate) => {
    await AdminAPI.approveVendor(approveTarget.id, cashbackRate);
    setApproveTarget(null);
    fetchVendors();
  };

  const handleRejectConfirm = async (reasonCategory, comment) => {
    await AdminAPI.rejectVendor(rejectTarget.id, reasonCategory, comment);
    setRejectTarget(null);
    fetchVendors();
  };

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Vendor Applications</h1>
          <p className="text-body-md text-on-surface-variant">Review onboarding applications and manage vendor accounts</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
            <input
              type="text"
              placeholder="Name, shop, mobile, or vendor ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 focus:w-full sm:focus:w-80 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(124,58,237,0.08)] transition-all duration-300"
            />
          </div>
          <button onClick={handleExport} className="h-10 px-4 bg-primary/10 text-primary rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span className="sm:inline">Export</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-outline-variant/20 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-3 font-title-md text-[14px] whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === tab.key ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
            {tab.key === 'PENDING_REVIEW' && pendingCount > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-[#f8f9fc]">
                <th className="p-4 font-bold">Vendor</th>
                <th className="p-4 font-bold">Shop Name</th>
                <th className="p-4 font-bold">Category</th>
                <th className="p-4 font-bold text-center">Cashback</th>
                <th className="p-4 font-bold">Location</th>
                <th className="p-4 font-bold">Submitted</th>
                <th className="p-4 font-bold">Last Updated</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-center">Resubmits</th>
                <th className="p-4 font-bold text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="10" className="p-8 text-center text-on-surface-variant">Loading...</td></tr>
              ) : vendors.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-on-surface-variant">No vendor applications found.</td></tr>
              ) : vendors.map((vendor) => (
                <tr key={vendor._id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                  <td className="p-4">
                    <p className="font-bold text-on-surface">{vendor.ownerName}</p>
                    <p className="font-mono text-[11px] text-on-surface-variant mt-0.5">{vendor.zeebacId} · {vendor.phone}</p>
                  </td>
                  <td className="p-4 text-on-surface-variant">{vendor.storeName || '—'}</td>
                  <td className="p-4 text-on-surface-variant">{vendor.category || '—'}</td>
                  <td className="p-4 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-lg text-[12px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                      {vendor.cashbackRate ? `${vendor.cashbackRate}%` : '—'}
                    </span>
                  </td>
                  <td className="p-4 text-on-surface-variant">{vendor.address?.city ? `${vendor.address.city}, ${vendor.address.state}` : '—'}</td>
                  <td className="p-4 text-on-surface-variant text-[12.5px]">{vendor.submittedAt ? new Date(vendor.submittedAt).toLocaleDateString() : '—'}</td>
                  <td className="p-4 text-on-surface-variant text-[12.5px]">{vendor.lastSubmittedAt ? new Date(vendor.lastSubmittedAt).toLocaleDateString() : '—'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${STATUS_BADGE[vendor.applicationStatus] || 'bg-gray-100 text-gray-500'}`}>
                      {vendor.applicationStatus?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-center text-on-surface-variant">{vendor.resubmissionCount || 0}</td>
                  <td className="p-4">
                    <div className="flex justify-center gap-2 items-center">
                          <button
                            onClick={() => navigate(`/admin/vendors/${vendor._id}`)}
                            className="px-3 py-1.5 bg-primary/10 text-primary font-bold text-[12px] rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
                          >
                            Details
                          </button>
                          {(vendor.applicationStatus === 'PENDING_REVIEW' || vendor.applicationStatus === 'RESUBMITTED') && (
                            <>
                              <button
                                onClick={() => setApproveTarget({ id: vendor._id, name: vendor.storeName || vendor.ownerName })}
                                className="px-3 py-1.5 bg-green-500/10 text-green-600 font-bold text-[12px] rounded-lg hover:bg-green-500/20 transition-colors cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectTarget({ id: vendor._id, name: vendor.storeName || vendor.ownerName })}
                                className="px-3 py-1.5 bg-red-500/10 text-red-600 font-bold text-[12px] rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {approveTarget && (
        <ApproveDialog vendorName={approveTarget.name} onConfirm={handleApproveConfirm} onClose={() => setApproveTarget(null)} />
      )}
      {rejectTarget && (
        <RejectDialog vendorName={rejectTarget.name} onConfirm={handleRejectConfirm} onClose={() => setRejectTarget(null)} />
      )}
    </div>
  );
}
