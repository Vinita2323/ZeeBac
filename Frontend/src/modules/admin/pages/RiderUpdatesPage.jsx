import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';

const KINDS = [
  { key: 'announcement', label: 'Announcement', icon: 'campaign', hint: 'A notice card on the rider Updates page.' },
  { key: 'story', label: 'Story', icon: 'motion_photos_on', hint: 'A circle in the stories row. Needs an image.' },
  { key: 'video', label: 'Training video', icon: 'smart_display', hint: 'A YouTube link or an uploaded MP4.' },
];
const EMPTY = { kind: 'announcement', title: '', body: '', badge: '', imageUrl: '', videoUrl: '', zoneIds: [], startAt: '', endAt: '', isActive: true, priority: 0, sendPush: true };
const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const statusOf = (u) => {
  const now = Date.now();
  if (!u.isActive) return ['Off', 'bg-slate-100 text-slate-600'];
  if (u.startAt && new Date(u.startAt).getTime() > now) return ['Scheduled', 'bg-blue-100 text-blue-700'];
  if (u.endAt && new Date(u.endAt).getTime() < now) return ['Ended', 'bg-slate-100 text-slate-500'];
  return ['Live', 'bg-emerald-100 text-emerald-700'];
};

/** Admin: content for the rider app "Updates" page. */
export default function RiderUpdatesPage() {
  const [rows, setRows] = useState([]);
  const [zones, setZones] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // form state or null
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getRiderUpdates(filter);
      if (res.success) setRows(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load rider updates');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    AdminAPI.getAdminDeliveryZones().then((r) => r.success && setZones(r.data)).catch(() => {});
  }, []);

  const openNew = (kind = 'announcement') => {
    setFile(null);
    setEditing({ ...EMPTY, kind });
  };
  const openEdit = (u) => {
    setFile(null);
    setEditing({ ...EMPTY, ...u, zoneIds: (u.zoneIds || []).map((z) => String(z._id || z)), startAt: toLocalInput(u.startAt), endAt: toLocalInput(u.endAt) });
  };

  const save = async () => {
    if (!editing.title.trim()) return toast.error('Title is required');
    const form = new FormData();
    for (const k of ['kind', 'title', 'body', 'badge', 'imageUrl', 'videoUrl', 'priority']) form.append(k, editing[k] ?? '');
    form.append('isActive', String(Boolean(editing.isActive)));
    if (!editing._id) form.append('sendPush', String(Boolean(editing.sendPush)));
    form.append('zoneIds', JSON.stringify(editing.zoneIds || []));
    form.append('startAt', editing.startAt ? new Date(editing.startAt).toISOString() : '');
    form.append('endAt', editing.endAt ? new Date(editing.endAt).toISOString() : '');
    if (file) form.append('storyMedia', file);
    setSaving(true);
    try {
      const res = editing._id ? await AdminAPI.updateRiderUpdate(editing._id, form) : await AdminAPI.createRiderUpdate(form);
      toast.success(res.message || 'Saved');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (u) => {
    const form = new FormData();
    form.append('isActive', String(!u.isActive));
    try {
      await AdminAPI.updateRiderUpdate(u._id, form);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const [pushingId, setPushingId] = useState(null);
  const sendPush = async (u) => {
    const who = u.zoneIds?.length ? u.zoneIds.map((z) => z.name || 'zone').join(', ') : 'all riders';
    if (!window.confirm(`Send "${u.title}" as a phone notification to ${who}?`)) return;
    setPushingId(u._id);
    try {
      const res = await AdminAPI.pushRiderUpdate(u._id);
      toast.success(res.message || 'Sent');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Push failed');
    } finally {
      setPushingId(null);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete "${u.title}"? Riders will stop seeing it.`)) return;
    try {
      await AdminAPI.deleteRiderUpdate(u._id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const set = (patch) => setEditing((e) => ({ ...e, ...patch }));
  const kindInfo = (k) => KINDS.find((x) => x.key === k) || KINDS[0];

  return (
    <div className="space-y-5 pb-10 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-black text-slate-900">Rider Updates</h1>
          <p className="text-[13px] text-slate-500">
            Announcements, stories and training videos shown on the rider app's Updates page. Target all riders or specific zones, and schedule start and end dates.
          </p>
        </div>
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => openNew(k.key)} className="px-3 py-2 rounded-xl bg-[#7c3aed] text-white text-[12px] font-bold flex items-center gap-1 cursor-pointer">
              <span className="material-symbols-outlined text-[16px]">add</span>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {[['', 'All'], ...KINDS.map((k) => [k.key, k.label])].map(([k, l]) => (
          <button key={k || 'all'} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer ${filter === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5 font-bold">Type</th>
              <th className="text-left px-3 py-2.5 font-bold">Title</th>
              <th className="text-left px-3 py-2.5 font-bold">Audience</th>
              <th className="text-left px-3 py-2.5 font-bold">Schedule</th>
              <th className="text-left px-3 py-2.5 font-bold">Status</th>
              <th className="text-right px-3 py-2.5 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nothing published yet. Riders see an empty Updates page until you add something.</td></tr>
            ) : (
              rows.map((u) => {
                const [label, cls] = statusOf(u);
                return (
                  <tr key={u._id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                        <span className="material-symbols-outlined text-[16px]">{kindInfo(u.kind).icon}</span>
                        {kindInfo(u.kind).label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-800">{u.title}</p>
                      {u.body && <p className="text-[11px] text-slate-500 line-clamp-1">{u.body}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{u.zoneIds?.length ? u.zoneIds.map((z) => z.name || 'Zone').join(', ') : 'All riders'}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                      {new Date(u.startAt).toLocaleDateString('en-IN')} → {u.endAt ? new Date(u.endAt).toLocaleDateString('en-IN') : 'no end'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-black ${cls}`}>{label}</span>
                      {u.lastPushedAt && (
                        <p className="text-[10.5px] text-slate-500 mt-1">
                          Pushed {new Date(u.lastPushedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {u.pushStats?.pushEnabled === false ? ' · push not configured' : u.pushStats ? ` · ${u.pushStats.sent ?? 0} device(s)` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => sendPush(u)} disabled={pushingId === u._id || label !== 'Live'} title={label !== 'Live' ? 'Only live items can be pushed' : 'Send as phone notification'} className="px-2.5 py-1 rounded-lg border border-purple-200 text-purple-700 font-bold text-[12px] cursor-pointer disabled:opacity-40">
                        {pushingId === u._id ? 'Sending…' : 'Send push'}
                      </button>{' '}
                      <button onClick={() => openEdit(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-[12px] cursor-pointer">Edit</button>{' '}
                      <button onClick={() => toggle(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-[12px] cursor-pointer">{u.isActive ? 'Turn off' : 'Turn on'}</button>{' '}
                      <button onClick={() => remove(u)} className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 font-bold text-[12px] cursor-pointer">Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-[17px] text-slate-900">{editing._id ? 'Edit' : 'New'} {kindInfo(editing.kind).label.toLowerCase()}</h3>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Close">✕</button>
            </div>
            <div className="flex gap-2">
              {KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => set({ kind: k.key })} className={`flex-1 px-2 py-2 rounded-xl text-[12px] font-bold cursor-pointer ${editing.kind === k.key ? 'bg-[#7c3aed] text-white' : 'border border-slate-200 text-slate-700'}`}>
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-slate-500">{kindInfo(editing.kind).hint}</p>

            <label className="block text-[11px] font-bold text-slate-500 uppercase">Title</label>
            <input value={editing.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
            <label className="block text-[11px] font-bold text-slate-500 uppercase">Message</label>
            <textarea rows={3} value={editing.body} onChange={(e) => set({ body: e.target.value })} maxLength={2000} className="w-full p-3 rounded-xl border border-slate-200 text-[13px]" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Badge (optional)</label>
                <input value={editing.badge} onChange={(e) => set({ badge: e.target.value })} maxLength={30} placeholder="Safety, Festival…" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Priority</label>
                <input type="number" value={editing.priority} onChange={(e) => set({ priority: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
              </div>
            </div>

            {editing.kind === 'video' && (
              <>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">YouTube / video link</label>
                <input value={editing.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://youtu.be/…" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
              </>
            )}
            <label className="block text-[11px] font-bold text-slate-500 uppercase">
              {editing.kind === 'video' ? 'Or upload a video / thumbnail image' : 'Image'}
            </label>
            <input type="file" accept={editing.kind === 'video' ? 'video/mp4,video/webm,image/*' : 'image/*'} onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[12px]" />
            <input value={editing.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="…or paste an image link" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />

            <label className="block text-[11px] font-bold text-slate-500 uppercase">Who sees it</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => set({ zoneIds: [] })} className={`px-2.5 py-1 rounded-lg text-[12px] font-bold cursor-pointer ${!editing.zoneIds.length ? 'bg-slate-900 text-white' : 'border border-slate-200'}`}>All riders</button>
              {zones.map((z) => {
                const on = editing.zoneIds.includes(String(z._id));
                return (
                  <button key={z._id} type="button" onClick={() => set({ zoneIds: on ? editing.zoneIds.filter((x) => x !== String(z._id)) : [...editing.zoneIds, String(z._id)] })} className={`px-2.5 py-1 rounded-lg text-[12px] font-bold cursor-pointer ${on ? 'bg-[#7c3aed] text-white' : 'border border-slate-200 text-slate-700'}`}>
                    {z.name}{z.city ? ` · ${z.city}` : ''}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Start</label>
                <input type="datetime-local" value={editing.startAt} onChange={(e) => set({ startAt: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">End (optional)</label>
                <input type="datetime-local" value={editing.endAt} onChange={(e) => set({ endAt: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[13px]" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
              <input type="checkbox" checked={editing.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Active
            </label>
            {!editing._id && (
              <label className="flex items-start gap-2 text-[13px] text-slate-700">
                <input type="checkbox" className="mt-1" checked={editing.sendPush} onChange={(e) => set({ sendPush: e.target.checked })} />
                <span>
                  <strong>Also send as a phone notification now</strong>
                  <span className="block text-[11.5px] text-slate-500">Only if it is live now (scheduled items can be pushed later with “Send push”).</span>
                </span>
              </label>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-[13px] cursor-pointer">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7c3aed] text-white font-bold text-[13px] disabled:opacity-50 cursor-pointer">
                {saving ? 'Saving…' : editing._id ? 'Save changes' : 'Publish to riders'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
