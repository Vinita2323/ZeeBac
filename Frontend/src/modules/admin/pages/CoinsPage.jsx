import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';

const inr = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const STATUS_STYLE = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

/** Admin: verify UPI coin top-ups and see every vendor's coin & cash position. */
export default function CoinsPage() {
  const [tab, setTab] = useState('topups');
  return (
    <div className="space-y-5 pb-10 text-left">
      <div>
        <h1 className="font-display text-[24px] font-black text-slate-900">Zeebac Coins</h1>
        <p className="text-[13px] text-slate-500">
          Verify UPI top-ups before coins are credited, and see each vendor's purchased coins, earned coins and cash earnings.
        </p>
      </div>
      <div className="flex gap-2">
        {[
          ['topups', 'UPI top-up approvals'],
          ['vendors', 'Vendor coin balances'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-[13px] font-bold cursor-pointer ${tab === k ? 'bg-[#7c3aed] text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'topups' ? <TopupsTab /> : <VendorsTab />}
    </div>
  );
}

function TopupsTab() {
  const [status, setStatus] = useState('PENDING');
  const [ownerType, setOwnerType] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ rows: [], total: 0, pending: { count: 0, amount: 0 } });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { id, note }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getCoinTopups({ status: status || undefined, ownerType: ownerType || undefined, search: search || undefined, limit: 50 });
      if (res.success) setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load top-ups');
    } finally {
      setLoading(false);
    }
  }, [status, ownerType, search]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (r) => {
    if (!window.confirm(`Approve ₹${r.amount} for ${r.ownerName || r.ownerZeebacId}?\n\nOnly approve after confirming UTR ${r.utr} for ₹${r.amount} in Zeebac's bank / UPI statement.`)) return;
    setBusyId(r._id);
    try {
      const res = await AdminAPI.approveCoinTopup(r._id);
      toast.success(res.message || 'Approved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting || rejecting.note.trim().length < 3) return toast.error('Enter a reason');
    setBusyId(rejecting.id);
    try {
      await AdminAPI.rejectCoinTopup(rejecting.id, rejecting.note.trim());
      toast.success('Rejected');
      setRejecting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
        <strong>{data.pending?.count || 0}</strong> pending · <strong>₹{inr(data.pending?.amount)}</strong> waiting for verification. Coins are credited only when you approve.
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-[13px] bg-white">
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </select>
        <select value={ownerType} onChange={(e) => setOwnerType(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-[13px] bg-white">
          <option value="">Vendors & customers</option>
          <option value="Vendor">Vendors</option>
          <option value="User">Customers</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search UTR, name, Zeebac ID, phone"
          className="h-10 px-3 rounded-xl border border-slate-200 text-[13px] flex-1 min-w-[220px]"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5 font-bold">Submitted</th>
              <th className="text-left px-3 py-2.5 font-bold">From</th>
              <th className="text-left px-3 py-2.5 font-bold">UTR</th>
              <th className="text-right px-3 py-2.5 font-bold">Amount</th>
              <th className="text-left px-3 py-2.5 font-bold">Status</th>
              <th className="text-right px-3 py-2.5 font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : data.rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No requests</td></tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r._id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-slate-800">{r.ownerName || '—'}</p>
                    <p className="text-[11px] text-slate-500">{r.ownerType === 'Vendor' ? 'Vendor' : 'Customer'} · {r.ownerZeebacId} · {r.ownerPhone}</p>
                  </td>
                  <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{r.utr}</td>
                  <td className="px-3 py-2.5 text-right font-black text-slate-900">₹{inr(r.amount)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-black ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    {r.reviewedAt && <p className="text-[10.5px] text-slate-400 mt-1">{fmtDate(r.reviewedAt)}</p>}
                    {r.adminNote && <p className="text-[11px] text-slate-600 mt-0.5">{r.adminNote}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {r.status === 'PENDING' && (
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => approve(r)}
                          disabled={busyId === r._id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[12px] disabled:opacity-50 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejecting({ id: r._id, note: '' })}
                          disabled={busyId === r._id}
                          className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 font-bold text-[12px] disabled:opacity-50 cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3">
            <h3 className="font-black text-[16px] text-slate-900">Reject top-up</h3>
            <textarea
              rows={3}
              value={rejecting.note}
              onChange={(e) => setRejecting((r) => ({ ...r, note: e.target.value }))}
              placeholder="Reason shown to the payer (e.g. UTR not found in statement, amount mismatch)"
              className="w-full p-3 rounded-xl border border-slate-200 text-[13px]"
            />
            <div className="flex gap-2">
              <button onClick={() => setRejecting(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-[13px] cursor-pointer">Cancel</button>
              <button onClick={reject} disabled={busyId === rejecting.id} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-[13px] disabled:opacity-50 cursor-pointer">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorsTab() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // vendor row
  const [txs, setTxs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getVendorCoinOverview({ search: search || undefined });
      if (res.success) setRows(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const openVendor = async (v) => {
    setOpen(v);
    setTxs([]);
    try {
      const res = await AdminAPI.getVendorCoinTransactions(v.vendorId, { limit: 100 });
      if (res.success) setTxs(res.data.rows);
    } catch {
      toast.error('Failed to load transactions');
    }
  };

  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Purchased coins', sum('purchasedCoins'), 'Bought from Zeebac · cashback & withdrawable'],
          ['Earned coins', sum('earnedCoins'), 'Redeemed by customers · cashback only'],
          ['Cash earnings', sum('cashEarnings'), 'Real money received · withdrawable'],
          ['Withdrawable', sum('withdrawable'), 'Purchased + cash'],
        ].map(([label, v, hint]) => (
          <div key={label} className="p-4 rounded-2xl bg-white border border-slate-200">
            <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-[20px] font-black text-slate-900 mt-0.5">{inr(v)}</p>
            <p className="text-[11px] text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search store, Zeebac ID, phone"
        className="h-10 px-3 rounded-xl border border-slate-200 text-[13px] w-full max-w-md"
      />

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5 font-bold">Store</th>
              <th className="text-right px-3 py-2.5 font-bold">Purchased</th>
              <th className="text-right px-3 py-2.5 font-bold">Earned</th>
              <th className="text-right px-3 py-2.5 font-bold">Cash</th>
              <th className="text-right px-3 py-2.5 font-bold">Withdrawable</th>
              <th className="text-right px-3 py-2.5 font-bold">Cashback given</th>
              <th className="text-right px-3 py-2.5 font-bold">Redeemed at store</th>
              <th className="text-right px-3 py-2.5 font-bold">Pending top-ups</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.vendorId} onClick={() => openVendor(r)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-slate-800">{r.storeName}</p>
                    <p className="text-[11px] text-slate-500">
                      {r.zeebacId}
                      {!r.migrated && <span className="ml-1.5 px-1.5 rounded bg-slate-100 text-slate-500 font-bold">not migrated · total ₹{inr(r.balance)}</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right">{inr(r.purchasedCoins)}</td>
                  <td className="px-3 py-2.5 text-right">{inr(r.earnedCoins)}</td>
                  <td className="px-3 py-2.5 text-right">{inr(r.cashEarnings)}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{inr(r.withdrawable)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{inr(r.totals.cashbackGiven)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{inr(r.totals.redeemedAtStore)}</td>
                  <td className="px-3 py-2.5 text-right">{r.pendingTopups.count ? `${r.pendingTopups.count} · ₹${inr(r.pendingTopups.amount)}` : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={() => setOpen(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-[17px] text-slate-900">{open.storeName}</h3>
                <p className="text-[12px] text-slate-500">{open.zeebacId} · {open.phone}</p>
              </div>
              <button onClick={() => setOpen(null)} className="w-8 h-8 rounded-full hover:bg-slate-100 cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <div className="p-3 rounded-xl bg-emerald-50"><p className="text-slate-500">Purchased</p><p className="font-black">{inr(open.purchasedCoins)}</p></div>
              <div className="p-3 rounded-xl bg-amber-50"><p className="text-slate-500">Earned</p><p className="font-black">{inr(open.earnedCoins)}</p></div>
              <div className="p-3 rounded-xl bg-sky-50"><p className="text-slate-500">Cash</p><p className="font-black">₹{inr(open.cashEarnings)}</p></div>
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Transaction history</p>
            <div className="divide-y divide-slate-100">
              {txs.map((t) => (
                <div key={t._id} className="py-2 flex justify-between gap-3 text-[12px]">
                  <div className="min-w-0">
                    <p className="text-slate-800 truncate">{t.description || t.category}</p>
                    <p className="text-[10.5px] text-slate-400">
                      {fmtDate(t.createdAt)} · {t.category}
                      {t.bucketSplit && ['purchasedPoints', 'earnedCoins', 'cashEarnings']
                        .filter((k) => t.bucketSplit[k])
                        .map((k) => ` · ${k === 'purchasedPoints' ? 'purchased' : k === 'earnedCoins' ? 'earned' : 'cash'} ${t.bucketSplit[k]}`)
                        .join('')}
                    </p>
                  </div>
                  <span className={`shrink-0 font-black ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.type === 'credit' ? '+' : '−'}{inr(t.amount)}
                  </span>
                </div>
              ))}
              {txs.length === 0 && <p className="text-[12px] text-slate-400 py-4">No transactions</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
