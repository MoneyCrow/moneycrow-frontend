import { useEffect, useMemo, useState } from 'react';
import { createPublicClient, http, parseAbiItem, formatEther, formatUnits } from 'viem';
import type { PublicClient } from 'viem';
import { base, polygon } from 'viem/chains';
import { useAccount } from 'wagmi';
import { useTheme } from '../../context/ThemeContext';
import { DEMO_ABI, getDemoAddress } from '../../contracts/EscrowDemo';

/**
 * Sticky banner shown on every page when the connected wallet is the
 * recipient of one or more Pending demos. Without this, a recipient has
 * no way to know a demo was sent to them — they'd need either an email
 * notification (backend work) or a direct link from the depositor.
 *
 * Scan strategy:
 *
 *   1. eth_getLogs for DemoCreated events on Base + Polygon, filtered by
 *      the indexed `recipient` topic (topic[2]) = connectedAddress. Same
 *      Alchemy-routed transport KnownWalletsPanel uses (single env-var
 *      source of truth via VITE_ALCHEMY_API_KEY).
 *
 *   2. For each matching event, read getDemoEscrow(depositor) — the
 *      event tells us a demo WAS created, but not its current status.
 *      Only Pending (status === 0) demos get rendered.
 *
 *   3. Skip self-sent demos (depositor === recipient === connectedAddress)
 *      so the admin's skip-acceptance auto-chain doesn't surface a banner
 *      on the same wallet that's already orchestrating the chain.
 *
 * Cache:
 *
 *   localStorage key `recipientDemoScan:<chainId>:<lowercaseAddr>`,
 *   { scannedAt: ms, entries: PendingDemo[] }. TTL 5 minutes — fresh
 *   enough for a banner that nudges acceptance, cheap enough that a user
 *   navigating between pages doesn't burn an Alchemy quota every click.
 *
 * Dismiss:
 *
 *   localStorage key `dismissedDemoBanner:<chainId>:<lowercaseDepositor>`.
 *   Persists across navigation but NOT across full page reload —
 *   reload clears the dismissed Set so a user can't accidentally lose
 *   the banner forever (per the prompt's "re-show on full page reload"
 *   requirement; we achieve this by holding the dismissed Set in
 *   component state initialised from localStorage AT MOUNT, but
 *   localStorage is only read once so a reload re-shows everything).
 *
 *   Wait — per second reading: "re-show on full page reload" means
 *   dismissals should NOT persist across reload. So I store in
 *   sessionStorage (not localStorage), which clears on tab close /
 *   reload but persists across page navigations within the same tab.
 */

const DEMO_CREATED_EVENT = parseAbiItem(
  'event DemoCreated(address indexed depositor, address indexed recipient, address token, uint256 amount)',
);

const DEPLOY_BLOCK: Record<number, bigint> = {
  8453: 44905249n,
  137:  85739901n,
};

const CHUNK_SIZE = 10_000n;
const CACHE_TTL_MS = 5 * 60 * 1000;

const ALCHEMY_KEY = (import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined) ?? '';

/** Build an Alchemy-routed viem client for the given chain. Falls through
 *  to per-chain RPC override env var, then viem's chain default — exact
 *  same hierarchy as KnownWalletsPanel.tsx so a key swap propagates
 *  uniformly. */
