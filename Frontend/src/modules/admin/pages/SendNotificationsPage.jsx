import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';

const ROLES = [
  { key: 'customer', label: 'Customers', icon: 'person' },
  { key: 'vendor', label: 'Vendors', icon: 'storefront' },
  { key: 'delivery', label: 'Delivery partners', icon: 'two_wheeler' },
];
// Suggested tap-through pages per app (admin can also type any in-app path)
const LINKS = {
  customer: [['', 'No link'], ['/wallet', 'Wallet'], ['/orders', 'My orders'], ['/explore', 'Explore stores'], ['/refer-earn', 'Refer & Earn'], ['/notifications', 'Notifications']],
  vendor: [['', 'No link'], ['/vendor', 'Dashboard'], ['/vendor/wallet', 'Wallet'], ['/vendor/subscription', 'Subscription'], ['/vendor/notifications', 'Notifications']],
  delivery: [['', 'No link'], ['/delivery/dashboard', 'Dashboard'], ['/delivery/earnings', 'Pocket'], ['/delivery/gigs', 'Gigs'], ['/delivery/updates', 'Updates']],
};
const TIER_LABEL = { INDEPENDENT: 'Independent Seller', ESTABLISHED: 'Established Retailers', ENTERPRISE: 'Business Enterprise', BRAND: 'Brand/Manufacturer', NONE: 'No active plan' };
const STATUS_STYLE = {
  QUEUED: 'bg-slate-100 text-slate-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** Admin: write a notification and send it to one person or a group, now or later. */
export default function SendNotificationsPage() {
  const [role, setRole] = useState('customer');
  const [mode, setMode] = useState('group');
  const [filters, setFilters] = useState({ city: '', vendorCategory: '', subscriptionTier: '', zoneId: '' });
  const [options, setOptions] = useState(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [person, setPerson] = useState(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [when, setWhen] = useState('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);

  const audience = useMemo(
    () => (mode === 'single' ? { mode, role, recipientId: person?._id } : { mode, role, filters }),
    [mode, role, person, filters]
  );

  const loadHistory = useCallback(async () => {
    try {
      const r = await AdminAPI.getBroadcasts();
      if (r.success) setHistory(r.data.rows);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    AdminAPI.getBroadcastFilters().then((r) => r.success && setOptions(r.data)).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  // Refresh history while something is sending / scheduled
  useEffect(() => {
    if (!history.some((h) => ['QUEUED', 'SENDING'].includes(h.status))) return undefined;
    const t = setInterval(loadHistory, 3000);
    return () => clearInterval(t);
  }, [history, loadHistory]);

  // Reset role-specific state
  useEffect(() => {
    setFilters({ city: '', vendorCategory: '', subscriptionTier: '', zoneId: '' });
    setPerson(null);
    setMatches([]);
    setQuery('');
    setUrl('');
  }, [role]);

  // Live audience size
  useEffect(() => {
    if (mode === 'single' && !person) return setPreview(null);
    let alive = true;
    const t = setTimeout(() => {
      AdminAPI.previewBroadcast(audience)
        .then((r) => alive && r.success && setPreview(r.data))
        .catch(() => alive && setPreview(null));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [audience, mode, person]);

  // Person search
  useEffect(() => {
    if (mode !== 'single' || query.trim().length < 3) return setMatches([]);
    const t = setTimeout(() => {
      AdminAPI.lookupBroadcastRecipient(role, query.trim()).then((r) => r.success && setMatches(r.data)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, role, mode]);

  const submit = async (extra = {}) => {
    if (mode === 'single' && !person) return toast.error('Choose the person to notify');
    if (!title.trim() || !message.trim()) return toast.error('Write a title and a message');
    if (when === 'later' && !scheduledAt) return toast.error('Pick a date and time');
    const who = mode === 'single' ? person.name : `${preview?.recipients ?? 0} ${ROLES.find((r) => r.key === role).label.toLowerCase()}`;
    if (!extra.confirmLarge && !window.confirm(`${when === 'later' ? 'Schedule' : 'Send'} "${title.trim()}" to ${who}?`)) return;
    setSending(true);
    try {
      const r = await AdminAPI.sendBroadcast({
        audience,
        title: title.trim(),
        message: message.trim(),
        url,
        sendPush,
        scheduledAt: when === 'later' ? new Date(scheduledAt).toISOString() : null,
        ...extra,
      });
      toast.success(r.message || 'Sent');
      setTitle('');
      setMessage('');
      loadHistory();
    } catch (err) {
      const d = err.response?.data;
      if (d?.code === 'CONFIRM_LARGE') {
        if (window.confirm(`${d.message}\n\nThis cannot be undone once it starts.`)) return submit({ ...extra, confirmLarge: true });
      } else if (d?.code === 'DUPLICATE') {
        if (window.confirm(`${d.message}\n\nSend it again anyway?`)) return submit({ ...extra, force: true });
      } else {
        toast.error(d?.message || 'Failed to send');
      }
    } finally {
      setSending(false);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm('Cancel this scheduled notification?')) return;
    try {
      await AdminAPI.cancelBroadcast(id);
      toast.success('Cancelled');
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed');
    }
  };

  const opt = options?.[role] || {};
  const select = (value, onChange, items, placeholder) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-[13px] bg-white min-w-[160px]">
      <option value="">{placeholder}</option>
      {items.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5 pb-10 text-left">
      <div>
        <h1 className="font-display text-[24px] font-black text-slate-900">Send Notifications</h1>
        <p className="text-[13px] text-slate-500">
          Message one person or a whole group. It appears in their in-app notifications, and as a phone notification on devices that allowed alerts.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          {/* Who */}
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">1. Who</p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button key={r.key} onClick={() => setRole(r.key)} className={`px-3 py-2 rounded-xl text-[13px] font-bold flex items-center gap-1.5 cursor-pointer ${role === r.key ? 'bg-[#7c3aed] text-white' : 'border border-slate-200 text-slate-700'}`}>
                  <span className="material-symbols-outlined text-[17px]">{r.icon}</span>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {[['group', 'Everyone / a group'], ['single', 'One person']].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer ${mode === k ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'}`}>{l}</button>
              ))}
            </div>

            {mode === 'group' ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {select(filters.city, (v) => setFilters((f) => ({ ...f, city: v })), (opt.cities || []).map((c) => [c, c]), 'All cities')}
                {role === 'vendor' && select(filters.vendorCategory, (v) => setFilters((f) => ({ ...f, vendorCategory: v })), (opt.categories || []).map((c) => [c, c]), 'All categories')}
                {role === 'vendor' && select(filters.subscriptionTier, (v) => setFilters((f) => ({ ...f, subscriptionTier: v })), (opt.tiers || []).map((tr) => [tr, TIER_LABEL[tr] || tr]), 'Any plan')}
                {role === 'delivery' && select(filters.zoneId, (v) => setFilters((f) => ({ ...f, zoneId: v })), (opt.zones || []).map((z) => [z._id, `${z.name}${z.city ? ` · ${z.city}` : ''}`]), 'All zones')}
              </div>
            ) : person ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 border border-purple-100">
                <div>
                  <p className="font-bold text-[13px] text-slate-900">{person.name}</p>
                  <p className="text-[11.5px] text-slate-500">{person.phone} · {person.code} · {person.pushDevices ? `${person.pushDevices} phone(s) with alerts on` : 'no phone alerts (in-app only)'}</p>
                </div>
                <button onClick={() => setPerson(null)} className="text-[12px] font-bold text-purple-700 cursor-pointer">Change</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by phone, ZeeBac ID or name" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
                {matches.map((m) => (
                  <button key={m._id} onClick={() => setPerson(m)} className="w-full text-left px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50 text-[12.5px] cursor-pointer">
                    <span className="font-bold text-slate-800">{m.name}</span> <span className="text-slate-500">· {m.phone} · {m.code}</span>
                  </button>
                ))}
                {query.trim().length >= 3 && !matches.length && <p className="text-[12px] text-slate-400">No match</p>}
              </div>
            )}
          </div>

          {/* What */}
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">2. Message</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Title" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Message" className="w-full p-3 rounded-xl border border-slate-200 text-[13px]" />
            <p className="text-[11px] text-slate-400 text-right">{title.length}/80 · {message.length}/500</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-slate-600">Opens when tapped:</span>
              {select(url, setUrl, LINKS[role].slice(1), LINKS[role][0][1])}
            </div>
          </div>

          {/* How / when */}
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">3. Delivery</p>
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
              Also send as a phone notification
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[['now', 'Send now'], ['later', 'Schedule']].map(([k, l]) => (
                <button key={k} onClick={() => setWhen(k)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer ${when === k ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'}`}>{l}</button>
              ))}
              {when === 'later' && <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-[13px]" />}
            </div>
          </div>

          <button onClick={() => submit()} disabled={sending || (mode === 'single' && !person) || !preview?.recipients} className="w-full py-3 rounded-xl bg-[#7c3aed] text-white font-black text-[14px] disabled:opacity-40 cursor-pointer">
            {sending ? 'Sending…' : when === 'later' ? 'Schedule notification' : `Send to ${preview?.recipients ?? 0} ${preview?.recipients === 1 ? 'person' : 'people'}`}
          </button>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Reach</p>
            {preview ? (
              <div className="space-y-1 text-[13px]">
                <p><strong className="text-[20px] text-slate-900">{preview.recipients}</strong> {preview.recipients === 1 ? 'person' : 'people'} — in-app</p>
                <p className="text-slate-600">
                  {sendPush ? (preview.pushConfigured ? `${preview.pushPeople} of them on ${preview.pushDevices} phone(s) get a phone notification` : 'Phone push is not configured on the server') : 'Phone notification off'}
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] text-slate-400">{mode === 'single' ? 'Choose a person' : '…'}</p>
            )}
          </div>
          <div className="bg-slate-900 rounded-2xl p-4 text-white">
            <p className="text-[10.5px] uppercase tracking-wider text-slate-400 mb-2">Phone preview</p>
            <div className="bg-white/10 rounded-xl p-3 flex gap-2.5">
              <img src="/Logo (6).png" alt="" className="w-8 h-8 rounded-lg bg-white object-contain" />
              <div className="min-w-0">
                <p className="text-[12px] font-bold truncate">{title || 'Title'}</p>
                <p className="text-[11.5px] text-slate-300 line-clamp-3">{message || 'Your message appears here'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <div className="px-4 pt-4 pb-2 font-black text-[15px] text-slate-900">Sent & scheduled</div>
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-bold">Created</th>
              <th className="text-left px-3 py-2 font-bold">To</th>
              <th className="text-left px-3 py-2 font-bold">Message</th>
              <th className="text-left px-3 py-2 font-bold">Status</th>
              <th className="text-right px-3 py-2 font-bold">Delivered</th>
              <th className="text-right px-3 py-2 font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Nothing sent yet</td></tr>
            ) : (
              history.map((h) => {
                const f = h.audience.filters || {};
                const scope = h.audience.mode === 'single'
                  ? h.audience.recipientLabel
                  : [f.city, f.vendorCategory, f.subscriptionTier && (TIER_LABEL[f.subscriptionTier] || f.subscriptionTier), f.zoneId && 'zone'].filter(Boolean).join(' · ') || 'everyone';
                return (
                  <tr key={h._id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{fmt(h.createdAt)}<p className="text-[10.5px] text-slate-400">{h.createdByName}</p></td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-800">{ROLES.find((r) => r.key === h.audience.role)?.label}</p>
                      <p className="text-[11px] text-slate-500">{scope}</p>
                    </td>
                    <td className="px-3 py-2.5 max-w-[320px]">
                      <p className="font-bold text-slate-800 truncate">{h.title}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{h.message}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-black ${STATUS_STYLE[h.status]}`}>{h.status}</span>
                      {h.status === 'SCHEDULED' && <p className="text-[10.5px] text-slate-500 mt-1">{fmt(h.scheduledAt)}</p>}
                      {h.error && <p className="text-[10.5px] text-red-600 mt-1">{h.error}</p>}
                      {h.resumeCount > 0 && h.status !== 'FAILED' && <p className="text-[10.5px] text-amber-700 mt-1">Resumed after an interruption — nobody was notified twice</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-700">
                      {h.stats?.inApp ?? 0} in-app
                      {h.sendPush && <p className="text-[10.5px] text-slate-500">{h.stats?.pushSent ?? 0} phone(s)</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {h.status === 'SCHEDULED' && <button onClick={() => cancel(h._id)} className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 font-bold text-[12px] cursor-pointer">Cancel</button>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
