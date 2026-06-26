import { useNavigate } from 'react-router-dom';

export default function OverviewTab({ vendor }) {
  const navigate = useNavigate();

  const highlights = [
    { id: 1, name: "Signature Dress", price: "₹2,499", img: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=300&q=80" },
    { id: 2, name: "Leather Tote", price: "₹3,999", img: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=300&q=80" },
    { id: 3, name: "Silk Scarf", price: "₹999", img: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=300&q=80" },
  ];

  return (
    <div className="space-y-lg animate-reveal">
      <div className="space-y-xs">
        <h3 className="font-display text-title-md font-extrabold text-on-surface">About</h3>
        <p className="text-body-sm text-on-surface-variant leading-relaxed">
          Experience high-end design form factor and exclusive curation. Enjoy modern checkout convenience, premium customer support, and the highest rewards rates at {vendor.name} through Zeebac.
        </p>
      </div>
      
      <div className="space-y-xs">
        <h3 className="font-display text-title-md font-extrabold text-on-surface">Store Information</h3>
        <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-outline">location_on</span>
          <span>{vendor.address || "42nd Luxury Blvd, Metro City"}</span>
        </div>
        <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-outline">schedule</span>
          <span>Open Daily: 09:00 AM - 10:00 PM</span>
        </div>
      </div>

      {/* Highlights Carousel */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-display text-title-md font-extrabold text-on-surface">Store Highlights</h3>
        </div>
        <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2 -mx-container-margin px-container-margin">
          {highlights.map(item => (
            <div key={item.id} className="min-w-[140px] bg-white rounded-2xl overflow-hidden border border-outline-variant/10 shadow-sm flex-shrink-0">
              <img src={item.img} alt={item.name} className="w-full h-[140px] object-cover" />
              <div className="p-3">
                <p className="text-[13px] font-bold text-on-surface truncate">{item.name}</p>
                <p className="text-[12px] text-primary font-black mt-1">{item.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={() => navigate('/chat', { state: { selectedChat: vendor.id, vendorData: vendor } })} 
        className="w-full h-[52px] bg-primary/10 text-primary font-title-md font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-primary/20 transition-colors active:scale-[0.98]"
      >
        <span className="material-symbols-outlined text-[20px]">chat</span>
        Message Shop
      </button>
    </div>
  );
}
