import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function SharpInput({ label, hint, style, className, ...rest }: InputProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const combinedClass = ['sharp-touch', className].filter(Boolean).join(' ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(17,17,17,0.45)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </label>
      )}
      <input
        className={combinedClass}
        style={{
          width: '100%', padding: '11px 14px', borderRadius: 0,
          background: isDark ? '#1C1C1C' : '#FFFFFF',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'}`,
          color: isDark ? '#FFFFFF' : '#111111',
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, outline: 'none',
          transition: 'border-color 0.15s', boxSizing: 'border-box',
          ...style,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#F2B705'; }}
        onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'; }}
        {...rest}
      />
      {hint && <span style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,17,17,0.40)' }}>{hint}</span>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function SharpTextarea({ label, hint, style, className, ...rest }: TextareaProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const combinedClass = ['sharp-touch', className].filter(Boolean).join(' ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(17,17,17,0.45)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </label>
      )}
      <textarea
        className={combinedClass}
        style={{
          width: '100%', padding: '11px 14px', borderRadius: 0,
          background: isDark ? '#1C1C1C' : '#FFFFFF',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'}`,
          color: isDark ? '#FFFFFF' : '#111111',
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, outline: 'none',
          resize: 'vertical', transition: 'border-color 0.15s', boxSizing: 'border-box',
          ...style,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#F2B705'; }}
        onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'; }}
        {...rest}
      />
      {hint && <span style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,17,17,0.40)' }}>{hint}</span>}
    </div>
  );
}

interface Option { value: string; label: string; }
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
}

export function SharpSelect({ label, options, style, className, ...rest }: SelectProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const combinedClass = ['sharp-touch', className].filter(Boolean).join(' ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(17,17,17,0.45)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </label>
      )}
      <select
        className={combinedClass}
        style={{
          width: '100%', padding: '11px 14px', borderRadius: 0,
          background: isDark ? '#1C1C1C' : '#FFFFFF',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'}`,
          color: isDark ? '#FFFFFF' : '#111111',
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, outline: 'none',
          cursor: 'pointer', boxSizing: 'border-box',
          ...style,
        }}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
