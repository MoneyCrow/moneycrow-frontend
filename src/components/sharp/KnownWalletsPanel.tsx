import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import type { PublicClient } from 'viem';
import { base, polygon } from 'viem/chains';
import { useTheme } from '../../context/ThemeContext';
import { SharpCard } from './SharpCard';
import { WalletSnapshot, fetchSnapshotData, type Balance } from './WalletSnapshot';
import { ESCROW_ADDRESS } from '../../contracts/Escrow';
import { DEMO_ADDRESS } from '../../contracts/EscrowDemo';

/**
 * Admin-only panel showing every address that has ever appeared as a
 * depositor or recipient in a Deposited / DemoCreated event on Base or
 * Polygon, plus their public on-chain balances at last scan.
 *
 * On mount it loads cached snapshots from the backend (GET /admin/wallets)
 * — no chain calls. The "Scan now" button does the full chain scan +
 * balance fetch in the browser, then POSTs the result to the backend so
 * the next admin login (or a fresh deploy) starts with the same view
 * instead of an empty list.
 *
 * The data is purely public chain reads; no wallet connection is required
 * to scan, and disconnects on the user's side don't affect anything here.
 */

const DEPOSITED_EVENT = parseAbiItem(
  'event Deposited(address indexed depositor, address indexed recipient, address token, uint256 amount, uint16 feeBps)',
);

const DEMO_CREATED_EVENT = parseAbiItem(
  'event DemoCreated(address indexed depositor, address indexed recipient, address token, uint256 amount)',
);

const DEPLOY_BLOCK: Record<number, bigint> = {
  8453: 44905249n,
  137:  85739901n,
};

const CHUNK_SIZE = 10_000n;

const baseClient    = createPublicClient({ chain: base,    transport: http() }) as PublicClient;
const polygonClient = createPublicClient({ chain: polygon, transport: http() }) as PublicClient;

interface CachedEntry {
  address:       `0x${string}`;
  /** Per-chain balance map keyed by chain id ('ethereum', 'base', 'polygon',
   *  'arbitrum', 'optimism', …). Open-ended on purpose — adding a chain in
   *  WalletSnapshot.tsx doesn't require touching this type. */
  chainBalances: Record<string, Balance[]>;
  /** Chain keys whose RPC call failed during the most recent scan.
   *  Persisted so the cached admin view shows "Unavailable" instead of
   *  ambiguous empty lists. May be undefined for legacy cache entries. */
  chainErrors?:  string[];
  chains:        Array<'base' | 'polygon'>;
  roles:         Array<'depositor' | 'recipient' | 'connected'>;
  scannedAt:     number;
}

/** Convert the raw payload from GET /admin/wallets into a CachedEntry,
 *  bridging the legacy { base, polygon } shape into the new chainBalances
 *  shape so older cached rows keep rendering until next scan. */
