import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import type { PublicClient } from 'viem';
import { base, polygon } from 'viem/chains';
import { useTheme } from '../../context/ThemeContext';
import { SharpCard } from './SharpCard';
import { WalletSnapshot } from './WalletSnapshot';
import { ESCROW_ADDRESS } from '../../contracts/Escrow';
import { DEMO_ADDRESS } from '../../contracts/EscrowDemo';

/**
 * Admin-only panel: scans the on-chain Deposited and DemoCreated events on
 * both Base and Polygon, dedupes the depositor + recipient addresses, and
 * renders a collapsible row per address. Expanding a row reveals the full
 * <WalletSnapshot> for that address.
 *
 * Data source is purely on-chain (and public) — no signing, no backend.
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

// Cast to PublicClient — see WalletSnapshot.tsx for the same workaround:
// viem's chain-narrow client types reject being passed to a single helper.
const baseClient    = createPublicClient({ chain: base,    transport: http() }) as PublicClient;
const polygonClient = createPublicClient({ chain: polygon, transport: http() }) as PublicClient;

interface AddressEntry {
  address: `0x${string}`;
  chains:  Set<'base' | 'polygon'>;  // which chain(s) we saw activity on
  roles:   Set<'depositor' | 'recipient'>;
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

    // Two separate queries (Deposited + DemoCreated) — kept apart because
    // viem's getLogs return type is event-specific, so combining them in a
    // single Promise.all confuses the type checker. Cast each to the loose
    // AnyLog shape we actually consume.
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

  const [entries,  setEntries]  = useState<AddressEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error,    setError]    = useState('');
  const [openSet,  setOpenSet]  = useState<Set<string>>(new Set());

  const scan = async () => {
    setScanning(true);
    setError('');
    setProgress('');
    try {
      const [baseHits, polHits] = await Promise.all([
        scanChain(baseClient,    8453, 'base',    ESCROW_ADDRESS[8453], DEMO_ADDRESS[8453], setProgress),
        scanChain(polygonClient, 137,  'polygon', ESCROW_ADDRESS[137],  DEMO_ADDRESS[137],  setProgress),
      ]);
      const all = [...baseHits, ...polHits];

      // Dedupe by lowercased address; merge chain + role sets per entry.
      const map = new Map<string, AddressEntry>();
      for (const hit of all) {
        const key = hit.address.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.chains.add(hit.chain);
          existing.roles.add(hit.role);
        } else {
          map.set(key, {
            address: hit.address,
            chains:  new Set([hit.chain]),
            roles:   new Set([hit.role]),
          });
        }
      }
      // Stable order: depositor-first, then alphabetical address.
      const list = [...map.values()].sort((a, b) => {
        const aDep = a.roles.has('depositor') ? 0 : 1;
        const bDep = b.roles.has('depositor') ? 0 : 1;
        if (aDep !== bDep) return aDep - bDep;
        return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
      });
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  // Auto-scan once on mount.
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <span style={{ fontSize: 12, color: textSecondary }}>— from on-chain Deposited / DemoCreated events</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          style={{
            padding: '5px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            background: 'transparent', border: `1px solid ${border}`, color: textSecondary, cursor: scanning ? 'wait' : 'pointer',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {scanning ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {scanning && entries.length === 0 && (
          <p style={{ fontSize: 13, color: textSecondary }}>Scanning Base and Polygon — {progress || 'starting...'}</p>
        )}
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        {!scanning && entries.length === 0 && !error && (
          <p style={{ fontSize: 13, color: textSecondary }}>No known wallets yet — create a deposit or demo to populate.</p>
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
                  {[...entry.roles].join(' / ')}
                </span>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {entry.chains.has('base') && (
                    <span style={{ background: 'rgba(0,82,255,0.1)', color: '#4F8EFF', fontSize: 10, fontWeight: 700, padding: '2px 6px', border: '1px solid rgba(79,142,255,0.2)' }}>BASE</span>
                  )}
                  {entry.chains.has('polygon') && (
                    <span style={{ background: 'rgba(130,71,229,0.1)', color: '#A855F7', fontSize: 10, fontWeight: 700, padding: '2px 6px', border: '1px solid rgba(168,85,247,0.2)' }}>POLY</span>
                  )}
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 0 16px' }}>
                  <WalletSnapshot address={entry.address} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SharpCard>
  );
}
