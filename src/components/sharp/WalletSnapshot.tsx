import { useEffect, useState } from 'react';
import { createPublicClient, http, formatUnits, formatEther, erc20Abi } from 'viem';
import type { PublicClient, Chain } from 'viem';
import { mainnet, base, polygon, arbitrum, optimism } from 'viem/chains';
import { useTheme } from '../../context/ThemeContext';

/**
 * Public wallet snapshot — reads on-chain balances with no signing required.
 *
 * Covers five EVM chains: Ethereum, Base, Polygon, Arbitrum, Optimism.
 * Two fetch paths:
 *
 *   1. Alchemy (preferred). When VITE_ALCHEMY_API_KEY is set, we ask
 *      Alchemy's enhanced API for every ERC-20 the wallet actually holds
 *      on each chain, plus its native balance. Spam-looking tokens are
 *      filtered out before display.
 *
 *   2. Curated (fallback). When no key is set, we read a hand-picked
 *      list of common tokens via plain viem publicClient calls. Less
 *      coverage but works without any third-party account.
 *
 * Both paths produce the same Record<chainKey, Balance[]> shape, where
 * each chain's list is sorted native-first then alphabetical with zero
 * balances stripped.
 */

export type Balance  = { symbol: string; amount: string };
type TokenCfg        = { symbol: string; address: `0x${string}`; decimals: number };
export type ChainKey = 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism';

interface ChainConfig {
  key:              ChainKey;
  displayName:      string;
  alchemySubdomain: string;
  nativeSymbol:     string;
  viemChain:        Chain;
  curatedTokens:    TokenCfg[];
}

// ── Curated fallback lists — only used when VITE_ALCHEMY_API_KEY is empty.

