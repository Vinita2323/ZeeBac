import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';
import useLanguageStore from '../../../store/useLanguageStore';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Monthly order quota for the vendor's current billing cycle:
 * free limit, used, remaining, extra paid orders and the total deducted.
 * `compact` renders the dashboard version (no order list).
 */
export default function OrderUsageCard({ compact = false }) {
  const { t } = useLanguageStore();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    VendorAPI.getOrderUsage()
      .then((res) => alive && res?.success && setData(res.data))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="bg-white rounded-3xl p-6 border border-outline-variant/15 shadow-sm h-40 animate-pulse" />;
  }
  if (!data?.hasPlan || !data.current) return null;

  const c = data.current;
  const pct = c.isUnlimited || !c.freeLimit ? 0 : Math.min(100, Math.round((c.freeUsed / c.freeLimit) * 100));
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const rows = showAll ? data.extraOrders : data.extraOrders.slice(0, 5);

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-outline-variant/15 shadow-sm space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('Monthly Order Usage')}</p>
          <h3 className="text-[17px] font-black text-gray-900 mt-0.5">
            {c.planName || t('Current plan')}
            {!data.isActive && <span className="ml-2 text-[11px] font-bold text-red-600">({t('Subscription inactive')})</span>}
          </h3>
          <p className="text-[12px] text-gray-500">
            {t('Billing cycle')}: <strong className="text-gray-700">{fmtDate(c.cycleStart)} – {fmtDate(c.displayEnd)}</strong> · {t('Resets on')} {fmtDate(c.cycleEnd)}
          </p>
        </div>
        {compact && (
          <button
            onClick={() => navigate('/vendor/subscription')}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-[12px] hover:bg-gray-50 cursor-pointer"
          >
            {t('View details')}
          </button>
        )}
      </div>

      {c.isUnlimited ? (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-[12.5px] text-blue-900">
          {t('Your current plan has no order limit.')} <strong>{c.ordersUsed}</strong> {t('completed orders this cycle.')}{' '}
          {t('Order limits and per-order charges apply when you renew on one of the new plans.')}
        </div>
      ) : (
        <>
          <div>
            <div className="flex justify-between text-[12.5px] font-semibold text-gray-700 mb-1.5">
              <span>
                {c.freeUsed} / {c.freeLimit} {t('free orders used')}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t('Orders completed')} value={c.ordersUsed} />
            <Stat label={t('Free remaining')} value={c.freeRemaining} tone={c.freeRemaining === 0 ? 'text-red-600' : 'text-emerald-700'} />
            <Stat label={t('Extra paid orders')} value={c.extraOrders} />
            <Stat label={t('Extra charges deducted')} value={inr(c.extraChargeTotal)} tone="text-purple-700" />
          </div>

          <p className="text-[12px] text-gray-500">
            ℹ️ {t('After your')} {c.freeLimit} {t('free orders, ₹')}
            {c.extraRate} {t('is deducted from your wallet for every completed order until the cycle resets. Refunded or returned orders are credited back and do not count.')}
          </p>
          {c.reversedOrders > 0 && (
            <p className="text-[12px] text-emerald-700">
              {c.reversedOrders} {t('refunded/returned order(s) removed from usage')}
              {c.reversedChargeTotal > 0 && ` · ${inr(c.reversedChargeTotal)} ${t('credited back')}`}
            </p>
          )}
        </>
      )}

      {!compact && data.extraOrders.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('Extra order charges this cycle')}</p>
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-[12.5px]">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">{t('Order')}</th>
                  <th className="text-left px-3 py-2 font-bold">{t('Completed')}</th>
                  <th className="text-right px-3 py-2 font-bold">{t('Charge')}</th>
                  <th className="text-right px-3 py-2 font-bold">{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id || r.orderId} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-semibold text-gray-800">#{r.orderCode}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtDate(r.completedAt)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.status === 'REVERSED' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{inr(r.chargeAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'REVERSED' ? (
                        <span className="text-emerald-700 font-bold">{t('Refunded')}</span>
                      ) : r.chargeStatus === 'DEDUCTED' ? (
                        <span className="text-gray-700 font-bold">{t('Deducted')}</span>
                      ) : (
                        <span className="text-amber-700 font-bold">{t('Processing')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.extraOrders.length > 5 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12px] font-bold text-purple-700 cursor-pointer">
              {showAll ? t('Show less') : `${t('Show all')} (${data.extraOrders.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'text-gray-900' }) {
  return (
    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
      <p className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[18px] font-black mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}
