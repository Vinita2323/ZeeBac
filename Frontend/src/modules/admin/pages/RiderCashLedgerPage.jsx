import { useState, useEffect, useCallback } from 'react';
import { AdminAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

// Read-only view of COD cash held by riders, with a per-rider running-balance ledger.

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

const STATUS_STYLES = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};

function KpiCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 text-slate-900',
    amber: 'border-amber-200 bg-amber-50/40 text-amber-800',
    red: 'border-red-200 bg-red-50/40 text-red-800',
    purple: 'border-purple-200 bg-purple-50/40 text-[#7c3aed]',
  };
  return (
    <div className={`bg-white p-3.5 rounded-2xl border shadow-xs ${tones[tone]}`}>
      <span className="text-[11px] font-bold uppercase block opacity-70">{label}</span>
      <span className="text-2xl font-black font-mono">{value}</span>
      {sub && <span className="text-[10px] block opacity-70 mt-0.5">{sub}</span>}
    </div>
  );
}

function downloadCsv(ledger) {
  const header = ['Date', 'Type', 'Order / Reference', 'Cash In (+)', 'Cash Out (-)', 'Balance', 'Status', 'Verified By', 'Details'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  const chronological = [...ledger.entries].reverse();
  lines.push([ '', 'Opening balance', '', '', '', ledger.openingBalance, '', '', '' ].map(esc).join(','));
  for (const e of chronological) {
    lines.push(
      [
        fmtDate(e.date),
        e.label,
        e.orderId || e.reference || '',
        e.credit || '',
        e.debit || '',
        e.affectsBalance ? e.balance : '',
        e.status,
        e.verifiedBy || '',
        e.description || '',
      ].map(esc).join(',')
    );
  }
  lines.push([ '', 'Closing balance', '', ledger.totalCollected, ledger.totalCleared, ledger.closingBalance, '', '', '' ].map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cash-ledger-${ledger.rider.riderId || 'rider'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RiderCashLedgerPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalCashHeld: 0, ridersWithCash: 0, ridersAtLimit: 0, pendingUpiAmount: 0, pendingUpiCount: 0 });
  const [filter, setFilter] = useState('WITH_CASH');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState(null); // rider row
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadRiders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getRiderCashLedgerSummary({ filter, search: debouncedSearch || undefined });
      if (res.success) {
        setRows(res.data || []);
        if (res.summary) setSummary(res.summary);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load rider cash');
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    loadRiders();
  }, [loadRiders]);

  const loadLedger = useCallback(async () => {
    if (!selected) return;
    setLedgerLoading(true);
    try {
      const res = await AdminAPI.getRiderCashLedger(selected.riderObjectId, { from: from || undefined, to: to || undefined });
      if (res.success) setLedger(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  }, [selected, from, to]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const openRider = (r) => {
    setLedger(null);
    setFrom('');
    setTo('');
    setSelected(r);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#7c3aed] text-3xl">payments</span>
            <span>Rider Cash Ledger</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">COD cash held by riders, with a full collection and deposit history per rider</p>
        </div>
        <button
          onClick={() => {
            loadRiders();
            if (selected) loadLedger();
          }}
          className="self-start sm:self-auto py-2 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Cash Held" value={fmtMoney(summary.totalCashHeld)} tone="purple" sub="Across all riders" />
        <KpiCard label="Riders Holding Cash" value={summary.ridersWithCash} />
        <KpiCard label="At Cash Limit" value={summary.ridersAtLimit} tone="red" sub="Orders paused for these riders" />
        <KpiCard
          label="Pending UPI Deposits"
          value={fmtMoney(summary.pendingUpiAmount)}
          tone="amber"
          sub={`${summary.pendingUpiCount} rider(s) awaiting verification`}
        />
      </div>

      {/* Riders table */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { key: 'WITH_CASH', label: 'Holding Cash' },
              { key: 'AT_LIMIT', label: 'At Limit' },
              { key: 'ALL', label: 'All Riders' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`py-2 px-3.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer transition-all ${
                  filter === t.key ? 'bg-[#7c3aed] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative sm:min-w-[260px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or rider ID"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#7c3aed]"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">Rider</th>
                <th className="px-3 py-2 font-bold">Cash in Hand</th>
                <th className="px-3 py-2 font-bold">Limit</th>
                <th className="px-3 py-2 font-bold">Pending UPI</th>
                <th className="px-3 py-2 font-bold">Last Collected</th>
                <th className="px-3 py-2 font-bold">Last Cleared</th>
                <th className="px-3 py-2 font-bold text-right">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No riders found</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.riderObjectId} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${r.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {r.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{r.riderId} · {r.phone}</div>
                    </td>
                    <td className={`px-3 py-2.5 font-black font-mono ${r.atLimit && r.cashInHand > 0 ? 'text-red-600' : r.cashInHand > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                      {fmtMoney(r.cashInHand)}
                      {r.atLimit && r.cashInHand > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-[9px] font-bold font-sans">LIMIT</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{fmtMoney(r.cashLimit)}</td>
                    <td className="px-3 py-2.5 font-mono text-amber-700">{r.pendingUpi > 0 ? fmtMoney(r.pendingUpi) : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(r.lastCollectedAt)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(r.lastClearedAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => openRider(r)}
                        className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#7c3aed] border border-purple-200 font-bold text-[11px] cursor-pointer"
                      >
                        View Ledger
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ledger drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-4xl h-full overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-black text-lg text-slate-900">{selected.name} — Cash Ledger</h2>
                <p className="text-[11px] text-slate-500 font-mono">{selected.riderId} · {selected.phone}</p>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs" />
              </div>
              {(from || to) && (
                <button onClick={() => { setFrom(''); setTo(''); }} className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">
                  Clear
                </button>
              )}
              <button
                onClick={() => ledger && downloadCsv(ledger)}
                disabled={!ledger || ledgerLoading}
                className="ml-auto px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[15px]">download</span>
                Export CSV
              </button>
            </div>

            {ledgerLoading || !ledger ? (
              <div className="py-16 text-center text-slate-400 text-sm">Loading ledger…</div>
            ) : (
              <>
                {/* Totals */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <KpiCard label="Opening Balance" value={fmtMoney(ledger.openingBalance)} />
                  <KpiCard label="Cash Collected (+)" value={fmtMoney(ledger.totalCollected)} tone="amber" />
                  <KpiCard label="Cash Cleared (−)" value={fmtMoney(ledger.totalCleared)} />
                  <KpiCard label="Closing Balance" value={fmtMoney(ledger.closingBalance)} tone="purple" sub={`Current cash in hand: ${fmtMoney(ledger.rider.cashInHand)}`} />
                </div>

                {ledger.unrecordedBalance !== 0 && !from && (
                  <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-600">
                    Opening balance of <b>{fmtMoney(ledger.unrecordedBalance)}</b> is cash held before detailed history was recorded
                    (older data or manual adjustment). It is included so the closing balance matches the rider&apos;s actual cash in hand.
                  </div>
                )}
                {ledger.pendingUpi > 0 && (
                  <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-amber-800">
                    {fmtMoney(ledger.pendingUpi)} in UPI deposits is awaiting verification and is not yet deducted from the balance.
                    Verify it under Delivery Partners → Deposits &amp; Payouts.
                  </div>
                )}

                {/* Ledger table */}
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">Date</th>
                        <th className="px-3 py-2 font-bold">Type</th>
                        <th className="px-3 py-2 font-bold">Order / Reference</th>
                        <th className="px-3 py-2 font-bold text-right">Cash In</th>
                        <th className="px-3 py-2 font-bold text-right">Cash Out</th>
                        <th className="px-3 py-2 font-bold text-right">Balance</th>
                        <th className="px-3 py-2 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.entries.length === 0 ? (
                        <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No transactions in this period</td></tr>
                      ) : (
                        ledger.entries.map((e) => (
                          <tr key={e.id} className={e.affectsBalance ? '' : 'bg-slate-50/50 text-slate-500'}>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(e.date)}</td>
                            <td className="px-3 py-2">
                              <div className="font-bold text-slate-800">{e.label}</div>
                              {e.verifiedBy && <div className="text-[10px] text-slate-400">by {e.verifiedBy}</div>}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px]">
                              {e.orderId ? `#${e.orderId}` : e.utr ? `UTR ${e.utr}` : e.txnRef || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">{e.credit ? `+${fmtMoney(e.credit)}` : ''}</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${e.affectsBalance ? 'text-emerald-700' : 'text-slate-400 line-through'}`}>
                              {e.debit ? `−${fmtMoney(e.debit)}` : ''}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-black text-slate-900">{e.affectsBalance ? fmtMoney(e.balance) : '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[e.status] || ''}`}>
                                {e.status === 'COMPLETED' ? 'Done' : e.status === 'PENDING' ? 'Pending' : 'Rejected'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
