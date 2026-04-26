import { useEffect, useState } from 'react';
import { createPublicClient, http, formatUnits, formatEther, erc20Abi } from 'viem';
import type { PublicClient } from 'viem';
import { base, polygon } from 'viem/chains';
import { useTheme } from '../../context/ThemeContext';

/**
 * Public wallet snapshot — reads on-chain balances with no signing required.
 * Designed to make the "what does any site see when you connect?" question
 * tangible: native ETH/POL plus a few headline ERC-20s on Base and Polygon.
 *
 * All fetches go through Promise.allSettled so a single chain or token
 * failing never blocks the rest. Zero balances are filtered out.
 */

type TokenCfg = { symbol: string; address: `0x${string}`; decimals: number };

const BASE_TOKENS: TokenCfg[] = [
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
  // Address from the spec was 39 hex chars (one short); padded to canonical 40-char Base WBTC.
  { symbol: 'WBTC', address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8 },
];

const POLYGON_TOKENS: TokenCfg[] = [
  { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
];

// Singleton clients — module-level so they're shared across every panel
// instance (admin's collapsible list calls many WalletSnapshots at once).
// Cast to the broader PublicClient type so a single helper can accept
// either client; viem's per-chain narrow types reject cross-chain calls.
const baseClient    = createPublicClient({ chain: base,    transport: http() }) as PublicClient;
const polygonClient = createPublicClient({ chain: polygon, transport: http() }) as PublicClient;

export type Balance = { symbol: string; amount: string };

/** Public entry point so other components (e.g. KnownWalletsPanel) can
 *  pre-fetch a full Base + Polygon snapshot for an address without
 *  mounting the visual panel. */
export async function fetchSnapshotData(
  address: `0x${string}`,
): Promise<{ base: Balance[]; polygon: Balance[] }> {
  const [baseRes, polRes] = await Promise.allSettled([
    fetchChainBalances(baseClient,    address, 'ETH', BASE_TOKENS),
    fetchChainBalances(polygonClient, address, 'POL', POLYGON_TOKENS),
  ]);
  return {
    base:    baseRes.status === 'fulfilled' ? baseRes.value : [],
    polygon: polRes.status  === 'fulfilled' ? polRes.value  : [],
  };
}

/** Compact "5m ago" / "23h ago" formatter for a unix-ms timestamp. */
function formatAge(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)    return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)     return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function fetchChainBalances(
  client:       PublicClient,
  address:      `0x${string}`,
  nativeSymbol: 'ETH' | 'POL',
  tokens:       TokenCfg[],
): Promise<Balance[]> {
  const results = await Promise.allSettled([
    client.getBalance({ address }),
    ...tokens.map(t =>
      client.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    ),
  ]);

  const out: Balance[] = [];

  // Native first
  const native = results[0];
  if (native.status === 'fulfilled' && native.value > 0n) {
    out.push({ symbol: nativeSymbol, amount: formatEther(native.value as bigint) });
  }

  // ERC-20s in declared order
  tokens.forEach((t, i) => {
    const r = results[i + 1];
    if (r.status === 'fulfilled') {
      const bal = r.value as bigint;
      if (bal > 0n) out.push({ symbol: t.symbol, amount: formatUnits(bal, t.decimals) });
    }
  });

  return out;
}

interface Props {
  address: `0x${string}`;
  /** Optional pre-fetched snapshot. When provided, skip the live RPC fetch
   *  and render this data immediately — used by the admin panel where
   *  balances were captured at scan time and persisted server-side. */
  cachedData?: { base: Balance[]; polygon: Balance[] };
  /** Optional unix-ms timestamp of when cachedData was captured. Renders
   *  a small "Last scanned: X ago" line when set. */
  cachedAt?: number;
}

export function WalletSnapshot({ address, cachedData, cachedAt }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const textPrimary   = isDark ? '#FFFFFF' : '#111111';
  const textTertiary  = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';
  const skeletonBg    = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  const [snapshot, setSnapshot] = useState<{ base: Balance[]; polygon: Balance[] } | null>(
    cachedData ?? null,
  );

  useEffect(() => {
    // Cached path — render immediately, no RPC fetch.
    if (cachedData) { setSnapshot(cachedData); return; }
    let cancelled = false;
    setSnapshot(null);
    fetchSnapshotData(address).then(s => { if (!cancelled) setSnapshot(s); });
    return () => { cancelled = true; };
  }, [address, cachedData]);

  const loading = snapshot === null;

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: '#F2B705', marginBottom: 8, marginTop: 14,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '6px 0', fontFamily: 'monospace', fontSize: 13,
    color: textPrimary,
    borderBottom: `1px dashed ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
  };

  return (
    <div style={{
      padding: '18px 22px',
      background: isDark ? 'rgba(242,183,5,0.04)' : 'rgba(242,183,5,0.06)',
      border: '1px solid rgba(242,183,5,0.40)',
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#F2B705', marginBottom: 6,
      }}>
        Wallet Snapshot — public on-chain data
      </div>

      <div style={{ fontSize: 11, color: textTertiary, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 4 }}>
        {address}
      </div>

      {cachedAt !== undefined && (
        <div style={{ fontSize: 10, color: textTertiary, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Last scanned: {formatAge(cachedAt)}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 18, marginBottom: 8, background: skeletonBg, animation: 'sharpFadeIn 1s ease infinite alternate' }} />
          ))}
        </div>
      ) : (
        <>
          <div style={sectionLabelStyle}>Base</div>
          {snapshot.base.length === 0 ? (
            <div style={{ fontSize: 12, color: textTertiary, fontStyle: 'italic', padding: '4px 0' }}>(no balances)</div>
          ) : (
            snapshot.base.map(b => (
              <div key={`base-${b.symbol}`} style={rowStyle}>
                <span>{b.symbol}</span>
                <span>{b.amount}</span>
              </div>
            ))
          )}

          <div style={sectionLabelStyle}>Polygon</div>
          {snapshot.polygon.length === 0 ? (
            <div style={{ fontSize: 12, color: textTertiary, fontStyle: 'italic', padding: '4px 0' }}>(no balances)</div>
          ) : (
            snapshot.polygon.map(b => (
              <div key={`pol-${b.symbol}`} style={rowStyle}>
                <span>{b.symbol}</span>
                <span>{b.amount}</span>
              </div>
            ))
          )}
        </>
      )}

      <div style={{
        marginTop: 16, padding: '10px 12px',
        fontSize: 12, color: '#F2B705', lineHeight: 1.5,
        background: 'rgba(242,183,5,0.08)',
        borderLeft: '3px solid #F2B705',
      }}>
        ⚠ This is what any site you visit can read the moment you connect your wallet — no signing required.
      </div>
    </div>
  );
}
