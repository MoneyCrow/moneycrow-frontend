import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function SharpButton({ variant = 'primary', size = 'md', children, style, className, ...rest }: Props) {
  const pad = size === 'lg' ? '14px 32px' : size === 'sm' ? '7px 16px' : '10px 22px';
  const fs  = size === 'lg' ? 15 : size === 'sm' ? 12 : 13;
  const isPrimary = variant === 'primary';
  // Touch target: <1024px min-height 44 for sm/md, 48 for lg. Desktop unchanged.
  const touchClass = size === 'lg' ? 'sharp-touch-lg' : 'sharp-touch';
  const combinedClass = [touchClass, className].filter(Boolean).join(' ');
  return (
    <button
      className={combinedClass}
      style={{
        padding: pad, borderRadius: 0,
        border: isPrimary ? 'none' : '1px solid #F2B705',
        background: isPrimary ? '#F2B705' : 'transparent',
        color: isPrimary ? '#111111' : '#F2B705',
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 600, fontSize: fs, letterSpacing: '0.04em', textTransform: 'uppercase',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.4 : 1,
        transition: 'background 0.15s, color 0.15s',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...style,
      }}
      onMouseEnter={e => {
        if (!rest.disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = isPrimary ? '#E6AD04' : 'rgba(242,183,5,0.10)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = isPrimary ? '#F2B705' : 'transparent';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
