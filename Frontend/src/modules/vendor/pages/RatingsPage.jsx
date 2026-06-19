import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function RatingsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');

  const stats = [
    { stars: 5, percentage: 75, count: 96 },
    { stars: 4, percentage: 15, count: 19 },
    { stars: 3, percentage: 6, count: 8 },
    { stars: 2, percentage: 2, count: 3 },
    { stars: 1, percentage: 2, count: 2 },
  ];

  const reviews = [
    { id: 1, name: 'Rahul Sharma', rating: 5, date: 'Oct 22, 2023', verified: true, text: 'Great collection! Cashback processed instantly through Zeebac.', avatar: 'bg-blue-500/10 text-blue-600' },
    { id: 2, name: 'Sneha Patel', rating: 4, date: 'Oct 20, 2023', verified: true, text: 'Good store with nice ambiance. Overall a great experience.', avatar: 'bg-purple-500/10 text-purple-600' },
    { id: 3, name: 'Amit Kumar', rating: 5, date: 'Oct 18, 2023', verified: true, text: 'Excellent service. Checkout with the app was seamless!', avatar: 'bg-green-500/10 text-green-600' },
    { id: 4, name: 'Karan Mehra', rating: 3, date: 'Oct 15, 2023', verified: false, text: 'Decent collection but prices are on the higher side.', avatar: 'bg-orange-500/10 text-orange-600' },
  ];

  const filteredReviews = filter === 'All' 
    ? reviews 
    : reviews.filter(r => filter === 'Verified' ? r.verified : r.rating === parseInt(filter.charAt(0)));

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Ratings & Reviews</span>
      </header>

      <div className="space-y-6 pt-4">
        
        {/* Rating Summary Card */}
        <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-center gap-5">
            <div className="text-center">
              <h2 className="text-[44px] font-black text-on-surface leading-none tracking-tight">4.6</h2>
              <div className="flex items-center justify-center gap-0.5 text-orange-500 mt-2">
                {[1,2,3,4].map(i => <span key={i} className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>star</span>)}
                <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>star_half</span>
              </div>
              <p className="text-on-surface-variant text-[11px] font-medium mt-1">128 reviews</p>
            </div>
            
            <div className="flex-1 space-y-2">
              {stats.map(stat => (
                <div key={stat.stars} className="flex items-center gap-2 text-[11px] font-bold">
                  <div className="flex items-center gap-0.5 w-6 text-on-surface-variant">
                    {stat.stars} <span className="material-symbols-outlined text-[11px] text-orange-500" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
                  </div>
                  <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${stat.percentage}%` }} />
                  </div>
                  <span className="w-6 text-right text-on-surface-variant opacity-70 text-[10px]">{stat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {['All', '5 Stars', '4 Stars', '3 Stars', 'Verified'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl font-bold text-[13px] border whitespace-nowrap transition-all active:scale-[0.97] ${
                filter === f 
                  ? 'bg-primary text-white border-primary shadow-sm' 
                  : 'bg-white text-on-surface-variant border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Review Cards */}
        <div className="space-y-4">
          {filteredReviews.map(review => (
            <div key={review.id} className="bg-white p-4 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-3 active:scale-[0.98] transition-transform">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[15px] ${review.avatar}`}>
                    {review.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-on-surface">{review.name}</h4>
                    <p className="text-on-surface-variant text-[11px] mt-0.5">{review.date}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-0.5 text-orange-500">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={`material-symbols-outlined text-[15px] ${i < review.rating ? '' : 'text-outline-variant/40'}`} style={{fontVariationSettings: i < review.rating ? "'FILL' 1" : "'FILL' 0"}}>
                        star
                      </span>
                    ))}
                  </div>
                  {review.verified && (
                    <div className="flex items-center justify-end gap-0.5 text-green-600 mt-1">
                      <span className="material-symbols-outlined text-[11px]">verified</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">Verified</span>
                    </div>
                  )}
                </div>
              </div>
              
              <p className="text-on-surface-variant text-[14px] leading-relaxed">
                "{review.text}"
              </p>

              <div className="pt-3 border-t border-outline-variant/5 flex items-center gap-4">
                <button 
                  onClick={() => alert('Replying...')}
                  className="text-primary text-[12px] font-bold flex items-center gap-1 active:scale-[0.97] transition-transform"
                >
                  <span className="material-symbols-outlined text-[16px]">reply</span>
                  Reply
                </button>
                <button 
                  onClick={() => alert('Reported')}
                  className="text-on-surface-variant text-[12px] font-bold flex items-center gap-1 active:scale-[0.97] transition-transform hover:text-red-500"
                >
                  <span className="material-symbols-outlined text-[16px]">flag</span>
                  Report
                </button>
              </div>
            </div>
          ))}

          {filteredReviews.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">forum</span>
              <p className="font-bold text-[16px]">No reviews found</p>
              <p className="text-[14px]">Try changing your filters.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
