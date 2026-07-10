import { useState, useEffect } from 'react';
import { UserAPI, API_BASE_URL } from '../../../../services/api';

export default function ShopTab({ vendor }) {
  const [promotions, setPromotions] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchShopData = async () => {
      if (!vendor?._id) return;
      try {
        const [prodRes, promoRes] = await Promise.all([
          UserAPI.getVendorProducts(vendor._id),
          UserAPI.getVendorPromotions(vendor._id)
        ]);
        if (prodRes.success) setProducts(prodRes.data);
        if (promoRes.success) setPromotions(promoRes.data);
      } catch (err) {
        console.error('Failed to load shop data', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchShopData();
  }, [vendor?._id]);

  return (
    <div className="space-y-lg animate-reveal">
      
      {/* Offers Banners */}
      {promotions.length > 0 && (
        <div className="space-y-3">
          {promotions.map((promo, index) => {
            const isPercent = promo.type === 'percent';
            // Alternate styles for visual interest based on index
            const themeClass = index % 2 === 0 
              ? { bg: 'bg-primary', text: 'text-primary' } 
              : { bg: 'bg-secondary', text: 'text-secondary' };
              
            return (
              <div key={promo._id} className={`p-4 ${themeClass.bg}/5 border border-${themeClass.text.replace('text-', '')}/20 rounded-2xl flex items-center gap-md relative overflow-hidden`}>
                <div className={`absolute top-0 right-0 w-24 h-24 ${themeClass.bg}/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none`}></div>
                <div className={`w-10 h-10 rounded-full ${themeClass.bg}/10 flex items-center justify-center ${themeClass.text} flex-shrink-0`}>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {isPercent ? 'percent' : 'redeem'}
                  </span>
                </div>
                <div className="text-left space-y-0.5 relative z-10">
                  <p className={`font-title-md font-extrabold ${themeClass.text} text-body-sm`}>{promo.title}</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">{promo.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                  {product.branding?.isBranded && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="bg-[#420093]/10 text-[#420093] px-2 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm border border-[#420093]/10 w-max">
                        {product.branding.brandLogo ? (
                          <img src={product.branding.brandLogo.startsWith('http') || product.branding.brandLogo.startsWith('data:') ? product.branding.brandLogo : `${API_BASE_URL}${product.branding.brandLogo}`} alt="logo" className="w-5 h-5 rounded-sm object-contain bg-white border border-[#420093]/20 p-[1px]" />
                        ) : (
                          <span className="material-symbols-outlined text-[12px]">verified</span>
                        )}
                        <span className="truncate max-w-[90px]">{product.branding?.brandName || 'Verified Brand'}</span>
                      </span>
                    </div>
                  )}
                  <p className="font-caption text-[11px] uppercase text-on-surface-variant line-clamp-1">{product.category || 'General'}</p>
                  <p className="font-title-md font-bold text-on-surface text-body-md line-clamp-2 leading-tight mt-1">{product.name}</p>
                  <p className="font-bold text-primary mt-1.5">₹{product.price}</p>
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
