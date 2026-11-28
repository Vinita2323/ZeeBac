import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';
import AdminOrderDetailModal, { getAdminOrderStageMeta } from '../components/AdminOrderDetailModal';

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_STYLE = {
  Active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Suspended: 'bg-amber-100 text-amber-800 border-amber-200',
  Banned: 'bg-rose-100 text-rose-800 border-rose-200',
};

const STATUS_LABEL = {
  Active: 'Active',
  Suspended: 'Deactivated (Suspended)',
  Banned: 'Blocked (Banned)',
};

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'reviews' | 'transactions' | 'profile'
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Action modal: { type: 'suspend' | 'block' | 'activate' | 'delete', reason: '' }
  const [actionModal, setActionModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getUserById(id);
      if (res.success && res.data) {
        setData(res.data);
        setError('');
      } else {
        setError(res.message || 'User not found');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load user details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const executeAction = async (e) => {
    e?.preventDefault();
    if (!actionModal || !data?.user?._id) return;
    setBusy(true);
    try {
      const uid = data.user._id;
      if (actionModal.type === 'suspend') {
        await AdminAPI.suspendUser(uid, actionModal.reason);
        toast.success('User deactivated (suspended)');
      } else if (actionModal.type === 'block') {
        await AdminAPI.blockUser(uid, actionModal.reason);
        toast.success('User blocked');
      } else if (actionModal.type === 'activate') {
        await AdminAPI.unsuspendUser(uid);
        toast.success('User activated');
      } else if (actionModal.type === 'delete') {
        await AdminAPI.deleteUser(uid);
        toast.success('User deleted permanently');
        setActionModal(null);
        navigate('/admin/users', { replace: true });
        return;
      }
      setActionModal(null);
      loadUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 bg-white rounded-2xl border border-slate-200" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 bg-white rounded-2xl border border-slate-200" />
          ))}
        </div>
        <div className="h-72 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto mt-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[32px]">person_off</span>
        </div>
        <h2 className="text-lg font-black text-slate-900">User not found</h2>
        <p className="text-xs text-slate-500">{error || 'This customer account could not be loaded.'}</p>
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="px-5 py-2.5 rounded-xl bg-[#7c3aed] text-white font-bold text-xs cursor-pointer"
        >
          Back to Users
        </button>
      </div>
    );
  }

  const { user, behaviorStats = {}, orders = [], storeReviews = [], orderRatings = [], walletTransactions = [], inStoreTransactions = [] } = data;
  const highRiskCancel = behaviorStats.totalOrders >= 3 && behaviorStats.cancellationRate >= 40;
  const hasRiskFlags = highRiskCancel || behaviorStats.flaggedTransactionsCount > 0 || behaviorStats.latePenaltiesCount > 0;

  return (
    <div className="space-y-5 text-left pb-10">
      {/* Top User Header & Account Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
            title="Back to All Users"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>

          {user.profileImage ? (
            <img
              src={user.profileImage}
              alt={user.name}
              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-purple-100 text-[#7c3aed] flex items-center justify-center font-black text-xl shrink-0">
              {(user.name || 'U').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 truncate">{user.name}</h1>
              <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                {user.zeebacId}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_STYLE[user.status] || STATUS_STYLE.Active}`}>
                {STATUS_LABEL[user.status] || user.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="font-mono font-semibold text-slate-700">📞 {user.phone}</span>
              {user.email && <span>✉️ {user.email}</span>}
              <span>Joined: {formatDate(user.createdAt)}</span>
              {user.location?.city && (
                <span>
                  📍 {[user.location.city, user.location.state, user.location.pincode].filter(Boolean).join(', ')}
                </span>
              )}
            </div>

            {user.statusReason && user.status !== 'Active' && (
              <p className="text-[11.5px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 inline-block mt-2">
                Reason: {user.statusReason}
              </p>
            )}
          </div>
        </div>

        {/* Account Moderation Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {user.status !== 'Active' && (
            <button
              type="button"
              onClick={() => setActionModal({ type: 'activate', reason: '' })}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Activate</span>
            </button>
          )}
          {user.status !== 'Suspended' && (
            <button
              type="button"
              onClick={() => setActionModal({ type: 'suspend', reason: '' })}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">pause_circle</span>
              <span>Deactivate</span>
            </button>
          )}
          {user.status !== 'Banned' && (
            <button
              type="button"
              onClick={() => setActionModal({ type: 'block', reason: '' })}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">block</span>
              <span>Block User</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActionModal({ type: 'delete', reason: '' })}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">delete_forever</span>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Behavior Risk Warning Banner (if applicable) */}
      {hasRiskFlags && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex flex-wrap items-center gap-3 text-xs text-amber-950">
          <span className="material-symbols-outlined text-amber-700 text-[22px]">warning</span>
          <div className="flex flex-wrap items-center gap-3 font-semibold">
            {highRiskCancel && (
              <span>High cancellation rate: {behaviorStats.cancellationRate}% ({behaviorStats.cancelledOrders}/{behaviorStats.totalOrders} orders)</span>
            )}
            {behaviorStats.latePenaltiesCount > 0 && (
              <span>Late cancellation penalties: {behaviorStats.latePenaltiesCount} ({behaviorStats.latePenaltyAmount} pts)</span>
            )}
            {behaviorStats.flaggedTransactionsCount > 0 && (
              <span>Flagged in-store transactions: {behaviorStats.flaggedTransactionsCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Behavior Analytics KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase text-slate-400 block">Total Orders</span>
          <span className="text-2xl font-black font-mono text-slate-900">{behaviorStats.totalOrders || 0}</span>
          <p className="text-[11px] text-slate-500">
            <span className="text-emerald-700 font-bold">{behaviorStats.deliveredOrders || 0} delivered</span> ·{' '}
            <span className="text-purple-700 font-bold">{behaviorStats.processingOrders || 0} active</span> ·{' '}
            <span className="text-rose-600 font-bold">{behaviorStats.cancelledOrders || 0} cancelled</span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase text-slate-400 block">Total Spend &amp; Avg</span>
          <span className="text-2xl font-black font-mono text-slate-900">{money(behaviorStats.totalOrderSpend)}</span>
          <p className="text-[11px] text-slate-500">
            Avg order: <strong className="text-slate-800">{money(behaviorStats.avgOrderValue)}</strong> · Cancel rate:{' '}
            <strong className={highRiskCancel ? 'text-rose-600' : 'text-slate-800'}>
              {behaviorStats.cancellationRate || 0}%
            </strong>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-purple-200 bg-purple-50/30 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase text-purple-800 block">Wallet &amp; Cashback</span>
          <span className="text-2xl font-black font-mono text-[#7c3aed]">
            {Number(behaviorStats.walletBalance || 0).toLocaleString('en-IN')} Pts
          </span>
          <p className="text-[11px] text-slate-600">
            Earned: <strong>+{behaviorStats.totalCashbackEarned || 0}</strong> · Redeemed:{' '}
            <strong>{behaviorStats.totalPointsRedeemed || 0}</strong>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase text-slate-400 block">Reviews &amp; Ratings</span>
          <span className="text-2xl font-black font-mono text-slate-900">
            {(behaviorStats.totalStoreReviews || 0) + (behaviorStats.totalOrderRatings || 0)}
          </span>
          <p className="text-[11px] text-slate-500">
            Avg rating given:{' '}
            <strong className="text-amber-600">
              {behaviorStats.avgRatingGiven ? `${behaviorStats.avgRatingGiven}/5 ★` : '—'}
            </strong>{' '}
            · In-store tx: <strong>{behaviorStats.totalInStoreTransactions || 0}</strong>
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'orders', label: `Orders (${orders.length})`, icon: 'shopping_bag' },
            { id: 'reviews', label: `Reviews & Ratings (${storeReviews.length + orderRatings.length})`, icon: 'star' },
            { id: 'transactions', label: `Wallet & Store Tx (${walletTransactions.length + inStoreTransactions.length})`, icon: 'receipt_long' },
            { id: 'profile', label: 'Profile, KYC & Addresses', icon: 'badge' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-all ${
                  active ? 'bg-[#7c3aed] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: ORDERS */}
        {activeTab === 'orders' && (
          <div className="p-4">
            {orders.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-10">This user has not placed any orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[10.5px] font-black uppercase text-slate-500">
                      <th className="py-2.5 px-3">Order ID &amp; Date</th>
                      <th className="py-2.5 px-3">Items (Photo / Variant / SKU)</th>
                      <th className="py-2.5 px-3">Store</th>
                      <th className="py-2.5 px-3">Amount &amp; Cashback</th>
                      <th className="py-2.5 px-3">Payment</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((ord) => {
                      const stage = getAdminOrderStageMeta(ord.orderStatus);
                      const first = ord.items?.[0];
                      const extra = (ord.items?.length || 0) - 1;
                      return (
                        <tr
                          key={ord._id || ord.orderId}
                          onClick={() => setSelectedOrder(ord)}
                          className="hover:bg-purple-50/40 cursor-pointer"
                        >
                          <td className="py-3 px-3 whitespace-nowrap">
                            <p className="font-mono font-bold text-slate-900">#{ord.orderId}</p>
                            <p className="text-[10.5px] text-slate-400">{formatDate(ord.createdAt)}</p>
                          </td>
                          <td className="py-3 px-3">
                            {first ? (
                              <div className="flex items-center gap-2 max-w-[260px]">
                                {first.image ? (
                                  <img
                                    src={first.image}
                                    alt={first.name}
                                    className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 truncate">
                                    {first.quantity}× {first.name}{extra > 0 ? ` +${extra}` : ''}
                                  </p>
                                  {(first.variant || first.sku) && (
                                    <p className="text-[10px] font-mono text-slate-500 truncate">
                                      {[first.variant, first.sku ? `SKU: ${first.sku}` : ''].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-bold text-slate-800">{ord.storeName || ord.vendorId?.storeName || 'Store'}</p>
                            <p className="text-[10.5px] text-slate-400">{ord.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}</p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <p className="font-mono font-black text-slate-900">{money(ord.finalPayableAmount ?? ord.totalAmount)}</p>
                            <span className="text-[10px] font-bold text-purple-700">+{ord.totalCashbackPoints || 0} Pts CB</span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-bold text-slate-700">{ord.paymentMethod}</span>
                            <span className="block text-[10px] text-slate-500">{ord.paymentStatus}</span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${stage.cls}`}>
                              {stage.label}
                            </span>
                            {ord.cancellationReason && (
                              <p className="text-[10px] text-rose-600 mt-0.5 max-w-[160px] truncate" title={ord.cancellationReason}>
                                {ord.cancellationReason}
                              </p>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(ord)}
                              className="px-3 py-1.5 rounded-lg bg-[#7c3aed] text-white font-bold text-[11px] cursor-pointer"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REVIEWS & RATINGS */}
        {activeTab === 'reviews' && (
          <div className="p-4 space-y-4">
            {storeReviews.length === 0 && orderRatings.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-10">This user has not submitted any reviews or ratings yet.</p>
            ) : (
              <>
                {storeReviews.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Store Reviews ({storeReviews.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {storeReviews.map((rev) => (
                        <div key={rev._id} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-black text-slate-900">
                              {rev.vendorId?.storeName || 'Partner Store'}
                              {rev.vendorId?.zeebacId && (
                                <span className="ml-1.5 font-mono text-[10px] text-slate-500">{rev.vendorId.zeebacId}</span>
                              )}
                            </p>
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-black">
                              ★ {rev.rating}/5
                            </span>
                          </div>
                          {rev.text && <p className="text-slate-700 leading-relaxed">"{rev.text}"</p>}
                          {rev.reply?.text && (
                            <p className="text-[11px] text-purple-800 bg-purple-50 border border-purple-100 rounded-lg p-2">
                              Store reply: "{rev.reply.text}"
                            </p>
                          )}
                          <p className="text-[10.5px] text-slate-400">{formatDate(rev.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {orderRatings.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Order Store &amp; Rider Feedback ({orderRatings.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {orderRatings.map((r) => (
                        <div key={r._id} className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-black uppercase text-purple-700 block">
                                {r.source === 'ORDER_VENDOR' ? 'Store Rating' : 'Rider Rating'} · #{r.orderId}
                              </span>
                              <p className="font-bold text-slate-900">{r.targetName}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-black">
                              ★ {r.rating}/5
                            </span>
                          </div>
                          {r.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.tags.map((t) => (
                                <span key={t} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {r.comment && <p className="text-slate-700">"{r.comment}"</p>}
                          <p className="text-[10.5px] text-slate-400">{formatDate(r.ratedAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: WALLET & IN-STORE TRANSACTIONS */}
        {activeTab === 'transactions' && (
          <div className="p-4 space-y-5 text-xs">
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                In-Store POS / QR Transactions ({inStoreTransactions.length})
              </h3>
              {inStoreTransactions.length === 0 ? (
                <p className="text-slate-400 py-3">No in-store transactions.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-black">
                      <tr>
                        <th className="py-2 px-3">Txn ID</th>
                        <th className="py-2 px-3">Store</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Cashback</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inStoreTransactions.map((tx) => (
                        <tr key={tx._id} className={tx.status === 'Flagged' ? 'bg-rose-50/50' : ''}>
                          <td className="py-2 px-3 font-mono font-bold">{tx.transactionId}</td>
                          <td className="py-2 px-3">{tx.vendorName || tx.vendorZeebacId}</td>
                          <td className="py-2 px-3 font-mono font-bold">{money(tx.amount)}</td>
                          <td className="py-2 px-3 font-mono text-purple-700">{money(tx.cashbackAmount)}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.status === 'Flagged' ? 'bg-rose-600 text-white' : tx.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {tx.status}
                            </span>
                            {tx.flagReason && <p className="text-[10px] text-rose-600 mt-0.5">{tx.flagReason}</p>}
                          </td>
                          <td className="py-2 px-3 text-slate-500">{formatDate(tx.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Recent Wallet Activity ({walletTransactions.length})
              </h3>
              {walletTransactions.length === 0 ? (
                <p className="text-slate-400 py-3">No wallet activity.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-black">
                      <tr>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {walletTransactions.map((wt) => (
                        <tr key={wt._id}>
                          <td className="py-2 px-3 font-bold uppercase">{wt.type}</td>
                          <td className="py-2 px-3">{wt.category}</td>
                          <td className={`py-2 px-3 font-mono font-bold ${wt.type === 'credit' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {wt.type === 'credit' ? '+' : '-'}{wt.amount} Pts
                          </td>
                          <td className="py-2 px-3">{wt.status}</td>
                          <td className="py-2 px-3 text-slate-600 max-w-[260px] truncate">{wt.description || '—'}</td>
                          <td className="py-2 px-3 text-slate-500">{formatDate(wt.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PROFILE, KYC & ADDRESSES */}
        {activeTab === 'profile' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-2.5">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Account &amp; Bank Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10.5px] text-slate-400 font-bold uppercase block">ZeeBac ID</span>
                  <span className="font-mono font-bold text-slate-900">{user.zeebacId}</span>
                </div>
                <div>
                  <span className="text-[10.5px] text-slate-400 font-bold uppercase block">Referral Code</span>
                  <span className="font-mono font-bold text-slate-900">{user.referralCode || '—'}</span>
                </div>
                <div>
                  <span className="text-[10.5px] text-slate-400 font-bold uppercase block">Referred By</span>
                  <span className="font-bold text-slate-900">
                    {user.referredBy ? `${user.referredBy.name} (${user.referredBy.zeebacId})` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10.5px] text-slate-400 font-bold uppercase block">Bank / UPI</span>
                  <span className="font-bold text-slate-900">
                    {user.bankDetails?.upiId || user.bankDetails?.bankName || 'Not linked'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-2.5">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Saved Addresses ({user.savedAddresses?.length || 0})
              </h3>
              {!user.savedAddresses?.length ? (
                <p className="text-slate-400">No saved delivery addresses.</p>
              ) : (
                <div className="space-y-2">
                  {user.savedAddresses.map((a, i) => (
                    <div key={a._id || i} className="bg-white rounded-xl p-2.5 border border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-900">{a.label || 'Home'}</span>
                        {a.isDefault && (
                          <span className="text-[9.5px] bg-purple-100 text-purple-800 px-1.5 rounded font-bold">Default</span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        {[a.houseNo, a.street, a.landmark ? `Near ${a.landmark}` : '', a.city, a.state, a.pincode]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                      {(a.receiverName || a.receiverPhone) && (
                        <p className="text-[10.5px] text-slate-400 mt-0.5">
                          Receiver: {a.receiverName} ({a.receiverPhone})
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Deactivate / Block / Activate / Delete */}
      {actionModal &&
        createPortal(
          <div
            onClick={() => !busy && setActionModal(null)}
            className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={executeAction}
              className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 text-left"
            >
              <h3 className="text-lg font-black text-slate-900">
                {actionModal.type === 'delete'
                  ? `Delete ${user.name}?`
                  : actionModal.type === 'block'
                  ? `Block ${user.name}?`
                  : actionModal.type === 'suspend'
                  ? `Deactivate ${user.name}?`
                  : `Activate ${user.name}?`}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {actionModal.type === 'delete'
                  ? 'This permanently removes this user account, wallet, and store reviews. This cannot be undone.'
                  : actionModal.type === 'block'
                  ? 'Blocked users cannot log in to the platform until reactivated by an administrator.'
                  : actionModal.type === 'suspend'
                  ? 'Deactivated (suspended) users are signed out and cannot log in until reactivated.'
                  : 'This will restore Active access so the user can log in and place orders again.'}
              </p>

              {(actionModal.type === 'suspend' || actionModal.type === 'block') && (
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
                    Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={actionModal.reason}
                    onChange={(e) => setActionModal((m) => ({ ...m, reason: e.target.value }))}
                    placeholder="e.g. Repeated fake orders / abusive reviews..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#7c3aed] outline-none resize-none"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActionModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={`flex-1 py-2.5 rounded-xl text-white font-bold text-xs cursor-pointer disabled:opacity-50 ${
                    actionModal.type === 'activate'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : actionModal.type === 'suspend'
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {busy
                    ? 'Processing…'
                    : actionModal.type === 'delete'
                    ? 'Delete Permanently'
                    : actionModal.type === 'block'
                    ? 'Confirm Block'
                    : actionModal.type === 'suspend'
                    ? 'Confirm Deactivate'
                    : 'Confirm Activate'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {selectedOrder && <AdminOrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}
