import useLanguageStore from '../../../../../store/useLanguageStore';

const BUSINESS_TYPE_OPTIONS = [
  {
    id: 'Manufacturer',
    emoji: '🏭',
    icon: 'precision_manufacturing',
    title: 'Manufacturer',
    subtitle: 'Produces & crafts goods',
    description: 'Factory, production facility, or craft enterprise producing goods for B2B supply chains.',
    badge: 'Production & B2B',
  },
  {
    id: 'Wholesaler',
    emoji: '📦',
    icon: 'inventory_2',
    title: 'Wholesaler',
    subtitle: 'Bulk trade & distributor',
    description: 'Bulk inventory supply hub and distributor providing stock directly to retail businesses.',
    badge: 'Bulk Distribution',
  },
  {
    id: 'Retailer',
    emoji: '🛍️',
    icon: 'storefront',
    title: 'Retailer',
    subtitle: 'Direct-to-consumer store',
    description: 'Physical storefront, neighborhood retail shop, or chain brand serving end customers.',
    badge: '2 Store Models',
  },
];

export default function StepBusinessType({ selectedType, onSelect, onContinue, onBack }) {
  const { t } = useLanguageStore();

  return (
    <div className="w-full box-border bg-white/90 backdrop-blur-xl border border-white/90 rounded-3xl p-4 sm:p-7 shadow-xl flex flex-col gap-5 animate-reveal">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">domain</span>
        </div>
        <h1 className="text-[22px] sm:text-[25px] font-black tracking-tight text-gray-900 leading-tight mb-1.5">
          {t('Register Your Business')}
        </h1>
        <p className="text-[13px] sm:text-[14px] text-gray-500 leading-relaxed">
          {t('Select your business type in the supply chain to get started.')}
        </p>
      </div>

      <div className="space-y-3">
        {BUSINESS_TYPE_OPTIONS.map((opt) => {
          const isSelected = selectedType === opt.id;
          return (
            <div
              key={opt.id}
              role="button"
              tabIndex={0}
              id={`business-type-card-${opt.id.toLowerCase()}`}
              onClick={() => onSelect(opt.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(opt.id);
                }
              }}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer relative text-left select-none flex items-start gap-4 ${
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
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={`text-[16px] font-black leading-tight ${isSelected ? 'text-[#7c3aed]' : 'text-gray-900'}`}>
                    {t(opt.title)}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isSelected
                        ? 'text-purple-700 bg-purple-100/70 border-purple-300'
                        : 'text-gray-600 bg-gray-100 border-gray-200'
                    }`}
                  >
                    {t(opt.badge)}
                  </span>
                </div>
                <p className="text-[12.5px] font-bold text-gray-700 mb-1">
                  {t(opt.subtitle)}
                </p>
                <p className="text-[11.5px] text-gray-500 leading-snug">
                  {t(opt.description)}
                </p>
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
          id="btn-continue-business-type"
          disabled={!selectedType}
          onClick={onContinue}
          style={{
            display: 'flex',
            width: '100%',
            height: '52px',
            borderRadius: '14px',
            border: 'none',
            background: selectedType
              ? 'linear-gradient(135deg, #16082f 0%, #3b0764 50%, #6000da 100%)'
              : '#e5e7eb',
            color: selectedType ? '#ffffff' : '#9ca3af',
            fontWeight: '700',
            fontSize: '15px',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: selectedType ? 'pointer' : 'not-allowed',
            boxShadow: selectedType ? '0 8px 24px rgba(96,0,218,0.28)' : 'none',
            fontFamily: 'inherit',
            transition: 'all 0.2s ease',
          }}
        >
          <span>{selectedType === 'Retailer' ? t('Next: Select Retailer Model') : t('Continue to Registration')}</span>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
        </button>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full text-center mt-3 text-[12.5px] font-bold text-gray-500 hover:text-gray-800 transition-colors py-1 cursor-pointer flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>{t('Back to Sign In')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
