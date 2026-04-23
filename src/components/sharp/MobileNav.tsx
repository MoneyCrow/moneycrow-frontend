import { useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTheme } from '../../context/ThemeContext';
import logoGold from '../../assets/logo-gold.png';
import type { Page } from './AppShell';

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: 'landing',      label: 'Home'          },
  { id: 'create',       label: 'Create Escrow' },
  { id: 'status',       label: 'My Escrows'    },
  { id: 'claim',        label: 'Claim Funds'   },
  { id: 'how-it-works', label: 'How It Works'  },
  { id: 'faq',          label: 'FAQ'           },
];

interface Props {
  open: boolean;
  onClose: () => void;
  page: Page;
  onNav: (p: Page) => void;
  isAdmin: boolean;
}

/**
 * Mobile full-viewport nav drawer. Self-scoped to <1024px via the AppShell gate
 * (this component is only mounted when `useIsMobile()` is true). Handles body
 * scroll lock and ESC-to-close via the parent `open` prop.
 */
export function MobileNav({ open, onClose, page, onNav, isAdmin }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const bg = isDark ? '#111111' : '#E8E8E3';
  const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.55)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';

  const navItems = isAdmin ? [...NAV_ITEMS, { id: 'admin' as Page, label: 'Admin' }] : NAV_ITEMS;

  // Close the drawer if we cross back to desktop width mid-flight.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) onClose(); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 150,
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        style={{
          position: 'fixed', inset: 0, zIndex: 151,
          display: 'flex', flexDirection: 'column',
          background: bg, color: textPrimary,
          fontFamily: "'Space Grotesk', sans-serif",
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease-out',
        }}
      >
        {/* Header: logo + close */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 64, padding: '0 20px',
          borderBottom: `1px solid ${border}`, flexShrink: 0,
        }}>
          <button
            onClick={() => { onNav('landing'); onClose(); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: 0, border: 'none', background: 'transparent',
              color: textPrimary, cursor: 'pointer',
            }}
          >
            <img src={logoGold} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.2px' }}>MoneyCrow</span>
          </button>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 44, height: 44,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${border}`, background: 'transparent',
              color: textPrimary, cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {navItems.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNav(item.id); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', minHeight: 52, padding: '0 20px',
                  textAlign: 'left', border: 'none', background: active ? 'rgba(242,183,5,0.06)' : 'transparent',
                  borderLeft: `3px solid ${active ? '#F2B705' : 'transparent'}`,
                  color: active ? '#F2B705' : textPrimary,
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: active ? 600 : 500, letterSpacing: '0.02em',
                  cursor: 'pointer', transition: 'background 150ms ease, color 150ms ease',
                }}
              >
                <span style={{
                  width: 5, height: 5, flexShrink: 0,
                  background: active ? '#F2B705' : 'transparent',
                  border: active ? 'none' : `1px solid ${textSecondary}`,
                }} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer: theme segmented control + wallet + networks */}
        <div style={{
          flexShrink: 0, borderTop: `1px solid ${border}`,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Theme segmented control */}
          <div style={{
            display: 'flex', alignItems: 'stretch',
            border: `1px solid ${border}`,
          }}>
            {(['dark', 'light'] as const).map(t => {
              const on = theme === t;
              return (
                <button
                  key={t}
                  onClick={() => { if (!on) toggleTheme(); }}
                  style={{
                    flex: 1, minHeight: 44,
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: on ? '#F2B705' : 'transparent',
                    color: on ? '#111111' : textSecondary,
                    border: 'none', cursor: 'pointer',
                    transition: 'background 150ms ease, color 150ms ease',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Wallet — RainbowKit handles its own styling. Wrapped so drawer
              scroll locks won't fight its popover; the popover portals to body. */}
          <div style={{ display: 'flex', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ flex: 1, minHeight: 48, display: 'flex' }}>
              <ConnectButton />
            </div>
          </div>

          {/* Live networks */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: textSecondary, marginBottom: 10, opacity: 0.75,
            }}>
              Live Networks
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{
                background: 'rgba(0,82,255,0.1)', color: '#4F8EFF',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                padding: '4px 10px', border: '1px solid rgba(79,142,255,0.2)',
              }}>BASE</span>
              <span style={{
                background: 'rgba(130,71,229,0.1)', color: '#A855F7',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                padding: '4px 10px', border: '1px solid rgba(168,85,247,0.2)',
              }}>POLYGON</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
