import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';

export default function ReviewsTab({ vendorId, vendor }) {
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUser = useAuthStore(state => state.currentUser);
  
  const fetchReviews = async () => {
    try {
      const res = await UserAPI.getVendorReviews(vendorId);
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
  }, [vendorId]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (rating === 0) return alert("Please select a rating");
    
    setIsSubmitting(true);
    try {
      const res = await UserAPI.createReview(vendorId, { rating, text: reviewText });
      if (res.success) {
        setShowWriteModal(false);
        setRating(0);
        setReviewText('');
        fetchReviews(); // Refresh list
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!window.confirm("Are you sure you want to delete your review?")) return;
    
    try {
      const res = await UserAPI.deleteReview(vendorId);
      if (res.success) {
        setRating(0);
        setReviewText('');
        fetchReviews(); // Refresh list
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete review");
    }
  };

  // Calculate stats
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1)
    : 0;

  const getRatingCount = (stars) => reviews.filter(r => r.rating === stars).length;
  const getRatingPercent = (stars) => totalReviews > 0 ? (getRatingCount(stars) / totalReviews) * 100 : 0;

  const myReview = reviews.find(r => r.customerId === currentUser?._id);

  const openModal = () => {
    if (myReview) {
      setRating(myReview.rating);
      setReviewText(myReview.text || '');
    } else {
      setRating(0);
      setReviewText('');
    }
    setShowWriteModal(true);
  };

  return (
    <div className="space-y-lg animate-reveal pb-[100px]">
      
      {/* Header with Write/Edit Review Button */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[18px] font-black text-on-surface">Customer Reviews</h3>
        <div className="flex items-center gap-2">
          {myReview && (
            <button 
              onClick={handleDeleteReview}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-red-50 text-red-500 active:scale-95 transition-transform cursor-pointer"
              title="Delete Review"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          )}
          <button 
            onClick={openModal}
            className="px-4 py-2 bg-primary text-white rounded-full font-bold text-[12px] active:scale-95 transition-transform shadow-sm cursor-pointer"
          >
            {myReview ? 'Edit Review' : 'Write Review'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 p-4 bg-white rounded-3xl shadow-sm border border-outline-variant/10">
        <div className="flex flex-col items-center justify-center px-4">
          <span className="font-display text-[40px] font-black text-on-surface leading-none">{avgRating}</span>
          <div className="flex text-amber-400 mt-1">
            {[1,2,3,4,5].map(i => (
              <span key={i} className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: i <= Math.round(avgRating) ? "'FILL' 1" : "'FILL' 0"}}>star</span>
            ))}
          </div>
          <span className="text-[12px] text-on-surface-variant mt-1">{totalReviews} reviews</span>
        </div>
        <div className="flex-1 space-y-1.5 border-l border-outline-variant/10 pl-4">
          {[5,4,3,2,1].map(stars => (
            <div key={stars} className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-on-surface-variant w-2">{stars}</span>
              <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-full" 
                  style={{ width: `${getRatingPercent(stars)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <p className="text-center py-8 text-on-surface-variant text-[13px] font-bold">Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-outline-variant/10 shadow-sm">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant opacity-30 mb-2">forum</span>
            <p className="font-bold text-[15px] text-on-surface">No reviews yet</p>
            <p className="text-[12px] text-on-surface-variant mt-1">Be the first to review this store!</p>
          </div>
        ) : reviews.map(review => (
          <div key={review._id} className="p-4 bg-white rounded-2xl shadow-sm border border-outline-variant/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[16px]">
                  {(review.customerName || 'U').charAt(0)}
                </div>
                <div>
                  <p className="text-[14px] font-bold text-on-surface flex items-center gap-1">
                    {review.customerName || 'Unknown User'}
                    {review.isVerified && <span className="material-symbols-outlined text-[14px] text-green-500" title="Verified Buyer">verified</span>}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">{new Date(review.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg border border-amber-100">
                <span className="text-[12px] font-bold text-amber-700">{review.rating}</span>
                <span className="material-symbols-outlined text-[14px] text-amber-500" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
              </div>
            </div>
            {review.text && <p className="text-[13px] text-on-surface-variant leading-relaxed">{review.text}</p>}
            
            {/* Vendor Reply */}
            {review.reply?.text && (
              <div className="mt-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/10 ml-4 relative">
                <div className="absolute -left-2 top-4 w-4 h-[1px] bg-outline-variant/20"></div>
                <div className="absolute -left-2 -top-2 w-[1px] h-6 bg-outline-variant/20"></div>
                <p className="text-[11px] font-bold text-primary mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">store</span> Response from Vendor
                </p>
                <p className="text-[12px] text-on-surface-variant leading-relaxed">{review.reply.text}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Write Review Modal */}
      {showWriteModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm m-0" onClick={() => setShowWriteModal(false)}>
          <div className="bg-white w-[90vw] max-w-[360px] min-w-[300px] rounded-3xl overflow-hidden shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-[20px] font-black text-on-surface text-center mb-1">Rate your experience</h3>
            <p className="text-center text-[12px] text-on-surface-variant mb-6">at {vendor.storeName}</p>

            <form onSubmit={handleSubmitReview} className="space-y-5">
              <div className="flex justify-center gap-2">
                {[1,2,3,4,5].map(star => (
                  <button 
                    key={star} 
                    type="button"
                    onClick={() => setRating(star)}
                    className={`material-symbols-outlined text-[36px] transition-transform active:scale-75 ${rating >= star ? 'text-amber-400' : 'text-outline-variant/30'}`}
                    style={{fontVariationSettings: rating >= star ? "'FILL' 1" : "'FILL' 0"}}
                  >
                    star
                  </button>
                ))}
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-on-surface-variant px-1">Write a Review (Optional)</label>
                <textarea 
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share details of your experience at this store..."
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 text-[14px] text-on-surface focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all resize-none h-24"
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowWriteModal(false)}
                  className="flex-1 h-12 rounded-xl bg-surface-container text-on-surface font-bold text-[14px] active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || rating === 0}
                  className="flex-1 h-12 rounded-xl bg-primary text-white font-bold text-[14px] active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100 shadow-md"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
