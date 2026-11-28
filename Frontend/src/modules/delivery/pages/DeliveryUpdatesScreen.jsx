import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryTopBar from '../components/DeliveryTopBar';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { DeliveryAPI } from '../../../services/api';
import { getSocket } from '../../../services/socket';
import { toast } from 'react-hot-toast';

const NOTIF_STYLE = {
  rider_order: { icon: 'two_wheeler', cls: 'bg-purple-100 text-purple-700' },
  rider_payout: { icon: 'payments', cls: 'bg-emerald-100 text-emerald-700' },
  rider_cash: { icon: 'account_balance_wallet', cls: 'bg-amber-100 text-amber-700' },
  rider_account: { icon: 'badge', cls: 'bg-blue-100 text-blue-700' },
  announcement: { icon: 'campaign', cls: 'bg-slate-100 text-slate-700' },
  admin_message: { icon: 'campaign', cls: 'bg-purple-100 text-purple-700' },
};

const timeAgo = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** YouTube links → embeddable URL; anything else is played with <video>. */
const youtubeEmbed = (url) => {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : null;
};
const youtubeThumb = (url) => {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
};

export default function DeliveryUpdatesScreen() {
  const navigate = useNavigate();
  const [feed, setFeed] = useState({ stories: [], videos: [], announcements: [] });
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeStory, setActiveStory] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [f, n] = await Promise.all([DeliveryAPI.getUpdatesFeed(), DeliveryAPI.getNotifications()]);
      if (f?.success) setFeed(f.data);
      if (n?.success) {
        setNotifs(n.data.rows);
        setUnread(n.data.unread);
      }
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load updates. Pull to refresh or try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // New notifications arrive live (socket room rider_<id>)
  useEffect(() => {
    const socket = getSocket?.();
    if (!socket) return undefined;
    const onNew = (n) => {
      if (n?.recipientType !== 'delivery') return;
      setNotifs((prev) => [n, ...prev.filter((x) => x._id !== n._id)]);
      setUnread((u) => u + 1);
    };
    socket.on('new_notification', onNew);
    return () => socket.off('new_notification', onNew);
  }, []);

  const markAll = async () => {
    if (!unread) return toast.success('All caught up');
    try {
      await DeliveryAPI.markAllNotificationsRead();
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
      window.dispatchEvent(new Event('rider-notifications-read'));
    } catch {
      toast.error('Could not update notifications');
    }
  };

  const openNotif = async (n) => {
    if (!n.isRead) {
      setNotifs((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      DeliveryAPI.markNotificationRead(n._id).catch(() => {});
      window.dispatchEvent(new Event('rider-notifications-read'));
    }
    if (n.data?.url && String(n.data.url).startsWith('/')) navigate(n.data.url);
    else if (n.type === 'rider_order') navigate('/delivery/dashboard');
    else if (n.type === 'rider_payout' || n.type === 'rider_cash') navigate('/delivery/earnings');
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      <DeliveryTopBar />

      <main className="max-w-[480px] mx-auto p-4 space-y-4">
        {loadError && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center justify-between gap-2">
            <span>{loadError}</span>
            <button onClick={load} className="px-2.5 py-1 rounded-lg bg-white border border-red-200 cursor-pointer">Retry</button>
          </div>
        )}

        {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[11.5px] flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-700">notifications_off</span>
            <span>
              <strong>Phone alerts are blocked.</strong> To get order alerts when the app is closed, allow notifications for this site in your
              browser settings (tap the lock icon next to the address), then reopen the app.
            </span>
          </div>
        )}

        {/* ─── Stories (admin-published) ─── */}
        {feed.stories.length > 0 && (
          <div className="flex items-center gap-3 overflow-x-auto scroll-hide py-1">
            {feed.stories.map((story) => (
              <button key={story._id} onClick={() => setActiveStory(story)} className="flex flex-col items-center shrink-0 cursor-pointer group">
                <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-purple-600 to-amber-500">
                  <img src={story.imageUrl} alt={story.title} className="w-full h-full rounded-full object-cover border-2 border-white" />
                </div>
                <span className="text-[11px] font-bold text-slate-700 mt-1 max-w-[72px] truncate">{story.badge || story.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* ─── Notifications (real, for this rider) ─── */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="font-display font-black text-base text-slate-900 flex items-center gap-2">
              Notifications
              {unread > 0 && <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">{unread} new</span>}
            </h3>
            <button onClick={markAll} className="text-[11px] font-bold text-purple-700 cursor-pointer disabled:opacity-40" disabled={!unread}>
              Mark all read
            </button>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : notifs.length === 0 ? (
            <div className="px-4 pb-5 pt-2 text-center">
              <span className="material-symbols-outlined text-[32px] text-slate-300">notifications_off</span>
              <p className="text-xs font-bold text-slate-600 mt-1">No notifications yet</p>
              <p className="text-[11px] text-slate-400">Order assignments, payouts and account updates will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifs.map((n) => {
                const st = NOTIF_STYLE[n.type] || NOTIF_STYLE.announcement;
                return (
                  <button key={n._id} onClick={() => openNotif(n)} className={`w-full px-4 py-3 flex items-start gap-3 text-left cursor-pointer hover:bg-slate-50 ${n.isRead ? '' : 'bg-purple-50/40'}`}>
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${st.cls}`}>
                      <span className="material-symbols-outlined text-[18px]">{st.icon}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-xs ${n.isRead ? 'font-bold text-slate-700' : 'font-black text-slate-900'}`}>{n.title}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{n.message}</span>
                    </span>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-purple-600 mt-1.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Announcements from Zeebac ─── */}
        {feed.announcements.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-display font-black text-sm text-slate-900">From Zeebac</h3>
            {feed.announcements.map((a) => (
              <div key={a._id} className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
                {a.imageUrl && <img src={a.imageUrl} alt="" className="w-full h-32 object-cover" />}
                <div className="p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-purple-700">campaign</span>
                    <h4 className="font-bold text-xs text-slate-900 flex-1">{a.title}</h4>
                    {a.badge && <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-black">{a.badge}</span>}
                  </div>
                  {a.body && <p className="text-[11.5px] text-slate-600 mt-1.5 leading-relaxed whitespace-pre-line">{a.body}</p>}
                  <p className="text-[10px] text-slate-400 mt-2">{new Date(a.startAt || a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ─── Training videos ─── */}
        {feed.videos.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="font-display font-black text-base text-slate-900">Training videos</h3>
            <div className="flex gap-3 overflow-x-auto scroll-hide pb-1">
              {feed.videos.map((v) => {
                const thumb = v.imageUrl || youtubeThumb(v.videoUrl);
                return (
                  <button key={v._id} onClick={() => setSelectedVideo(v)} className="w-56 shrink-0 bg-white rounded-2xl border border-slate-100 overflow-hidden text-left cursor-pointer group">
                    <div className="relative h-28 bg-slate-900">
                      {thumb && <img src={thumb} alt="" className="w-full h-full object-cover opacity-80" />}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow">
                          <span className="material-symbols-outlined text-[24px] text-slate-900">play_arrow</span>
                        </span>
                      </span>
                    </div>
                    <div className="p-2.5">
                      <h4 className="font-black text-xs text-slate-900 line-clamp-1 group-hover:text-purple-700">{v.title}</h4>
                      {v.body && <p className="text-[10.5px] text-slate-500 line-clamp-2 mt-0.5">{v.body}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!loading && !loadError && feed.stories.length + feed.videos.length + feed.announcements.length === 0 && (
          <p className="text-center text-[11px] text-slate-400 pt-2">No announcements or training videos right now.</p>
        )}
      </main>

      {/* Video player */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedVideo(null)}>
          <div className="w-full max-w-[480px] bg-slate-900 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-video bg-black">
              {youtubeEmbed(selectedVideo.videoUrl) ? (
                <iframe
                  src={youtubeEmbed(selectedVideo.videoUrl)}
                  title={selectedVideo.title}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={selectedVideo.videoUrl} controls autoPlay playsInline className="w-full h-full" />
              )}
              <button onClick={() => setSelectedVideo(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer" aria-label="Close video">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4">
              <h3 className="font-display font-black text-sm text-white">{selectedVideo.title}</h3>
              {selectedVideo.body && <p className="text-xs text-slate-300 mt-1">{selectedVideo.body}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Story viewer */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setActiveStory(null)}>
          <div className="w-full max-w-[420px] rounded-3xl overflow-hidden bg-slate-900 relative" onClick={(e) => e.stopPropagation()}>
            <img src={activeStory.imageUrl} alt={activeStory.title} className="w-full max-h-[60vh] object-cover" />
            <button onClick={() => setActiveStory(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer" aria-label="Close story">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <div className="p-4">
              {activeStory.badge && <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-black uppercase">{activeStory.badge}</span>}
              <h3 className="font-display font-black text-lg text-white mt-2">{activeStory.title}</h3>
              {activeStory.body && <p className="text-sm text-slate-200 mt-1 whitespace-pre-line">{activeStory.body}</p>}
            </div>
          </div>
        </div>
      )}

      <DeliveryBottomNav />
    </div>
  );
}
