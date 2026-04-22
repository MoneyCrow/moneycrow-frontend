import type { ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SharpPageHeader({ title, subtitle, action }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div style={{
      marginBottom: 40, paddingBottom: 28,
      borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: isDark ? '#FFFFFF' : '#111111', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '8px 0 0', fontSize: 14, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)', lineHeight: 1.6 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
