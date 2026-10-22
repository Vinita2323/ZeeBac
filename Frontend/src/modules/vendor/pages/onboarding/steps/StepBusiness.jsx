import { useState, useEffect, useRef } from 'react';
import { AuthAPI } from '../../../../../services/api';
import useLanguageStore from '../../../../../store/useLanguageStore';
import FloatingInput from '../components/FloatingInput';
import MapPicker from '../components/MapPicker';

function CategorySelect({ value, onChange, error, label = 'Business Category' }) {
  const { t } = useLanguageStore();
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
        {t(label)}<span className="text-red-500">*</span>
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full h-[52px] px-4 bg-white border-2 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer ${error ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'}`}
      >
        <span className={`text-[15px] font-bold ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value || t('Select a category')}
        </span>
        <span className="material-symbols-outlined text-gray-400">expand_more</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-reveal">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search category...')}
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

export default function StepBusiness({ data, update, errors, minRates = {} }) {
  const { t } = useLanguageStore();

  const isRetailer = data.businessType === 'Retailer' || (!data.businessType && !!data.shopType);
  const isManufacturer = data.businessType === 'Manufacturer';
  const isWholesaler = data.businessType === 'Wholesaler';
  const isChain = data.retailerSubtype === 'chain_brand' || data.shopType === 'Chain & Brand';

  const currentMin = isChain ? (minRates['Chain & Brand'] ?? 5) : (minRates['Independent Store'] ?? 2);

  const handleSelectBusinessType = (type) => {
    update('businessType', type);
    if (type === 'Retailer') {
      const sub = data.retailerSubtype || 'independent_store';
      update('retailerSubtype', sub);
      const st = sub === 'chain_brand' ? 'Chain & Brand' : 'Independent Store';
      update('shopType', st);
      const min = minRates[st] ?? (st === 'Chain & Brand' ? 5 : 2);
      if (data.cashbackRate === undefined || data.cashbackRate === null || Number(data.cashbackRate) < min) {
        update('cashbackRate', min);
      }
    } else {
      update('retailerSubtype', null);
      update('shopType', 'Independent Store');
      const min = minRates['Independent Store'] ?? 2;
      if (data.cashbackRate === undefined || data.cashbackRate === null || Number(data.cashbackRate) < min) {
        update('cashbackRate', min);
      }
    }
  };

  const handleSelectShopType = (type) => {
    const sub = type === 'Chain & Brand' ? 'chain_brand' : 'independent_store';
    update('shopType', type);
    update('retailerSubtype', sub);
    const newMin = minRates[type] ?? (type === 'Chain & Brand' ? 5 : 2);
    if (data.cashbackRate === undefined || data.cashbackRate === null || Number(data.cashbackRate) < newMin) {
      update('cashbackRate', newMin);
    }
  };

  // Dynamic names and descriptions based on chosen trade type
  const getContextInfo = () => {
    if (isManufacturer) {
      return {
        icon: 'precision_manufacturing',
        title: 'Manufacturer Details',
        desc: 'Provide your manufacturing factory or production enterprise details.',
        nameLabel: 'Manufacturing Firm / Factory Name',
        categoryLabel: 'Manufacturing Goods Category',
      };
    }
    if (isWholesaler) {
      return {
        icon: 'inventory_2',
        title: 'Wholesaler Details',
        desc: 'Provide your wholesale distribution business details.',
        nameLabel: 'Wholesale Business / Firm Name',
        categoryLabel: 'Wholesale Trade Category',
      };
    }
    if (isChain) {
      return {
        icon: 'corporate_fare',
        title: 'Chain Brand Retail Details',
        desc: 'Provide your brand and outlet business details.',
        nameLabel: 'Brand / Chain Store Name',
        categoryLabel: 'Retail Business Category',
      };
    }
    return {
      icon: 'storefront',
      title: 'Store & Business Details',
      desc: 'Provide your retail shop details to start onboarding.',
      nameLabel: 'Business / Shop Name',
      categoryLabel: 'Retail Category',
    };
  };

  const contextInfo = getContextInfo();

  return (
    <div className="w-full box-border bg-white/85 backdrop-blur-xl border border-white/90 rounded-3xl p-4 sm:p-7 shadow-xl flex flex-col gap-5 animate-reveal">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">{contextInfo.icon}</span>
        </div>
        <h1 className="text-[22px] sm:text-[24px] font-black tracking-tight text-gray-900 leading-tight mb-1">
          {t(contextInfo.title)}
        </h1>
        <p className="text-[13px] sm:text-[13.5px] text-gray-500">
          {t(contextInfo.desc)}
        </p>
      </div>

      {/* 1. Merchant Business Type Selection / Review */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">
            {t('Merchant Business Type')}<span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
            {t('Supply Chain Role')}
          </span>
        </div>
        <p className="text-[12px] text-gray-500 mb-2.5">
          {t('Your registered role in the ZeeBac commerce network:')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {[
            { id: 'Manufacturer', icon: 'precision_manufacturing', emoji: '🏭', label: 'Manufacturer', desc: 'Produces & crafts goods' },
            { id: 'Wholesaler', icon: 'inventory_2', emoji: '📦', label: 'Wholesaler', desc: 'Bulk trade & distributor' },
            { id: 'Retailer', icon: 'storefront', emoji: '🛍️', label: 'Retailer', desc: 'Direct-to-consumer store' },
          ].map((type) => {
            const isSelected = data.businessType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => handleSelectBusinessType(type.id)}
                className={`flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer text-center relative ${
                  isSelected
                    ? 'border-[#7c3aed] bg-[#7c3aed]/10 shadow-sm text-gray-900 ring-2 ring-[#7c3aed]/25'
                    : 'border-gray-200 bg-white hover:border-[#7c3aed]/40 text-gray-700'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#7c3aed] text-white flex items-center justify-center text-[12px] font-black shadow-xs">
                    ✓
                  </span>
                )}
                <span className="text-3xl mb-1.5">{type.emoji}</span>
                <p className={`text-[13.5px] font-black leading-tight ${isSelected ? 'text-[#7c3aed]' : 'text-gray-900'}`}>{t(type.label)}</p>
                <span className="text-[10.5px] font-medium text-gray-500 mt-0.5 leading-snug">{t(type.desc)}</span>
              </button>
            );
          })}
        </div>
        {errors.businessType && (
          <p className="text-[11.5px] font-bold text-red-500 flex items-center gap-1 mt-1.5 ml-1">
            <span className="material-symbols-outlined text-[13px]">error</span>{errors.businessType}
          </p>
        )}
      </div>

      {/* 2. Retailer Store Scale (Visible for Retailers) */}
      {isRetailer && (
        <div className="animate-reveal">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">
              {t('Retailer Scale & Model')}<span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] font-bold text-purple-700">
              {isChain ? t('Chain Brand') : t('Independent Store')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => handleSelectShopType('Independent Store')}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                !isChain
                  ? 'border-emerald-500 bg-emerald-50/70 shadow-sm text-emerald-900 ring-2 ring-emerald-500/20'
                  : 'border-gray-200 bg-white hover:border-emerald-300 text-gray-700'
              }`}
            >
              {!isChain && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[12px] font-black shadow-xs">
                  ✓
                </span>
              )}
              <span className="text-3xl mb-1">🏪</span>
              <p className={`text-[13.5px] font-black ${!isChain ? 'text-emerald-800' : 'text-gray-800'}`}>
                {t('Independent Store')}
              </p>
              <span className="text-[10.5px] font-bold text-emerald-600 mt-0.5">
                {t('Min')} {minRates['Independent Store'] ?? 2}% {t('Cashback')} · {t('Single Outlet')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectShopType('Chain & Brand')}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                isChain
                  ? 'border-blue-500 bg-blue-50/70 shadow-sm text-blue-900 ring-2 ring-blue-500/20'
                  : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
              }`}
            >
              {isChain && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[12px] font-black shadow-xs">
                  ✓
                </span>
              )}
              <span className="text-3xl mb-1">🏢</span>
              <p className={`text-[13.5px] font-black ${isChain ? 'text-blue-800' : 'text-gray-800'}`}>
                {t('Chain Brand')}
              </p>
              <span className="text-[10.5px] font-bold text-blue-600 mt-0.5">
                {t('Min')} {minRates['Chain & Brand'] ?? 5}% {t('Cashback')} · {t('GST Required')}
              </span>
            </button>
          </div>
          {errors.shopType && <p className="text-[11.5px] font-bold text-red-500 mt-1.5 ml-1">{errors.shopType}</p>}
        </div>
      )}

      {/* Business Details Fields */}
      <FloatingInput
        label={contextInfo.nameLabel}
        icon="storefront"
        required
        value={data.storeName}
        onChange={(e) => update('storeName', e.target.value)}
        error={errors.storeName}
      />

      <CategorySelect
        label={contextInfo.categoryLabel}
        value={data.category}
        onChange={(v) => update('category', v)}
        error={errors.category}
      />

      <FloatingInput
        label="Business Sub-category (Optional)"
        icon="category"
        value={data.subCategory}
        onChange={(e) => update('subCategory', e.target.value)}
      />

      <FloatingInput
        label="Business Description"
        icon="notes"
        multiline
        value={data.description}
        onChange={(e) => update('description', e.target.value)}
      />

      {/* Customer Cashback Percentage Selection */}
      <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200/80 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">percent</span>
            </div>
            <div>
              <h3 className="text-[13.5px] font-black text-gray-900 flex items-center gap-1">
                {t('Customer Cashback Offer')}<span className="text-red-500">*</span>
              </h3>
              <p className="text-[11.5px] text-gray-500">
                {t('Cashback percentage rewarded to users on verified purchases')}
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 bg-white rounded-full text-[11px] font-black tracking-wide border border-purple-200 text-purple-700 shadow-sm shrink-0">
            {t('Min')}: {currentMin}%
          </span>
        </div>

        {/* Quick select presets */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            {t('Quick Select Percentage')}
          </label>
          <div className="flex flex-wrap gap-2">
            {[currentMin, 5, 7, 10]
              .filter((val, idx, arr) => val >= currentMin && arr.indexOf(val) === idx)
              .map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => update('cashbackRate', pct)}
                  className={`px-3 py-1.5 rounded-xl text-[12.5px] font-black transition-all cursor-pointer ${
                    Number(data.cashbackRate) === pct
                      ? 'bg-purple-700 text-white shadow-sm scale-105'
                      : 'bg-white text-gray-700 border border-purple-200/60 hover:border-purple-400'
                  }`}
                >
                  {pct}% {pct === currentMin ? `(${t('Min')})` : ''}
                </button>
              ))}
          </div>
        </div>

        {/* Custom Input */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
            {t('Or Enter Custom Rate (%)')}
          </label>
          <div className="relative flex items-center">
            <input
              type="number"
              min={currentMin}
              max="100"
              step="0.5"
              value={data.cashbackRate ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                update('cashbackRate', val);
              }}
              placeholder={`${t('Min')} ${currentMin}%`}
              className={`w-full h-11 px-3 pr-10 bg-white border-2 rounded-xl text-[14px] font-bold outline-none transition-colors ${
                errors.cashbackRate ? 'border-red-300' : 'border-gray-200 focus:border-purple-600'
              }`}
            />
            <span className="absolute right-3 font-bold text-gray-400 select-none">%</span>
          </div>
          {errors.cashbackRate && (
            <p className="text-[11.5px] font-bold text-red-500 flex items-center gap-1 mt-1 ml-1">
              <span className="material-symbols-outlined text-[13px]">error</span>{errors.cashbackRate}
            </p>
          )}
        </div>

        {/* Helper Note */}
        <div className="pt-2 border-t border-purple-200/50 flex flex-wrap items-center justify-between gap-1.5 text-[11.5px]">
          <span className="text-gray-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-purple-600">info</span>
            {t('You can change this later in your store profile')}
          </span>
          {Number(data.cashbackRate) >= currentMin && (
            <span className="text-green-700 font-bold flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              {t('Valid offer')}
            </span>
          )}
        </div>
      </div>

      {/* GST Number field */}
      <FloatingInput
        label={`GST Number${isChain ? '' : ' (Optional)'}`}
        icon="receipt_long"
        required={isChain}
        value={data.gstNumber}
        onChange={(e) => update('gstNumber', e.target.value.toUpperCase())}
        error={errors.gstNumber}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FloatingInput
          label="Business Contact Number (Optional)"
          icon="call"
          type="tel"
          value={data.businessContactNumber}
          onChange={(e) => update('businessContactNumber', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
        />
        <FloatingInput
          label="Business Email (Optional)"
          icon="mail"
          type="email"
          value={data.businessEmail}
          onChange={(e) => update('businessEmail', e.target.value)}
        />
      </div>

      <div className="pt-2 border-t border-gray-100 space-y-3">
        <FloatingInput
          label="Full Address"
          icon="home"
          required
          multiline
          value={data.address.fullAddress}
          onChange={(e) => update('address', { ...data.address, fullAddress: e.target.value })}
          error={errors['address.fullAddress']}
        />
        <FloatingInput
          label="Landmark (Optional)"
          icon="pin_drop"
          value={data.address.landmark}
          onChange={(e) => update('address', { ...data.address, landmark: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <FloatingInput
            label="City"
            required
            value={data.address.city}
            onChange={(e) => update('address', { ...data.address, city: e.target.value })}
            error={errors['address.city']}
          />
          <FloatingInput
            label="State"
            required
            value={data.address.state}
            onChange={(e) => update('address', { ...data.address, state: e.target.value })}
            error={errors['address.state']}
          />
        </div>
        <FloatingInput
          label="Pincode"
          icon="local_post_office"
          required
          type="tel"
          value={data.address.pincode}
          onChange={(e) => update('address', { ...data.address, pincode: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) })}
          error={errors['address.pincode']}
        />
      </div>

      <MapPicker
        lat={data.lat}
        lng={data.lng}
        onChange={(lat, lng) => { update('lat', lat); update('lng', lng); }}
        error={errors.location}
      />
    </div>
  );
}
