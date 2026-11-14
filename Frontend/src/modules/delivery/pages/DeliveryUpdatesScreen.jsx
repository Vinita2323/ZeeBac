import { useState } from 'react';
import DeliveryTopBar from '../components/DeliveryTopBar';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';

export default function DeliveryUpdatesScreen() {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeStory, setActiveStory] = useState(null);

  const stories = [
    {
      id: 'story_fest',
      title: 'MAHA FESTIVAL MELA',
      color: 'from-amber-500 to-red-600',
      badge: 'Festival',
      img: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=400&auto=format&fit=crop&q=80',
      description: 'Diwali & Festival Bonus: Earn upto ₹500 extra per 10 deliveries this weekend!',
    },
    {
      id: 'story_safety',
      title: 'ROAD SAFETY',
      color: 'from-blue-600 to-indigo-700',
      badge: 'Safety',
      img: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&auto=format&fit=crop&q=80',
      description: 'Always wear a helmet and check vehicle lights. Free emergency insurance active on all trips.',
    },
    {
      id: 'story_tips',
      title: 'TOP RATINGS',
      color: 'from-emerald-600 to-teal-700',
      badge: 'Tips',
      img: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=400&auto=format&fit=crop&q=80',
      description: 'Polite greeting at customer doorsteps leads to 3x higher tips in Zeebac Partner app!',
    },
  ];

  const videos = [
    {
      id: 'vid_1',
      title: 'Start Your Delivery Journey',
      duration: '2:33',
      views: '951.9K Views',
      likes: '114.9K Likes',
      thumbnail: 'https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?w=600&auto=format&fit=crop&q=80',
      desc: 'Complete step-by-step walkthrough for order pickup, OTP verification, and navigation.',
    },
    {
      id: 'vid_2',
      title: 'Road Safety & Emergency Protocol',
      duration: '3:15',
      views: '1.89M Views',
      likes: '240K Likes',
      thumbnail: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop&q=80',
      desc: 'How to use the SOS siren and request immediate roadside assistance if vehicle breaks down.',
    },
    {
      id: 'vid_3',
      title: 'How to Maximize Daily Earnings with Gigs',
      duration: '4:10',
      views: '540K Views',
      likes: '85K Likes',
      thumbnail: 'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=600&auto=format&fit=crop&q=80',
      desc: 'Pick high surge peak hours (evening slots) to earn upto ₹1,200+ per day.',
    },
  ];

  const notifications = [
    {
      id: 1,
      title: '₹150 Bonus Added to Pocket',
      desc: 'Congratulations! You completed 5 deliveries in the evening peak slot.',
      time: '15 mins ago',
      type: 'earning',
    },
    {
      id: 2,
      title: 'Assigned Store Hub Updated',
      desc: 'Your preferred pickup store has been updated to Lucknow Vibhuti Khand Hub.',
      time: '2 hours ago',
      type: 'hub',
    },
    {
      id: 3,
      title: 'Rain Alert in your delivery zone',
      desc: 'Rain surge active: +₹15 extra per delivery order. Drive safely!',
      time: '5 hours ago',
      type: 'weather',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      {/* Top Header */}
      <DeliveryTopBar />

      <main className="max-w-[480px] mx-auto p-4 space-y-4">
        {/* ─── Stories Bar (From Image 5) ─── */}
        <div className="flex items-center gap-3 overflow-x-auto scroll-hide py-1">
          {/* Add story / your story */}
          <div className="flex flex-col items-center shrink-0 cursor-pointer group">
            <div className="relative w-16 h-16 rounded-full bg-slate-200 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-500 group-hover:border-purple-600 transition-all">
              <span className="material-symbols-outlined text-[24px]">add</span>
            </div>
            <span className="text-[11px] font-bold text-slate-600 mt-1">Your story</span>
          </div>

          {/* Stories List */}
          {stories.map((story) => (
            <div
              key={story.id}
              onClick={() => setActiveStory(story)}
              className="flex flex-col items-center shrink-0 cursor-pointer group"
            >
              <div className="p-0.5 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-400 group-hover:scale-105 transition-all">
                <div className="w-15 h-15 rounded-full overflow-hidden bg-slate-900 border-2 border-white">
                  <img
                    src={story.img}
                    alt={story.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <span className="text-[10.5px] font-bold text-slate-800 mt-1 max-w-[70px] truncate text-center">
                {story.title}
              </span>
            </div>
          ))}
        </div>

        {/* ─── Notification Banner Card (From Image 5) ─── */}
        <div className="bg-[#eef5ff] rounded-2xl p-3.5 border border-blue-100 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">notifications</span>
            </div>
            <div>
              <p className="text-xs font-black text-slate-900">Check all your notifications</p>
              <p className="text-[11px] text-slate-500 font-medium">
                Today, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
          <button
            onClick={() => toast.success('All notifications up to date')}
            className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            View
          </button>
        </div>

        {/* ─── Videos for You Section (From Image 5) ─── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="font-display font-black text-base text-slate-900">Videos for you</h3>
            <button
              onClick={() => toast.success('More videos coming soon')}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer"
            >
              <span>View all</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto scroll-hide pb-2">
            {videos.map((vid) => (
              <div
                key={vid.id}
                onClick={() => setSelectedVideo(vid)}
                className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-2xs min-w-[240px] max-w-[240px] shrink-0 cursor-pointer group hover:border-purple-300 transition-all"
              >
                {/* Thumbnail with overlay */}
                <div className="relative h-32 bg-slate-900 overflow-hidden">
                  <img
                    src={vid.thumbnail}
                    alt={vid.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300 opacity-90"
                  />
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-white/90 shadow-md text-slate-900 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px] fill-current">play_arrow</span>
                    </div>
                  </div>
                  {/* Duration Pill */}
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono font-bold">
                    {vid.duration}
                  </div>
                </div>

                {/* Video Info */}
                <div className="p-3">
                  <h4 className="font-display font-black text-xs text-slate-900 line-clamp-1 group-hover:text-purple-700 transition-colors">
                    {vid.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    {vid.views} • {vid.likes}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Recent Notifications Feed ─── */}
        <div>
          <h3 className="font-display font-black text-sm text-slate-900 mb-2.5">
            Partner Updates & Announcements
          </h3>
          <div className="space-y-2">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px]">campaign</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-xs text-slate-900">{notif.title}</h5>
                    <span className="text-[10px] text-slate-400 font-medium">{notif.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{notif.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ─── VIDEO PLAYER MODAL ─── */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full overflow-hidden text-white shadow-2xl border border-slate-700">
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <img
                src={selectedVideo.thumbnail}
                alt={selectedVideo.title}
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-xl animate-pulse">
                  <span className="material-symbols-outlined text-[36px]">play_arrow</span>
                </div>
                <p className="text-xs font-bold text-white/90 mt-2">Training Video Simulation</p>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4 space-y-2">
              <h3 className="font-display font-black text-sm text-white">
                {selectedVideo.title}
              </h3>
              <p className="text-xs text-slate-300 font-medium">{selectedVideo.desc}</p>
              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800">
                <span>{selectedVideo.views}</span>
                <span>{selectedVideo.likes}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── STORY MODAL ─── */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-gradient-to-b from-slate-900 to-black rounded-3xl max-w-sm w-full p-5 text-white shadow-2xl border border-white/10 relative overflow-hidden">
            <button
              onClick={() => setActiveStory(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center z-10 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black uppercase">
              {activeStory.badge}
            </span>

            <h3 className="font-display font-black text-xl text-white mt-2">
              {activeStory.title}
            </h3>

            <div className="my-4 h-52 rounded-2xl overflow-hidden border border-white/10">
              <img
                src={activeStory.img}
                alt={activeStory.title}
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              {activeStory.description}
            </p>

            <button
              onClick={() => setActiveStory(null)}
              className="w-full mt-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}

