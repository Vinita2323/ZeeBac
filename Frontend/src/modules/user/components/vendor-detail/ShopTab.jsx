import { useState, useEffect } from 'react';
import { UserAPI, API_BASE_URL } from '../../../../services/api';

export default function ShopTab({ vendor }) {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!vendor?._id) return;
      try {
        const res = await UserAPI.getVendorProducts(vendor._id);
        if (res.success) {
          setProducts(res.data);
        }
      } catch (err) {
        console.error('Failed to load products', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, [vendor?._id]);

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
        <h3 className="font-display font-black text-title-md text-on-surface">Store Items</h3>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 gap-md">
            {products.map((product) => (
              <div key={product._id} className="group">
                <div className="aspect-[4/5] rounded-2xl overflow-hidden mb-2 relative">
                  {product.image ? (
                    <img src={product.image.startsWith('http') ? product.image : `${API_BASE_URL}${product.image}`} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full bg-surface-variant flex items-center justify-center">
                      <span className="material-symbols-outlined text-outline text-[40px]">inventory_2</span>
                    </div>
                  )}
                  {product.stock <= 5 && product.stock > 0 && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Only {product.stock} left
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-caption text-[11px] uppercase text-on-surface-variant">{product.category || 'General'}</p>
                  <p className="font-title-md font-bold text-on-surface text-body-md truncate">{product.name}</p>
                  <p className="font-bold text-primary">₹{product.price}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center opacity-60">
            <span className="material-symbols-outlined text-[48px]">inventory_2</span>
            <p className="font-bold mt-2">No products added yet.</p>
          </div>
        )}
      </div>

    </div>
  );
}
