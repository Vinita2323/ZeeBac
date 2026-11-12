import { useState, useEffect, useCallback } from 'react';
import { AdminAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

export default function DeliveryPartnersPage() {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
    online: 0,
    offline: 0,
  });

  const [partners, setPartners] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, totalPartners: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // Detail Drawer state
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Lightbox Document Preview Modal
  const [previewImage, setPreviewImage] = useState(null);

  // Rejection / Suspension prompt modals
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await AdminAPI.getDeliveryStats();
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to load delivery stats', err);
    }
  }, []);

  // Fetch Partners List
  const fetchPartners = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getDeliveryPartners({
        status: activeTab,
        search: searchQuery,
        page,
        limit: 15,
      });
      if (res.success && res.data) {
        setPartners(res.data.partners || []);
        setPagination({
          totalPages: res.data.totalPages || res.data.pages || 1,
          totalPartners: res.data.totalPartners ?? res.data.total ?? 0,
        });
      }
    } catch (err) {
      console.error('Failed to load partners', err);
      toast.error('Failed to load delivery partners');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, searchQuery, page]);

  useEffect(() => {
    fetchStats();
    fetchPartners();
  }, [fetchStats, fetchPartners]);

  // Open Partner Detail (accepts either partner id or partner object)
  const handleOpenDetail = async (partnerOrId) => {
    const partnerId = typeof partnerOrId === 'string' ? partnerOrId : partnerOrId?._id;
    if (typeof partnerOrId === 'object' && partnerOrId !== null) {
      setSelectedPartner(partnerOrId);
      setIsDetailOpen(true);
    }
    try {
      const res = await AdminAPI.getDeliveryPartnerById(partnerId);
      if (res.success && res.data) {
        // Backend returns { partner, recentOrders } or { ...partner }
        const fullPartner = res.data.partner || res.data;
        setSelectedPartner(fullPartner);
        setIsDetailOpen(true);
      }
    } catch (err) {
      console.warn('Could not load full partner details', err);
      if (!selectedPartner) toast.error('Could not load partner details');
    }
  };

  // Actions
  const handleApprove = async () => {
    const partnerId = selectedPartner?._id || selectedPartner?.partner?._id;
    if (!partnerId) return;
    setActionLoading(true);
    try {
      const res = await AdminAPI.approveDeliveryPartner(partnerId);
      if (res.success) {
        toast.success(res.message || 'Delivery partner approved successfully!');
        setSelectedPartner((p) => ({ ...p, applicationStatus: 'APPROVED' }));
        fetchStats();
        fetchPartners();
      } else {
        toast.error(res.message || 'Approval failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve delivery partner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkUnderReview = async () => {
    const partnerId = selectedPartner?._id || selectedPartner?.partner?._id;
    if (!partnerId) return;
    setActionLoading(true);
    try {
      const res = await AdminAPI.markDeliveryPartnerUnderReview(partnerId, 'Under review by operations team');
      if (res.success) {
        toast.success('Application marked Under Review');
        setSelectedPartner((p) => ({ ...p, applicationStatus: 'UNDER_REVIEW' }));
        fetchStats();
        fetchPartners();
      } else {
        toast.error(res.message || 'Update failed');
      }
    } catch (err) {
      toast.error('Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async (e) => {
    e.preventDefault();
    const partnerId = selectedPartner?._id || selectedPartner?.partner?._id;
    if (!partnerId) return;
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }
    setActionLoading(true);
    try {
      const res = await AdminAPI.rejectDeliveryPartner(partnerId, rejectionReason.trim());
      if (res.success) {
        toast.success('Application rejected');
        setShowRejectModal(false);
        setRejectionReason('');
        setSelectedPartner((p) => ({
          ...p,
          applicationStatus: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
        }));
        fetchStats();
        fetchPartners();
      } else {
        toast.error(res.message || 'Rejection failed');
      }
    } catch (err) {
      toast.error('Failed to reject application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmSuspend = async (e) => {
    e.preventDefault();
    const partnerId = selectedPartner?._id || selectedPartner?.partner?._id;
    if (!partnerId) return;
    if (!suspensionReason.trim()) {
      toast.error('Please enter a suspension reason');
      return;
    }
    setActionLoading(true);
    try {
      const res = await AdminAPI.suspendDeliveryPartner(partnerId, suspensionReason.trim());
      if (res.success) {
        toast.success('Partner suspended');
        setShowSuspendModal(false);
        setSuspensionReason('');
        setSelectedPartner((p) => ({
          ...p,
          applicationStatus: 'SUSPENDED',
          isSuspended: true,
          suspensionReason: suspensionReason.trim(),
        }));
        fetchStats();
        fetchPartners();
      } else {
        toast.error(res.message || 'Suspension failed');
      }
    } catch (err) {
      toast.error('Failed to suspend partner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    const partnerId = selectedPartner?._id || selectedPartner?.partner?._id;
    if (!partnerId) return;
    setActionLoading(true);
    try {
      const res = await AdminAPI.reactivateDeliveryPartner(partnerId);
      if (res.success) {
        toast.success('Partner reactivated and restored to approved fleet');
        setSelectedPartner((p) => ({
          ...p,
          applicationStatus: 'APPROVED',
          isSuspended: false,
          suspensionReason: null,
        }));
        fetchStats();
        fetchPartners();
      } else {
        toast.error(res.message || 'Reactivation failed');
      }
    } catch (err) {
      toast.error('Failed to reactivate partner');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            <span>APPROVED</span>
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            <span>PENDING REVIEW</span>
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>UNDER REVIEW</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            <span>REJECTED</span>
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            <span>SUSPENDED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
            <span>{status || 'UNKNOWN'}</span>
          </span>
        );
    }
  };

  const tabs = [
    { key: 'ALL', label: 'All Partners', count: stats.total },
    { key: 'PENDING_REVIEW', label: 'Pending Review', count: stats.pending },
    { key: 'UNDER_REVIEW', label: 'Under Review', count: stats.underReview },
    { key: 'APPROVED', label: 'Approved Fleet', count: stats.approved },
    { key: 'REJECTED', label: 'Rejected', count: stats.rejected },
    { key: 'SUSPENDED', label: 'Suspended', count: stats.suspended },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#7c3aed] text-3xl">two_wheeler</span>
            <span>Delivery Partners Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review onboarding applications, verify Aadhaar/PAN/DL documents, manage active delivery fleet
          </p>
        </div>

        <button
          onClick={() => {
            fetchStats();
            fetchPartners();
            toast.success('Data refreshed');
          }}
          className="py-2 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase block">Total</span>
          <span className="text-2xl font-black text-slate-900 font-mono">{stats.total}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-amber-200 bg-amber-50/40 shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 uppercase block">Pending</span>
          <span className="text-2xl font-black text-amber-800 font-mono">{stats.pending}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase block">Approved</span>
          <span className="text-2xl font-black text-emerald-800 font-mono">{stats.approved}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-red-200 bg-red-50/40 shadow-xs">
          <span className="text-[11px] font-bold text-red-700 uppercase block">Rejected</span>
          <span className="text-2xl font-black text-red-800 font-mono">{stats.rejected}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-rose-200 bg-rose-50/40 shadow-xs">
          <span className="text-[11px] font-bold text-rose-700 uppercase block">Suspended</span>
          <span className="text-2xl font-black text-rose-800 font-mono">{stats.suspended}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-emerald-300 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase block">Online Now</span>
          <span className="text-2xl font-black text-emerald-600 font-mono flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{stats.online}</span>
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase block">Offline</span>
          <span className="text-2xl font-black text-slate-500 font-mono">{stats.offline}</span>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-hide pb-1 sm:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`py-2 px-3.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-[#7c3aed] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, phone, ID, city..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-[#7c3aed]"
            />
          </div>
        </div>

        {/* Partners Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3 px-3">Partner</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Vehicle</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Fleet Availability</th>
                <th className="py-3 px-3">Registered</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-[#7c3aed] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading delivery partners...</span>
                  </td>
                </tr>
              ) : partners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No delivery partners found matching this filter.
                  </td>
                </tr>
              ) : (
                partners.map((p) => {
                  const avatar = p.profileImage || p.documents?.profilePhoto;
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-purple-100 text-[#7c3aed] flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border border-purple-200">
                            {avatar ? (
                              <img src={avatar} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              p.name?.charAt(0) || 'R'
                            )}
                          </div>
                          <div>
                            <strong className="text-slate-900 block text-xs">{p.name}</strong>
                            <span className="font-mono text-[10.5px] text-slate-400">{p.riderId}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono text-slate-800 block">+91 {p.phone}</span>
                        <span className="text-[10.5px] text-slate-400">{p.email || 'No email'}</span>
                      </td>

                      <td className="py-3 px-3 text-slate-700">
                        <span>{p.address?.city || 'Lucknow'}</span>
                        <span className="block text-[10.5px] text-slate-400 font-mono">{p.address?.pincode}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-800 block">{p.vehicleType || 'Bike'}</span>
                        <span className="font-mono text-[10.5px] text-slate-500 uppercase">{p.vehicleNo || 'Bicycle'}</span>
                      </td>

                      <td className="py-3 px-3">
                        {getStatusBadge(p.applicationStatus)}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${p.isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <span className={`w-2 h-2 rounded-full ${p.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                          <span>{p.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : 'Recent'}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenDetail(p)}
                          className="py-1.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#7c3aed] font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility</span>
                          <span>Review Application</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Showing page {page} of {pagination.totalPages} ({pagination.totalPartners} total partners)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="py-1 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="py-1 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAIL MODAL / DRAWER */}
      {isDetailOpen && selectedPartner && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end">
          <div className="bg-white w-full max-w-[660px] h-full shadow-2xl flex flex-col text-left overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-13 h-13 rounded-2xl bg-purple-100 text-[#7c3aed] flex items-center justify-center font-black text-base shrink-0 overflow-hidden border border-purple-200">
                  {selectedPartner.profileImage || selectedPartner.documents?.profilePhoto ? (
                    <img
                      src={selectedPartner.profileImage || selectedPartner.documents?.profilePhoto}
                      alt={selectedPartner.name}
                      className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                      onClick={() => setPreviewImage({
                        url: selectedPartner.profileImage || selectedPartner.documents?.profilePhoto,
                        title: `${selectedPartner.name} - Profile Selfie`,
                      })}
                    />
                  ) : (
                    <span className="material-symbols-outlined text-[28px]">sports_motorsports</span>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 leading-tight">
                    {selectedPartner.name}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {selectedPartner.riderId} • +91 {selectedPartner.phone}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {getStatusBadge(selectedPartner.applicationStatus)}
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* Action Toolbar */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2">
                {selectedPartner.applicationStatus !== 'APPROVED' && (
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Approve Application</span>
                  </button>
                )}

                {selectedPartner.applicationStatus !== 'REJECTED' && (
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                    className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                    <span>Reject Application</span>
                  </button>
                )}

                {selectedPartner.applicationStatus !== 'UNDER_REVIEW' && selectedPartner.applicationStatus !== 'APPROVED' && (
                  <button
                    onClick={handleMarkUnderReview}
                    disabled={actionLoading}
                    className="py-2 px-3.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-bold hover:bg-blue-100 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">fact_check</span>
                    <span>Mark Under Review</span>
                  </button>
                )}

                {selectedPartner.applicationStatus === 'APPROVED' && !selectedPartner.isSuspended && (
                  <button
                    onClick={() => setShowSuspendModal(true)}
                    disabled={actionLoading}
                    className="py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">block</span>
                    <span>Suspend Partner</span>
                  </button>
                )}

                {selectedPartner.applicationStatus === 'SUSPENDED' && (
                  <button
                    onClick={handleReactivate}
                    disabled={actionLoading}
                    className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">restore</span>
                    <span>Reactivate Account</span>
                  </button>
                )}
              </div>

              {/* Rejection / Suspension Notice if any */}
              {selectedPartner.rejectionReason && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-0.5">
                  <span className="font-bold uppercase text-[10px] text-red-700">Rejection Reason:</span>
                  <p className="font-semibold">{selectedPartner.rejectionReason}</p>
                </div>
              )}

              {selectedPartner.suspensionReason && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-0.5">
                  <span className="font-bold uppercase text-[10px] text-rose-700">Suspension Reason:</span>
                  <p className="font-semibold">{selectedPartner.suspensionReason}</p>
                </div>
              )}

              {/* 1. Personal & Contact Details */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <h4 className="font-bold uppercase tracking-wider text-[11px] text-[#7c3aed]">
                  Personal & Contact Information
                </h4>
                <div className="grid grid-cols-2 gap-3 text-slate-800">
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Full Name:</span>
                    <strong className="text-slate-900 text-[13px]">{selectedPartner.name || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Mobile Phone:</span>
                    <strong className="text-slate-900 font-mono text-[13px]">+91 {selectedPartner.phone}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Email Address:</span>
                    <span className="font-medium text-slate-700">{selectedPartner.email || 'Not provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Gender / Date of Birth:</span>
                    <span className="font-medium text-slate-700">
                      {selectedPartner.gender || 'Male'} • {selectedPartner.dateOfBirth || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Application ID:</span>
                    <span className="font-mono font-bold text-purple-700">{selectedPartner.riderId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Registered On:</span>
                    <span className="font-mono text-slate-600">
                      {selectedPartner.createdAt ? new Date(selectedPartner.createdAt).toLocaleString('en-IN') : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Residential Address Details */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold uppercase tracking-wider text-[11px] text-[#7c3aed]">
                  Residential Address
                </h4>
                <div className="text-slate-800 space-y-1">
                  <p className="font-medium text-[12.5px]">
                    {selectedPartner.address?.currentAddress || selectedPartner.address?.street || 'Address not available'}
                    {selectedPartner.address?.landmark ? `, Near ${selectedPartner.address.landmark}` : ''}
                  </p>
                  <p className="font-mono text-slate-600 text-[12px]">
                    {selectedPartner.address?.city || 'Lucknow'}, {selectedPartner.address?.state || 'Uttar Pradesh'} - {selectedPartner.address?.pincode || 'N/A'}
                  </p>
                  {selectedPartner.address?.permanentAddress && selectedPartner.address.permanentAddress !== (selectedPartner.address.currentAddress || selectedPartner.address.street) && (
                    <p className="text-[11px] text-slate-500 font-normal pt-1 border-t border-slate-200">
                      Permanent: {selectedPartner.address.permanentAddress}
                    </p>
                  )}
                </div>
              </div>

              {/* 3. Vehicle Information */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold uppercase tracking-wider text-[11px] text-[#7c3aed]">
                  Vehicle Information
                </h4>
                <div className="grid grid-cols-3 gap-3 text-slate-800">
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Vehicle Type:</span>
                    <strong className="text-slate-900 text-[13px]">{selectedPartner.vehicleType || 'Bike'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Registration Number:</span>
                    <strong className="text-slate-900 font-mono uppercase text-[13px]">
                      {selectedPartner.vehicleNo || 'Bicycle / None'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Model / Make:</span>
                    <span className="text-slate-700 font-medium">{selectedPartner.vehicleModel || 'Not specified'}</span>
                  </div>
                </div>
              </div>

              {/* 4. Bank Account & Payout Details */}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <h4 className="font-bold uppercase tracking-wider text-[11px] text-[#7c3aed]">
                  Settlement & Payout Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-slate-800">
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Account Holder Name:</span>
                    <strong className="text-slate-900">
                      {selectedPartner.bankDetails?.accountHolderName || selectedPartner.name || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Bank Name:</span>
                    <span className="font-medium text-slate-800">
                      {selectedPartner.bankDetails?.bankName || 'Direct UPI'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Account Number:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedPartner.bankDetails?.accountNumber || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">IFSC Code:</span>
                    <span className="font-mono font-bold uppercase text-purple-700">
                      {selectedPartner.bankDetails?.ifscCode || 'N/A'}
                    </span>
                  </div>
                  <div className="col-span-2 p-2.5 rounded-xl bg-purple-50/70 border border-purple-200">
                    <span className="text-slate-500 block text-[10.5px] font-bold uppercase">UPI ID for Direct Payout:</span>
                    <span className="font-mono font-bold text-emerald-800 text-[13px]">
                      {selectedPartner.bankDetails?.upiId || 'No UPI ID provided'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Complete Verification Documents Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-[#7c3aed]">
                    KYC & Vehicle Documents (Click to View Full Size)
                  </h4>
                  <span className="text-[11px] text-slate-400">Click any document to inspect</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Selfie / Profile Photo */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                        <span>Profile Photo / Selfie</span>
                      </span>
                    </div>
                    {selectedPartner.profileImage || selectedPartner.documents?.profilePhoto ? (
                      <div
                        onClick={() => setPreviewImage({
                          url: selectedPartner.profileImage || selectedPartner.documents?.profilePhoto,
                          title: 'Applicant Profile Photo (Selfie)',
                        })}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={selectedPartner.profileImage || selectedPartner.documents?.profilePhoto}
                          alt="Selfie"
                          className="w-full h-36 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                          <span>Click to View Full</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-28 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                        <span className="material-symbols-outlined text-[20px]">no_photography</span>
                        <span className="text-[11px]">No photo uploaded</span>
                      </div>
                    )}
                  </div>

                  {/* Aadhaar Card */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">badge</span>
                        <span>Aadhaar Card</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 font-bold">
                        {selectedPartner.documents?.aadhaarNo || 'No Number'}
                      </span>
                    </div>
                    {selectedPartner.documents?.aadhaarDoc ? (
                      <div
                        onClick={() => setPreviewImage({
                          url: selectedPartner.documents.aadhaarDoc,
                          title: `Aadhaar Card (No: ${selectedPartner.documents?.aadhaarNo || 'N/A'})`,
                        })}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={selectedPartner.documents.aadhaarDoc}
                          alt="Aadhaar"
                          className="w-full h-36 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                          <span>Click to View Full</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-28 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                        <span className="material-symbols-outlined text-[20px]">image_not_supported</span>
                        <span className="text-[11px]">No Aadhaar image uploaded</span>
                      </div>
                    )}
                  </div>

                  {/* Driving Licence */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">license</span>
                        <span>Driving Licence</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 font-bold uppercase">
                        {selectedPartner.documents?.drivingLicenceNo || 'No DL'}
                      </span>
                    </div>
                    {selectedPartner.documents?.drivingLicenceDoc ? (
                      <div
                        onClick={() => setPreviewImage({
                          url: selectedPartner.documents.drivingLicenceDoc,
                          title: `Driving Licence (No: ${selectedPartner.documents?.drivingLicenceNo || 'N/A'})`,
                        })}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={selectedPartner.documents.drivingLicenceDoc}
                          alt="DL"
                          className="w-full h-36 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                          <span>Click to View Full</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-28 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                        <span className="material-symbols-outlined text-[20px]">image_not_supported</span>
                        <span className="text-[11px]">{selectedPartner.vehicleType === 'Cycle' ? 'Not required for bicycle' : 'No DL uploaded'}</span>
                      </div>
                    )}
                  </div>

                  {/* PAN Card */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">credit_card</span>
                        <span>PAN Card</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 font-bold uppercase">
                        {selectedPartner.documents?.panNo || 'No PAN'}
                      </span>
                    </div>
                    {selectedPartner.documents?.panDoc ? (
                      <div
                        onClick={() => setPreviewImage({
                          url: selectedPartner.documents.panDoc,
                          title: `PAN Card (No: ${selectedPartner.documents?.panNo || 'N/A'})`,
                        })}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={selectedPartner.documents.panDoc}
                          alt="PAN"
                          className="w-full h-36 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                          <span>Click to View Full</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-28 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                        <span className="material-symbols-outlined text-[20px]">image_not_supported</span>
                        <span className="text-[11px]">Optional / No image uploaded</span>
                      </div>
                    )}
                  </div>

                  {/* Vehicle RC */}
                  {selectedPartner.documents?.vehicleRcDoc && (
                    <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-primary">description</span>
                          <span>Vehicle RC</span>
                        </span>
                      </div>
                      <div
                        onClick={() => setPreviewImage({
                          url: selectedPartner.documents.vehicleRcDoc,
                          title: `Vehicle Registration Certificate (${selectedPartner.vehicleNo || 'RC'})`,
                        })}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={selectedPartner.documents.vehicleRcDoc}
                          alt="RC"
                          className="w-full h-36 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                          <span>Click to View Full</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Insurance */}
                  {selectedPartner.documents?.insuranceDoc && (
                    <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
                          <span>Vehicle Insurance</span>
                        </span>
                      </div>
                      <div
                        onClick={() => setPreviewImage({
                          url: selectedPartner.documents.insuranceDoc,
                          title: `Vehicle Insurance Policy`,
                        })}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={selectedPartner.documents.insuranceDoc}
                          alt="Insurance"
                          className="w-full h-36 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                          <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                          <span>Click to View Full</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Admin Audit Log */}
              {selectedPartner.adminAuditLogs?.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
                    Audit & Review History
                  </h4>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {selectedPartner.adminAuditLogs.map((log, i) => (
                      <div key={i} className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 flex justify-between">
                        <span><strong>{log.action}</strong>: {log.reason || 'No remarks'}</span>
                        <span className="text-slate-400">{new Date(log.timestamp).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN IMAGE LIGHTBOX MODAL */}
      {previewImage && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-700 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 px-6 bg-slate-800 flex items-center justify-between border-b border-slate-700 text-white">
              <span className="font-bold text-sm truncate flex items-center gap-2">
                <span className="material-symbols-outlined text-[#7c3aed] text-[20px]">image</span>
                <span>{previewImage.title}</span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  download="document.jpg"
                  target="_blank"
                  rel="noreferrer"
                  className="py-1.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Download</span>
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[24px]">close</span>
                </button>
              </div>
            </div>

            {/* Modal Image Display */}
            <div className="p-4 flex items-center justify-center bg-black/50 max-h-[75vh] overflow-auto">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-lg border border-slate-800"
              />
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[420px] w-full p-6 border border-slate-100 shadow-2xl space-y-4 text-left">
            <h3 className="font-black text-lg text-slate-900">
              Reject Delivery Application
            </h3>
            <p className="text-xs text-slate-500">
              Please state why this application is being rejected so the applicant can correct their submission.
            </p>
            <form onSubmit={handleConfirmReject} className="space-y-3">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Blurry Aadhaar photo. Please re-upload clear front and back pictures."
                rows={3}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-red-500"
                required
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUSPEND MODAL */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[420px] w-full p-6 border border-slate-100 shadow-2xl space-y-4 text-left">
            <h3 className="font-black text-lg text-slate-900">
              Suspend Delivery Partner
            </h3>
            <p className="text-xs text-slate-500">
              Suspended partners are immediately barred from going online and taking new orders.
            </p>
            <form onSubmit={handleConfirmSuspend} className="space-y-3">
              <textarea
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="e.g. Repeated customer complaints or delayed deliveries without valid explanation."
                rows={3}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-rose-600"
                required
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuspendModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  Confirm Suspension
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
