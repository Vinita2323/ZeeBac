import { useState, useEffect, useCallback } from 'react';
import { AdminAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [
      addr.fullAddress || addr.street,
      addr.landmark,
      addr.city,
      addr.state,
      addr.pincode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
  }
  return String(addr);
};

export default function DeliveryOperationsPage() {
  const [liveData, setLiveData] = useState({
    activeOrders: [],
    unassignedOrders: [],
    onlineRiders: [],
    stats: { inTransitCount: 0, unassignedCount: 0, onlineRidersCount: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE', 'UNASSIGNED', 'FLEET'

  // Manual Assign Modal
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Cancel Assignment Modal
  const [cancelModalOrderId, setCancelModalOrderId] = useState(null);
  const [cancelReason, setCancelReason] = useState('Rider unresponsive / customer request');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchLiveOperations = useCallback(async () => {
    try {
      const res = await AdminAPI.getLiveDeliveryOperations();
      if (res.success && res.data) {
        setLiveData(res.data);
      }
    } catch (err) {
      console.error('Failed to load live operations', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveOperations();
    const interval = setInterval(fetchLiveOperations, 6000); // 6s live polling
    return () => clearInterval(interval);
  }, [fetchLiveOperations]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchLiveOperations();
  };

  const handleAssignRider = async (e) => {
    e.preventDefault();
    if (!assignModalOrder || !selectedRiderId) {
      toast.error('Please select an online rider');
      return;
    }

    setIsAssigning(true);
    try {
      const res = await AdminAPI.assignDeliveryOrder(assignModalOrder._id, selectedRiderId);
      if (res.success) {
        toast.success(res.message || 'Rider assigned successfully!');
        setAssignModalOrder(null);
        setSelectedRiderId('');
        fetchLiveOperations();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign rider');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCancelAssignment = async (e) => {
    e.preventDefault();
    if (!cancelModalOrderId) return;

    setIsCancelling(true);
    try {
      const res = await AdminAPI.cancelDeliveryAssignment(cancelModalOrderId, cancelReason);
      if (res.success) {
        toast.success('Rider assignment cancelled. Order returned to unassigned queue.');
        setCancelModalOrderId(null);
        setCancelReason('Rider unresponsive / customer request');
        fetchLiveOperations();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel assignment');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStageBadge = (status) => {
    switch (status) {
      case 'RIDER_ASSIGNED':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">1. Assigned (To Store)</span>;
      case 'ARRIVED_AT_PICKUP':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800">2. Arrived at Store</span>;
      case 'PICKED_UP':
      case 'OUT_FOR_DELIVERY':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">3. Out for Delivery</span>;
      case 'ARRIVED_AT_CUSTOMER':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">4. At Customer Door</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-[#7c3aed]">route</span>
            <span>Live Delivery Dispatch Center</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            Monitor real-time in-transit orders, assign pending drops, and supervise active delivery fleet.
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="self-start sm:self-auto py-2 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#7c3aed] font-bold text-xs transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <span className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin' : ''}`}>
            sync
          </span>
          <span>Refresh Operations</span>
        </button>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-blue-200 bg-blue-50/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block">
              Active In-Transit Orders
            </span>
            <span className="text-3xl font-black text-blue-900 font-mono">
              {liveData.stats?.inTransitCount || liveData.activeOrders.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">two_wheeler</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
              Unassigned Orders Waiting
            </span>
            <span className="text-3xl font-black text-amber-900 font-mono">
              {liveData.stats?.unassignedCount || liveData.unassignedOrders.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">pending_actions</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
              Online Fleet Available
            </span>
            <span className="text-3xl font-black text-emerald-900 font-mono flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{liveData.stats?.onlineRidersCount || liveData.onlineRiders.length}</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">online_prediction</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`py-2 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ACTIVE'
                ? 'bg-[#7c3aed] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>In-Transit Deliveries</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {liveData.activeOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('UNASSIGNED')}
            className={`py-2 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'UNASSIGNED'
                ? 'bg-[#7c3aed] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Unassigned Orders</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'UNASSIGNED' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {liveData.unassignedOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('FLEET')}
            className={`py-2 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'FLEET'
                ? 'bg-[#7c3aed] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Online Fleet</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'FLEET' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {liveData.onlineRiders.length}
            </span>
          </button>
        </div>

        {/* TAB 1: ACTIVE IN-TRANSIT ORDERS */}
        {activeTab === 'ACTIVE' && (
          <div className="overflow-x-auto">
            {liveData.activeOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <span className="material-symbols-outlined text-[32px] text-slate-300 block mb-1">
                  check_circle
                </span>
                No orders are currently in transit. All active deliveries are complete!
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                    <th className="py-3 px-3">Order</th>
                    <th className="py-3 px-3">Pickup Store</th>
                    <th className="py-3 px-3">Customer Drop</th>
                    <th className="py-3 px-3">Assigned Rider</th>
                    <th className="py-3 px-3">Delivery Stage</th>
                    <th className="py-3 px-3 text-right">Dispatch Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {liveData.activeOrders.map((ord) => (
                    <tr key={ord._id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3">
                        <strong className="text-slate-900 block font-mono text-xs">
                          #{String(ord.orderId || ord._id).slice(-6)}
                        </strong>
                        <span className="text-[10.5px] text-slate-400">
                          ₹{ord.finalAmount || ord.totalAmount} • {ord.items?.length || 1} items
                        </span>
                      </td>

                      <td className="py-3 px-3 max-w-[200px]">
                        <strong className="text-slate-900 block truncate">
                          {ord.vendor?.storeName || ord.vendorName || 'Partner Store'}
                        </strong>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {formatAddress(ord.vendor?.address || ord.vendorAddress)}
                        </span>
                      </td>

                      <td className="py-3 px-3 max-w-[200px]">
                        <strong className="text-slate-900 block truncate">
                          {ord.deliveryAddress?.receiverName || ord.user?.name || 'Customer'}
                        </strong>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {formatAddress(ord.deliveryAddress)}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {ord.deliveryPartner ? (
                          <div>
                            <strong className="text-slate-900 block">{ord.deliveryPartner.name}</strong>
                            <span className="font-mono text-[10.5px] text-slate-500">
                              +91 {ord.deliveryPartner.phone} ({ord.deliveryPartner.vehicleType || 'Bike'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-bold text-[11px]">Unassigned</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {getStageBadge(ord.orderStatus)}
                      </td>

                      <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setAssignModalOrder(ord);
                          }}
                          className="py-1 px-2.5 rounded-lg bg-purple-50 text-[#7c3aed] hover:bg-purple-100 font-bold text-[11px] cursor-pointer"
                        >
                          Reassign
                        </button>
                        <button
                          onClick={() => setCancelModalOrderId(ord._id)}
                          className="py-1 px-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold text-[11px] cursor-pointer"
                        >
                          Cancel Rider
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: UNASSIGNED ORDERS */}
        {activeTab === 'UNASSIGNED' && (
          <div className="overflow-x-auto">
            {liveData.unassignedOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <span className="material-symbols-outlined text-[32px] text-emerald-400 block mb-1">
                  done_all
                </span>
                No pending unassigned orders! Every customer order has a delivery partner assigned.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                    <th className="py-3 px-3">Order ID</th>
                    <th className="py-3 px-3">Placed At</th>
                    <th className="py-3 px-3">Pickup Store</th>
                    <th className="py-3 px-3">Customer Area</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {liveData.unassignedOrders.map((ord) => (
                    <tr key={ord._id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        #{String(ord.orderId || ord._id).slice(-6)}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </td>
                      <td className="py-3 px-3">
                        <strong className="text-slate-900 block truncate">
                          {ord.vendor?.storeName || ord.vendorName || 'Store'}
                        </strong>
                        <span className="text-[10.5px] text-slate-400 block truncate">
                          {formatAddress(ord.vendor?.address || ord.vendorAddress)}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[200px] truncate">
                        {formatAddress(ord.deliveryAddress)}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        ₹{ord.finalAmount || ord.totalAmount}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setAssignModalOrder(ord)}
                          className="py-1 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <span className="material-symbols-outlined text-[14px]">person_add</span>
                          <span>Assign Partner</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: ONLINE FLEET */}
        {activeTab === 'FLEET' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {liveData.onlineRiders.length === 0 ? (
              <div className="col-span-3 py-12 text-center text-slate-500 text-xs">
                No delivery partners are currently marked ONLINE.
              </div>
            ) : (
              liveData.onlineRiders.map((r) => (
                <div key={r._id} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <strong className="text-slate-900 text-xs">{r.name}</strong>
                    </div>
                    <span className="text-[10.5px] font-mono text-slate-400">{r.riderId}</span>
                  </div>

                  <div className="text-[11.5px] text-slate-600 space-y-0.5">
                    <p>Phone: <strong className="font-mono text-slate-800">+91 {r.phone}</strong></p>
                    <p>Vehicle: <strong>{r.vehicleType || 'Bike'} ({r.vehicleNo || 'N/A'})</strong></p>
                    <p>Operating City: <strong>{r.address?.city || 'Lucknow'}</strong></p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      Active Drop: <strong className="text-slate-800">{r.activeOrderId ? '1 Order In Hand' : 'Idle / Available'}</strong>
                    </span>
                    <a
                      href={`tel:${r.phone}`}
                      className="text-primary font-bold hover:underline flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[13px]">call</span>
                      <span>Call Rider</span>
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* MANUAL ASSIGN MODAL */}
      {assignModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[440px] w-full p-6 border border-slate-100 shadow-2xl space-y-4 text-left">
            <h3 className="font-black text-lg text-slate-900">
              Assign Delivery Partner
            </h3>
            <p className="text-xs text-slate-500">
              Assign order <strong>#{String(assignModalOrder.orderId || assignModalOrder._id).slice(-6)}</strong> to an approved partner:
            </p>

            <form onSubmit={handleAssignRider} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Select Online Rider ({liveData.onlineRiders.length} Available)
                </label>
                {liveData.onlineRiders.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    No riders are currently online! You can still assign from all approved partners, or ask riders to go online.
                  </p>
                ) : (
                  <select
                    value={selectedRiderId}
                    onChange={(e) => setSelectedRiderId(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#7c3aed]"
                    required
                  >
                    <option value="">-- Choose an Online Partner --</option>
                    {liveData.onlineRiders.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name} (+91 {r.phone}) • {r.vehicleType || 'Bike'} • {r.activeOrderId ? '(Has Active Drop)' : '(Idle)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOrder(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !selectedRiderId}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL ASSIGNMENT MODAL */}
      {cancelModalOrderId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[420px] w-full p-6 border border-slate-100 shadow-2xl space-y-4 text-left">
            <h3 className="font-black text-lg text-slate-900">
              Cancel Rider Assignment
            </h3>
            <p className="text-xs text-slate-500">
              The assigned partner will be detached and the order returned to the dispatch queue.
            </p>
            <form onSubmit={handleCancelAssignment} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Reason for Cancellation
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrderId(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 cursor-pointer"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
