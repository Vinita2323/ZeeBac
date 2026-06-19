export default function ReviewsTab() {
  const reviews = [
    { id: 1, name: "Sneha P.", rating: 5, date: "2 days ago", text: "Amazing collection and super friendly staff! Will definitely visit again.", img: "https://i.pravatar.cc/150?u=1" },
    { id: 2, name: "Rahul K.", rating: 4, date: "1 week ago", text: "Great quality products but slightly on the expensive side. The cashback made it worth it though.", img: "https://i.pravatar.cc/150?u=2" },
    { id: 3, name: "Priya S.", rating: 5, date: "2 weeks ago", text: "Perfect place for weekend shopping. Love the vibe here!", img: "https://i.pravatar.cc/150?u=3" },
  ];

  return (
    <div className="space-y-lg animate-reveal">
      <div className="flex items-center gap-4 p-4 bg-white rounded-3xl shadow-sm border border-outline-variant/10">
        <div className="flex flex-col items-center justify-center px-4">
          <span className="font-display text-[40px] font-black text-on-surface leading-none">4.9</span>
          <div className="flex text-amber-400 mt-1">
            {[1,2,3,4,5].map(i => <span key={i} className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>star</span>)}
          </div>
          <span className="text-[12px] text-on-surface-variant mt-1">1.2k reviews</span>
        </div>
        <div className="flex-1 space-y-1.5 border-l border-outline-variant/10 pl-4">
          {[5,4,3,2,1].map(rating => (
            <div key={rating} className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-on-surface-variant w-2">{rating}</span>
              <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-full" 
                  style={{ width: rating === 5 ? '85%' : rating === 4 ? '10%' : '2%' }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {reviews.map(review => (
          <div key={review.id} className="p-4 bg-white rounded-2xl shadow-sm border border-outline-variant/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <img src={review.img} alt={review.name} className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <p className="text-[14px] font-bold text-on-surface">{review.name}</p>
                  <p className="text-[11px] text-on-surface-variant">{review.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg">
                <span className="text-[12px] font-bold text-amber-700">{review.rating}</span>
                <span className="material-symbols-outlined text-[14px] text-amber-500" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
              </div>
            </div>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">{review.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
