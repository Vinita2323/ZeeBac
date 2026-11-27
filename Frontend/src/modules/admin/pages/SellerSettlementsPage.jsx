import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';

// Centralized Payment Collection & Seller Settlement console.
// All cart payments (Razorpay online + rider COD) land with admin; this page
// tracks what each seller is owed and records payouts, refunds and COD confirmations.

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const newKey = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const errMsg = (e, f) => e?.response?.data?.message || f;

const TABS = [
  { id: 'sellers', label: 'Seller Balances', icon: 'storefront' },
  { id: 'requests', label: 'Withdrawal Requests', icon: 'outbox' },
  { id: 'cod', label: 'COD Confirmation', icon: 'payments' },
  { id: 'orders', label: 'Order Financials', icon: 'receipt_long' },
  { id: 'recon', label: 'Reconciliation', icon: 'balance' },
  { id: 'audit', label: 'Audit Log', icon: 'history' },
  { id: 'pricing', label: 'Fees & Commission', icon: 'tune' },
];

function Kpi({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 text-slate-900',
    green: 'border-emerald-200 bg-emerald-50/40 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50/40 text-amber-800',
    purple: 'border-purple-200 bg-purple-50/40 text-[#7c3aed]',
    red: 'border-red-200 bg-red-50/40 text-red-800',
  };
  return (
    <div className={`bg-white p-3.5 rounded-2xl border shadow-xs ${tones[tone]}`}>
      <span className="text-[11px] font-bold uppercase block opacity-70">{label}</span>
      <span className="text-xl font-black font-mono">{value}</span>
      {sub && <span className="text-[10px] block opacity-70 mt-0.5">{sub}</span>}
    </div>
  );
}

