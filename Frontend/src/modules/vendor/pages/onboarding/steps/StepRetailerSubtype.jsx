import useLanguageStore from '../../../../../store/useLanguageStore';

const RETAILER_SUBTYPE_OPTIONS = [
  {
    id: 'independent_store',
    shopType: 'Independent Store',
    emoji: '🏪',
    icon: 'storefront',
    title: 'Independent Store',
    subtitle: 'Single outlet or local standalone shop',
    description: 'Perfect for neighborhood retailers and single-outlet stores. Fast onboarding with min 2% customer cashback.',
    badge: 'Min 2% Cashback',
    features: ['Single retail location', 'Standard KYC & shop license', 'Customer cashback from 2%'],
  },
  {
    id: 'chain_brand',
    shopType: 'Chain & Brand',
    emoji: '🏢',
    icon: 'corporate_fare',
    title: 'Chain Brand',
    subtitle: 'Multi-outlet retail brand or recognized chain',
    description: 'Designed for retail brand chains with multiple branches or high retail volume. Verified badge and premium visibility.',
    badge: 'Min 5% Cashback · GST Required',
    features: ['Multi-outlet / brand scale', 'GST certificate required', 'Customer cashback from 5%'],
  },
];

export default function StepRetailerSubtype({ selectedSubtype, onSelect, onContinue, onBack }) {
  const { t } = useLanguageStore();

  return (
    <div className="w-full box-border bg-white/90 backdrop-blur-xl border border-white/90 rounded-3xl p-4 sm:p-7 shadow-xl flex flex-col gap-5 animate-reveal">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">store</span>
          </div>
          <span className="text-[11px] font-extrabold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
            {t('Step 2: Retailer Model')}
          </span>
        </div>
        <h1 className="text-[22px] sm:text-[25px] font-black tracking-tight text-gray-900 leading-tight mb-1.5">
          {t('Choose Your Retailer Type')}
        </h1>
        <p className="text-[13px] sm:text-[14px] text-gray-500 leading-relaxed">
          {t('Select whether you operate as an Independent Store or a Chain Brand.')}
        </p>
      </div>

      <div className="space-y-3.5">
        {RETAILER_SUBTYPE_OPTIONS.map((opt) => {
          const isSelected = selectedSubtype === opt.id || selectedSubtype === opt.shopType;
          return (
            <div
              key={opt.id}
              role="button"
              tabIndex={0}
              id={`retailer-subtype-card-${opt.id}`}
              onClick={() => onSelect(opt.id, opt.shopType)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(opt.id, opt.shopType);
                }
              }}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative text-left select-none flex flex-col sm:flex-row items-start gap-3.5 sm:gap-4 ${
                isSelected
                  ? 'border-[#7c3aed] bg-[#7c3aed]/5 shadow-md ring-2 ring-[#7c3aed]/25'
                  : 'border-gray-200/90 bg-white hover:border-[#7c3aed]/40 hover:bg-purple-50/20'
              }`}
            >
              {/* Emoji icon container */}
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 transition-all ${
                  isSelected ? 'bg-[#7c3aed]/15 shadow-xs' : 'bg-gray-100'
                }`}
              >
                <span>{opt.emoji}</span>
              </div>

              {/* Card content */}
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className={`text-[16px] font-black leading-tight ${isSelected ? 'text-[#7c3aed]' : 'text-gray-900'}`}>
                    {t(opt.title)}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      opt.id === 'chain_brand'
                        ? 'text-blue-700 bg-blue-50 border-blue-200'
                        : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    {t(opt.badge)}
                  </span>
                </div>
                <p className="text-[12px] font-bold text-gray-700 mb-1.5">
                  {t(opt.subtitle)}
                </p>
                <p className="text-[11.5px] text-gray-500 leading-snug mb-2.5">
                  {t(opt.description)}
                </p>

                {/* Key feature bullets */}
                <div className="flex flex-wrap gap-1.5">
                  {opt.features.map((feat) => (
                    <span
                      key={feat}
                      className="text-[10.5px] font-medium text-gray-600 bg-gray-50 border border-gray-200/80 rounded-md px-2 py-0.5"
                    >
                      ✓ {t(feat)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Selection indicator radio / checkmark */}
              <div className="absolute top-4 right-4">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? 'border-[#7c3aed] bg-[#7c3aed] text-white shadow-xs' : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && (
                    <span className="material-symbols-outlined text-[15px] font-black leading-none">
                      check
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action CTA */}
      <div className="pt-2">
        <button
          type="button"
          id="btn-continue-retailer-subtype"
          disabled={!selectedSubtype}
          onClick={onContinue}
          style={{
            display: 'flex',
            width: '100%',
            height: '52px',
            borderRadius: '14px',
            border: 'none',
            background: selectedSubtype
              ? 'linear-gradient(135deg, #16082f 0%, #3b0764 50%, #6000da 100%)'
              : '#e5e7eb',
            color: selectedSubtype ? '#ffffff' : '#9ca3af',
            fontWeight: '700',
            fontSize: '15px',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: selectedSubtype ? 'pointer' : 'not-allowed',
            boxShadow: selectedSubtype ? '0 8px 24px rgba(96,0,218,0.28)' : 'none',
            fontFamily: 'inherit',
            transition: 'all 0.2s ease',
          }}
        >
          <span>{t('Proceed with Retailer Registration')}</span>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
        </button>

        <button
          type="button"
          id="btn-back-to-business-type"
          onClick={onBack}
          className="w-full text-center mt-3 text-[12.5px] font-bold text-gray-500 hover:text-gray-800 transition-colors py-1 cursor-pointer flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>{t('Back to Business Type Selection')}</span>
        </button>
      </div>
    </div>
  );
}
