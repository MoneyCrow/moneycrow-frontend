import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';
import logoGold from '../../assets/logo-gold.png';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export type Page = 'landing' | 'create' | 'status' | 'claim' | 'demo-accept' | 'admin' | 'how-it-works' | 'faq';

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: 'landing',      label: 'Home'          },
  { id: 'create',       label: 'Create Escrow' },
  { id: 'status',       label: 'My Escrows'    },
  { id: 'claim',        label: 'Claim Funds'   },
  { id: 'how-it-works', label: 'How It Works'  },
  { id: 'faq',          label: 'FAQ'           },
];

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
    <div style={{
      width: collapsed ? 56 : 232, minHeight: '100vh',
      background: bg, borderRight: `1px solid ${border}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease', position: 'fixed',
      left: 0, top: 0, bottom: 0, zIndex: 100, overflow: 'hidden',
    }}>
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

function TopBar({ sidebarWidth, onToggleTheme }: { sidebarWidth: number; onToggleTheme: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const bg = isDark ? '#111111' : '#E8E8E3';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(17,17,17,0.45)';

  return (
    <div style={{
      position: 'fixed', top: 0, left: sidebarWidth, right: 0, height: 64,
      background: bg, borderBottom: `1px solid ${border}`,
      display: 'flex', alignItems: 'center', padding: '0 36px',
      zIndex: 99, transition: 'left 0.2s ease', gap: 14,
    }}>
      <div style={{ flex: 1 }} />

      {/* Audit badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', border: '1px solid rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.06)' }}>
        <span style={{ width: 5, height: 5, background: '#4ADE80' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>Audited</span>
      </div>

      {/* Theme toggle */}
      <button onClick={onToggleTheme} style={{
        display: 'flex', alignItems: 'center', border: `1px solid ${border}`,
        background: 'transparent', cursor: 'pointer', padding: 0, overflow: 'hidden', borderRadius: 0,
      }}>
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

      {/* Wallet — use existing RainbowKit ConnectButton */}
      <ConnectButton />
    </div>
  );
}

export function AppShell({ page, onNav, children, isAdmin }: {
  page: Page; onNav: (p: Page) => void; children: ReactNode; isAdmin: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { toggleTheme, theme } = useTheme();
  const sw = collapsed ? 56 : 232;
  const isDark = theme === 'dark';

  return (
    <div style={{ minHeight: '100vh', background: isDark ? '#161616' : '#F2F2ED', fontFamily: "'Space Grotesk', sans-serif", color: isDark ? '#FFFFFF' : '#111111' }}>
      <Sidebar page={page} onNav={onNav} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} isAdmin={isAdmin} />
      <TopBar sidebarWidth={sw} onToggleTheme={toggleTheme} />
      <main style={{ marginLeft: sw, marginTop: 64, minHeight: 'calc(100vh - 64px)', padding: '44px 48px', transition: 'margin-left 0.2s ease' }}>
        <div key={page} className="sharp-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