const Card = ({ title, right, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
    {title && (
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <h3 className="font-black text-[13.5px] text-slate-900">{title}</h3>
        {right}
      </div>
    )}
    {children}
  </div>
);

const Th = ({ children, right }) => <th className={`px-3 py-2 text-[10.5px] uppercase text-slate-500 font-bold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
const Td = ({ children, right, mono, className = '' }) => (
  <td className={`px-3 py-2 text-[12.5px] ${right ? 'text-right' : ''} ${mono ? 'font-mono' : ''} ${className}`}>{children}</td>
);
const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-[13px] focus:border-purple-600 focus:outline-none';

// ───────────────────────── Payout / adjustment modal ─────────────────────────
function PayoutModal({ seller, request, onClose, onDone }) {
  const unpaid = request ? Number(request.requestedAmount) - Number(request.paidAmount || 0) : null;
  const [mode, setMode] = useState('payout');
  const [amount, setAmount] = useState(unpaid != null ? String(unpaid) : '');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey); // one key per modal: double-clicks / retries can't double-pay

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'payout') {
        await AdminAPI.recordSellerPayout(seller.vendorId, { amount: Number(amount), method, utr, note, requestId: request?._id }, key);
        toast.success('Payout recorded');
      } else {
        await AdminAPI.recordSellerAdjustment(seller.vendorId, { amount: Number(amount), note }, key);
        toast.success('Adjustment recorded');
      }
      onDone();
    } catch (err) {
      toast.error(errMsg(err, 'Failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-3xl w-full max-w-md p-5 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-black text-[16px]">{request ? `Pay request ${request.requestId}` : seller.storeName}</h3>
            <p className="text-[12px] text-slate-500">
              Available {money(seller.available)}
              {request && ` · Unpaid on request ${money(unpaid)}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="material-symbols-outlined text-slate-400">close</button>
        </div>
        {!request && (
          <div className="grid grid-cols-2 gap-2">
            {['payout', 'adjustment'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-2 rounded-xl text-[12px] font-bold border ${mode === m ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'border-slate-200'}`}
              >
                {m === 'payout' ? 'Record payout' : 'Manual adjustment'}
              </button>
            ))}
          </div>
        )}
        {request?.bankSnapshot && (
          <div className="bg-slate-50 rounded-xl p-2.5 text-[11.5px] text-slate-600">
            {request.bankSnapshot.bankName} {request.bankSnapshot.accountNumberMasked} {request.bankSnapshot.ifscCode}
            {request.bankSnapshot.upiId && ` · UPI ${request.bankSnapshot.upiId}`}
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase">
            Amount (₹){mode === 'adjustment' && ' (use minus for a deduction)'}
          </label>
          <input className={input} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          {mode === 'payout' && <p className="text-[10.5px] text-slate-400 mt-0.5">Partial payouts are allowed.</p>}
        </div>
        {mode === 'payout' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase">Method</label>
                <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="RAZORPAY_PAYOUT">Razorpay payout</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase">UTR / Reference</label>
                <input className={input} value={utr} onChange={(e) => setUtr(e.target.value)} required placeholder="Bank / UPI ref" />
              </div>
            </div>
          </>
        )}
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase">Note {mode === 'adjustment' && '(required)'}</label>
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} required={mode === 'adjustment'} minLength={mode === 'adjustment' ? 5 : 0} />
        </div>
        <button disabled={busy} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-black text-[13px] disabled:opacity-50">
          {busy ? 'Saving…' : mode === 'payout' ? 'Confirm payout' : 'Save adjustment'}
        </button>
      </form>
    </div>
  );
}

// ───────────────────────── Seller ledger drawer ─────────────────────────
function SellerLedger({ seller, onClose, onPay }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    AdminAPI.getSellerSettlementLedger(seller.vendorId, { limit: 100 })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(errMsg(e, 'Could not load ledger')));
  }, [seller.vendorId]);

  const exportCsv = () => {
    if (!data) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Status', 'Order', 'Mode', 'Amount', 'UTR', 'Note']];
    data.entries.forEach((e) => rows.push([when(e.createdAt), e.type, e.status, e.orderCode, e.paymentMode, e.amount, e.payout?.utr, e.note]));
    const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `settlement-${seller.zeebacId || seller.vendorId}.csv`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="bg-slate-50 w-full max-w-3xl h-full overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-black text-[18px]">{seller.storeName}</h2>
            <p className="text-[12px] text-slate-500">{seller.zeebacId} · {seller.phone}</p>
            {data?.vendor?.bank && (
              <p className="text-[11.5px] text-slate-500 mt-1">
                {data.vendor.bank.bankName || 'No bank'} {data.vendor.bank.accountNumberMasked} {data.vendor.bank.ifscCode}
                {data.vendor.bank.upiId && ` · UPI ${data.vendor.bank.upiId}`}
                {data.vendor.bank.isVerified ? ' · ✅ verified' : ' · ⚠️ not verified'}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] font-bold">CSV</button>
            <button onClick={() => onPay(seller)} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[12px] font-bold">Pay / Adjust</button>
            <button onClick={onClose} className="material-symbols-outlined text-slate-400">close</button>
          </div>
        </div>
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Available" value={money(data.balance.available)} tone="green" />
              <Kpi label="On hold (COD)" value={money(data.balance.onHold)} tone="amber" />
              <Kpi label="Requested" value={money(data.balance.reservedForRequests)} tone="purple" />
              <Kpi label="Paid out" value={money(data.balance.totalPaidOut)} />
            </div>
            <Card title={`Ledger (${data.pagination.total})`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr><Th>Date</Th><Th>Type</Th><Th>Order / Ref</Th><Th>Detail</Th><Th right>Amount</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.entries.map((e) => (
                      <tr key={e._id}>
                        <Td className="whitespace-nowrap text-slate-500">{when(e.createdAt)}</Td>
                        <Td className="whitespace-nowrap font-bold">
                          {e.type.replace('_', ' ')}
                          {e.status === 'ON_HOLD' && <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 px-1 rounded">HOLD</span>}
                        </Td>
                        <Td mono>{e.orderCode || e.payout?.utr || '—'}</Td>
                        <Td className="text-[11px] text-slate-500">
                          {e.type === 'ORDER_CREDIT' && e.breakdown
                            ? `${e.paymentMode}: gross ${money(e.breakdown.sellerGross)} − pts ${money(e.breakdown.pointsRedeemed)} − comm ${money(e.breakdown.commissionAmount)} − PG ${money(e.breakdown.gatewayFee)}`
                            : e.note}
                        </Td>
                        <Td right mono className={e.amount < 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>{money(e.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Tabs ─────────────────────────
function SellersTab() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [pay, setPay] = useState(null);
  const load = useCallback(() => AdminAPI.getSettlementSummary().then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e, 'Failed to load'))), []);
  useEffect(() => {
    load();
  }, [load]);
  const rows = useMemo(
    () => (data?.sellers || []).filter((s) => !q || `${s.storeName} ${s.zeebacId} ${s.phone}`.toLowerCase().includes(q.toLowerCase())),
    [data, q]
  );
  if (!data) return <p className="text-slate-500 text-sm">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Owed to sellers (available)" value={money(data.totals.available)} tone="green" />
        <Kpi label="On hold (COD unconfirmed)" value={money(data.totals.onHold)} tone="amber" />
        <Kpi label="Pending withdrawal requests" value={money(data.totals.pendingRequestAmount)} tone="purple" />
        <Kpi label="Paid out (lifetime)" value={money(data.totals.totalPaidOut)} />
      </div>
      <Card title="Sellers" right={<input className="px-3 py-1.5 rounded-xl border border-slate-200 text-[12px]" placeholder="Search store / ID / phone" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr><Th>Store</Th><Th right>Orders</Th><Th right>Available</Th><Th right>On hold</Th><Th right>Requested</Th><Th right>Paid out</Th><Th>Last activity</Th><Th> </Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.vendorId} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-bold">{s.storeName}</p>
                    <p className="text-[11px] text-slate-500">{s.zeebacId} {!s.bankLinked && <span className="text-red-600">· no bank/UPI</span>}</p>
                  </Td>
                  <Td right>{s.orders}</Td>
                  <Td right mono className="font-bold text-emerald-700">{money(s.available)}</Td>
                  <Td right mono className="text-amber-700">{money(s.onHold)}</Td>
                  <Td right mono>{s.pendingRequests ? `${money(s.pendingRequestAmount)} (${s.pendingRequests})` : '—'}</Td>
                  <Td right mono>{money(s.totalPaidOut)}</Td>
                  <Td className="text-slate-500 whitespace-nowrap">{when(s.lastActivity)}</Td>
                  <Td>
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => setOpen(s)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11.5px] font-bold">Ledger</button>
                      <button onClick={() => setPay(s)} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11.5px] font-bold">Pay</button>
                    </div>
                  </Td>
                </tr>
              ))}
              {!rows.length && (
                <tr><Td className="text-slate-500">No settlement activity yet.</Td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {open && <SellerLedger seller={open} onClose={() => setOpen(null)} onPay={(s) => setPay(s)} />}
      {pay && <PayoutModal seller={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); setOpen(null); load(); }} />}
    </div>
  );
}

function RequestsTab() {
  const [status, setStatus] = useState('REQUESTED,PARTIALLY_PAID');
  const [data, setData] = useState(null);
  const [pay, setPay] = useState(null);
  const load = useCallback(() => AdminAPI.getSettlementPayoutRequests({ status }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e, 'Failed'))), [status]);
  useEffect(() => {
    load();
  }, [load]);
  const reject = async (r) => {
    const reason = window.prompt(`Reject ${r.requestId}? Enter a reason:`);
    if (!reason) return;
    try {
      await AdminAPI.rejectSettlementPayoutRequest(r._id, reason);
      toast.success('Rejected');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Failed'));
    }
  };
  const openPay = async (r) => {
    // Balance is needed for the modal header
    const s = await AdminAPI.getSellerSettlementLedger(r.vendorId._id, { limit: 1 });
    setPay({ seller: { vendorId: r.vendorId._id, storeName: r.vendorId.storeName, available: s.data.balance.available }, request: r });
  };
  return (
    <Card
      title="Seller withdrawal requests"
      right={
        <select className="px-2 py-1 rounded-lg border border-slate-200 text-[12px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="REQUESTED,PARTIALLY_PAID">Open</option>
          <option value="PAID">Paid</option>
          <option value="REJECTED,CANCELLED">Rejected / cancelled</option>
          <option value="">All</option>
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr><Th>Request</Th><Th>Store</Th><Th right>Requested</Th><Th right>Paid</Th><Th>Payout account</Th><Th>Status</Th><Th> </Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.requests || []).map((r) => (
              <tr key={r._id}>
                <Td>
                  <p className="font-mono font-bold">{r.requestId}</p>
                  <p className="text-[11px] text-slate-500">{when(r.createdAt)}</p>
                </Td>
                <Td>{r.vendorId?.storeName}</Td>
                <Td right mono className="font-bold">{money(r.requestedAmount)}</Td>
                <Td right mono>{money(r.paidAmount)}</Td>
                <Td className="text-[11px] text-slate-500">
                  {r.bankSnapshot?.bankName} {r.bankSnapshot?.accountNumberMasked} {r.bankSnapshot?.ifscCode}
                  {r.bankSnapshot?.upiId && <span className="block">UPI {r.bankSnapshot.upiId}</span>}
                </Td>
                <Td className="font-bold text-[11.5px]">{r.status.replace('_', ' ')}</Td>
                <Td>
                  {['REQUESTED', 'PARTIALLY_PAID'].includes(r.status) && (
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => openPay(r)} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11.5px] font-bold">Pay</button>
                      {r.status === 'REQUESTED' && (
                        <button onClick={() => reject(r)} className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-[11.5px] font-bold">Reject</button>
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
            {data && !data.requests.length && (
              <tr><Td className="text-slate-500">No requests.</Td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pay && <PayoutModal seller={pay.seller} request={pay.request} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
    </Card>
  );
}

function CodTab() {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => AdminAPI.getCodPendingOrders().then((r) => { setData(r.data); setSel(new Set()); }).catch((e) => toast.error(errMsg(e, 'Failed'))), []);
  useEffect(() => {
    load();
  }, [load]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedTotal = (data?.orders || []).filter((o) => sel.has(o.orderId)).reduce((t, o) => t + Number(o.finalPayableAmount || 0), 0);
  const confirm = async () => {
    if (!window.confirm(`Confirm that ZeeBac has received ${money(selectedTotal)} in cash for ${sel.size} order(s)? This releases the sellers' share.`)) return;
    setBusy(true);
    try {
      const r = await AdminAPI.confirmCodCollection([...sel]);
      toast.success(r.message);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={`Delivered COD orders awaiting cash confirmation${data ? ` · ${money(data.totalCashToCollect)}` : ''}`}
      right={
        <button disabled={!sel.size || busy} onClick={confirm} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[12px] font-bold disabled:opacity-40">
          Confirm collection ({sel.size}) {sel.size ? money(selectedTotal) : ''}
        </button>
      }
    >
      <p className="px-4 pt-3 text-[11.5px] text-slate-500">
        Check the cash against the Rider Cash Ledger, then confirm. The seller's share moves from "on hold" to "available". No gateway fee applies to COD.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>
                <input
                  type="checkbox"
                  checked={data?.orders?.length > 0 && sel.size === data.orders.length}
                  onChange={(e) => setSel(e.target.checked ? new Set(data.orders.map((o) => o.orderId)) : new Set())}
                />
              </Th>
              <Th>Order</Th><Th>Store</Th><Th>Rider</Th><Th>Delivered</Th><Th right>Cash collected</Th><Th right>Seller share</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.orders || []).map((o) => (
              <tr key={o.orderId}>
                <Td><input type="checkbox" checked={sel.has(o.orderId)} onChange={() => toggle(o.orderId)} /></Td>
                <Td mono className="font-bold">{o.orderId}</Td>
                <Td>{o.storeName}</Td>
                <Td>{o.riderDetails?.name || '—'}</Td>
                <Td className="text-slate-500 whitespace-nowrap">{when(o.riderDetails?.deliveredAt)}</Td>
                <Td right mono className="font-bold">{money(o.finalPayableAmount)}</Td>
                <Td right mono className="text-emerald-700">{money(o.financials?.sellerPayable)}</Td>
              </tr>
            ))}
            {data && !data.orders.length && (
              <tr><Td className="text-slate-500">Nothing pending.</Td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function OrdersTab() {
  const [filters, setFilters] = useState({ search: '', settlementStatus: '', paymentMethod: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const load = useCallback(() => {
    const params = { page, limit: 50, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
    AdminAPI.getOrderFinancials(params).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e, 'Failed')));
  }, [filters, page]);
  useEffect(() => {
    load();
  }, [load]);
  const openDetail = (o) => AdminAPI.getOrderFinancialDetail(o.orderId).then((r) => setDetail(r.data)).catch((e) => toast.error(errMsg(e, 'Failed')));
  const refund = async () => {
    const o = detail.order;
    const amount = window.prompt(`Refund amount for ${o.orderId} (₹). Paid ${money(o.razorpay?.amountPaid)}, already refunded ${money(o.refundedAmount)}. Leave blank for the full remaining amount.`);
    if (amount === null) return;
    const reason = window.prompt('Refund reason:');
    if (!reason) return;
    const credited = detail.ledger.filter((l) => ['ORDER_CREDIT', 'ORDER_REVERSAL'].includes(l.type)).reduce((t, l) => t + l.amount, 0);
    let sellerReversal = '';
    if (credited > 0) {
      sellerReversal = window.prompt(`Seller was credited ${money(credited)}. How much to deduct from the seller? (blank = same as refund)`, '');
      if (sellerReversal === null) return;
    }
    try {
      const r = await AdminAPI.refundOrder(o.orderId, { amount: amount === '' ? undefined : Number(amount), reason, sellerReversal: sellerReversal === '' ? undefined : Number(sellerReversal) });
      toast.success(r.message);
      openDetail(o);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Refund failed'));
    }
  };
  const f = (k) => (e) => { setPage(1); setFilters((p) => ({ ...p, [k]: e.target.value })); };
  const pages = Math.ceil((data?.pagination?.total || 0) / 50);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="px-3 py-1.5 rounded-xl border border-slate-200 text-[12px]" placeholder="Order ID" value={filters.search} onChange={f('search')} />
        <select className="px-2 py-1.5 rounded-xl border border-slate-200 text-[12px]" value={filters.paymentMethod} onChange={f('paymentMethod')}>
          <option value="">All payments</option><option value="ONLINE">Online</option><option value="CASH">COD / store</option><option value="ZEEBAC_POINTS">Points</option>
        </select>
        <select className="px-2 py-1.5 rounded-xl border border-slate-200 text-[12px]" value={filters.settlementStatus} onChange={f('settlementStatus')}>
          <option value="">All settlement</option><option value="PENDING">Pending</option><option value="ON_HOLD">On hold</option><option value="CREDITED">Credited</option><option value="REVERSED">Reversed</option><option value="NOT_APPLICABLE">Not applicable</option>
        </select>
        <input type="date" className="px-2 py-1.5 rounded-xl border border-slate-200 text-[12px]" value={filters.from} onChange={f('from')} />
        <input type="date" className="px-2 py-1.5 rounded-xl border border-slate-200 text-[12px]" value={filters.to} onChange={f('to')} />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr><Th>Order</Th><Th>Store</Th><Th>Payment</Th><Th right>Customer paid</Th><Th right>Items+pack</Th><Th right>Delivery</Th><Th right>Fee+GST</Th><Th right>PG fee</Th><Th right>Seller</Th><Th right>Admin</Th><Th>Settlement</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.orders || []).map((o) => (
                <tr key={o._id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(o)}>
                  <Td>
                    <p className="font-mono font-bold">{o.orderId}</p>
                    <p className="text-[10.5px] text-slate-500">{when(o.createdAt)} · {o.orderStatus}</p>
                  </Td>
                  <Td>{o.storeName}</Td>
                  <Td className="text-[11.5px]">{o.paymentMethod} · {o.paymentStatus}{o.refundedAmount > 0 && <span className="text-red-600"> · refunded {money(o.refundedAmount)}</span>}</Td>
                  <Td right mono>{money(o.finalPayableAmount)}</Td>
                  <Td right mono>{money(Number(o.itemTotal || 0) + Number(o.packagingCharge || 0))}</Td>
                  <Td right mono>{money(o.deliveryCharge)}</Td>
                  <Td right mono>{money(Number(o.platformFee || 0) + Number(o.taxAmount || 0))}</Td>
                  <Td right mono>{money(o.razorpay?.fee)}</Td>
                  <Td right mono className="text-emerald-700 font-bold">{o.financials?.sellerPayable != null ? money(o.financials.sellerPayable) : '—'}</Td>
                  <Td right mono>{o.financials?.adminShare != null ? money(o.financials.adminShare) : '—'}</Td>
                  <Td className="text-[11px] font-bold">{o.financials?.settlementStatus || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex justify-between px-4 py-2 text-[12px] border-t border-slate-100">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="font-bold disabled:opacity-40">← Prev</button>
            <span>Page {page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="font-bold disabled:opacity-40">Next →</button>
          </div>
        )}
      </Card>
      {detail && (
        <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={() => setDetail(null)}>
          <div className="bg-slate-50 w-full max-w-xl h-full overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between">
              <h2 className="font-black text-[17px] font-mono">{detail.order.orderId}</h2>
              <div className="flex gap-2">
                {detail.order.razorpay?.status === 'CAPTURED' && (
                  <button onClick={refund} className="px-3 py-1.5 rounded-xl border border-red-200 bg-white text-red-600 text-[12px] font-bold">Refund</button>
                )}
                <button onClick={() => setDetail(null)} className="material-symbols-outlined text-slate-400">close</button>
              </div>
            </div>
            <Card title="Bill & split">
              <div className="p-4 text-[12.5px] space-y-1">
                {[
                  ['Items', detail.order.itemTotal],
                  ['Packaging (seller)', detail.order.packagingCharge],
                  ['Delivery fee (admin)', detail.order.deliveryCharge],
                  ['Platform fee (admin)', detail.order.platformFee],
                  ['GST (admin)', detail.order.taxAmount],
                  ['Rider tip', detail.order.tipAmount],
                  ['Points redeemed', -Number(detail.order.pointsRedeemed || 0)],
                  ['Customer paid', detail.order.finalPayableAmount],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-mono">{money(v)}</span></div>
                ))}
                <div className="border-t border-slate-100 pt-1.5 mt-1.5" />
                {[
                  ['Razorpay fee incl. GST', detail.order.razorpay?.fee],
                  ['Commission', detail.order.financials?.commissionAmount],
                  ['Seller payable', detail.order.financials?.sellerPayable],
                  ['Admin share', detail.order.financials?.adminShare],
                  ['Rider payout (from admin share)', detail.order.deliveryPayout],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between font-bold"><span>{k}</span><span className="font-mono">{v != null ? money(v) : '—'}</span></div>
                ))}
                <p className="text-[11px] text-slate-500 pt-1">
                  Settlement: {detail.order.financials?.settlementStatus} · Payment {detail.order.paymentMethod} {detail.order.razorpay?.paymentId || ''}
                  {detail.order.razorpay?.capturedVia && ` (confirmed via ${detail.order.razorpay.capturedVia})`}
                </p>
              </div>
            </Card>
            {detail.order.refunds?.length > 0 && (
              <Card title="Refunds">
                <div className="p-4 space-y-1 text-[12px]">
                  {detail.order.refunds.map((r) => (
                    <p key={r.refundId}>{money(r.amount)} · {r.status} · {r.refundId} · seller −{money(r.sellerReversal)} · {r.reason}</p>
                  ))}
                </div>
              </Card>
            )}
            <Card title="Seller ledger entries">
              <div className="p-4 space-y-1 text-[12px]">
                {detail.ledger.length ? detail.ledger.map((l) => (
                  <p key={l._id}>{when(l.createdAt)} · {l.type} · {l.status} · <b className="font-mono">{money(l.amount)}</b></p>
                )) : <p className="text-slate-500">None yet</p>}
              </div>
            </Card>
            {detail.audit?.length > 0 && (
              <Card title="Admin actions">
                <div className="p-4 space-y-1 text-[12px]">
                  {detail.audit.map((a) => <p key={a._id}>{when(a.createdAt)} · {a.action} · {money(a.amount)}</p>)}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReconTab() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(range).filter(([, v]) => v));
    AdminAPI.getSettlementReconciliation(params).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e, 'Failed')));
  }, [range]);
  if (!data) return <p className="text-slate-500 text-sm">Loading…</p>;
  const { online, cod, split, ledger, anomalies } = data;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input type="date" className="px-2 py-1.5 rounded-xl border border-slate-200 text-[12px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <input type="date" className="px-2 py-1.5 rounded-xl border border-slate-200 text-[12px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      {anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-1">
          {anomalies.map((a) => <p key={a.type} className="text-[12.5px] text-red-800 font-bold">⚠️ {a.count} · {a.message}</p>)}
        </div>
      )}
      <h3 className="font-black text-[13px] text-slate-700">Money in</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={`Razorpay captured (${online.orders})`} value={money(online.captured)} tone="purple" />
        <Kpi label="Razorpay fees incl. GST" value={money(online.gatewayFee)} sub={`GST ${money(online.gatewayGst)}`} tone="red" />
        <Kpi label="Refunded" value={money(online.refunded)} tone="red" />
        <Kpi label="Net in Razorpay" value={money(online.netReceived)} tone="green" />
        <Kpi label={`COD collected by riders (${cod.orders})`} value={money(cod.collectedByRiders)} />
        <Kpi label="COD confirmed by admin" value={money(cod.confirmedByAdmin)} tone="green" />
        <Kpi label="COD awaiting confirmation" value={money(cod.awaitingConfirmation)} tone="amber" />
      </div>
      <h3 className="font-black text-[13px] text-slate-700">Split of delivered orders ({split.orders})</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Seller payable" value={money(split.sellerPayable)} tone="green" />
        <Kpi label="Admin share" value={money(split.adminShare)} tone="purple" sub="delivery + platform fee + GST + tip + commission" />
        <Kpi label="Rider payouts" value={money(split.riderPayouts)} tone="red" />
        <Kpi label="Admin net after riders" value={money(split.adminNetAfterRiders)} tone={split.adminNetAfterRiders < 0 ? 'red' : 'green'} />
        <Kpi label="Delivery fees" value={money(split.deliveryFees)} />
        <Kpi label="Platform fees" value={money(split.platformFees)} />
        <Kpi label="GST collected (payable to govt)" value={money(split.gst)} />
        <Kpi label="Commission" value={money(split.commission)} />
      </div>
      <h3 className="font-black text-[13px] text-slate-700">Seller ledger movements</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {['ORDER_CREDIT', 'ORDER_REVERSAL', 'PAYOUT', 'ADJUSTMENT', 'PAYOUT_REVERSAL'].map((t) => (
          <Kpi key={t} label={`${t.replace('_', ' ')} (${ledger[t]?.count || 0})`} value={money(ledger[t]?.total)} />
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const [data, setData] = useState(null);
  const [action, setAction] = useState('');
  useEffect(() => {
    AdminAPI.getSettlementAuditLogs({ limit: 100, ...(action ? { action } : {}) }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e, 'Failed')));
  }, [action]);
  return (
    <Card
      title="Financial admin actions"
      right={
        <select className="px-2 py-1 rounded-lg border border-slate-200 text-[12px]" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {['SELLER_PAYOUT_RECORDED', 'SELLER_ADJUSTMENT', 'PAYOUT_REQUEST_REJECTED', 'COD_COLLECTION_CONFIRMED', 'ORDER_REFUND_INITIATED', 'PRICING_CONFIG_UPDATED'].map((a) => (
            <option key={a} value={a}>{a.replaceAll('_', ' ')}</option>
          ))}
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><Th>When</Th><Th>Action</Th><Th>Entity</Th><Th right>Amount</Th><Th>Admin</Th><Th>Details</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.logs || []).map((l) => (
              <tr key={l._id}>
                <Td className="whitespace-nowrap text-slate-500">{when(l.createdAt)}</Td>
                <Td className="font-bold text-[11.5px]">{l.action.replaceAll('_', ' ')}</Td>
                <Td mono className="text-[11px]">{l.entityType} {l.entityId}</Td>
                <Td right mono>{l.amount != null ? money(l.amount) : '—'}</Td>
                <Td className="text-[11px] text-slate-500">{l.adminRole} {String(l.adminId || '').slice(-6)}</Td>
                <Td className="text-[11px] text-slate-500 max-w-xs truncate" title={JSON.stringify({ meta: l.meta, before: l.before, after: l.after })}>
                  {l.meta ? Object.entries(l.meta).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PricingTab() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    AdminAPI.getOrderPricingConfig().then((r) => setCfg(r.data)).catch((e) => toast.error(errMsg(e, 'Failed')));
  }, []);
  if (!cfg) return <p className="text-slate-500 text-sm">Loading…</p>;
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await AdminAPI.updateOrderPricingConfig(cfg);
      setCfg(r.data);
      toast.success('Saved');
    } catch (err) {
      toast.error(errMsg(err, 'Failed'));
    } finally {
      setBusy(false);
    }
  };
  // Live preview with the spec's example order
  const items = 500;
  const pack = 10;
  const delivery = Number(cfg.orderFreeDeliveryAbove) > 0 && items >= Number(cfg.orderFreeDeliveryAbove) ? 0 : Number(cfg.orderDeliveryCharge || 0);
  const pf = Number(cfg.orderPlatformFeeFixed || 0) + (items * Number(cfg.orderPlatformFeePercent || 0)) / 100;
  const gst = cfg.enableOrderTax ? (items * Number(cfg.orderGstTaxPercent || 0)) / 100 : 0;
  const comm = ((items + pack) * Number(cfg.sellerCommissionPercent || 0)) / 100;
  const field = (k, label, hint) => (
    <div>
      <label className="text-[11px] font-bold text-slate-600 uppercase">{label}</label>
      <input className={input} type="number" min="0" step="0.01" value={cfg[k] ?? ''} onChange={set(k)} />
      {hint && <p className="text-[10.5px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Order fees (go to admin)">
        <form onSubmit={save} className="p-4 space-y-3">
          {field('orderDeliveryCharge', 'Delivery fee (₹)', 'Charged on every delivery order; admin pays the rider from it.')}
          {field('orderFreeDeliveryAbove', 'Free delivery above (₹)', '0 = never free')}
          <div className="grid grid-cols-2 gap-2">
            {field('orderPlatformFeeFixed', 'Platform fee fixed (₹)')}
            {field('orderPlatformFeePercent', 'Platform fee (% of items)')}
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            {field('orderGstTaxPercent', 'GST on items (%)')}
            <label className="flex items-center gap-2 text-[12.5px] font-bold pb-2">
              <input type="checkbox" checked={Boolean(cfg.enableOrderTax)} onChange={set('enableOrderTax')} /> Charge GST
            </label>
          </div>
          {field('sellerCommissionPercent', 'Seller commission (% of items + packaging)', 'Deducted from the seller share on online and COD orders.')}
          {field('sellerMinPayoutRequest', 'Minimum seller withdrawal (₹)')}
          <p className="text-[11px] text-slate-500">Packaging is set by each seller in their store settings and is paid to the seller.</p>
          <button disabled={busy} className="w-full py-2.5 rounded-xl bg-[#7c3aed] text-white font-black text-[13px] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </form>
      </Card>
      <Card title="Preview: ₹500 order, ₹10 packaging">
        <div className="p-4 text-[12.5px] space-y-1">
          {[
            ['Items', items],
            ['Packaging (seller)', pack],
            ['Delivery fee', delivery],
            ['Platform fee', pf],
            ['GST', gst],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-mono">{money(v)}</span></div>
          ))}
          <div className="flex justify-between font-black border-t border-slate-100 pt-1.5"><span>Customer pays</span><span className="font-mono">{money(items + pack + delivery + pf + gst)}</span></div>
          <div className="flex justify-between font-bold text-emerald-700"><span>Seller gets (COD)</span><span className="font-mono">{money(items + pack - comm)}</span></div>
          <div className="flex justify-between font-bold text-emerald-700"><span>Seller gets (online)</span><span className="font-mono">{money(items + pack - comm)} − Razorpay fee</span></div>
          <div className="flex justify-between font-bold text-[#7c3aed]"><span>Admin keeps</span><span className="font-mono">{money(delivery + pf + gst + comm)}</span></div>
          <p className="text-[11px] text-slate-500 pt-1">From the admin share you pay the rider and the GST due to the government.</p>
        </div>
      </Card>
    </div>
  );
}

export default function SellerSettlementsPage() {
  const [tab, setTab] = useState('sellers');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Vendor Settlements</h1>
        <p className="text-[12.5px] text-slate-500">
          Online cart payments (admin Razorpay) and COD cash collected by riders. Track, settle and reconcile what each seller is owed.
        </p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap flex items-center gap-1 border ${
              tab === t.id ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'sellers' && <SellersTab />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'cod' && <CodTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'recon' && <ReconTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'pricing' && <PricingTab />}
    </div>
  );
}
