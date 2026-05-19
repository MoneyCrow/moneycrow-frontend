import { useEffect, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { useTheme } from '../../context/ThemeContext';
import { scanAllDemos, type DemoEntry, type DemoScanRole } from '../../lib/demoScan';
import { DEMO_STATUS_LABEL, DEMO_STATUS_VARIANT } from '../../contracts/EscrowDemo';
import { SharpCard } from './SharpCard';
import { SharpPageHeader } from './SharpPageHeader';
import { SharpBadge } from './SharpBadge';

/**
 * "My Demos" page surface. Two sub-tabs:
 *
 *   - Sent to me  → DemoCreated events where recipient == connectedAddr.
 *                   Pending rows show an Accept button (links to the
 *                   existing /demo-accept flow). Accepted / Approved
 *                   rows are read-only history.
 *   - Sent by me  → DemoCreated events where depositor == connectedAddr.
 *                   Cancel button rendered as disabled placeholder for
 *                   the future declineDemo / cancelDemo contract upgrade.
 *
 * Differences from the banner (RecipientDemoBanner.tsx):
 *   - Scans full history (no scanWindowBlocks cap). MyDemos has its own
 *     loading UX so the longer cold scan is acceptable here.
 *   - Shows all statuses (no statusFilter). Banner is "needs your
 *     attention" → Pending only; MyDemos is "your demo history" → all.
 *   - Self-sent demos are KEPT in the "Sent by me" tab so the admin's
 *     skip-acceptance chain shows up where the admin would expect it.
 *
 * Cache:
 *   localStorage `demoScan:<role>:<addr>` with the same 5-min TTL as
 *   the banner. Two cache slots per address (one per role) so navigating
 *   between tabs is instant once warm.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const ETH_ZERO = '0x0000000000000000000000000000000000000000';

/** Token symbol/decimals lookup for the curated assets — duplicated with
 *  the banner for now. Extraction to a shared module is the cleanest move
 *  but adds scope; ~12 lines either way, low maintenance cost. */
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  // Base
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6  },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI',  decimals: 18 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  // Polygon
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6  },
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6  },
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI',  decimals: 18 },
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(role: DemoScanRole, addr: string): string {
  return `demoScan:${role}:${addr.toLowerCase()}`;
}

interface Cached { scannedAt: number; entries: DemoEntry[] }

function loadCache(role: DemoScanRole, addr: string): Cached | null {
  try {
    const raw = localStorage.getItem(cacheKey(role, addr));
    if (!raw) return null;
    return JSON.parse(raw) as Cached;
  } catch { return null; }
}

function saveCache(role: DemoScanRole, addr: string, entries: DemoEntry[]): void {
  try {
    localStorage.setItem(cacheKey(role, addr), JSON.stringify({
      scannedAt: Date.now(),
      entries,
    } satisfies Cached));
  } catch { /* quota or disabled — best-effort */ }
}

function formatAmount(d: DemoEntry): string {
  if (d.token.toLowerCase() === ETH_ZERO) return `${formatEther(BigInt(d.amount))} ETH`;
  const meta = KNOWN_TOKENS[d.token.toLowerCase()];
  if (meta) return `${formatUnits(BigInt(d.amount), meta.decimals)} ${meta.symbol}`;
  return `${formatUnits(BigInt(d.amount), 18)} ${d.token.slice(0, 6)}…`;
}

function formatRelativeAge(createdAtSecs: number): string {
  const secs = Math.floor(Date.now() / 1000) - createdAtSecs;
  if (secs < 60)         return 'just now';
  const m = Math.floor(secs / 60);
  if (m < 60)            return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)            return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)            return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function formatAgeIso(createdAtSecs: number): string {
  return new Date(createdAtSecs * 1000).toISOString();
}

function truncAddr(a: string): string {
  return a.length <= 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** True when the connected wallet is the contract admin. Surfaces the
   *  "try Demo Mode in the Admin section" pointer in the Sent-by-me
   *  empty state. */
  isAdmin: boolean;
}

type Tab = 'received' | 'sent';