const ETHEREUM_TOKENS: TokenCfg[] = [
  { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6  },
  { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
  { symbol: 'DAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8  },
  { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
  { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18 },
  { symbol: 'UNI',  address: '0x1f9840a85d5aF5bf1D1762F925BdAdc4201F984', decimals: 18 },
];

const BASE_TOKENS: TokenCfg[] = [
  { symbol: 'WETH',  address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'USDC',  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
  { symbol: 'USDbC', address: '0xd9aAEcCf5e751805B68fdf85f4bbb8C0F1f6d64d', decimals: 6  },
  { symbol: 'USDT',  address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6  },
  { symbol: 'DAI',   address: '0x50c5725949A6F0c72E6C4a641f24049A917DB0Cb', decimals: 18 },
  { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8  },
  // Address in original spec was 39 hex chars; padded to canonical 40-char Base WBTC.
  { symbol: 'WBTC',  address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8  },
  { symbol: 'cbETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
  { symbol: 'AERO',  address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
];

const POLYGON_TOKENS: TokenCfg[] = [
  { symbol: 'WPOL',   address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
  { symbol: 'WETH',   address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
  { symbol: 'USDC',   address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6  },
  { symbol: 'USDC.e', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6  },
  { symbol: 'USDT',   address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6  },
  { symbol: 'DAI',    address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
  { symbol: 'WBTC',   address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8  },
  { symbol: 'LINK',   address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18 },
  { symbol: 'AAVE',   address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18 },
];

const ARBITRUM_TOKENS: TokenCfg[] = [
  { symbol: 'ARB',    address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  { symbol: 'WETH',   address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  { symbol: 'USDC',   address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6  },
  { symbol: 'USDC.e', address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6  },
  { symbol: 'USDT',   address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6  },
  { symbol: 'DAI',    address: '0xDA10009cBd5D07dD0CeCc66161FC93D7c9000da1', decimals: 18 },
  { symbol: 'WBTC',   address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8  },
];

const OPTIMISM_TOKENS: TokenCfg[] = [
  { symbol: 'OP',     address: '0x4200000000000000000000000000000000000042', decimals: 18 },
  { symbol: 'WETH',   address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'USDC',   address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6  },
  { symbol: 'USDC.e', address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals: 6  },
  { symbol: 'USDT',   address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6  },
  { symbol: 'DAI',    address: '0xDA10009cBd5D07dD0CeCc66161FC93D7c9000da1', decimals: 18 },
  { symbol: 'WBTC',   address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8  },
];

// Order here is the order chains render in the UI.
const CHAIN_CONFIGS: ChainConfig[] = [
  { key: 'ethereum', displayName: 'Ethereum', alchemySubdomain: 'eth-mainnet',     nativeSymbol: 'ETH', viemChain: mainnet,  curatedTokens: ETHEREUM_TOKENS },
  { key: 'base',     displayName: 'Base',     alchemySubdomain: 'base-mainnet',    nativeSymbol: 'ETH', viemChain: base,     curatedTokens: BASE_TOKENS     },
  { key: 'polygon',  displayName: 'Polygon',  alchemySubdomain: 'polygon-mainnet', nativeSymbol: 'POL', viemChain: polygon,  curatedTokens: POLYGON_TOKENS  },
  { key: 'arbitrum', displayName: 'Arbitrum', alchemySubdomain: 'arb-mainnet',     nativeSymbol: 'ETH', viemChain: arbitrum, curatedTokens: ARBITRUM_TOKENS },
  { key: 'optimism', displayName: 'Optimism', alchemySubdomain: 'opt-mainnet',     nativeSymbol: 'ETH', viemChain: optimism, curatedTokens: OPTIMISM_TOKENS },
];

// ── Alchemy ──────────────────────────────────────────────────────────────────

const ALCHEMY_KEY: string = (import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined) ?? '';

interface RpcResponse<T> { result?: T; error?: { message: string } }

async function alchemyCall<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) return null;
    const body = await res.json() as RpcResponse<T>;
    return body.result ?? null;
  } catch { return null; }
}

/** Heuristic to drop airdrop/dust spam tokens from the visible list.
 *  Matches the most common patterns: phishing-style names with URLs,
 *  unusually long symbols, or punctuation that real tokens never use. */
const SPAM_SYMBOL_CHARS = ['<', '>', '{', '}', '[', ']', '\\', '/', '`', '"', "'", ' '];
function isLikelySpam(symbol: string, name: string | null | undefined): boolean {
  if (!symbol) return true;
  if (symbol.length > 12) return true;
  for (const ch of SPAM_SYMBOL_CHARS) if (symbol.includes(ch)) return true;
  const t = `${symbol} ${name ?? ''}`.toLowerCase();
  if (/visit |claim |airdrop|reward|bonus|http|www\.|\.com|\.io|\.xyz|\.net|\.org|\.app/.test(t)) return true;
  return false;
}

interface AlchemyTokenBalance  { contractAddress: string; tokenBalance: string }
interface AlchemyMetadata      { decimals: number | null; name: string | null; symbol: string | null }
interface AlchemyTokenBalances { tokenBalances: AlchemyTokenBalance[] }

async function fetchChainBalancesAlchemy(
  url:          string,
  address:      `0x${string}`,
  nativeSymbol: string,
): Promise<Balance[]> {
  const [native, tokens] = await Promise.all([
    alchemyCall<string>(url, 'eth_getBalance', [address, 'latest']),
    alchemyCall<AlchemyTokenBalances>(url, 'alchemy_getTokenBalances', [address, 'erc20']),
  ]);

  const out: Balance[] = [];

  if (native) {
    try {
      const wei = BigInt(native);
      if (wei > 0n) out.push({ symbol: nativeSymbol, amount: formatEther(wei) });
    } catch { /* non-hex result */ }
  }

  const nonZero = (tokens?.tokenBalances ?? []).filter(t => {
    if (!t.tokenBalance) return false;
    try { return BigInt(t.tokenBalance) > 0n; } catch { return false; }
  });

  const metas = await Promise.all(
    nonZero.map(t => alchemyCall<AlchemyMetadata>(url, 'alchemy_getTokenMetadata', [t.contractAddress])),
  );

  metas.forEach((meta, i) => {
    if (!meta || meta.decimals == null || !meta.symbol) return;
    if (isLikelySpam(meta.symbol, meta.name)) return;
    try {
      const raw = BigInt(nonZero[i].tokenBalance);
      out.push({ symbol: meta.symbol, amount: formatUnits(raw, meta.decimals) });
    } catch { /* skip malformed balance */ }
  });

  return sortBalances(out, nativeSymbol);
}

// ── Curated viem fallback ───────────────────────────────────────────────────

// Module-level singleton clients per chain. Cast to PublicClient because
// viem's per-chain narrow client types reject being passed to a single helper.
const VIEM_CLIENTS: Record<ChainKey, PublicClient> = Object.fromEntries(
  CHAIN_CONFIGS.map(cfg => [
    cfg.key,
    createPublicClient({ chain: cfg.viemChain, transport: http() }) as PublicClient,
  ]),
) as Record<ChainKey, PublicClient>;

async function fetchChainBalancesViem(
  client:       PublicClient,
  address:      `0x${string}`,
  nativeSymbol: string,
  tokens:       TokenCfg[],
): Promise<Balance[]> {
  const results = await Promise.allSettled([
    client.getBalance({ address }),
    ...tokens.map(t =>
      client.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    ),
  ]);

  const out: Balance[] = [];

  const native = results[0];
  if (native.status === 'fulfilled' && (native.value as bigint) > 0n) {
    out.push({ symbol: nativeSymbol, amount: formatEther(native.value as bigint) });
  }

  tokens.forEach((t, i) => {
    const r = results[i + 1];
    if (r.status === 'fulfilled') {
      const bal = r.value as bigint;
      if (bal > 0n) out.push({ symbol: t.symbol, amount: formatUnits(bal, t.decimals) });
    }
  });

  return sortBalances(out, nativeSymbol);
}

function sortBalances(list: Balance[], nativeSymbol: string): Balance[] {
  return [...list].sort((a, b) => {
    if (a.symbol === nativeSymbol) return -1;
    if (b.symbol === nativeSymbol) return 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

// ── Public entry point ──────────────────────────────────────────────────────

/** Fetches a full multi-chain snapshot for an address. Picks the Alchemy
 *  "all tokens" path when a key is present, otherwise falls back to the
 *  curated list via viem. Each chain's fetch is independent — one chain
 *  failing never blocks the others. */
export async function fetchSnapshotData(
  address: `0x${string}`,
): Promise<Record<string, Balance[]>> {
  const results = await Promise.all(
    CHAIN_CONFIGS.map(async (cfg): Promise<readonly [ChainKey, Balance[]]> => {
      try {
        if (ALCHEMY_KEY) {
          const url = `https://${cfg.alchemySubdomain}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
          return [cfg.key, await fetchChainBalancesAlchemy(url, address, cfg.nativeSymbol)] as const;
        }
        return [cfg.key, await fetchChainBalancesViem(VIEM_CLIENTS[cfg.key], address, cfg.nativeSymbol, cfg.curatedTokens)] as const;
      } catch {
        return [cfg.key, [] as Balance[]] as const;
      }
    }),
  );
  return Object.fromEntries(results) as Record<string, Balance[]>;
}

// ── Utilities ───────────────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  address: `0x${string}`;
  /** Optional pre-fetched snapshot. When provided, skip the live RPC fetch
   *  and render this data immediately — used by the admin panel where
   *  balances were captured at scan time and persisted server-side. */
  cachedData?: Record<string, Balance[]>;
  /** Optional unix-ms timestamp of when cachedData was captured. Renders
   *  a small "Last scanned: X ago" line when set. */
  cachedAt?: number;
}

export function WalletSnapshot({ address, cachedData, cachedAt }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const textPrimary  = isDark ? '#FFFFFF' : '#111111';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';
  const skeletonBg   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  const [snapshot, setSnapshot] = useState<Record<string, Balance[]> | null>(
    cachedData ?? null,
  );

  useEffect(() => {
    if (cachedData) { setSnapshot(cachedData); return; }
    let cancelled = false;
    setSnapshot(null);
    fetchSnapshotData(address).then(s => { if (!cancelled) setSnapshot(s); });
    return () => { cancelled = true; };
  }, [address, cachedData]);

  const loading = snapshot === null;

  // Chains that actually have balances — empty ones are summarised at the bottom.
  const chainsWithBalances = snapshot
    ? CHAIN_CONFIGS.filter(cfg => (snapshot[cfg.key] ?? []).length > 0)
    : [];
  const emptyChains = snapshot
    ? CHAIN_CONFIGS.filter(cfg => (snapshot[cfg.key] ?? []).length === 0)
    : [];

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
      ) : chainsWithBalances.length === 0 ? (
        <div style={{ ...sectionLabelStyle, color: textTertiary, fontStyle: 'italic' }}>
          (no balances on any of {CHAIN_CONFIGS.length} EVM chains scanned)
        </div>
      ) : (
        <>
          {chainsWithBalances.map(cfg => (
            <div key={cfg.key}>
              <div style={sectionLabelStyle}>{cfg.displayName}</div>
              {(snapshot![cfg.key] ?? []).map(b => (
                <div key={`${cfg.key}-${b.symbol}`} style={rowStyle}>
                  <span>{b.symbol}</span>
                  <span>{b.amount}</span>
                </div>
              ))}
            </div>
          ))}

          {emptyChains.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 11, color: textTertiary, fontStyle: 'italic' }}>
              Empty on: {emptyChains.map(c => c.displayName).join(', ')}
            </div>
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