function asCachedEntry(raw: Record<string, unknown>): CachedEntry | null {
  if (typeof raw.address !== 'string') return null;
  let chainBalances: Record<string, Balance[]>;
  if (raw.chainBalances && typeof raw.chainBalances === 'object') {
    chainBalances = raw.chainBalances as Record<string, Balance[]>;
  } else {
    chainBalances = {};
    if (Array.isArray(raw.base))    chainBalances.base    = raw.base    as Balance[];
    if (Array.isArray(raw.polygon)) chainBalances.polygon = raw.polygon as Balance[];
  }
  const chainErrors = Array.isArray(raw.chainErrors)
    ? (raw.chainErrors as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  return {
    address:       raw.address as `0x${string}`,
    chainBalances,
    chainErrors,
    chains:        (raw.chains as CachedEntry['chains']) ?? [],
    roles:         (raw.roles  as CachedEntry['roles'])  ?? [],
    scannedAt:     typeof raw.scannedAt === 'number' ? raw.scannedAt : 0,
  };
}

/** Stable sort: depositors first, then alphabetical address.
 *  Used for both the cache-loaded mount path and the post-scan refresh. */
function sortEntries(list: CachedEntry[]): CachedEntry[] {
  return [...list].sort((a, b) => {
    const aDep = a.roles.includes('depositor') ? 0 : 1;
    const bDep = b.roles.includes('depositor') ? 0 : 1;
    if (aDep !== bDep) return aDep - bDep;
    return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
  });
}

async function scanChain(
  client:        PublicClient,
  chainId:       8453 | 137,
  chainKey:      'base' | 'polygon',
  contractAddr:  `0x${string}` | undefined,
  demoAddr:      `0x${string}` | undefined,
  onProgress:    (s: string) => void,
): Promise<Array<{ address: `0x${string}`; role: 'depositor' | 'recipient'; chain: 'base' | 'polygon' }>> {
  if (!contractAddr) return [];
  const fromBlock = DEPLOY_BLOCK[chainId] ?? 0n;
  const toBlock   = await client.getBlockNumber();

  type AnyLog = { args?: { depositor?: `0x${string}`; recipient?: `0x${string}` } };
  const allLogs: AnyLog[] = [];
  let chunkFrom = fromBlock;

  while (chunkFrom <= toBlock) {
    const chunkTo = chunkFrom + CHUNK_SIZE - 1n < toBlock ? chunkFrom + CHUNK_SIZE - 1n : toBlock;

    const dep = await client
      .getLogs({ address: contractAddr, event: DEPOSITED_EVENT, fromBlock: chunkFrom, toBlock: chunkTo })
      .catch(() => [] as unknown[]);
    allLogs.push(...(dep as AnyLog[]));

    if (demoAddr) {
      const demo = await client
        .getLogs({ address: demoAddr, event: DEMO_CREATED_EVENT, fromBlock: chunkFrom, toBlock: chunkTo })
        .catch(() => [] as unknown[]);
      allLogs.push(...(demo as AnyLog[]));
    }

    onProgress(`${chainKey}: scanned through block ${chunkTo}`);
    chunkFrom = chunkTo + 1n;
  }

  const out: Array<{ address: `0x${string}`; role: 'depositor' | 'recipient'; chain: 'base' | 'polygon' }> = [];
  for (const log of allLogs) {
    if (log.args?.depositor) out.push({ address: log.args.depositor, role: 'depositor', chain: chainKey });
    if (log.args?.recipient) out.push({ address: log.args.recipient, role: 'recipient', chain: chainKey });
  }
  return out;
}

export function KnownWalletsPanel() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary  = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';
  const textPrimary   = isDark ? '#FFFFFF' : '#111111';
  const hoverBg       = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';

  const [entries,  setEntries]  = useState<CachedEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error,    setError]    = useState('');
  const [openSet,  setOpenSet]  = useState<Set<string>>(new Set());
  const [loadedCache, setLoadedCache] = useState(false);

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

  // Load persisted cache on mount — no chain calls.
  useEffect(() => {
    fetch(`${apiBase}/admin/wallets`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { ok?: boolean; entries?: Array<Record<string, unknown>> } | null) => {
        if (data?.ok && Array.isArray(data.entries)) {
          const parsed = data.entries
            .map(asCachedEntry)
            .filter((e): e is CachedEntry => e !== null);
          setEntries(sortEntries(parsed));
        }
      })
      .catch(() => { /* fallthrough — empty list, user can scan */ })
      .finally(() => setLoadedCache(true));
  }, [apiBase]);

  const scan = async () => {
    setScanning(true);
    setError('');
    setProgress('');
    try {
      // Step 1 — chain event scan, both chains in parallel.
      const [baseHits, polHits] = await Promise.all([
        scanChain(baseClient,    8453, 'base',    ESCROW_ADDRESS[8453], DEMO_ADDRESS[8453], setProgress),
        scanChain(polygonClient, 137,  'polygon', ESCROW_ADDRESS[137],  DEMO_ADDRESS[137],  setProgress),
      ]);
      const all = [...baseHits, ...polHits];

      // Step 2 — dedupe by lowercased address; merge chain + role sets.
      const map = new Map<string, { address: `0x${string}`; chains: Set<'base' | 'polygon'>; roles: Set<'depositor' | 'recipient'> }>();
      for (const hit of all) {
        const key = hit.address.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.chains.add(hit.chain);
          existing.roles.add(hit.role);
        } else {
          map.set(key, { address: hit.address, chains: new Set([hit.chain]), roles: new Set([hit.role]) });
        }
      }

      // Step 3 — fetch each address's balances in parallel.
      setProgress(`fetching balances for ${map.size} address(es)...`);
      const scannedAt = Date.now();
      const fresh: CachedEntry[] = await Promise.all(
        [...map.values()].map(async (m) => {
          const { chainBalances, chainErrors } = await fetchSnapshotData(m.address);
          return {
            address:       m.address.toLowerCase() as `0x${string}`,
            chainBalances,
            chainErrors:   chainErrors.length > 0 ? chainErrors : undefined,
            chains:        [...m.chains],
            roles:         [...m.roles],
            scannedAt,
          };
        }),
      );

      // Step 4 — POST to backend for persistence. Awaited so we can GET the
      // merged result afterwards; if either call fails we fall back to the
      // freshly-scanned local data.
      try {
        await fetch(`${apiBase}/admin/wallets`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ entries: fresh }),
        });
      } catch { /* ignore — refresh below will fall back to fresh */ }

      // Step 5 — GET fresh server state. Includes every connect-only
      // wallet the tracker has POSTed (which the event scan above wouldn't
      // catch). Without this step those would disappear from the UI on
      // every scan, even though they're still in the DB.
      let merged: CachedEntry[] = fresh;
      try {
        const r = await fetch(`${apiBase}/admin/wallets`);
        if (r.ok) {
          const data = await r.json() as { ok?: boolean; entries?: Array<Record<string, unknown>> };
          if (data?.ok && Array.isArray(data.entries)) {
            merged = data.entries
              .map(asCachedEntry)
              .filter((e): e is CachedEntry => e !== null);
          }
        }
      } catch { /* ignore */ }

      setEntries(sortEntries(merged));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
      setProgress('');
    }
  };

  const toggle = (addr: string) => {
    setOpenSet(prev => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr); else next.add(addr);
      return next;
    });
  };

  const trunc = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

  return (
    <SharpCard>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#F2B705', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Known Wallets</span>
        <span style={{ fontSize: 12, color: textSecondary }}>— public on-chain snapshots, scanned on demand</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            background: scanning ? 'transparent' : '#F2B705',
            border: scanning ? `1px solid ${border}` : 'none',
            color: scanning ? textSecondary : '#000',
            cursor: scanning ? 'wait' : 'pointer',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {scanning ? 'Scanning...' : entries.length === 0 ? 'Scan now' : 'Re-scan'}
        </button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {scanning && (
          <p style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
            {progress || 'Scanning Base and Polygon...'}
          </p>
        )}
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        {!scanning && loadedCache && entries.length === 0 && !error && (
          <p style={{ fontSize: 13, color: textSecondary }}>
            No cached wallets yet — click <b>Scan now</b> to populate from on-chain events.
          </p>
        )}

        {entries.map(entry => {
          const isOpen = openSet.has(entry.address);
          return (
            <div key={entry.address} style={{ borderTop: `1px solid ${border}` }}>
              <button
                type="button"
                onClick={() => toggle(entry.address)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '12px 4px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: textPrimary,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 12, color: textTertiary, width: 14 }}>{isOpen ? '▾' : '▸'}</span>
                <code style={{ fontSize: 13, color: textPrimary, flex: 1 }}>{trunc(entry.address)}</code>
                <span style={{ fontSize: 10, color: textSecondary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {entry.roles.join(' / ')}
                </span>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {entry.chains.includes('base') && (
                    <span style={{ background: 'rgba(0,82,255,0.1)', color: '#4F8EFF', fontSize: 10, fontWeight: 700, padding: '2px 6px', border: '1px solid rgba(79,142,255,0.2)' }}>BASE</span>
                  )}
                  {entry.chains.includes('polygon') && (
                    <span style={{ background: 'rgba(130,71,229,0.1)', color: '#A855F7', fontSize: 10, fontWeight: 700, padding: '2px 6px', border: '1px solid rgba(168,85,247,0.2)' }}>POLY</span>
                  )}
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 0 16px' }}>
                  {/* Pass cached data so the inner panel renders instantly,
                      no live RPC fetch — that's the whole point of caching. */}
                  <WalletSnapshot
                    address={entry.address}
                    cachedData={entry.chainBalances}
                    cachedErrors={entry.chainErrors}
                    cachedAt={entry.scannedAt}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SharpCard>
  );
}