export function MyDemosPanel({ isAdmin }: Props) {
  const { address } = useAccount();
  const { theme }   = useTheme();
  const isDark = theme === 'dark';
  const border        = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary  = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';
  const textPrimary   = isDark ? '#FFFFFF' : '#111111';

  const [tab, setTab] = useState<Tab>('received');
  // One entry list per role, kept independently so flipping tabs is
  // instant after each one has been warmed.
  const [received, setReceived] = useState<DemoEntry[] | null>(null);
  const [sent,     setSent]     = useState<DemoEntry[] | null>(null);
  const [scanning, setScanning] = useState<{ received: boolean; sent: boolean }>({ received: false, sent: false });

  // Drive the scan for the active tab, with cache-then-refresh. Both
  // tabs eventually scan independently so opening either one warms its
  // cache without forcing both to run on mount.
  useEffect(() => {
    if (!address) return;
    const role: DemoScanRole = tab === 'received' ? 'recipient' : 'depositor';
    const setEntries = tab === 'received' ? setReceived : setSent;

    const cached = loadCache(role, address);
    if (cached) setEntries(cached.entries);

    const stale = !cached || (Date.now() - cached.scannedAt) > CACHE_TTL_MS;
    if (!stale) return;

    setScanning(prev => ({ ...prev, [tab]: true }));
    let cancelled = false;
    (async () => {
      const entries = await scanAllDemos(role, address, {
        // No scanWindowBlocks — MyDemos shows full history, which is the
        // point of having a dedicated tab. The chunked Alchemy scan
        // takes ~4 min worst-case on a cold cache; the loading state
        // below tells the user what's happening.
        // No statusFilter — all statuses (Pending / Accepted / Approved)
        // surface here.
      });
      if (cancelled) return;
      // Sort newest-first.
      const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
      setEntries(sorted);
      saveCache(role, address, sorted);
      setScanning(prev => ({ ...prev, [tab]: false }));
    })();
    return () => { cancelled = true; };
  }, [address, tab]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div>
        <SharpPageHeader title="My Demos" subtitle="Demos you've sent or received." />
        <SharpCard><div className="not-connected">Connect a wallet to see your demos</div></SharpCard>
      </div>
    );
  }

  const activeEntries = tab === 'received' ? received : sent;
  const isLoading     = tab === 'received' ? scanning.received : scanning.sent;

  return (
    <div>
      <SharpPageHeader title="My Demos" subtitle="Demos you've sent or received." />

      {/* Sub-tab toggle. Same visual language as DepositForm's mode
          toggle — yellow active state, neutral inactive, uppercase
          short labels, sharp-touch class for mobile feedback. */}
      <div style={{ display: 'flex', width: 'fit-content', marginBottom: 18, border: `1px solid ${border}`, overflow: 'hidden' }}>
        {(['received', 'sent'] as Tab[]).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              className="sharp-touch"
              onClick={() => setTab(t)}
              style={{
                padding: '8px 20px', border: 'none', cursor: 'pointer',
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                background: active ? '#F2B705' : 'transparent',
                color: active ? '#111111' : textSecondary,
                transition: 'all 0.12s',
              }}
            >
              {t === 'received' ? 'Sent to me' : 'Sent by me'}
            </button>
          );
        })}
      </div>

      <SharpCard>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F2B705', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {tab === 'received' ? 'Sent to me' : 'Sent by me'}
          </span>
          {activeEntries && (
            <span style={{ fontSize: 12, color: textSecondary }}>
              — {activeEntries.length} {activeEntries.length === 1 ? 'demo' : 'demos'}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {isLoading && (
            <span style={{ fontSize: 11, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              scanning…
            </span>
          )}
        </div>

        <DemoRows
          tab={tab}
          entries={activeEntries}
          isLoading={isLoading}
          isAdmin={isAdmin}
          isDark={isDark}
          border={border}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          textTertiary={textTertiary}
        />
      </SharpCard>
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

interface RowsProps {
  tab:           Tab;
  entries:       DemoEntry[] | null;
  isLoading:     boolean;
  isAdmin:       boolean;
  isDark:        boolean;
  border:        string;
  textPrimary:   string;
  textSecondary: string;
  textTertiary:  string;
}

function DemoRows({ tab, entries, isLoading, isAdmin, isDark, border, textPrimary, textSecondary, textTertiary }: RowsProps) {
  const skeletonBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // Cold-cache state (no entries yet, scan in flight) — render skeleton
  // rows so the user has feedback that work is happening, instead of an
  // empty card. Once at least one warm scan has hydrated the cache, the
  // entries array is non-null and we skip the skeleton on future loads.
  if (entries === null && isLoading) {
    return (
      <div style={{ padding: '16px 20px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 22, marginBottom: 10, background: skeletonBg, animation: 'sharpFadeIn 1s ease infinite alternate' }} />
        ))}
        <p style={{ fontSize: 12, color: textTertiary, fontStyle: 'italic', marginTop: 4 }}>
          Walking the chain history — may take up to 4 minutes on first load.
        </p>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    // Empty state copy is tab-specific. The admin-pointer on Sent-by-me
    // is gated on isAdmin so non-admin users don't see a hint to use
    // an admin-only surface.
    return (
      <div style={{ padding: '20px', fontSize: 13, color: textSecondary, fontStyle: 'italic' }}>
        {tab === 'received'
          ? 'No demos sent to you yet.'
          : isAdmin
            ? <>You haven't sent any demos yet — try <strong style={{ color: textPrimary, fontStyle: 'normal' }}>Demo Mode</strong> in the Admin section.</>
            : 'You haven\'t sent any demos yet.'}
      </div>
    );
  }

  return (
    <div>
      {entries.map(d => (
        <DemoRow
          key={`${d.chainId}:${d.depositor.toLowerCase()}`}
          tab={tab}
          demo={d}
          isDark={isDark}
          border={border}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          textTertiary={textTertiary}
        />
      ))}
    </div>
  );
}

// ── Single row ───────────────────────────────────────────────────────────────

interface RowProps {
  tab:           Tab;
  demo:          DemoEntry;
  isDark:        boolean;
  border:        string;
  textPrimary:   string;
  textSecondary: string;
  textTertiary:  string;
}

function DemoRow({ tab, demo, isDark, border, textPrimary, textSecondary, textTertiary }: RowProps) {
  // Counterparty: depositor on the "Sent to me" tab, recipient on
  // "Sent by me". The connected wallet is implicit (it's the other
  // side of the pair) so showing only the counterparty keeps the row
  // visually scannable.
  const counterparty = tab === 'received' ? demo.depositor : demo.recipient;
  const cpLabel      = tab === 'received' ? 'from' : 'to';

  // Action button shape varies by tab + status:
  //   Sent to me, Pending     → "Accept" → links to existing
  //                              /demo-accept route (full EIP-712 flow)
  //   Sent to me, Accepted    → none (waiting on depositor's admin
  //                              approveDemo — passive state for recipient)
  //   Sent to me, Approved    → none (terminal)
  //   Sent by me, any status  → "Cancel" disabled (placeholder for
  //                              future cancelDemo contract upgrade)
  const acceptHref = `?tab=demo-accept&depositor=${demo.depositor}`;

  const rowBg     = isDark ? 'transparent' : 'transparent';
  const hoverBg   = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

  // Inline button styles — separate from SharpButton because the table-
  // row context wants smaller, more compact controls than the dashboard's
  // primary action buttons.
  const buttonBase: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    fontFamily: "'Space Grotesk', sans-serif",
    textDecoration: 'none',
    border: '1px solid',
    cursor: 'pointer',
    background: 'transparent',
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '14px 20px',
        borderBottom: `1px solid ${border}`,
        background: rowBg,
        transition: 'background 0.12s',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
    >
      {/* Counterparty + chain pill */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 220, flex: '1 1 auto' }}>
        <div style={{ fontSize: 12, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {cpLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <code style={{ fontFamily: 'monospace', fontSize: 13, color: textPrimary }}>{truncAddr(counterparty)}</code>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '2px 6px',
            background: demo.chainKey === 'base' ? 'rgba(79,142,255,0.10)' : 'rgba(168,85,247,0.10)',
            color:      demo.chainKey === 'base' ? '#4F8EFF' : '#A855F7',
            border:     `1px solid ${demo.chainKey === 'base' ? 'rgba(79,142,255,0.25)' : 'rgba(168,85,247,0.25)'}`,
          }}>
            {demo.chainKey === 'base' ? 'BASE' : 'POLY'}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 140 }}>
        <div style={{ fontSize: 12, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Amount
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: textPrimary, marginTop: 3 }}>
          {formatAmount(demo)}
        </div>
      </div>

      {/* Age */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
        <div style={{ fontSize: 12, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Age
        </div>
        <div title={formatAgeIso(demo.createdAt)} style={{ fontSize: 13, color: textPrimary, marginTop: 3 }}>
          {formatRelativeAge(demo.createdAt)}
        </div>
      </div>

      {/* Status pill */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 12, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Status
        </div>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SharpBadge status={DEMO_STATUS_VARIANT[demo.status] ?? 'pending'} />
          <span style={{ fontSize: 11, color: textSecondary }}>
            {DEMO_STATUS_LABEL[demo.status] ?? ''}
          </span>
        </div>
      </div>

      {/* Action */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {tab === 'received' && demo.status === 0 && (
          <a
            href={acceptHref}
            style={{
              ...buttonBase,
              background: '#F2B705', color: '#000', borderColor: '#F2B705',
            }}
          >
            Accept
          </a>
        )}
        {tab === 'received' && demo.status !== 0 && (
          <a
            href={acceptHref}
            style={{
              ...buttonBase,
              color: textPrimary,
              borderColor: border,
            }}
          >
            Details
          </a>
        )}
        {tab === 'sent' && (
          <>
            <a
              href={acceptHref}
              style={{
                ...buttonBase,
                color: textPrimary,
                borderColor: border,
              }}
            >
              Details
            </a>
            <span title="Cancel requires a contract upgrade" style={{ display: 'inline-block', cursor: 'not-allowed' }}>
              <button
                type="button"
                disabled
                style={{
                  ...buttonBase,
                  color: textSecondary,
                  borderColor: border,
                  opacity: 0.5,
                  cursor: 'not-allowed',
                }}
              >
                Cancel
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
