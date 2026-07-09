import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';

export default function RatingsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Reply State
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const statsFromUser = currentUser.stats || { avgRating: 0, totalReviews: 0 };

  const fetchReviews = async () => {
    try {
      const res = await VendorAPI.getMyReviews();
      if (res.success) {
        setReviews(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch reviews", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleReplySubmit = async (reviewId) => {
    if (!replyText.trim()) return;
    setIsSubmittingReply(true);
    try {
      const res = await VendorAPI.replyToReview(reviewId, replyText);
      if (res.success) {
        setReplyingTo(null);
        setReplyText('');
        fetchReviews(); // refresh
      }
    } catch (err) {
      alert("Failed to submit reply");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const filteredReviews = filter === 'All' 
    ? reviews 
    : reviews.filter(r => filter === 'Verified' ? r.isVerified : r.rating === parseInt(filter.charAt(0)));

  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1)
    : 0;

  const getRatingCount = (stars) => reviews.filter(r => r.rating === stars).length;
  const getRatingPercent = (stars) => totalReviews > 0 ? (getRatingCount(stars) / totalReviews) * 100 : 0;

  return (
    <div className="animate-reveal text-left pb-[100px]">
      
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
            <div className="text-center w-24">
              <h2 className="text-[44px] font-black text-on-surface leading-none tracking-tight">{avgRating}</h2>
              <div className="flex items-center justify-center text-orange-500 mt-2">
                {[1,2,3,4,5].map(i => (
                  <span key={i} className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: i <= Math.round(avgRating) ? "'FILL' 1" : "'FILL' 0"}}>star</span>
                ))}
              </div>
              <p className="text-on-surface-variant text-[11px] font-medium mt-1">{totalReviews} reviews</p>
            </div>
            
            <div className="flex-1 space-y-2 border-l border-outline-variant/10 pl-5">
              {[5,4,3,2,1].map(stars => (
                <div key={stars} className="flex items-center gap-2 text-[11px] font-bold">
                  <div className="flex items-center gap-0.5 w-6 text-on-surface-variant">
                    {stars} <span className="material-symbols-outlined text-[11px] text-orange-500" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
                  </div>
                  <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${getRatingPercent(stars)}%` }} />
                  </div>
                  <span className="w-6 text-right text-on-surface-variant opacity-70 text-[10px]">{getRatingCount(stars)}</span>
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
              className={`px-4 py-2 rounded-xl font-bold text-[13px] border whitespace-nowrap transition-all active:scale-[0.97] cursor-pointer ${
                filter === f 
                  ? 'bg-primary text-white border-primary shadow-sm' 
                  : 'bg-white text-on-surface-variant border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:bg-surface-container-lowest'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Review Cards */}
        <div className="space-y-4">
          {isLoading ? (
             <p className="text-center py-8 text-on-surface-variant text-[13px] font-bold">Loading reviews...</p>
          ) : filteredReviews.map(review => (
            <div key={review._id} className="bg-white p-4 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-3 transition-transform">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[15px]">
                    {(review.customerName || 'U').charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-on-surface">{review.customerName || 'Unknown User'}</h4>
                    <p className="text-on-surface-variant text-[11px] mt-0.5">{new Date(review.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-0.5 text-orange-500 justify-end">
                    {[1,2,3,4,5].map(i => (
                      <span key={i} className="material-symbols-outlined text-[15px]" style={{fontVariationSettings: i <= review.rating ? "'FILL' 1" : "'FILL' 0"}}>
                        star
                      </span>
                    ))}
                  </div>
                  {review.isVerified && (
                    <div className="flex items-center justify-end gap-0.5 text-green-600 mt-1">
                      <span className="material-symbols-outlined text-[11px]">verified</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">Verified</span>
                    </div>
                  )}
                </div>
              </div>
              
              {review.text && (
                <p className="text-on-surface-variant text-[14px] leading-relaxed">
                  "{review.text}"
                </p>
              )}

              {/* Existing Reply */}
              {review.reply?.text ? (
                <div className="mt-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/10 ml-4 relative">
                  <div className="absolute -left-2 top-4 w-4 h-[1px] bg-outline-variant/20"></div>
                  <div className="absolute -left-2 -top-2 w-[1px] h-6 bg-outline-variant/20"></div>
                  <p className="text-[11px] font-bold text-primary mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">store</span> Your Response
                  </p>
                  <p className="text-[12px] text-on-surface-variant leading-relaxed">{review.reply.text}</p>
                </div>
              ) : replyingTo === review._id ? (
                /* Reply Input Box */
                <div className="pt-3 mt-3 border-t border-outline-variant/10">
                  <textarea 
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a response to this customer..."
                    className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl p-3 text-[13px] text-on-surface focus:outline-none focus:border-primary/50 resize-none h-20 mb-2"
                  ></textarea>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => { setReplyingTo(null); setReplyText(''); }}
                      className="px-4 h-8 rounded-lg text-on-surface-variant font-bold text-[12px] hover:bg-surface-container cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      disabled={isSubmittingReply || !replyText.trim()}
                      onClick={() => handleReplySubmit(review._id)}
                      className="px-4 h-8 rounded-lg bg-primary text-white font-bold text-[12px] disabled:opacity-50 hover:bg-primary/90 cursor-pointer"
                    >
                      {isSubmittingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Action Buttons */
                <div className="pt-3 border-t border-outline-variant/5 flex items-center gap-4">
                  <button 
                    onClick={() => setReplyingTo(review._id)}
                    className="text-primary text-[12px] font-bold flex items-center gap-1 active:scale-[0.97] transition-transform cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">reply</span>
                    Reply
                  </button>
                </div>
              )}
            </div>
          ))}

          {!isLoading && filteredReviews.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant bg-white rounded-2xl border border-outline-variant/10">
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
