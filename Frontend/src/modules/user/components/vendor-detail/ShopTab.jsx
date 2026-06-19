export default function ShopTab() {
  const products = [
    { id: 1, name: "Signature Dress", price: "₹2,499", category: "Bestsellers", img: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=300&q=80" },
    { id: 2, name: "Leather Tote", price: "₹3,999", category: "Bestsellers", img: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=300&q=80" },
    { id: 3, name: "Classic Blazer", price: "₹4,500", category: "New Arrivals", img: "https://images.unsplash.com/photo-1591369822096-bbcdd8dc4500?auto=format&fit=crop&w=300&q=80" },
    { id: 4, name: "Silk Scarf", price: "₹999", category: "Accessories", img: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=300&q=80" },
  ];

  return (
    <div className="space-y-lg animate-reveal">
      
      {/* Offers Banners */}
      <div className="space-y-3">
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none"></div>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>percent</span>
          </div>
          <div className="text-left space-y-0.5 relative z-10">
            <p className="font-title-md font-extrabold text-primary text-body-sm">Welcome Reward Boost</p>
            <p className="font-caption text-[11px] text-on-surface-variant">Extra 5% cashback on your first payment this week.</p>
          </div>
        </div>

        <div className="p-4 bg-secondary/5 border border-secondary/20 rounded-2xl flex items-center gap-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none"></div>
          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>redeem</span>
          </div>
          <div className="text-left space-y-0.5 relative z-10">
            <p className="font-title-md font-extrabold text-secondary text-body-sm">Spend Bonus</p>
            <p className="font-caption text-[11px] text-on-surface-variant">Get flat ₹10 reward when spending over ₹100.</p>
          </div>
        </div>
      </div>

      {/* Product List */}
      <div>
        <h3 className="font-display text-title-md font-extrabold text-on-surface mb-4">All Products</h3>
        <div className="space-y-4">
          {products.map(product => (
            <div key={product.id} className="flex gap-4 p-3 bg-white rounded-2xl border border-outline-variant/10 shadow-sm relative">
              <img src={product.img} alt={product.name} className="w-24 h-24 object-cover rounded-xl bg-surface-container" />
              <div className="flex-1 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{product.category}</span>
                <p className="text-[15px] font-bold text-on-surface leading-tight mt-0.5">{product.name}</p>
                <p className="text-[14px] text-primary font-black mt-2">{product.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
