import { useState, useEffect, useCallback } from 'react';
import { AdminAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

// Read-only view of rider earnings wallets with a per-rider running-balance ledger.

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

const STATUS_STYLES = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
};

const SORTS = {
  walletBalance: 'Wallet Balance',
  totalEarned: 'Total Earned',
  pendingWithdrawals: 'Pending',
  completedDeliveries: 'Deliveries',
};

function KpiCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 text-slate-900',
    amber: 'border-amber-200 bg-amber-50/40 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50/40 text-emerald-800',
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

function breakdownText(b) {
  if (!b) return '';
  const parts = [];
  if (b.baseFare != null) parts.push(`Base ${fmtMoney(b.baseFare)}`);
  if (b.distancePayout != null) parts.push(`Distance ${fmtMoney(b.distancePayout)}`);
  if (b.surgeBonus) parts.push(`Surge ${fmtMoney(b.surgeBonus)}`);
  if (b.tip) parts.push(`Tip ${fmtMoney(b.tip)}`);
  return parts.join(' + ');
}

function downloadCsv(ledger) {
  const header = ['Date', 'Type', 'Order', 'Store', 'Distance (km)', 'Delivery Fee', 'Tip', 'Credit (+)', 'Debit (-)', 'Balance', 'Status', 'Method', 'UTR', 'Processed By', 'Remarks'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  lines.push(['', 'Opening balance', '', '', '', '', '', '', '', ledger.openingBalance].map(esc).join(','));
  for (const e of [...ledger.entries].reverse()) {
    lines.push(
      [
        fmtDate(e.date), e.label, e.orderId || '', e.storeName || '', e.distanceKm ?? '',
        e.breakdown?.deliveryFee ?? '', e.breakdown?.tip || '', e.credit || '', e.debit || '',
        e.affectsBalance ? e.balance : '', e.status, e.payoutMethod || '', e.utr || '', e.processedBy || '', e.remarks || '',
      ].map(esc).join(',')
    );
  }
  lines.push(['', 'Closing balance', '', '', '', '', '', ledger.totalEarned, ledger.totalDebited, ledger.closingBalance].map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `earnings-ledger-${ledger.rider.riderId || 'rider'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RiderEarningsPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalEarned: 0, totalWalletBalance: 0, totalPendingWithdrawals: 0, ridersWithPending: 0, totalPaidOut: 0, riderCount: 0 });
  const [filter, setFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('walletBalance');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadRiders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getRiderEarningsSummary({ filter, search: debouncedSearch || undefined });
      if (res.success) {
        setRows(res.data || []);
        if (res.summary) setSummary(res.summary);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load rider earnings');
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
      const res = await AdminAPI.getRiderEarningsLedger(selected.riderObjectId, { from: from || undefined, to: to || undefined });
      if (res.success) setLedger(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load earnings ledger');
    } finally {
      setLedgerLoading(false);
    }
  }, [selected, from, to]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const sortedRows = [...rows].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  const visibleEntries = ledger ? ledger.entries.filter((e) => typeFilter === 'ALL' || e.type === typeFilter) : [];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#7c3aed] text-3xl">savings</span>
            <span>Rider Earnings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Earnings wallet balance and full payout history of every rider</p>
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
        <KpiCard label="Total Earned" value={fmtMoney(summary.totalEarned)} sub={`${summary.riderCount} active riders`} />
        <KpiCard label="Wallet Balance (Owed)" value={fmtMoney(summary.totalWalletBalance)} tone="purple" sub="Withdrawable by riders" />
        <KpiCard label="Pending Withdrawals" value={fmtMoney(summary.totalPendingWithdrawals)} tone="amber" sub={`${summary.ridersWithPending} rider(s) waiting`} />
        <KpiCard label="Total Paid Out" value={fmtMoney(summary.totalPaidOut)} tone="emerald" />
      </div>

      {/* Riders table */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { key: 'ALL', label: 'All Riders' },
              { key: 'WITH_BALANCE', label: 'Has Balance' },
              { key: 'PENDING_WITHDRAWAL', label: 'Pending Withdrawal' },
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
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-2 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:border-[#7c3aed]"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>Sort: {v}</option>
              ))}
            </select>
            <div className="relative sm:min-w-[240px] flex-1">
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
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">Rider</th>
                <th className="px-3 py-2 font-bold">Wallet Balance</th>
                <th className="px-3 py-2 font-bold">Total Earned</th>
                <th className="px-3 py-2 font-bold">Pending</th>
                <th className="px-3 py-2 font-bold">Paid Out</th>
                <th className="px-3 py-2 font-bold">Deliveries</th>
                <th className="px-3 py-2 font-bold">Last Payout</th>
                <th className="px-3 py-2 font-bold text-right">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : sortedRows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No riders found</td></tr>
              ) : (
                sortedRows.map((r) => (
                  <tr key={r.riderObjectId} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${r.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {r.name}
                        {r.applicationStatus === 'SUSPENDED' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-bold">SUSPENDED</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{r.riderId} · {r.phone}</div>
                    </td>
                    <td className="px-3 py-2.5 font-black font-mono text-[#7c3aed]">{fmtMoney(r.walletBalance)}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-800">{fmtMoney(r.totalEarned)}</td>
                    <td className="px-3 py-2.5 font-mono text-amber-700">{r.pendingWithdrawals > 0 ? fmtMoney(r.pendingWithdrawals) : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-emerald-700">{fmtMoney(r.totalPaidOut)}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{r.completedDeliveries}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(r.lastPaidAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => {
                          setLedger(null);
                          setFrom('');
                          setTo('');
                          setTypeFilter('ALL');
                          setSelected(r);
                        }}
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
          <div className="bg-white w-full max-w-5xl h-full overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-black text-lg text-slate-900">{selected.name} — Earnings Wallet</h2>
                <p className="text-[11px] text-slate-500 font-mono">
                  {selected.riderId} · {selected.phone} · UPI: {selected.upiId || 'not linked'}
                </p>
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
              <div>
                <label className="text-[10px] font-bold text-slate-500 block">Type</label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white">
                  <option value="ALL">All</option>
                  <option value="DELIVERY_PAYOUT">Delivery payouts</option>
                  <option value="WITHDRAWAL">Withdrawals</option>
                  <option value="CASH_SETTLEMENT">Cash settled</option>
                </select>
              </div>
              {(from || to) && (
                <button onClick={() => { setFrom(''); setTo(''); }} className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">
                  Clear dates
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <KpiCard label="Opening" value={fmtMoney(ledger.openingBalance)} />
                  <KpiCard label="Earned (+)" value={fmtMoney(ledger.totalEarned)} sub={`${ledger.deliveries} deliveries · tips ${fmtMoney(ledger.totalTips)}`} />
                  <KpiCard label="Paid Out" value={fmtMoney(ledger.totalPaidOut)} tone="emerald" />
                  <KpiCard label="Pending" value={fmtMoney(ledger.pendingWithdrawals)} tone="amber" sub="Held from wallet" />
                  <KpiCard label="Cash Settled" value={fmtMoney(ledger.cashSettled)} sub="COD cash paid from earnings" />
                  <KpiCard label="Wallet Balance" value={fmtMoney(ledger.closingBalance)} tone="purple" sub={`Current: ${fmtMoney(ledger.rider.walletBalance)}`} />
                </div>

                {ledger.unrecordedBalance !== 0 && !from && (
                  <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-600">
                    Opening balance of <b>{fmtMoney(ledger.unrecordedBalance)}</b> was in the wallet before detailed history was recorded
                    (older data or manual adjustment). It is included so the closing balance matches the rider&apos;s actual wallet balance.
                  </div>
                )}

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">Date</th>
                        <th className="px-3 py-2 font-bold">Type</th>
                        <th className="px-3 py-2 font-bold">Details</th>
                        <th className="px-3 py-2 font-bold text-right">Credit</th>
                        <th className="px-3 py-2 font-bold text-right">Debit</th>
                        <th className="px-3 py-2 font-bold text-right">Balance</th>
                        <th className="px-3 py-2 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleEntries.length === 0 ? (
                        <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No transactions</td></tr>
                      ) : (
                        visibleEntries.map((e) => (
                          <tr key={e.id} className={e.affectsBalance ? 'align-top' : 'align-top bg-slate-50/50 text-slate-500'}>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(e.date)}</td>
                            <td className="px-3 py-2 font-bold text-slate-800">{e.label}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600 space-y-0.5">
                              {e.type === 'DELIVERY_PAYOUT' ? (
                                <>
                                  <div>
                                    <span className="font-mono font-bold">#{e.orderId || '—'}</span>
                                    {e.storeName && <span> · {e.storeName}</span>}
                                    {e.distanceKm != null && <span> · {e.distanceKm} km</span>}
                                  </div>
                                  {breakdownText(e.breakdown) && <div className="text-slate-400">{breakdownText(e.breakdown)}</div>}
                                </>
                              ) : e.type === 'WITHDRAWAL' ? (
                                <>
                                  {e.utr && <div>UTR: <span className="font-mono font-bold">{e.utr}</span></div>}
                                  {e.processedBy && <div>By {e.processedBy} · {fmtDate(e.processedAt)}</div>}
                                  {e.remarks && <div className="italic text-slate-500">“{e.remarks}”</div>}
                                  {!e.utr && !e.processedBy && <div className="text-slate-400">{e.status === 'PENDING' ? 'Awaiting admin payment' : e.description}</div>}
                                </>
                              ) : (
                                <div className="text-slate-500">{e.description}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{e.credit ? `+${fmtMoney(e.credit)}` : ''}</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${e.affectsBalance ? 'text-red-600' : 'text-slate-400 line-through'}`}>
                              {e.debit ? `−${fmtMoney(e.debit)}` : ''}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-black text-slate-900">{e.affectsBalance ? fmtMoney(e.balance) : '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[e.status] || ''}`}>
                                {e.status === 'COMPLETED' ? (e.type === 'WITHDRAWAL' ? 'Paid' : 'Done') : e.status === 'PENDING' ? 'Pending' : 'Rejected'}
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
