import { useState } from 'react';

export default function FloatingInput({ label, icon, type = 'text', value, onChange, readOnly, placeholder, multiline, required, error }) {
  const [focused, setFocused] = useState(false);
  const isFilled = value && String(value).length > 0;
  const InputEl = multiline ? 'textarea' : 'input';

  return (
    <div className="space-y-1">
      <div className={`relative flex ${multiline ? 'items-start pt-4' : 'items-center'} bg-white border border-slate-200 rounded-xl transition-colors ${
        error ? 'border-red-400' : focused ? 'border-purple-600' : 'border-slate-200 hover:border-slate-300'
      } ${readOnly ? 'bg-slate-50 border-slate-200' : ''}`}>
        {icon && (
          <span className={`material-symbols-outlined absolute left-4 transition-colors ${focused ? 'text-[#7c3aed]' : 'text-gray-400'} ${multiline ? 'top-5' : ''}`}>{icon}</span>
        )}
        <InputEl
          type={type}
          readOnly={readOnly}
          value={value ?? ''}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused || readOnly ? placeholder : ''}
          rows={multiline ? 3 : undefined}
          className={`w-full bg-transparent outline-none px-4 pt-[18px] pb-[10px] text-[15px] font-bold text-gray-900 ${icon ? 'pl-12' : ''} ${multiline ? 'resize-none' : ''}`}
        />
        <label className={`absolute transition-all duration-200 pointer-events-none ${icon ? 'left-12' : 'left-4'} ${
          focused || isFilled || placeholder
            ? 'top-2 text-[11px] font-bold text-[#7c3aed]'
            : `text-[15px] text-gray-500 ${multiline ? 'top-5' : 'top-1/2 -translate-y-1/2'}`
        }`}>
          {label}{required && <span className="text-red-500">*</span>}
        </label>
      </div>
      {error && (
        <p className="text-[11.5px] font-bold text-red-500 flex items-center gap-1 ml-1">
          <span className="material-symbols-outlined text-[13px]">error</span>{error}
        </p>
      )}
    </div>
  );
}
