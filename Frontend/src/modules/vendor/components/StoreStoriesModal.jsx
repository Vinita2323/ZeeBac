import { useState, useEffect, useRef, useMemo } from 'react';
import { StoryAPI } from '../../../services/api';

const PRESET_OFFER_TAGS = [
  '🔥 Flat 20% OFF',
  '⚡ Flash Deal',
  '🎉 New Arrival',
  '⏰ Today Only',
  '💰 Extra Cashback',
  '✨ Special Deal',
];

const PRESET_BG_GRADIENTS = [
  { name: 'Instagram Sunset', val: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' },
  { name: 'Electric Purple', val: 'linear-gradient(135deg, #4f46e5, #7c3aed, #c026d3)' },
  { name: 'Midnight Neon', val: 'linear-gradient(135deg, #0f172a, #1e1b4b, #312e81)' },
  { name: 'Emerald Luxe', val: 'linear-gradient(135deg, #064e3b, #047857, #10b981)' },
  { name: 'Warm Amber', val: 'linear-gradient(135deg, #78350f, #d97706, #f59e0b)' },
];

export default function StoreStoriesModal({ isOpen, onClose, onStoryUpdated }) {
  const [activeTab, setActiveTab] = useState('add'); // 'add' | 'my_stories'
  const [myStories, setMyStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [offerTag, setOfferTag] = useState(PRESET_OFFER_TAGS[0]);
  const [customTag, setCustomTag] = useState('');
  const [isCustomTag, setIsCustomTag] = useState(false);
  const [bgGradient, setBgGradient] = useState(PRESET_BG_GRADIENTS[0].val);

  const fileInputRef = useRef(null);

  // Story Viewers State
  const [selectedStoryForViewers, setSelectedStoryForViewers] = useState(null);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersList, setViewersList] = useState([]);
  const [viewerSearchQuery, setViewerSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchMyStories();
    } else {
      setSelectedStoryForViewers(null);
    }
  }, [isOpen]);

  const fetchMyStories = async () => {
    try {
      setLoading(true);
      const res = await StoryAPI.getMyStories();
      if (res.success) {
        setMyStories(res.data || []);
        if (res.data && res.data.length > 0 && !selectedFile) {
          // If vendor already has active stories, show them
          setActiveTab('my_stories');
        }
      }
    } catch (err) {
      console.error('Failed to load stories', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract unique viewers (each customer only appears once)
  const getUniqueViewerList = (list = []) => {
    const map = new Map();
    for (const v of list) {
      const name = (v.name || v.userName || v.userId?.name || 'Customer').trim();
      const userId = v.userId?._id || v.userId;
      const key = userId ? userId.toString() : name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          ...v,
          name,
        });
      } else {
        const existing = map.get(key);
        if (new Date(v.viewedAt) > new Date(existing.viewedAt)) {
          existing.viewedAt = v.viewedAt;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.viewedAt) - new Date(a.viewedAt)
    );
  };

  const openStoryViewers = async (story) => {
    setSelectedStoryForViewers(story);
    setViewerSearchQuery('');
    const rawList = story.viewersList || (story.views || []).map((v) => ({
      _id: v._id,
      userId: v.userId?._id || v.userId,
      name: v.userName || v.userId?.name || 'Customer',
      profileImage: v.userImage || v.userId?.profileImage || '',
      viewedAt: v.viewedAt,
    }));
    setViewersList(getUniqueViewerList(rawList));

    try {
      setViewersLoading(true);
      const res = await StoryAPI.getStoryViewers(story._id);
      if (res.success && res.data?.viewers) {
        setViewersList(getUniqueViewerList(res.data.viewers));
      }
    } catch (err) {
      console.warn('Failed to fetch latest viewers:', err);
    } finally {
      setViewersLoading(false);
    }
  };

  const uniqueViewers = useMemo(() => {
    return getUniqueViewerList(viewersList);
  }, [viewersList]);

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0) return 'Just now';
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / (1000 * 60 * 60 * 24))}d ago`;
  };

  const getAvatarGradient = (name = 'Customer') => {
    const gradients = [
      'from-pink-500 to-rose-500',
      'from-purple-500 to-indigo-500',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-teal-500',
      'from-amber-500 to-orange-500',
    ];
    let hash = 0;
    for (let i = 0; i < (name || 'Customer').length; i++) {
      hash = (name || 'Customer').charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleCreateStory = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please select a photo or banner for your story.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('storyMedia', selectedFile);
      formData.append('caption', caption);
      formData.append('offerTag', isCustomTag ? customTag : offerTag);
      formData.append('backgroundColor', bgGradient);

      const res = await StoryAPI.createStory(formData);
      if (res.success) {
        // Reset form
        setSelectedFile(null);
        setPreviewUrl('');
        setCaption('');
        fetchMyStories();
        setActiveTab('my_stories');
        if (onStoryUpdated) onStoryUpdated();
      } else {
        alert(res.message || 'Failed to publish story');
      }
    } catch (err) {
      console.error('Story publish failed', err);
      alert(err.response?.data?.message || 'Error publishing story');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStory = async (storyId) => {
    if (!window.confirm('Delete this story? It will no longer be visible to customers.')) return;
    try {
      const res = await StoryAPI.deleteStory(storyId);
      if (res.success) {
        setMyStories((prev) => prev.filter((s) => s._id !== storyId));
        if (selectedStoryForViewers?._id === storyId) {
          setSelectedStoryForViewers(null);
        }
        if (onStoryUpdated) onStoryUpdated();
      }
    } catch (err) {
      console.error('Failed to delete story', err);
      alert('Failed to delete story');
    }
  };

  const formatHoursRemaining = (expiresAt) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hrs > 0) return `${hrs}h ${mins}m left`;
    return `${mins}m left`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn text-left">
      <div className="relative w-full max-w-xl sm:max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-transparent">
          <div className="flex items-center gap-3">
            {selectedStoryForViewers ? (
              <button
                type="button"
                onClick={() => setSelectedStoryForViewers(null)}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer transition-colors shadow-2xs"
                title="Back to Stories"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 p-[2px] shadow-sm flex items-center justify-center flex-shrink-0">
                <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px] text-purple-600">history_toggle_off</span>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-[16px] sm:text-[17px] text-slate-900 leading-tight">
                  {selectedStoryForViewers ? 'Story Viewers' : 'Store Stories'}
                </h2>
                {!selectedStoryForViewers && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[9px] font-black uppercase tracking-wider border border-purple-200/50">
                    24h Live
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {selectedStoryForViewers
                  ? `${uniqueViewers.length} unique customer${uniqueViewers.length === 1 ? '' : 's'} viewed this story`
                  : 'Post daily flash deals and updates to attract nearby customers'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setSelectedStoryForViewers(null);
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[19px]">close</span>
          </button>
        </div>

        {/* Tab Toggle (Clean Segmented Pill) */}
        {!selectedStoryForViewers && (
          <div className="px-5 sm:px-6 pt-3 pb-1 bg-white">
            <div className="flex bg-slate-100/90 p-1 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('add')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'add'
                    ? 'bg-white text-purple-700 shadow-xs scale-[1.01]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Create Story
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('my_stories')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'my_stories'
                    ? 'bg-white text-purple-700 shadow-xs scale-[1.01]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">auto_awesome_motion</span>
                Active Stories ({myStories.length})
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {selectedStoryForViewers ? (
            /* Story Viewers Detail View */
            <div className="space-y-4">
              {/* Story Context Banner */}
              <div className="p-3.5 bg-gradient-to-r from-purple-50/60 via-pink-50/40 to-slate-50 rounded-2xl border border-purple-100 flex items-center gap-3.5 shadow-2xs">
                <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 relative shadow-sm">
                  <img
                    src={selectedStoryForViewers.mediaUrl}
                    alt="Story preview"
                    className="w-full h-full object-cover"
                  />
                  {selectedStoryForViewers.offerTag && (
                    <span className="absolute bottom-0 inset-x-0 bg-amber-400 text-slate-900 text-[7px] font-black text-center py-0.5 truncate">
                      {selectedStoryForViewers.offerTag}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-slate-900 truncate">
                    {selectedStoryForViewers.caption || 'Store Story & Offers'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] mt-1 text-slate-500">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold flex items-center gap-0.5 border border-emerald-200/50">
                      <span className="material-symbols-outlined text-[12px]">timer</span>
                      {formatHoursRemaining(selectedStoryForViewers.expiresAt)}
                    </span>
                    <span>•</span>
                    <span className="font-bold text-purple-700 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                      {uniqueViewers.length} total view{uniqueViewers.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStoryForViewers(null)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  Back
                </button>
              </div>

              {/* Viewers Search (if more than 2 viewers) */}
              {uniqueViewers.length > 2 && (
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={viewerSearchQuery}
                    onChange={(e) => setViewerSearchQuery(e.target.value)}
                    placeholder="Search viewer by name..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-600 focus:bg-white transition-all outline-hidden"
                  />
                </div>
              )}

              {/* Viewers List Header */}
              <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Who Viewed ({uniqueViewers.length})</span>
                {viewersLoading && (
                  <span className="flex items-center gap-1 text-purple-600 text-[10px] lowercase font-medium">
                    <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                    syncing...
                  </span>
                )}
              </div>

              {/* Viewers List */}
              {uniqueViewers.length === 0 ? (
                <div className="py-14 text-center text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <span className="material-symbols-outlined text-[42px] text-purple-300 mb-2">
                    visibility_off
                  </span>
                  <p className="font-bold text-xs text-slate-700">No viewers yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[260px] mx-auto">
                    When nearby customers browse your store's 24h story on their feed, their names will show here in real-time.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs max-h-[320px] overflow-y-auto">
                  {uniqueViewers
                    .filter((v) =>
                      (v.name || 'Customer')
                        .toLowerCase()
                        .includes(viewerSearchQuery.toLowerCase().trim())
                    )
                    .map((viewer, idx) => (
                      <div
                        key={viewer._id || idx}
                        className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {viewer.profileImage ? (
                            <img
                              src={viewer.profileImage}
                              alt={viewer.name}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                            />
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-full bg-gradient-to-tr ${getAvatarGradient(
                                viewer.name
                              )} text-white font-black text-sm flex items-center justify-center flex-shrink-0 shadow-xs`}
                            >
                              {(viewer.name || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-slate-900 truncate">
                              {viewer.name || 'Customer'}
                            </p>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium mt-0.5">
                              <span className="material-symbols-outlined text-[12px] text-emerald-600">
                                check_circle
                              </span>
                              Seen {formatTimeAgo(viewer.viewedAt)}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200/60 px-2.5 py-1 rounded-full flex-shrink-0">
                          Viewed
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : activeTab === 'add' ? (
            /* Minimalist Classy Story Studio */
            <form onSubmit={handleCreateStory} className="max-w-2xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* Left: 9:16 Live Canvas & Dropzone */}
                <div className="md:col-span-5 flex flex-col items-center">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`group relative w-[195px] sm:w-[215px] aspect-[9/16] rounded-[28px] overflow-hidden shadow-xl border-2 transition-all cursor-pointer select-none flex flex-col justify-between p-3.5 text-white ${
                      previewUrl
                        ? 'border-purple-300 shadow-purple-900/15'
                        : 'border-slate-200 hover:border-purple-400 hover:shadow-2xl'
                    }`}
                    style={{ background: bgGradient }}
                  >
                    {/* Background Media or Empty Dropzone */}
                    {previewUrl ? (
                      <>
                        <img
                          src={previewUrl}
                          alt="Story media"
                          className="absolute inset-0 w-full h-full object-cover z-0 group-hover:scale-102 transition-transform duration-500"
                        />
                        {/* Cinematic Gradient Mask */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-slate-950/40 pointer-events-none z-1" />
                      </>
                    ) : (
                      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center p-4 text-center bg-black/15 backdrop-blur-[1px]">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white mb-2.5 group-hover:scale-110 group-hover:bg-white/30 transition-all shadow-md">
                          <span className="material-symbols-outlined text-[26px]">add_photo_alternate</span>
                        </div>
                        <p className="text-xs font-bold text-white drop-shadow-xs">
                          Tap to Add Photo
                        </p>
                        <p className="text-[10px] text-white/70 mt-1 font-medium leading-tight">
                          Banner or product image<br />(9:16 vertical)
                        </p>
                      </div>
                    )}

                    {/* Top Canvas Bar */}
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 bg-black/35 backdrop-blur-md px-2 py-1 rounded-full border border-white/15">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-[8px] font-black text-white">
                          ★
                        </div>
                        <span className="text-[10px] font-bold text-white tracking-wide">
                          Your Store
                        </span>
                      </div>

                      {previewUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            setPreviewUrl('');
                          }}
                          className="w-6 h-6 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition-colors shadow-xs"
                          title="Remove photo"
                        >
                          <span className="material-symbols-outlined text-[13px]">close</span>
                        </button>
                      ) : (
                        <span className="text-[9px] bg-black/35 backdrop-blur-md px-2 py-0.5 rounded-full font-mono text-white/80 border border-white/10">
                          24h Live
                        </span>
                      )}
                    </div>

                    {/* Bottom Canvas Overlay: Badge + Caption */}
                    <div className="relative z-10 space-y-1.5 bg-black/45 backdrop-blur-md p-2.5 rounded-2xl border border-white/15">
                      {(isCustomTag ? customTag : offerTag) && (
                        <span className="inline-block px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 text-[9px] font-black rounded-lg uppercase tracking-wider shadow-xs">
                          {isCustomTag ? (customTag || 'Special Offer') : offerTag}
                        </span>
                      )}
                      <p className="text-[11px] font-medium text-white/95 leading-snug line-clamp-3">
                        {caption || 'Add your deal message or store update...'}
                      </p>
                    </div>

                    {/* Subtle Hover Overlay Hint */}
                    {previewUrl && (
                      <div className="absolute inset-0 z-5 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-3 py-1.5 rounded-full bg-white/25 backdrop-blur-md text-white text-[10px] font-bold border border-white/30">
                          Tap to Change Photo
                        </span>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <p className="text-[10px] text-slate-400 mt-2 font-medium">
                    {previewUrl ? 'Tap canvas to change photo' : 'Tap canvas to upload photo'}
                  </p>
                </div>

                {/* Right: Minimalist Classy Controls */}
                <div className="md:col-span-7 space-y-4">
                  
                  {/* Photo Quick Bar */}
                  {previewUrl ? (
                    <div className="flex items-center justify-between p-2.5 px-3 rounded-2xl bg-purple-50/70 border border-purple-200/70">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-[17px] text-emerald-600">check_circle</span>
                        <span className="text-xs font-bold text-slate-800 truncate">Photo selected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 cursor-pointer"
                        >
                          Change
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setPreviewUrl('');
                          }}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 px-3.5 rounded-2xl bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200/80 text-purple-700 font-bold text-xs flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                        Choose Photo or Banner
                      </span>
                      <span className="text-[10px] text-purple-500 font-normal">JPG, PNG up to 5MB</span>
                    </button>
                  )}

                  {/* Offer Badge Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Offer Highlight
                      </span>
                      <span className="text-[10px] text-slate-400">Optional</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_OFFER_TAGS.slice(0, 4).map((tag) => {
                        const isActive = !isCustomTag && offerTag === tag;
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setIsCustomTag(false);
                              setOfferTag(isActive ? '' : tag);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isActive
                                ? 'bg-amber-400 text-slate-950 shadow-xs scale-102 ring-1 ring-amber-500/60'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200/40'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setIsCustomTag(!isCustomTag)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isCustomTag
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200/40'
                        }`}
                      >
                        Custom +
                      </button>
                    </div>

                    {isCustomTag && (
                      <input
                        type="text"
                        placeholder="e.g. BOGO Deal, Clearance Sale..."
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        maxLength={30}
                        className="mt-1 w-full px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-600 focus:bg-white transition-all outline-hidden"
                      />
                    )}
                  </div>

                  {/* Caption & Offer Details */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Story Caption
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {caption.length}/250
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Write your deal details, discount message, or announcement..."
                      maxLength={250}
                      className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-600 focus:bg-white transition-all outline-hidden resize-none placeholder:text-slate-400"
                    />
                  </div>

                  {/* Canvas Mood Palette */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Theme Accent
                    </span>
                    <div className="flex items-center gap-2.5">
                      {PRESET_BG_GRADIENTS.map((bg, idx) => {
                        const isSelected = bgGradient === bg.val;
                        return (
                          <button
                            key={idx}
                            type="button"
                            title={bg.name}
                            onClick={() => setBgGradient(bg.val)}
                            style={{ background: bg.val }}
                            className={`w-7 h-7 rounded-full cursor-pointer transition-all ${
                              isSelected
                                ? 'scale-115 ring-2 ring-purple-600 ring-offset-2 shadow-xs'
                                : 'hover:scale-105 opacity-80 hover:opacity-100'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Publish Story CTA */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting || !selectedFile}
                      className="w-full h-12 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-xs shadow-md shadow-purple-600/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <span className="material-symbols-outlined text-[17px] animate-spin">progress_activity</span>
                          Publishing 24h Story...
                        </>
                      ) : !selectedFile ? (
                        <>
                          <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                          Upload Photo to Publish
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">bolt</span>
                          Publish Story (Live for 24h)
                        </>
                      )}
                    </button>
                    
                    <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center justify-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[13px] text-purple-500">schedule</span>
                      Visible to nearby customers for exactly 24 hours
                    </p>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            /* My Stories List (Spacious & Responsive Cards) */
            <div className="space-y-3.5">
              {loading ? (
                <div className="py-14 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[20px] animate-spin text-purple-600">progress_activity</span>
                  Loading stories...
                </div>
              ) : myStories.length === 0 ? (
                <div className="py-14 text-center text-slate-400 bg-slate-50/60 rounded-3xl border border-dashed border-slate-200 p-6">
                  <span className="material-symbols-outlined text-[48px] text-purple-300 mb-2">history_toggle_off</span>
                  <p className="font-bold text-sm text-slate-800">No active stories</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Add a story to showcase today's deals & updates to nearby shoppers on the Zeebac app!
                  </p>
                  <button
                    onClick={() => setActiveTab('add')}
                    className="mt-4 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-xs font-bold shadow-sm hover:opacity-95 transition-all cursor-pointer"
                  >
                    + Create Your First Story
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {myStories.map((story) => {
                    const cardViewers = getUniqueViewerList(story.viewersList || story.views || []);

                    return (
                      <div
                        key={story._id}
                        className="bg-white rounded-2xl border border-slate-200/90 hover:border-purple-200 shadow-xs hover:shadow-md transition-all p-3.5 sm:p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center relative group"
                      >
                        {/* Thumbnail (9:16 aspect ratio) */}
                        <div className="relative w-20 h-28 sm:w-24 sm:h-32 rounded-xl overflow-hidden flex-shrink-0 bg-slate-950 shadow-sm border border-slate-100">
                          <img
                            src={story.mediaUrl}
                            alt="story"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {story.offerTag && (
                            <div className="absolute top-1.5 left-1.5 right-1.5">
                              <span className="block text-[8px] sm:text-[9px] font-black bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 rounded-md px-1 py-0.5 text-center truncate shadow-xs uppercase tracking-wider">
                                {story.offerTag}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[8px] font-mono">
                            24h
                          </div>
                        </div>

                        {/* Details & Viewers */}
                        <div className="flex-1 min-w-0 w-full space-y-2.5">
                          {/* Caption & Expiration */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-900 line-clamp-1">
                                {story.caption || 'Store Story & Offers'}
                              </p>
                              <span className="text-[11px] text-slate-400 font-medium">
                                Active • Visible to nearby shoppers
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-full flex-shrink-0">
                              <span className="material-symbols-outlined text-[13px]">timer</span>
                              {formatHoursRemaining(story.expiresAt)}
                            </span>
                          </div>

                          {/* Viewers Engagement Banner */}
                          <div
                            onClick={() => openStoryViewers(story)}
                            className="w-full flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-purple-50/80 via-pink-50/40 to-slate-50 border border-purple-100 hover:border-purple-300 hover:shadow-xs transition-all cursor-pointer group/view"
                            title="Click to see all customers who viewed this story"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs group-hover/view:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                              </div>
                              <div className="min-w-0 text-left">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800">
                                    {cardViewers.length} customer view{cardViewers.length === 1 ? '' : 's'}
                                  </span>
                                  <span className="text-[9px] text-purple-700 font-black bg-purple-100/80 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                    Who seen
                                  </span>
                                </div>
                               
                              </div>
                            </div>

                            <div className="flex items-center gap-1 text-[11px] font-bold text-purple-700 group-hover/view:translate-x-0.5 transition-transform flex-shrink-0 ml-2">
                              <span className="hidden sm:inline">View names</span>
                              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </div>
                          </div>

                          {/* Bottom Actions */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                              <span className="material-symbols-outlined text-[13px] text-purple-500">near_me</span>
                              Auto-expires in 24 hours
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteStory(story._id)}
                              className="text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