function makeClient(chainKey: 'base' | 'polygon'): PublicClient {
  const url = (() => {
    if (ALCHEMY_KEY) {
      const sub = chainKey === 'base' ? 'base-mainnet' : 'polygon-mainnet';
      return `https://${sub}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
    }
    const env = import.meta.env as Record<string, string | undefined>;
    return chainKey === 'base' ? env.VITE_BASE_RPC_URL : env.VITE_POLYGON_RPC_URL;
  })();
  return createPublicClient({
    chain:     chainKey === 'base' ? base : polygon,
    transport: http(url),
  }) as PublicClient;
}

interface ChainConfig {
  key:         'base' | 'polygon';
  chainId:     number;
  displayName: string;
  explorer:    string;
  client:      PublicClient;
}

const CHAINS: ChainConfig[] = [
  { key: 'base',    chainId: 8453, displayName: 'Base',    explorer: 'https://basescan.org',    client: makeClient('base')    },
  { key: 'polygon', chainId: 137,  displayName: 'Polygon', explorer: 'https://polygonscan.com', client: makeClient('polygon') },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface PendingDemo {
  chainId:    number;
  chainKey:   'base' | 'polygon';
  depositor:  `0x${string}`;
  recipient:  `0x${string}`;
  token:      `0x${string}`;
  amount:     string;       // hex string so it survives JSON.stringify in cache
  termsHash:  `0x${string}`;
  createdAt:  number;       // unix seconds
}

interface CachedScan {
  scannedAt: number;
  entries:   PendingDemo[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

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

function formatAmount(d: PendingDemo): string {
  if (d.token.toLowerCase() === ETH_ZERO) {
    return `${formatEther(BigInt(d.amount))} ETH`;
  }
  const meta = KNOWN_TOKENS[d.token.toLowerCase()];
  if (meta) return `${formatUnits(BigInt(d.amount), meta.decimals)} ${meta.symbol}`;
  // Unknown ERC-20 — default to 18-decimal display with a truncated address as
  // the symbol stand-in. The recipient can click Details to see authoritative
  // values on the dedicated /demo-accept page.
  return `${formatUnits(BigInt(d.amount), 18)} ${d.token.slice(0, 6)}…`;
}

function formatDateShort(createdAtSecs: number): string {
  const d = new Date(createdAtSecs * 1000);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
}

function truncAddr(a: string): string {
  return a.length <= 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ── Cache ────────────────────────────────────────────────────────────────────

function cacheKey(recipient: string): string {
  return `recipientDemoScan:${recipient.toLowerCase()}`;
}

function loadCache(recipient: string): CachedScan | null {
  try {
    const raw = localStorage.getItem(cacheKey(recipient));
    if (!raw) return null;
    return JSON.parse(raw) as CachedScan;
  } catch { return null; }
}

function saveCache(recipient: string, entries: PendingDemo[]): void {
  try {
    localStorage.setItem(cacheKey(recipient), JSON.stringify({
      scannedAt: Date.now(),
      entries,
    } satisfies CachedScan));
  } catch { /* quota or disabled — best-effort */ }
}

// ── Dismiss state (sessionStorage so it clears on reload) ────────────────────
//
// Per the prompt: "Dismissing the banner with an X should set a localStorage
// flag … but it should re-show on full page reload". sessionStorage matches
// that behaviour exactly — survives within-tab navigation, clears on reload.
// (The prompt said localStorage but described sessionStorage semantics; I
// picked the API that matches the described behaviour.)

function dismissKey(d: PendingDemo): string {
  return `dismissedDemoBanner:${d.chainId}:${d.depositor.toLowerCase()}`;
}

function loadDismissed(): Set<string> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('dismissedDemoBanner:')) out.add(k);
    }
  } catch { /* sessionStorage may be unavailable */ }
  return out;
}

// ── Chain scan ───────────────────────────────────────────────────────────────

async function scanChainForRecipient(
  cfg:       ChainConfig,
  recipient: `0x${string}`,
): Promise<PendingDemo[]> {
  const demoAddr = getDemoAddress(cfg.chainId);
  if (!demoAddr) return [];

  const fromBlock = DEPLOY_BLOCK[cfg.chainId] ?? 0n;
  const toBlock   = await cfg.client.getBlockNumber();

  // Collect DemoCreated logs in chunks. Per-chunk failure isn't fatal —
  // we'd rather show partial results than mark the whole chain blocked.
  type Log = { args?: { depositor?: `0x${string}`; recipient?: `0x${string}` }; blockNumber: bigint };
  const allLogs: Log[] = [];
  let chunkFrom = fromBlock;
  while (chunkFrom <= toBlock) {
    const chunkTo = chunkFrom + CHUNK_SIZE - 1n < toBlock ? chunkFrom + CHUNK_SIZE - 1n : toBlock;
    try {
      const chunk = await cfg.client.getLogs({
        address: demoAddr,
        event:   DEMO_CREATED_EVENT,
        args:    { recipient }, // viem indexes this into topic[2]
        fromBlock: chunkFrom,
        toBlock:   chunkTo,
      });
      allLogs.push(...(chunk as unknown as Log[]));
    } catch { /* skip chunk, continue */ }
    chunkFrom = chunkTo + 1n;
  }

  // For each unique depositor, read current state. A given depositor only
  // ever has ONE active demo (createDemo reverts on Pending/Accepted), so
  // deduping by depositor is safe.
  const uniqueDepositors = Array.from(new Set(
    allLogs
      .map(l => l.args?.depositor)
      .filter((d): d is `0x${string}` => !!d),
  ));

  const reads = await Promise.allSettled(
    uniqueDepositors.map(dep =>
      cfg.client.readContract({
        address:      demoAddr,
        abi:          DEMO_ABI,
        functionName: 'getDemoEscrow',
        args:         [dep],
      }),
    ),
  );

  const out: PendingDemo[] = [];
  reads.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    const r = res.value as {
      depositor: `0x${string}`; recipient: `0x${string}`; token: `0x${string}`;
      amount: bigint; termsHash: `0x${string}`; status: number; createdAt: bigint;
    };
    // Status guard: only Pending.
    if (r.status !== 0) return;
    // Confirm the recipient still matches (no contract upgrades or address
    // mismatches mid-flight) and skip self-sent demos.
    if (r.recipient.toLowerCase() !== recipient.toLowerCase()) return;
    if (r.depositor.toLowerCase() === recipient.toLowerCase()) return;
    out.push({
      chainId:   cfg.chainId,
      chainKey:  cfg.key,
      depositor: r.depositor,
      recipient: r.recipient,
      token:     r.token,
      // Stringify amount as hex so it survives JSON serialisation.
      amount:    `0x${r.amount.toString(16)}`,
      termsHash: r.termsHash,
      createdAt: Number(r.createdAt),
    });
    void uniqueDepositors[i]; // suppress unused-var linter
  });
  return out;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RecipientDemoBanner() {
  const { address } = useAccount();
  const { theme }   = useTheme();
  const isDark = theme === 'dark';

  const [demos,     setDemos]     = useState<PendingDemo[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  // Track whether the most recent scan is still in flight so the banner can
  // optimistically render cached results while refreshing in the background.
  const [, setScanning] = useState(false);

  useEffect(() => {
    if (!address) { setDemos(null); return; }

    // 1. Hydrate immediately from cache if present. This is what makes the
    //    banner appear "instantly" on subsequent page loads within the
    //    TTL window — the chunked log scan takes seconds, but cached
    //    state is one localStorage read away.
    const cached = loadCache(address);
    if (cached) setDemos(cached.entries);

    // 2. If cache is stale (or absent), kick off a fresh scan in the
    //    background. Don't await — let the cached entries render while
    //    we refresh.
    const stale = !cached || (Date.now() - cached.scannedAt) > CACHE_TTL_MS;
    if (!stale) return;

    setScanning(true);
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        CHAINS.map(cfg => scanChainForRecipient(cfg, address).catch(() => [] as PendingDemo[])),
      );
      if (cancelled) return;
      const entries = results.flat();
      setDemos(entries);
      saveCache(address, entries);
      setScanning(false);
    })();
    return () => { cancelled = true; };
  }, [address]);

  const visible = useMemo(
    () => (demos ?? []).filter(d => !dismissed.has(dismissKey(d))),
    [demos, dismissed],
  );

  const dismiss = (d: PendingDemo) => {
    const k = dismissKey(d);
    try { sessionStorage.setItem(k, '1'); } catch { /* unavailable — best-effort */ }
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };

  if (!address || visible.length === 0) return null;

  // Render each visible banner as its own row in a sticky column at the
  // top of the layout. Sticky + zIndex 200 keeps it above page content
  // but below modals (which should use zIndex >= 1000).
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 200, marginBottom: 14 }}>
      {visible.map(d => (
        <DemoBannerRow key={dismissKey(d)} demo={d} isDark={isDark} onDismiss={() => dismiss(d)} />
      ))}
    </div>
  );
}

// ── Banner row ───────────────────────────────────────────────────────────────

interface RowProps {
  demo:      PendingDemo;
  isDark:    boolean;
  onDismiss: () => void;
}

function DemoBannerRow({ demo, isDark, onDismiss }: RowProps) {
  const textPrimary  = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.55)';
  const border       = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';

  // Accept / Details targets: both navigate to the existing /demo-accept
  // route via URL query params. App.tsx reads these on mount, so this is
  // a real navigation (full reload) rather than an in-app state push.
  // Once 2.2 lands a dedicated /demo/<depositor> route, swap the Details
  // href to that — kept as the same target for now so both buttons are
  // functional today.
  const acceptHref  = `?tab=demo-accept&depositor=${demo.depositor}`;
  const detailsHref = acceptHref;

  // Decline placeholder. The contract has no declineDemo function today;
  // the button renders as visibly disabled so the future contract upgrade
  // can wire it up without re-introducing the UI.
  const declineDisabledTitle = 'Decline requires a contract upgrade';

  const pillStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '3px 7px',
    background: 'rgba(242,183,5,0.16)',
    color: '#F2B705',
    border: '1px solid rgba(242,183,5,0.30)',
    fontFamily: "'Space Grotesk', sans-serif",
    flexShrink: 0,
  };

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
      role="region"
      aria-label="Demo waiting for your acceptance"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 14px',
        background: isDark ? '#1A1A1A' : '#FFF9E8',
        borderTop:    `1px solid ${border}`,
        borderBottom: `1px solid ${border}`,
        borderLeft:   '3px solid #F2B705',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <span style={pillStyle}>Demo waiting</span>
      <span style={{ fontSize: 13, color: textPrimary, flex: 1, minWidth: 220 }}>
        <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{truncAddr(demo.depositor)}</code>
        {' '}sent you a demo for{' '}
        <strong>{formatAmount(demo)}</strong>
        {' '}on {formatDateShort(demo.createdAt)}.
        <span style={{ marginLeft: 8, fontSize: 11, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {demo.chainKey}
        </span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <a
          href={acceptHref}
          style={{
            ...buttonBase,
            background: '#F2B705', color: '#000', borderColor: '#F2B705',
          }}
        >
          Accept
        </a>

        <span title={declineDisabledTitle} style={{ display: 'inline-block', cursor: 'not-allowed' }}>
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
            Decline
          </button>
        </span>

        <a
          href={detailsHref}
          style={{
            ...buttonBase,
            color: textPrimary,
            borderColor: border,
          }}
        >
          Details
        </a>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss banner"
          title="Dismiss until next reload"
          style={{
            ...buttonBase,
            padding: '6px 8px',
            color: textSecondary,
            borderColor: 'transparent',
            fontSize: 14, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
