const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatWhen = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const formatAddress = (addr) => {
  if (!addr) return '—';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [addr.fullAddress || addr.street, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  }
  return String(addr);
};

export function getAdminOrderStageMeta(orderStatus) {
  const map = {
    PLACED: { label: 'New / Pending Store Accept', cls: 'bg-amber-100 text-amber-800', isProcessing: true },
    CONFIRMED: { label: 'Store Accepted', cls: 'bg-purple-100 text-purple-800', isProcessing: true },
    PREPARING: { label: 'Preparing at Store', cls: 'bg-purple-100 text-purple-800', isProcessing: true },
    READY_FOR_PICKUP: { label: 'Packed & Ready', cls: 'bg-indigo-100 text-indigo-800', isProcessing: true },
    RIDER_ASSIGNED: { label: 'Rider Assigned (To Store)', cls: 'bg-blue-100 text-blue-800', isProcessing: true },
    ARRIVED_AT_PICKUP: { label: 'Rider At Store', cls: 'bg-purple-100 text-purple-900', isProcessing: true },
    PICKED_UP: { label: 'Picked Up', cls: 'bg-sky-100 text-sky-800', isProcessing: true },
    OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'bg-blue-600 text-white', isProcessing: true },
    ARRIVED_AT_CUSTOMER: { label: 'At Customer Door', cls: 'bg-teal-100 text-teal-800', isProcessing: true },
    DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-800', isProcessing: false },
    CANCELLED: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-800', isProcessing: false },
    FAILED_DELIVERY: { label: 'Failed Delivery', cls: 'bg-rose-100 text-rose-800', isProcessing: false },
  };
  return map[orderStatus] || { label: orderStatus || 'Unknown', cls: 'bg-slate-100 text-slate-700', isProcessing: false };
}

