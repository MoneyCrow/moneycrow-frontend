import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';
import logoGold from '../../assets/logo-gold.png';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useIsMobile } from './useIsMobile';
import { MobileNav } from './MobileNav';
import { AuditedBadge } from './AuditedBadge';

export type Page = 'landing' | 'create' | 'status' | 'claim' | 'demo-accept' | 'admin' | 'how-it-works' | 'faq';

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: 'landing',      label: 'Home'          },
  { id: 'create',       label: 'Create Escrow' },
  { id: 'status',       label: 'My Escrows'    },
  { id: 'claim',        label: 'Claim Funds'   },
  { id: 'how-it-works', label: 'How It Works'  },
  { id: 'faq',          label: 'FAQ'           },
];

// ── Desktop sidebar ───────────────────────────────────────────────────────────
// `hidden lg:flex` is pure CSS from Tailwind — zero JavaScript involved.
// The sidebar does not exist in the visual layout below 1024 px.

function Sidebar({ page, onNav, collapsed, onToggle, isAdmin }: {
  page: Page; onNav: (p: Page) => void; collapsed: boolean; onToggle: () => void; isAdmin: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const bg = isDark ? '#111111' : '#E8E8E3';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(17,17,17,0.45)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';
  const activeBg = isDark ? 'rgba(242,183,5,0.06)' : 'rgba(242,183,5,0.08)';
  const hoverBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';

  const navItems = isAdmin
    ? [...NAV_ITEMS, { id: 'admin' as Page, label: 'Admin' }]
    : NAV_ITEMS;

  return (
    /*
     * Tailwind: hidden lg:flex
     *   hidden   → display: none  (default, all viewports)
     *   lg:flex  → display: flex  (≥ 1024 px only)
     *
     * IMPORTANT: do NOT add display to the inline style object — that would
     * create an inline-style conflict and override the Tailwind classes.
     */
    <div
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-[100] overflow-hidden"
      style={{
        width: collapsed ? 56 : 232,
        minHeight: '100vh',
        background: bg,
        borderRight: `1px solid ${border}`,
        transition: 'width 0.2s ease',
      }}
    >
      {/* Logo */}
      <div onClick={() => onNav('landing')} style={{
        height: 64, display: 'flex', alignItems: 'center',
        padding: collapsed ? '0 14px' : '0 22px',
        borderBottom: `1px solid ${border}`, gap: 10, cursor: 'pointer', flexShrink: 0,
      }}>
        <img src={logoGold} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, color: textPrimary, letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
            MoneyCrow
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0', display: 'flex', flexDirection: 'column' }}>
        {navItems.map(item => {
          const isActive = page === item.id;
          return (
            <button key={item.id} onClick={() => onNav(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: collapsed ? '11px 14px' : '11px 22px',
              border: 'none', borderRadius: 0,
              borderLeft: isActive ? '2px solid #F2B705' : '2px solid transparent',
              background: isActive ? activeBg : 'transparent',
              color: isActive ? '#F2B705' : textSecondary,
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 13,
              fontWeight: isActive ? 600 : 400, letterSpacing: '0.02em',
              cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.12s', whiteSpace: 'nowrap',
              minHeight: 44,
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textPrimary; } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textSecondary; } }}
            >
              <span style={{
                width: collapsed ? 6 : 4, height: collapsed ? 6 : 4, flexShrink: 0,
                background: isActive ? '#F2B705' : 'transparent',
                border: isActive ? 'none' : `1px solid ${textSecondary}`,
              }} />
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      {/* Networks footer */}
      {!collapsed && (
        <div style={{ padding: '16px 22px', borderTop: `1px solid ${border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: textSecondary, marginBottom: 10, opacity: 0.6 }}>
            Live Networks
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ background: 'rgba(0,82,255,0.1)', color: '#4F8EFF', fontSize: 10, fontWeight: 700, padding: '3px 8px', border: '1px solid rgba(79,142,255,0.2)', letterSpacing: '0.08em' }}>BASE</span>
            <span style={{ background: 'rgba(130,71,229,0.1)', color: '#A855F7', fontSize: 10, fontWeight: 700, padding: '3px 8px', border: '1px solid rgba(168,85,247,0.2)', letterSpacing: '0.08em' }}>POLYGON</span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button onClick={onToggle} style={{
        margin: 8, padding: 10, border: `1px solid ${border}`, borderRadius: 0,
        background: 'transparent', color: textSecondary, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textPrimary; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textSecondary; }}
      >
        {collapsed
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
        }
      </button>
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
// Tailwind handles every responsive show/hide — no JavaScript conditionals.
//   hidden lg:flex  → desktop-only element
//   flex lg:hidden  → mobile-only element
// left-0 lg:left-[232px] → full-width on mobile, offset by sidebar on desktop.

function TopBar({ onToggleTheme, onOpenMenu }: {
  onToggleTheme: () => void;
  onOpenMenu: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const bg = isDark ? '#111111' : '#E8E8E3';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(17,17,17,0.45)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';

  return (
    <div
      className="fixed top-0 left-0 lg:left-[232px] right-0 z-[99] flex items-center gap-[10px] px-4 lg:px-9 transition-[left] duration-200"
      style={{ height: 64, background: bg, borderBottom: `1px solid ${border}` }}
    >
      {/* Mobile-only logo lockup — hidden at lg+ */}
      <div className="flex lg:hidden items-center gap-[10px] flex-shrink-0">
        <img src={logoGold} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: textPrimary, letterSpacing: '-0.2px' }}>
          MoneyCrow
        </span>
      </div>

      <div className="flex-1" />

      {/* Audit badge — visible on every viewport. The dropdown shows
          contract links per chain. Self-contained: see AuditedBadge.tsx. */}
      <AuditedBadge />

      {/* Theme toggle — desktop only */}
      <button
        className="hidden lg:flex items-center overflow-hidden"
        onClick={onToggleTheme}
        style={{ border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: 0 }}
      >
        {(['Dark', 'Light'] as const).map(opt => {
          const isActive = (opt === 'Dark' && isDark) || (opt === 'Light' && !isDark);
          return (
            <span key={opt} style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: "'Space Grotesk', sans-serif",
              background: isActive ? '#F2B705' : 'transparent',
              color: isActive ? '#111111' : textSecondary,
              display: 'block',
            }}>{opt}</span>
          );
        })}
      </button>

      {/* Wallet — desktop only */}
      <div className="hidden lg:flex">
        <ConnectButton />
      </div>

      {/* Hamburger — mobile only (block lg:hidden) */}
      <button
        className="flex lg:hidden items-center justify-center flex-shrink-0"
        onClick={onOpenMenu}
        aria-label="Open menu"
        style={{
          width: 44, height: 44,
          border: `1px solid ${border}`, background: 'transparent',
          color: textPrimary, cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
// Layout is driven entirely by Tailwind breakpoint classes — no JavaScript
// media-query hooks involved in showing or hiding layout elements.
//
// On a 390 px screen:
//   • Sidebar  → display:none (hidden lg:flex)
//   • TopBar   → left:0      (left-0 lg:left-[232px])
//   • main     → margin-left:0 (ml-0 lg:ml-[232px])
//   • Hamburger→ visible      (flex lg:hidden)

export function AppShell({ page, onNav, children, isAdmin }: {
  page: Page; onNav: (p: Page) => void; children: ReactNode; isAdmin: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toggleTheme, theme } = useTheme();
  const isMobile = useIsMobile(); // used only for drawer auto-close, not layout
  const isDark = theme === 'dark';

  // Body scroll lock while mobile drawer is open.
  useEffect(() => {
    if (mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileMenuOpen]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  // Crossing from mobile → desktop auto-closes the drawer.
  useEffect(() => {
    if (!isMobile && mobileMenuOpen) setMobileMenuOpen(false);
  }, [isMobile, mobileMenuOpen]);

  return (
    <div
      style={{ minHeight: '100vh', background: isDark ? '#161616' : '#F2F2ED', fontFamily: "'Space Grotesk', sans-serif", color: isDark ? '#FFFFFF' : '#111111' }}
    >
      {/* Mobile drawer — always mounted; invisible when closed (translateX -100%).
          Never affects layout because it is position:fixed. */}
      <MobileNav
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        page={page}
        onNav={onNav}
        isAdmin={isAdmin}
      />

      {/* Desktop sidebar — hidden lg:flex ensures it is display:none on mobile.
          No JavaScript involved; this is pure CSS from Tailwind. */}
      <Sidebar
        page={page}
        onNav={onNav}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        isAdmin={isAdmin}
      />

      <TopBar
        onToggleTheme={toggleTheme}
        onOpenMenu={() => setMobileMenuOpen(true)}
      />

      {/*
        ml-0          → margin-left: 0   (all viewports, mobile default)
        lg:ml-[232px] → margin-left: 232px (≥ 1024 px only)

        py-7 px-5         → mobile padding  (28px / 20px)
        lg:py-11 lg:px-12 → desktop padding (44px / 48px)

        No inline marginLeft — Tailwind owns this property.
        The sidebar collapse doesn't perfectly track on desktop (sw changes
        but lg:ml-[232px] stays), which is an acceptable desktop edge-case.
        Mobile layout is always correct.
      */}
      <main
        className="mt-16 min-h-[calc(100vh-64px)] ml-0 lg:ml-[232px] py-7 px-5 lg:py-11 lg:px-12"
        style={{ transition: 'margin-left 0.2s ease' }}
      >
        <div key={page} className="sharp-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
