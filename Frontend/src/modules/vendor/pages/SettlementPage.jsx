import { useCallback, useEffect, useState } from 'react';
import { VendorAPI } from '../../../services/api';

// Seller view of what ZeeBac (admin) owes them for orders paid online or by COD.
// Online orders: available on delivery (Razorpay fee deducted).
// COD orders: on hold until admin confirms the rider's cash was collected.
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const TYPE_LABEL = {
  ORDER_CREDIT: 'Order earning',
  ORDER_REVERSAL: 'Refund deduction',
  PAYOUT: 'Paid to you',
  PAYOUT_REVERSAL: 'Payout reversed',
  ADJUSTMENT: 'Adjustment',
};
const REQ_STYLE = {
  REQUESTED: 'bg-amber-50 text-amber-700 border-amber-200',
  PARTIALLY_PAID: 'bg-blue-50 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-50 text-slate-500 border-slate-200',
};

function Stat({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 text-slate-900',
    green: 'border-emerald-200 bg-emerald-50/50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50/50 text-amber-800',
    purple: 'border-purple-200 bg-purple-50/50 text-purple-800',
  };
  return (
    <div className={`bg-white p-3.5 rounded-2xl border ${tones[tone]}`}>
      <span className="text-[11px] font-bold uppercase opacity-70 block">{label}</span>
      <span className="text-xl font-black font-mono">{value}</span>
      {sub && <span className="text-[10.5px] opacity-70 block mt-0.5">{sub}</span>}
    </div>
  );
}

export default function SettlementPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await VendorAPI.getSettlement({ page, limit: 30 });
      if (res.success) setData(res.data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load settlements');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const requestPayout = async (e) => {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      const res = await VendorAPI.requestSettlementPayout(Number(amount));
      setMsg(res.message || 'Request sent');
      setAmount('');
      load();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Could not send request');
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async (id) => {
    if (!window.confirm('Cancel this withdrawal request?')) return;
    try {
      await VendorAPI.cancelSettlementRequest(id);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not cancel');
    }
  };

  if (loading && !data) return <div className="p-6 text-slate-500 text-sm">Loading settlements…</div>;
  if (error && !data) return <div className="p-6 text-rose-600 text-sm font-bold">{error}</div>;

  const b = data.balance;
  const total = data.pagination?.total || 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="font-display font-black text-xl text-slate-900">Settlements</h1>
        <p className="text-[12.5px] text-slate-500 mt-0.5 max-w-2xl">
          When customers pay online or with cash on delivery, ZeeBac collects the money and settles your share: item amount
          + packaging, minus points the customer redeemed
          {data.commissionPercent > 0 ? `, ${data.commissionPercent}% commission` : ''} and, for online orders, the payment
          gateway fee. Orders paid at your counter are not included because you received that money directly.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Withdrawable" value={money(b.withdrawable)} tone="green" sub="Available to request now" />
        <Stat label="On hold (COD)" value={money(b.onHold)} tone="amber" sub="Released when ZeeBac confirms rider cash" />
        <Stat label="In open requests" value={money(b.reservedForRequests)} tone="purple" />
        <Stat label="Paid to you (lifetime)" value={money(b.totalPaidOut)} />
      </div>

      <form onSubmit={requestPayout} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Request withdrawal (₹)</label>
          <input
            type="number"
            min={data.minPayoutRequest}
            max={b.withdrawable}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Min ₹${data.minPayoutRequest} · Max ${money(b.withdrawable)}`}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[14px] font-mono focus:border-purple-600 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setAmount(String(b.withdrawable))}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700"
        >
          Max
        </button>
        <button
          type="submit"
          disabled={busy || !amount || Number(amount) < data.minPayoutRequest || Number(amount) > b.withdrawable}
          className="px-5 py-2.5 rounded-xl bg-purple-700 text-white font-black text-[13px] disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send to ZeeBac'}
        </button>
      </form>
      {msg && <p className="text-[12.5px] font-bold text-slate-700 -mt-2">{msg}</p>}

      {data.requests?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <h2 className="px-4 py-3 font-black text-[13.5px] border-b border-slate-100">Withdrawal requests</h2>
          <div className="divide-y divide-slate-100">
            {data.requests.map((r) => (
              <div key={r._id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                <div>
                  <p className="font-bold text-slate-900">
                    {money(r.requestedAmount)} <span className="text-slate-400 font-normal">· {r.requestId}</span>
                  </p>
                  <p className="text-slate-500 text-[11.5px]">
                    {when(r.createdAt)}
                    {r.paidAmount > 0 && ` · Paid ${money(r.paidAmount)}`}
                    {r.adminNote && ` · ${r.adminNote}`}
                  </p>
                  {r.payments?.map((p, i) => (
                    <p key={i} className="text-[11px] text-emerald-700">
                      {money(p.amount)} via {p.method?.replace('_', ' ')} {p.utr ? `(Ref ${p.utr})` : ''} on {when(p.paidAt)}
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${REQ_STYLE[r.status]}`}>{r.status.replace('_', ' ')}</span>
                  {r.status === 'REQUESTED' && (
                    <button onClick={() => cancelRequest(r._id)} className="text-[11.5px] font-bold text-rose-600">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <h2 className="px-4 py-3 font-black text-[13.5px] border-b border-slate-100">Ledger</h2>
        {data.entries.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-slate-500">No settlement activity yet. Delivered online and COD orders will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Order / Ref</th>
                  <th className="text-left px-4 py-2">Breakdown</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.entries.map((e) => {
                  const br = e.breakdown || {};
                  return (
                    <tr key={e._id}>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-500">{when(e.createdAt)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{TYPE_LABEL[e.type] || e.type}</span>
                        {e.status === 'ON_HOLD' && (
                          <span className="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">ON HOLD</span>
                        )}
                        {e.paymentMode && <span className="ml-1.5 text-[10px] text-slate-400">{e.paymentMode}</span>}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11.5px] text-slate-600">{e.orderCode || e.payout?.utr || '—'}</td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        {e.type === 'ORDER_CREDIT' ? (
                          <>
                            Items + packaging {money(br.sellerGross)}
                            {br.pointsRedeemed > 0 && ` − points ${money(br.pointsRedeemed)}`}
                            {br.commissionAmount > 0 && ` − commission ${money(br.commissionAmount)}`}
                            {br.gatewayFee > 0 && ` − gateway fee ${money(br.gatewayFee)}`}
                          </>
                        ) : (
                          e.note || ''
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono font-bold ${e.amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {e.amount < 0 ? '−' : '+'}
                        {money(Math.abs(e.amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 30 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 text-[12px]">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="font-bold disabled:opacity-40">
              ← Newer
            </button>
            <span className="text-slate-500">
              Page {page} of {Math.ceil(total / 30)}
            </span>
            <button disabled={page >= Math.ceil(total / 30)} onClick={() => setPage((p) => p + 1)} className="font-bold disabled:opacity-40">
              Older →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
