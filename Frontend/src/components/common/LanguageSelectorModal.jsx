import React from 'react';
import useLanguageStore, { SUPPORTED_LANGUAGES } from '../../store/useLanguageStore';

export default function LanguageSelectorModal({ isOpen, onClose }) {
  const { language, setLanguage, t } = useLanguageStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-reveal">
      <div 
        className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-outline-variant/20 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">translate</span>
            </div>
            <div>
              <h3 className="font-display font-black text-[17px] text-on-surface leading-tight">
                {t('select_language', 'Select Language')}
              </h3>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                {t('language_desc', 'Currently available in English and Hindi')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-2.5">
          {SUPPORTED_LANGUAGES.map((item) => {
            const isSelected = language === item.code;
            return (
              <button
                key={item.code}
                onClick={() => {
                  setLanguage(item.code);
                  onClose();
                }}
                className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-outline-variant/15 hover:border-primary/40 bg-surface-container-low/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  </div>
                  <div className="text-left">
                    <p className={`font-bold text-[15px] leading-tight ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                      {item.nativeName}
                    </p>
                    <p className="text-[12px] text-on-surface-variant font-medium">
                      {item.name}
                    </p>
                  </div>
                </div>

                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? 'border-primary bg-primary text-white' : 'border-outline-variant/40'
                }`}>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[16px] font-black">check</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-surface-container text-on-surface font-bold text-[13px] hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            {t('save', 'Done')}
          </button>
        </div>
      </div>
    </div>
  );
}
