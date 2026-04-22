import type { ReactNode, CSSProperties } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function SharpCard({ children, style, id }: { children: ReactNode; style?: CSSProperties; id?: string }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div id={id} style={{
      background: isDark ? '#1C1C1C' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
      borderRadius: 0,
      ...style,
    }}>
      {children}
    </div>
  );
}
