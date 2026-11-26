import { useState, useEffect, useCallback } from 'react';
import { AdminAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

// Section of the Delivery Partners page: pending rider withdrawals & UPI cash deposits.
// Balances only change on the server after a successful admin action.

const UTR_REGEX = /^[A-Za-z0-9]{6,35}$/;

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

function StatusBadge({ status, type }) {
  const label =
    status === 'COMPLETED' ? (type === 'withdrawal' ? 'Paid' : 'Verified') : status === 'PENDING' ? 'Pending' : 'Rejected';
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

export default function RiderSettlementRequests({ onChanged }) {
  const [type, setType] = useState('withdrawal'); // 'withdrawal' | 'deposit'
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ pendingWithdrawals: { count: 0, amount: 0 }, pendingDeposits: { count: 0, amount: 0 } });
  const [loading, setLoading] = useState(false);

  // action modal: { row, action: 'CASH' | 'ONLINE' | 'REJECT' | 'VERIFY' }
  const [modal, setModal] = useState(null);
  const [utr, setUtr] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getRiderSettlementRequests({ type, status });
      if (res.success) {
        setRows(res.data || []);
        if (res.summary) setSummary(res.summary);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settlement requests');
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = (row, action) => {
    setModal({ row, action });
    setUtr('');
    setRemarks('');
    setConfirmed(false);
  };

  const closeModal = () => {
    if (!submitting) setModal(null);
  };

  const needsUtr = modal?.action === 'ONLINE';
  const isReject = modal?.action === 'REJECT';
  const utrValid = !needsUtr || UTR_REGEX.test(utr.trim());
  const canSubmit = !submitting && utrValid && (isReject ? remarks.trim().length > 0 : confirmed);

  const submit = async () => {
    if (!modal || !canSubmit) return;
    const { row, action } = modal;
    setSubmitting(true);
    try {
      let res;
      if (type === 'withdrawal') {
        res = await AdminAPI.processRiderWithdrawal(row.riderObjectId, row.requestId, {
          action: action === 'REJECT' ? 'Reject' : 'Approve',
          payoutMethod: action === 'REJECT' ? undefined : action, // 'CASH' | 'ONLINE'
          utr: action === 'ONLINE' ? utr.trim() : undefined,
          remarks: remarks.trim(),
        });
      } else {
        res = await AdminAPI.verifyRiderCashDeposit(row.riderObjectId, row.requestId, {
          action: action === 'REJECT' ? 'Reject' : 'Approve',
          note: remarks.trim(),
        });
      }
      if (res.success) {
        toast.success(res.message || 'Updated');
        setModal(null);
        await load();
        onChanged?.();
      } else {
        toast.error(res.message || 'Action failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed. Nothing was changed.');
      // Request may have been processed by another admin — refresh to show the real state
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = {
    CASH: 'Mark Withdrawal Paid in Cash',
    ONLINE: 'Mark Withdrawal Paid Online',
    REJECT: type === 'withdrawal' ? 'Reject Withdrawal' : 'Reject UPI Deposit',
    VERIFY: 'Verify UPI Cash Deposit',
  }[modal?.action];

  const confirmText = {
    CASH: 'I confirm I have handed this cash amount to the rider.',
    ONLINE: 'I confirm the bank/UPI transfer has been completed successfully and the UTR above is correct.',
    VERIFY: 'I confirm this amount with the above UTR has been received in the admin account.',
  }[modal?.action];

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#7c3aed] text-[22px]">account_balance_wallet</span>
          <div>
            <h2 className="text-sm font-black text-slate-900">Rider Settlement Requests</h2>
            <p className="text-[11px] text-slate-500">Rider withdrawals and UPI cash-in-hand deposits awaiting admin action</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:border-[#7c3aed]"
          >
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">{type === 'withdrawal' ? 'Paid' : 'Verified'}</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
          </select>
          <button
            onClick={load}
            className="py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex items-center gap-1.5">
        {[
          { key: 'withdrawal', label: 'Withdrawal Requests', s: summary.pendingWithdrawals },
          { key: 'deposit', label: 'UPI Cash Deposits', s: summary.pendingDeposits },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`py-2 px-3.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              type === t.key ? 'bg-[#7c3aed] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>{t.label}</span>
            <span className={`px-1.5 rounded-full text-[10px] ${type === t.key ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {t.s.count} · {fmtMoney(t.s.amount)}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-100 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">Rider</th>
              <th className="px-3 py-2 font-bold">Amount</th>
              <th className="px-3 py-2 font-bold">{type === 'withdrawal' ? 'Requested' : 'Submitted'}</th>
              <th className="px-3 py-2 font-bold">{type === 'withdrawal' ? 'Pay To' : 'Rider UTR'}</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-3 py-2 font-bold">Transaction Details</th>
              <th className="px-3 py-2 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  No {status === 'ALL' ? '' : status.toLowerCase()} {type === 'withdrawal' ? 'withdrawal requests' : 'UPI deposits'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.requestId} className="hover:bg-slate-50/60 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-slate-900">{r.riderName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{r.riderId} · {r.riderPhone}</div>
                    <div className="text-[10px] text-slate-400">
                      {type === 'withdrawal' ? `Balance: ${fmtMoney(r.currentEarnings)}` : `Cash in hand: ${fmtMoney(r.currentCashInHand)}`}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-black font-mono text-slate-900">{fmtMoney(r.amount)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{fmtDate(type === 'withdrawal' ? r.requestedAt : r.submittedAt)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-700">
                    {type === 'withdrawal' ? r.upiId || <span className="text-red-500 font-sans">No UPI linked</span> : r.utr || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} type={type} />
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-600 space-y-0.5">
                    {r.status === 'PENDING' ? (
                      <span className="text-slate-400">Awaiting admin action</span>
                    ) : type === 'withdrawal' ? (
                      <>
                        {r.payoutMethod && <div>Method: <b>{r.payoutMethod === 'ONLINE' ? 'Online' : 'Cash'}</b></div>}
                        {r.utr && <div>UTR: <span className="font-mono font-bold">{r.utr}</span></div>}
                        <div>By {r.processedBy || '—'} · {fmtDate(r.processedAt)}</div>
                        {r.remarks && <div className="text-slate-500 italic">“{r.remarks}”</div>}
                      </>
                    ) : (
                      <>
                        <div>By {r.verifiedBy || '—'} · {fmtDate(r.verifiedAt)}</div>
                        {r.note && <div className="text-slate-500 italic truncate max-w-[220px]">{r.note}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.status === 'PENDING' && (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {type === 'withdrawal' ? (
                          <>
                            <button onClick={() => openModal(r, 'CASH')} className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] cursor-pointer">
                              Pay in Cash
                            </button>
                            <button onClick={() => openModal(r, 'ONLINE')} className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#7c3aed] border border-purple-200 font-bold text-[11px] cursor-pointer">
                              Paid Online
                            </button>
                          </>
                        ) : (
                          <button onClick={() => openModal(r, 'VERIFY')} className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] cursor-pointer">
                            Verify
                          </button>
                        )}
                        <button onClick={() => openModal(r, 'REJECT')} className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-[11px] cursor-pointer">
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

      {/* Action Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="font-black text-base text-slate-900">{modalTitle}</h3>
              <button onClick={closeModal} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Rider</span><b>{modal.row.riderName} ({modal.row.riderId})</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><b className="font-mono">{fmtMoney(modal.row.amount)}</b></div>
              {type === 'withdrawal' ? (
                <div className="flex justify-between"><span className="text-slate-500">Rider UPI</span><b className="font-mono">{modal.row.upiId || '—'}</b></div>
              ) : (
                <div className="flex justify-between"><span className="text-slate-500">Rider&apos;s UTR</span><b className="font-mono">{modal.row.utr}</b></div>
              )}
            </div>

            {needsUtr && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">Transfer UTR / Reference No. *</label>
                <input
                  type="text"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\s/g, ''))}
                  placeholder="e.g. 412345678901"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono font-bold focus:outline-none focus:border-[#7c3aed]"
                  autoFocus
                />
                {utr && !utrValid && <p className="text-[10px] text-red-500">Enter a valid UTR (6–35 letters/digits).</p>}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 block">{isReject ? 'Reason for rejection *' : 'Remarks (optional)'}</label>
              <input
                type="text"
                value={remarks}
                maxLength={300}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={isReject ? 'e.g. UTR not found in bank statement' : ''}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#7c3aed]"
              />
              {isReject && (
                <p className="text-[10px] text-slate-500">
                  {type === 'withdrawal'
                    ? 'The amount will be refunded to the rider’s earnings balance.'
                    : 'The rider’s cash-in-hand will stay unchanged.'}
                </p>
              )}
            </div>

            {!isReject && (
              <label className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-[#7c3aed]" />
                <span>{confirmText}</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={closeModal} disabled={submitting} className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-[#7c3aed] hover:bg-[#6d28d9]'
                }`}
              >
                {submitting ? 'Saving…' : isReject ? 'Reject' : modal.action === 'VERIFY' ? 'Verify & Clear Cash' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
