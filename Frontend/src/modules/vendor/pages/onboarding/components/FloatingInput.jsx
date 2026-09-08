import { useState } from 'react';

export default function FloatingInput({
  label, icon, type = 'text', value, onChange,
  readOnly, placeholder, multiline, required, error,
}) {
  const [focused, setFocused] = useState(false);
  const isFilled = value != null && String(value).length > 0;
  const isUp = focused || isFilled || !!placeholder;
  const InputEl = multiline ? 'textarea' : 'input';

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: multiline ? undefined : '58px',
          minHeight: multiline ? '80px' : undefined,
          backgroundColor: readOnly ? '#f8fafc' : '#ffffff',
          border: `1.5px solid ${error ? '#f87171' : focused ? '#7c3aed' : '#e2e8f0'}`,
          borderRadius: '12px',
          boxSizing: 'border-box',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Icon */}
        {icon && (
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: '14px',
              top: multiline ? '16px' : '50%',
              transform: multiline ? 'none' : 'translateY(-50%)',
              fontSize: '20px',
              color: focused ? '#7c3aed' : '#94a3b8',
              pointerEvents: 'none',
              transition: 'color 0.2s',
            }}
          >
            {icon}
          </span>
        )}

        {/* Floating Label */}
        <label
          style={{
            position: 'absolute',
            left: icon ? '44px' : '14px',
            top: isUp ? '8px' : multiline ? '16px' : '50%',
            transform: (!isUp && !multiline) ? 'translateY(-50%)' : 'none',
            fontSize: isUp ? '11px' : '14px',
            fontWeight: isUp ? '600' : '400',
            color: isUp ? '#7c3aed' : '#94a3b8',
            pointerEvents: 'none',
            transition: 'all 0.18s ease',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
          {required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
        </label>

        {/* Input */}
        <InputEl
          type={type}
          readOnly={readOnly}
          value={value ?? ''}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused && placeholder ? placeholder : ''}
          rows={multiline ? 3 : undefined}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: multiline ? 0 : undefined,
            height: multiline ? undefined : '36px',
            width: '100%',
            paddingLeft: icon ? '44px' : '14px',
            paddingRight: '14px',
            paddingTop: multiline ? '28px' : '0',
            paddingBottom: multiline ? '8px' : '0',
            background: 'transparent',
            outline: 'none',
            border: 'none',
            fontSize: '15px',
            fontWeight: '600',
            color: '#111827',
            boxSizing: 'border-box',
            resize: multiline ? 'none' : undefined,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', marginLeft: '4px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#ef4444' }}>error</span>
          <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#ef4444' }}>{error}</span>
        </div>
      )}
    </div>
  );
}
