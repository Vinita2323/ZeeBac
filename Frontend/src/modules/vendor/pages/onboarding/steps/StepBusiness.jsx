import { useState, useEffect, useRef } from 'react';
import { AuthAPI } from '../../../../../services/api';
import FloatingInput from '../components/FloatingInput';
import MapPicker from '../components/MapPicker';

function CategorySelect({ value, onChange, error }) {
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    AuthAPI.getVendorCategories().then(res => {
      if (res.success) setCategories(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = categories.filter(c => c.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={wrapRef}>
      <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-1">
        Business Category<span className="text-red-500">*</span>
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full h-[52px] px-4 bg-white border-2 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer ${error ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'}`}
      >
        <span className={`text-[15px] font-bold ${value ? 'text-gray-900' : 'text-gray-400'}`}>{value || 'Select a category'}</span>
        <span className="material-symbols-outlined text-gray-400">expand_more</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-reveal">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search category..."
              className="w-full h-10 px-3 bg-gray-50 rounded-lg outline-none text-[14px]"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <p className="px-4 py-3 text-[13px] text-gray-400">No matches — pick "Other"</p>}
            {filtered.map(c => (
              <button
                key={c} type="button"
                onClick={() => { onChange(c); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-4 py-2.5 text-[14px] font-semibold hover:bg-[#7c3aed]/5 transition-colors cursor-pointer ${value === c ? 'text-[#7c3aed] bg-[#7c3aed]/5' : 'text-gray-700'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className="text-[11.5px] font-bold text-red-500 flex items-center gap-1 mt-1 ml-1">
          <span className="material-symbols-outlined text-[13px]">error</span>{error}
        </p>
      )}
    </div>
  );
}

export default function StepBusiness({ data, update, errors }) {
  const isVendorTypeSelected = (t) => data.shopType === t;

  return (
    <div className="w-full glass-panel rounded-3xl p-6 sm:p-8 space-y-5 animate-reveal">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">storefront</span>
        </div>
        <h1 className="text-[24px] font-black tracking-tight text-gray-900 leading-tight mb-1">Tell us about your business</h1>
        <p className="text-[13.5px] text-gray-500">This helps customers find and trust your store.</p>
      </div>

      {/* Business Type */}
      <div>
        <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Business Type<span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => update('shopType', 'Independent Store')}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer ${
              isVendorTypeSelected('Independent Store') ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'
            }`}
          >
            <span className="text-3xl mb-1">🏪</span>
            <p className={`text-[13px] font-black ${isVendorTypeSelected('Independent Store') ? 'text-green-700' : 'text-gray-700'}`}>Independent Store</p>
          </button>
          <button
            type="button"
            onClick={() => update('shopType', 'Chain & Brand')}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer ${
              isVendorTypeSelected('Chain & Brand') ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'
            }`}
          >
            <span className="text-3xl mb-1">🏢</span>
            <p className={`text-[13px] font-black ${isVendorTypeSelected('Chain & Brand') ? 'text-blue-700' : 'text-gray-700'}`}>Chain & Brand</p>
          </button>
        </div>
        {errors.shopType && <p className="text-[11.5px] font-bold text-red-500 mt-1.5 ml-1">{errors.shopType}</p>}
      </div>

      <FloatingInput label="Business / Shop Name" icon="storefront" required value={data.storeName} onChange={(e) => update('storeName', e.target.value)} error={errors.storeName} />
      <CategorySelect value={data.category} onChange={(v) => update('category', v)} error={errors.category} />
      <FloatingInput label="Business Sub-category (Optional)" icon="category" value={data.subCategory} onChange={(e) => update('subCategory', e.target.value)} />
      <FloatingInput label="Business Description" icon="notes" multiline value={data.description} onChange={(e) => update('description', e.target.value)} />

      {data.shopType === 'Chain & Brand' && (
        <FloatingInput label="GST Number" icon="receipt_long" required value={data.gstNumber} onChange={(e) => update('gstNumber', e.target.value.toUpperCase())} error={errors.gstNumber} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FloatingInput label="Business Contact Number (Optional)" icon="call" type="tel" value={data.businessContactNumber} onChange={(e) => update('businessContactNumber', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} />
        <FloatingInput label="Business Email (Optional)" icon="mail" type="email" value={data.businessEmail} onChange={(e) => update('businessEmail', e.target.value)} />
      </div>

      <div className="pt-2 border-t border-gray-100 space-y-3">
        <FloatingInput label="Full Address" icon="home" required multiline value={data.address.fullAddress} onChange={(e) => update('address', { ...data.address, fullAddress: e.target.value })} error={errors['address.fullAddress']} />
        <FloatingInput label="Landmark (Optional)" icon="pin_drop" value={data.address.landmark} onChange={(e) => update('address', { ...data.address, landmark: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <FloatingInput label="City" required value={data.address.city} onChange={(e) => update('address', { ...data.address, city: e.target.value })} error={errors['address.city']} />
          <FloatingInput label="State" required value={data.address.state} onChange={(e) => update('address', { ...data.address, state: e.target.value })} error={errors['address.state']} />
        </div>
        <FloatingInput label="Pincode" icon="local_post_office" required type="tel" value={data.address.pincode} onChange={(e) => update('address', { ...data.address, pincode: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) })} error={errors['address.pincode']} />
      </div>

      <MapPicker
        lat={data.lat} lng={data.lng}
        onChange={(lat, lng) => { update('lat', lat); update('lng', lng); }}
        error={errors.location}
      />
    </div>
  );
}
