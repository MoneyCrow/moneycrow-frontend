import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'dark', toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mc_v3_state') || '{}');
      return saved.theme === 'light' ? 'light' : 'dark';
    } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      const saved = JSON.parse(localStorage.getItem('mc_v3_state') || '{}');
      localStorage.setItem('mc_v3_state', JSON.stringify({ ...saved, theme }));
    } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
