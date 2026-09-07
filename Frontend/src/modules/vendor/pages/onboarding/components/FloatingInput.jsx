import { useState } from 'react';

export default function FloatingInput({ label, icon, type = 'text', value, onChange, readOnly, placeholder, multiline, required, error }) {
  const [focused, setFocused] = useState(false);
  const isFilled = value && String(value).length > 0;
  const InputEl = multiline ? 'textarea' : 'input';

  return (
    <div className="space-y-1">
      <div className={`relative flex ${multiline ? 'items-start pt-4' : 'items-center'} bg-white border-2 rounded-lg transition-all duration-300 ${
        error ? 'border-red-300' : focused ? 'border-[#7c3aed] shadow-[0_0_0_4px_rgba(124,58,237,0.08)]' : 'border-gray-200 hover:border-gray-300'
      } ${readOnly ? 'bg-gray-50 border-gray-200' : ''}`}>
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