export default function AdminOrderDetailModal({ order, onClose }) {
  if (!order) return null;

  const stageMeta = getAdminOrderStageMeta(order.orderStatus);
  const storeName = order.storeName || order.vendor?.storeName || order.vendorId?.storeName || 'Partner Store';
  const customerName = order.customerName || order.deliveryAddress?.receiverName || order.user?.name || 'Customer';
  const customerPhone = order.customerPhone || order.deliveryAddress?.receiverPhone || order.user?.phone || '';
  const rider = order.riderDetails?.name ? order.riderDetails : order.deliveryPartner;

  const steps = [
    { label: 'Placed', icon: 'receipt' },
    { label: 'Preparing', icon: 'soup_kitchen' },
    { label: 'Packed', icon: 'inventory_2' },
    { label: 'Rider', icon: 'sports_motorsports' },
    { label: 'On Way', icon: 'two_wheeler' },
    { label: 'Delivered', icon: 'check_circle' },
  ];
  const stageOf = {
    PLACED: 0,
    CONFIRMED: 1,
    PREPARING: 1,
    READY_FOR_PICKUP: 2,
    RIDER_ASSIGNED: 3,
    ARRIVED_AT_PICKUP: 3,
    PICKED_UP: 4,
    OUT_FOR_DELIVERY: 4,
    ARRIVED_AT_CUSTOMER: 4,
    DELIVERED: 5,
  };
  const currIdx = stageOf[order.orderStatus] ?? -1;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 text-left"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-[18px] text-slate-900 font-mono">#{order.orderId || order._id}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${stageMeta.cls}`}>
                {stageMeta.label}
              </span>
              {order.packingStatus && order.orderStatus !== 'DELIVERED' && order.orderStatus !== 'CANCELLED' && (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-700">
                  Packing: {order.packingStatus}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              {formatWhen(order.createdAt)} • {order.fulfillmentType === 'pickup' ? 'Counter Pickup' : 'Rider Delivery'} •{' '}
              {order.paymentMethod || '—'} ({order.paymentStatus || 'PENDING'})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 bg-[#f8f9fc]">
          {/* Processing Lifecycle Stepper */}
          {order.orderStatus !== 'CANCELLED' && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider">
                  Live Processing &amp; Fulfillment Stage
                </span>
                {order.estimatedPrepTime && stageMeta.isProcessing && (
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                    Est. Prep: ~{order.estimatedPrepTime}m
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                {steps.map((step, idx) => {
                  const isCurrent = currIdx === idx;
                  const isDone = currIdx > idx;
                  return (
                    <div
                      key={step.label}
                      className={`p-2 rounded-xl flex flex-col items-center gap-0.5 ${
                        isCurrent
                          ? 'bg-[#7c3aed] text-white font-bold shadow-xs'
                          : isDone
                          ? 'bg-emerald-100 text-emerald-900 font-semibold'
                          : 'bg-slate-50 text-slate-400 border border-slate-100'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{isDone ? 'check' : step.icon}</span>
                      <span className="text-[10.5px] leading-tight">{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Store / Customer / Rider Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Store</p>
              <p className="font-black text-slate-900 text-[13.5px]">{storeName}</p>
              {order.vendorZeebacId && <p className="font-mono text-[11px] text-purple-700">{order.vendorZeebacId}</p>}
              {(order.vendor?.address || order.vendorId?.address) && (
                <p className="text-[11px] text-slate-500">{formatAddress(order.vendor?.address || order.vendorId?.address)}</p>
              )}
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Customer</p>
              <p className="font-black text-slate-900 text-[13.5px]">{customerName}</p>
              {customerPhone && <p className="font-mono text-[11.5px] text-slate-600">{customerPhone}</p>}
              <p className="text-[11px] text-slate-500">
                {order.fulfillmentType === 'pickup' ? 'Counter Pickup' : formatAddress(order.deliveryAddress)}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Delivery Partner</p>
              {rider?.name ? (
                <>
                  <p className="font-black text-slate-900 text-[13.5px]">{rider.name}</p>
                  <p className="font-mono text-[11.5px] text-slate-600">{rider.phone || '—'}</p>
                  <p className="text-[11px] text-slate-500">{rider.vehicleNo || rider.vehicleType || 'Bike'}</p>
                </>
              ) : (
                <p className="text-[12px] font-bold text-amber-700 pt-1">
                  {order.fulfillmentType === 'pickup' ? 'Not required (Pickup)' : 'Not assigned yet'}
                </p>
              )}
            </div>
          </div>

          {/* Ordered Products Table (Full Transparency: Photo, Name, Variant, SKU, Qty, Price, Cashback) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                Ordered Items ({order.items?.length || 0})
              </p>
              {order.orderNotes && (
                <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg font-medium">
                  Note: "{order.orderNotes}"
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 bg-slate-50/40">
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-3">Variant / SKU</th>
                    <th className="py-2.5 px-2 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Cashback</th>
                    <th className="py-2.5 px-4 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(order.items || []).map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-50"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{item.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {item.category && (
                                <span className="text-[10px] text-slate-500">{item.category}</span>
                              )}
                              {item.binCode && (
                                <span className="text-[10px] font-mono bg-purple-50 text-purple-800 px-1.5 py-0.2 rounded">
                                  Bin: {item.binCode}
                                </span>
                              )}
                              {item.picked && (
                                <span className="text-[9.5px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                                  ✓ Picked
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          {item.variant ? (
                            <span className="text-[10.5px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded">
                              {item.variant}
                            </span>
                          ) : (
                            <span className="text-[10.5px] text-slate-400">Standard</span>
                          )}
                          {item.sku && (
                            <span className="text-[10.5px] font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded">
                              SKU: {item.sku}
                            </span>
                          )}
                          {item.barcode && (
                            <span className="text-[10px] font-mono text-slate-500">EAN: {item.barcode}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-mono font-bold text-slate-800">× {item.quantity}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{money(item.price)}</td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                          {item.cashbackPercentage || 0}% (+{item.cashbackPoints || 0} pts)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {money(Number(item.price || 0) * Number(item.quantity || 1))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financials & Cashback Transparency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-1.5">
              <p className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider">Bill &amp; Cashback</p>
              <div className="flex justify-between">
                <span className="text-slate-500">Items Subtotal</span>
                <span className="font-mono">{money(order.itemTotal ?? order.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Packaging / Delivery</span>
                <span className="font-mono">
                  {money(Number(order.packagingCharge || 0) + Number(order.deliveryCharge || 0))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Platform Fee + GST</span>
                <span className="font-mono">
                  {money(Number(order.platformFee || 0) + Number(order.taxAmount || 0))}
                </span>
              </div>
              {Number(order.pointsRedeemed) > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Points Redeemed</span>
                  <span className="font-mono">-{money(order.pointsRedeemed)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-slate-100 font-black text-slate-900">
                <span>Customer Payable</span>
                <span className="font-mono text-[#7c3aed]">{money(order.finalPayableAmount ?? order.totalAmount)}</span>
              </div>
              <div className="flex justify-between pt-1 text-purple-800 font-bold">
                <span>Customer Cashback</span>
                <span className="font-mono">
                  +{order.totalCashbackPoints || 0} Pts ({order.cashbackSettled ? 'Settled' : 'Pending'})
                </span>
              </div>
            </div>

            {order.financials && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-1.5">
                <p className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider">
                  Seller &amp; Admin Split ({order.financials.settlementStatus || 'PENDING'})
                </p>
                <div className="flex justify-between">
                  <span className="text-slate-500">Seller Gross</span>
                  <span className="font-mono">{money(order.financials.sellerGross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Commission ({order.financials.commissionPercent || 0}%)</span>
                  <span className="font-mono text-rose-700">-{money(order.financials.commissionAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gateway Fee</span>
                  <span className="font-mono text-rose-700">-{money(order.financials.gatewayFee)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-100 font-bold text-emerald-700">
                  <span>Seller Payable</span>
                  <span className="font-mono">{money(order.financials.sellerPayable)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Admin Share</span>
                  <span className="font-mono">{money(order.financials.adminShare)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
