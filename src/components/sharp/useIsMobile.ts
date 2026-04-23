import { useEffect, useState } from 'react';

/**
 * Returns true below Tailwind's `lg` breakpoint (1024px). Mobile is the default;
 * desktop opts in at ≥1024px. Used by AppShell and pages to branch inline-style
 * layouts without touching desktop rendering.
 */
export function useIsMobile(): boolean {
  const getInitial = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1023.98px)').matches;
  };

  const [isMobile, setIsMobile] = useState<boolean>(getInitial);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    // Resync in case initial render used a stale value.
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
