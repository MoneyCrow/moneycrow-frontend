import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ESCROW_ADDRESS } from '../../contracts/Escrow';

/**
 * AUDITED badge with a clickable dropdown of contract links.
 *
 * - Visible on every viewport (compact label on small screens).
 * - Pulsing green dot to signal "live".
 * - Tap/click toggles a dropdown anchored under the badge.
 * - Clicking a link opens Basescan / Polygonscan in a new tab.
 * - Clicking anywhere outside the badge closes the dropdown.
 *
 * Contract addresses come from contracts/Escrow.ts so this stays in sync
 * if the deployed escrow ever moves.
 */

const SCAN_URL = {
  base:    'https://basescan.org/address',
  polygon: 'https://polygonscan.com/address',
} as const;

export function AuditedBadge() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside-click. mousedown (not click) so the same press that
  // selects something inside the dropdown doesn't immediately re-fire close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    // ESC also closes — accessible, no surprise to keyboard users.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const baseAddr    = ESCROW_ADDRESS[8453];
  const polygonAddr = ESCROW_ADDRESS[137];

  const dropdownBg = isDark ? '#111111' : '#FFFFFF';
  const border     = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
  const textPrimary   = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.55)';
  const hoverBg    = isDark ? 'rgba(242,183,5,0.08)' : 'rgba(242,183,5,0.10)';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="View audited contracts"
        aria-haspopup="menu"
        aria-expanded={open}
        className="audited-badge-button"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 10px',
          border: '1px solid rgba(74,222,128,0.30)',
          background: open ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.06)',
          cursor: 'pointer', borderRadius: 0,
          fontFamily: "'Space Grotesk', sans-serif",
          transition: 'background 0.12s ease',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(74,222,128,0.10)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(74,222,128,0.06)'; }}
      >
        {/* Pulsing dot — keyframes are defined in index.css (.pulse-dot) */}
        <span
          className="pulse-dot"
          style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: '#4ADE80',
            display: 'block',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#4ADE80',
          letterSpacing: '0.10em', textTransform: 'uppercase',
        }}>
          {/* Full word on lg+, short on mobile to keep the topbar uncluttered. */}
          <span className="hidden sm:inline">Audited</span>
          <span className="inline sm:hidden">Audit</span>
        </span>
        {/* Tiny chevron so the affordance reads as "more here" */}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" style={{ marginLeft: 1, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 220,
            background: dropdownBg,
            border: `1px solid ${border}`,
            boxShadow: isDark
              ? '0 6px 24px rgba(0,0,0,0.55)'
              : '0 6px 24px rgba(0,0,0,0.12)',
            zIndex: 200,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <div style={{
            padding: '8px 12px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            color: textSecondary,
            borderBottom: `1px solid ${border}`,
          }}>
            Verified Contracts
          </div>

          {[
            { chain: 'Base',    addr: baseAddr,    explorer: SCAN_URL.base,    chip: { fg: '#4F8EFF', bg: 'rgba(0,82,255,0.10)',  bd: 'rgba(79,142,255,0.25)' } },
            { chain: 'Polygon', addr: polygonAddr, explorer: SCAN_URL.polygon, chip: { fg: '#A855F7', bg: 'rgba(130,71,229,0.10)', bd: 'rgba(168,85,247,0.25)' } },
          ].map(row => row.addr ? (
            <a
              key={row.chain}
              href={`${row.explorer}/${row.addr}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                color: textPrimary,
                textDecoration: 'none',
                borderBottom: `1px solid ${border}`,
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                background: row.chip.bg, color: row.chip.fg,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '3px 7px', border: `1px solid ${row.chip.bd}`,
                flexShrink: 0,
              }}>{row.chain}</span>
              <code style={{
                fontFamily: 'monospace', fontSize: 11, color: textSecondary,
                flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {row.addr.slice(0, 8)}…{row.addr.slice(-6)}
              </code>
              <span style={{ color: '#F2B705', fontSize: 12, fontWeight: 600 }}>↗</span>
            </a>
          ) : null)}

          <div style={{
            padding: '8px 12px',
            fontSize: 10, color: textSecondary,
            borderTop: `1px solid ${border}`,
            fontStyle: 'italic',
          }}>
            Opens in a new tab on the block explorer.
          </div>
        </div>
      )}
    </div>
  );
}
