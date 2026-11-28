import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';
import AdminOrderDetailModal, { getAdminOrderStageMeta } from '../components/AdminOrderDetailModal';

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_TABS = [
  { id: '', label: 'All Orders' },
  { id: 'PROCESSING', label: 'Processing / Live' },
  { id: 'PLACED', label: 'New (Placed)' },
  { id: 'PREPARING', label: 'Preparing' },
  { id: 'READY_FOR_PICKUP', label: 'Packed & Ready' },
  { id: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      const params = { page, limit: 30 };
      if (search.trim()) params.search = search.trim();
      if (orderStatus) params.orderStatus = orderStatus;
      if (paymentMethod) params.paymentMethod = paymentMethod;

      const res = await AdminAPI.getOrderFinancials(params);
      if (res.success && res.data) {
        setOrders(res.data.orders || []);
        setTotal(res.data.pagination?.total || 0);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, orderStatus, paymentMethod]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const openFullOrder = async (ord) => {
    setSelectedOrder(ord);
    try {
      const res = await AdminAPI.getOrderFinancialDetail(ord.orderId);
      if (res.success && res.data?.order) {
        setSelectedOrder(res.data.order);
      }
    } catch (_) {}
  };

  const processingCount = orders.filter((o) => getAdminOrderStageMeta(o.orderStatus).isProcessing).length;
  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-5 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-[#7c3aed]">shopping_bag</span>
            <span>All Orders &amp; Processing Monitor</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            Full order transparency: ordered products, photos, variants, SKUs, cashback, and live processing stages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            loadOrders();
          }}
          disabled={refreshing}
          className="self-start sm:self-auto py-2 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#7c3aed] font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>sync</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-slate-400 block">Matching Orders</span>
          <span className="text-2xl font-black font-mono text-slate-900">{total}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-purple-200 bg-purple-50/30 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-purple-800 block">Processing (Page)</span>
          <span className="text-2xl font-black font-mono text-[#7c3aed]">{processingCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-emerald-800 block">Delivered (Page)</span>
          <span className="text-2xl font-black font-mono text-emerald-800">
            {orders.filter((o) => o.orderStatus === 'DELIVERED').length}
          </span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-rose-800 block">Cancelled (Page)</span>
          <span className="text-2xl font-black font-mono text-rose-800">
            {orders.filter((o) => o.orderStatus === 'CANCELLED').length}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search by Order ID, Store, Customer, Product, or SKU..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-xs font-medium focus:border-[#7c3aed] outline-none"
            />
          </div>

          <select
            value={paymentMethod}
            onChange={(e) => {
              setPage(1);
              setPaymentMethod(e.target.value);
            }}
            className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none"
          >
            <option value="">All Payment Modes</option>
            <option value="ONLINE">Online (Razorpay)</option>
            <option value="CASH">Cash / COD</option>
            <option value="ZEEBAC_POINTS">Zeebac Points</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => {
            const active = orderStatus === tab.id;
            return (
              <button
                key={tab.id || 'all'}
                type="button"
                onClick={() => {
                  setPage(1);
                  setOrderStatus(tab.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                  active ? 'bg-[#7c3aed] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-xs font-bold text-slate-400">Loading orders…</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No orders found matching your filters.</div>
          ) : (
            <table className="w-full min-w-[1000px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-black uppercase tracking-wider text-[10.5px]">
                  <th className="py-3 px-3">Order &amp; Time</th>
                  <th className="py-3 px-3">Ordered Products (Image / Variant / SKU)</th>
                  <th className="py-3 px-3">Store &amp; Customer</th>
                  <th className="py-3 px-3">Amount &amp; Cashback</th>
                  <th className="py-3 px-3">Payment</th>
                  <th className="py-3 px-3">Processing Status</th>
                  <th className="py-3 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord) => {
                  const stage = getAdminOrderStageMeta(ord.orderStatus);
                  const firstItem = ord.items?.[0];
                  const extraCount = (ord.items?.length || 0) - 1;

                  return (
                    <tr
                      key={ord._id || ord.orderId}
                      onClick={() => openFullOrder(ord)}
                      className="hover:bg-purple-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <p className="font-mono font-black text-slate-900 text-[12.5px]">#{ord.orderId}</p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5">{when(ord.createdAt)}</p>
                        <span className="inline-block text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded mt-0.5">
                          {ord.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}
                        </span>
                      </td>

                      <td className="py-3 px-3 align-middle">
                        {firstItem ? (
                          <div className="flex items-center gap-2.5 max-w-[300px]">
                            {firstItem.image ? (
                              <img
                                src={firstItem.image}
                                alt={firstItem.name}
                                className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-50"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">
                                {firstItem.quantity}× {firstItem.name}
                                {extraCount > 0 && (
                                  <span className="ml-1 text-[10.5px] font-black text-[#7c3aed]">
                                    +{extraCount} more
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                {firstItem.variant && (
                                  <span className="text-[9.5px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                                    {firstItem.variant}
                                  </span>
                                )}
                                {firstItem.sku && (
                                  <span className="text-[9.5px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded">
                                    SKU: {firstItem.sku}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400">
                                  ({ord.items?.length || 1} items)
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 align-middle">
                        <p className="font-bold text-slate-900 truncate max-w-[170px]">{ord.storeName || 'Store'}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[170px]">
                          Customer: {ord.customerName || '—'}
                        </p>
                      </td>

                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <p className="font-mono font-black text-slate-900 text-[13px]">
                          {money(ord.finalPayableAmount ?? ord.totalAmount)}
                        </p>
                        <span className="inline-block text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded mt-0.5">
                          +{ord.totalCashbackPoints || 0} Pts CB
                        </span>
                      </td>

                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <p className="font-bold text-slate-700 text-[11px]">{ord.paymentMethod || '—'}</p>
                        <span
                          className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                            ord.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.paymentStatus === 'REFUNDED'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ord.paymentStatus || 'PENDING'}
                        </span>
                      </td>

                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold ${stage.cls}`}>
                          {stage.label}
                        </span>
                        {stage.isProcessing && ord.estimatedPrepTime && (
                          <p className="text-[10px] text-indigo-700 font-bold mt-0.5">
                            Prep ~{ord.estimatedPrepTime}m {ord.riderDetails?.name ? `• ${ord.riderDetails.name}` : ''}
                          </p>
                        )}
                      </td>

                      <td onClick={(e) => e.stopPropagation()} className="py-3 px-3 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => openFullOrder(ord)}
                          className="px-3 py-1.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility</span>
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold disabled:opacity-40 cursor-pointer"
            >
              ← Prev
            </button>
            <span className="font-semibold text-slate-500">
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold disabled:opacity-40 cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {selectedOrder && <AdminOrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}
