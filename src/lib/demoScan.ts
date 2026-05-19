import { createPublicClient, http, parseAbiItem } from 'viem';
import type { PublicClient } from 'viem';
import { base, polygon } from 'viem/chains';
import { DEMO_ABI, getDemoAddress } from '../contracts/EscrowDemo';

/**
 * Shared chunked log-scanner for MoneyCrowDemo events.
 *
 * Both RecipientDemoBanner (banner shown on every page when the
 * connected wallet has incoming Pending demos) and MyDemosPanel (the
 * dedicated tab listing both sent + received demos) need to walk the
 * same DemoCreated event stream. Keeping this in a shared lib means:
 *
 *   - One source of truth for the chunked Alchemy fetch pattern.
 *   - One env-var lookup for the Alchemy key + per-chain RPC override
 *     (matches the pattern WalletSnapshot.tsx and KnownWalletsPanel.tsx
 *     already use — VITE_ALCHEMY_API_KEY → per-chain Alchemy URL →
 *     VITE_*_RPC_URL override → viem chain default).
 *   - Per-caller knobs (scanWindowBlocks for the banner's 30-day cap;
 *     statusFilter so the banner can show only Pending while MyDemos
 *     can show all statuses).
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const DEMO_CREATED_EVENT = parseAbiItem(
  'event DemoCreated(address indexed depositor, address indexed recipient, address token, uint256 amount)',
);

const DEPLOY_BLOCK: Record<number, bigint> = {
  8453: 44905249n,
  137:  85739901n,
};

const CHUNK_SIZE = 10_000n;
const ALCHEMY_KEY = (import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined) ?? '';

// ── Per-chain client construction ────────────────────────────────────────────

function alchemySubdomain(chainKey: 'base' | 'polygon'): string {
  return chainKey === 'base' ? 'base-mainnet' : 'polygon-mainnet';
}

/**
 * Pick the RPC URL the chunked log-scanner should use, in this priority:
 *
 *   1. VITE_BASE_RPC_URL / VITE_POLYGON_RPC_URL — explicit override.
 *      Wins over Alchemy because eth_getLogs is a standard JSON-RPC
 *      method that any provider handles, and Alchemy's free tier caps
 *      it at a 10-block range per request. The codebase chunks at
 *      10_000 blocks, so on free-tier Alchemy every chunk gets a -32600
 *      and the scan silently returns 0 logs. Letting an operator drop
 *      in a publicnode / Ankr / paid-Alchemy URL via env var is the
 *      escape hatch from that cap.
 *
 *   2. VITE_ALCHEMY_API_KEY → Alchemy enhanced API URL. Still the
 *      default when no per-chain override is set, because most
 *      deployments already have it for the WalletSnapshot enhanced-API
 *      path and reusing one key keeps the env surface small.
 *
 *   3. Undefined → viem's chain-default RPC (rate-limited public node).
 *      Last-resort fallback so a misconfigured environment doesn't
 *      throw on the createPublicClient call.
 *
 * WalletSnapshot's curated-token viem path uses its OWN envRpcUrl
 * helper (intentionally different — it shouldn't override the enhanced
 * API path, since publicnode doesn't have an equivalent for
 * alchemy_getTokenBalances). Don't unify these without thinking it
 * through.
 */
function rpcUrlFor(chainKey: 'base' | 'polygon'): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  const override = chainKey === 'base' ? env.VITE_BASE_RPC_URL : env.VITE_POLYGON_RPC_URL;
  if (override) return override;
  if (ALCHEMY_KEY) return `https://${alchemySubdomain(chainKey)}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  return undefined;
}

function makeClient(chainKey: 'base' | 'polygon'): PublicClient {
  return createPublicClient({
    chain:     chainKey === 'base' ? base : polygon,
    transport: http(rpcUrlFor(chainKey)),
  }) as PublicClient;
}

// ── Chain registry ──────────────────────────────────────────────────────────

export interface DemoScanChain {
  key:         'base' | 'polygon';
  chainId:     number;
  displayName: string;
  explorer:    string;
  client:      PublicClient;
}

export const DEMO_SCAN_CHAINS: DemoScanChain[] = [
  { key: 'base',    chainId: 8453, displayName: 'Base',    explorer: 'https://basescan.org',    client: makeClient('base')    },
  { key: 'polygon', chainId: 137,  displayName: 'Polygon', explorer: 'https://polygonscan.com', client: makeClient('polygon') },
];

// ── Public types ────────────────────────────────────────────────────────────

/** Status enum mirrors the contract: 0=Pending, 1=Accepted, 2=Approved. */
export type DemoStatus = 0 | 1 | 2;

export interface DemoEntry {
  chainId:    number;
  chainKey:   'base' | 'polygon';
  depositor:  `0x${string}`;
  recipient:  `0x${string}`;
  token:      `0x${string}`;
  /** Hex string so the value survives JSON.stringify (BigInt doesn't). */
  amount:     string;
  termsHash:  `0x${string}`;
  status:     DemoStatus;
  createdAt:  number;   // unix seconds
}

export type DemoScanRole = 'depositor' | 'recipient';

export interface DemoScanOptions {
  /** Cap how far back to scan. When omitted, scans from the contract's
   *  deploy block. Used by the recipient banner to keep cold-start to
   *  ~20s instead of ~4 min. MyDemos passes no cap and pays the longer
   *  scan in exchange for full history. */
  scanWindowBlocks?: bigint;
  /** Keep only entries whose status is in this set. When omitted, all
   *  statuses (Pending + Accepted + Approved) are returned. */
  statusFilter?:    ReadonlySet<DemoStatus>;
}

// ── Scan ────────────────────────────────────────────────────────────────────

/**
 * Per-chain result of a demo scan. `failed` is true when every chunk
 * of the getLogs sweep was rejected by the RPC — typically Alchemy's
 * free-tier 10-block-range limit on a chunk size larger than that, or
 * a 429 burst. Lets the UI flag the chain as Unavailable rather than
 * silently showing "0 demos" (which is indistinguishable from genuine
 * absence of activity).
 */
export interface DemoScanChainResult {
  entries: DemoEntry[];
  failed:  boolean;
}

/** Multi-chain result. `chainErrors` mirrors WalletSnapshot's
 *  SnapshotResult shape — list of chain keys whose scan failed
 *  completely. Empty entries[] + non-empty chainErrors means the
 *  scan couldn't run; non-empty entries[] + non-empty chainErrors
 *  means partial-success (some chains worked, others failed). */
export interface DemoScanAllResult {
  entries:     DemoEntry[];
  chainErrors: Array<DemoScanChain['key']>;
}

/**
 * Scan one chain for DemoCreated events where `addr` plays `role`, then
 * read each unique counterparty's current demo struct and return only
 * the entries that match `statusFilter` (or all of them, when omitted).
 *
 * Per-chunk getLogs failures are reported via console.warn (not
 * swallowed silently — that's what made the free-tier 10-block-range
 * issue invisible). If EVERY chunk fails, the result's `failed` flag
 * goes true so the UI can surface an Unavailable pill instead of an
 * ambiguous empty list. Per-counterparty read failures stay tolerated
 * inside the read loop — one stale token's metadata shouldn't take
 * down the whole chain.
 */
export async function scanChainDemos(
  cfg:  DemoScanChain,
  role: DemoScanRole,
  addr: `0x${string}`,
  opts: DemoScanOptions = {},
): Promise<DemoScanChainResult> {
  const demoAddr = getDemoAddress(cfg.chainId);
  if (!demoAddr) return { entries: [], failed: false };

  const deployBlock = DEPLOY_BLOCK[cfg.chainId] ?? 0n;
  let toBlock: bigint;
  try {
    toBlock = await cfg.client.getBlockNumber();
  } catch (err) {
    // Even the head-block lookup failed — RPC is unreachable. Surface
    // and mark the chain failed; no point trying chunks.
    console.warn(`[demoScan] [${cfg.displayName}] getBlockNumber failed: ${err instanceof Error ? err.message : String(err)}`);
    return { entries: [], failed: true };
  }
  const windowStart = opts.scanWindowBlocks !== undefined && toBlock > opts.scanWindowBlocks
    ? toBlock - opts.scanWindowBlocks
    : 0n;
  const fromBlock   = windowStart > deployBlock ? windowStart : deployBlock;

  type Log = { args?: { depositor?: `0x${string}`; recipient?: `0x${string}` } };
  const allLogs: Log[] = [];
  let chunkFrom    = fromBlock;
  let chunksOk     = 0;
  let chunksFailed = 0;
  let firstError: string | null = null;  // log only the first per chain to avoid console spam
  while (chunkFrom <= toBlock) {
    const chunkTo = chunkFrom + CHUNK_SIZE - 1n < toBlock ? chunkFrom + CHUNK_SIZE - 1n : toBlock;
    try {
      // viem's `args` shortcut indexes the address into the matching
      // topic slot (depositor → topic[1], recipient → topic[2]) so the
      // filter happens server-side on Alchemy.
      const filter = role === 'depositor'
        ? { depositor: addr }
        : { recipient: addr };
      const chunk = await cfg.client.getLogs({
        address: demoAddr,
        event:   DEMO_CREATED_EVENT,
        args:    filter,
        fromBlock: chunkFrom,
        toBlock:   chunkTo,
      });
      allLogs.push(...(chunk as unknown as Log[]));
      chunksOk++;
    } catch (err) {
      chunksFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      // Surface the first failure inline so a free-tier / rate-limit
      // root cause appears in DevTools immediately. Subsequent identical
      // failures stay quiet — a 100-chunk Alchemy 403 storm would
      // otherwise drown the console.
      if (firstError === null) {
        firstError = msg;
        console.warn(`[demoScan] [${cfg.displayName}] eth_getLogs chunk ${chunkFrom}-${chunkTo} failed: ${msg.slice(0, 240)}`);
      }
    }
    chunkFrom = chunkTo + 1n;
  }
  if (chunksFailed > 1) {
    console.warn(`[demoScan] [${cfg.displayName}] ${chunksFailed} chunks failed total (${chunksOk} succeeded). First error above.`);
  }
  // Chain is "failed" only when nothing succeeded AND at least one
  // chunk error happened. Empty window with no failures = real "no
  // logs in this range", not an Unavailable state.
  const failed = chunksOk === 0 && chunksFailed > 0;

  // Dedupe by the counterparty whose address keys the contract's
  // storage — depositor. A given depositor only ever has ONE active
  // demo (createDemo reverts on Pending/Accepted), so we read each
  // depositor's struct once regardless of how many DemoCreated events
  // their wallet is in.
  const uniqueDepositors = Array.from(new Set(
    allLogs.map(l => l.args?.depositor).filter((d): d is `0x${string}` => !!d),
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

  const out: DemoEntry[] = [];
  reads.forEach((res) => {
    if (res.status !== 'fulfilled') return;
    const r = res.value as {
      depositor: `0x${string}`; recipient: `0x${string}`; token: `0x${string}`;
      amount: bigint; termsHash: `0x${string}`; status: number; createdAt: bigint;
    };

    // Validate the role-membership invariant. A DemoCreated event for
    // (dep, rec) is permanent, but the current demo struct at that
    // depositor key could in principle have been replaced by a later
    // demo (which the contract today disallows for non-Approved states,
    // but defending against future contract changes is cheap).
    if (role === 'depositor' && r.depositor.toLowerCase() !== addr.toLowerCase()) return;
    if (role === 'recipient' && r.recipient.toLowerCase() !== addr.toLowerCase()) return;

    const status = r.status as DemoStatus;
    if (opts.statusFilter && !opts.statusFilter.has(status)) return;

    out.push({
      chainId:   cfg.chainId,
      chainKey:  cfg.key,
      depositor: r.depositor,
      recipient: r.recipient,
      token:     r.token,
      amount:    `0x${r.amount.toString(16)}`,
      termsHash: r.termsHash,
      status,
      createdAt: Number(r.createdAt),
    });
  });
  return { entries: out, failed };
}

/** Scan all configured chains in parallel. Per-chain failures are
 *  isolated and reported back via `chainErrors`; the entries field
 *  contains everything that came back successfully (which may be empty
 *  if every chain failed). Mirrors WalletSnapshot's SnapshotResult
 *  shape so the consumer UI can render an Unavailable pill the same
 *  way it does for wallet-balance lookups. */
export async function scanAllDemos(
  role: DemoScanRole,
  addr: `0x${string}`,
  opts: DemoScanOptions = {},
): Promise<DemoScanAllResult> {
  const results = await Promise.all(
    DEMO_SCAN_CHAINS.map(cfg =>
      scanChainDemos(cfg, role, addr, opts).catch(err => {
        // scanChainDemos already catches its own internal errors. If we
        // land here it's a programming error (unhandled throw from a
        // hook reorganisation, etc.) — surface it, mark failed so the
        // chain shows Unavailable, return empty entries.
        console.warn(`[demoScan] [${cfg.displayName}] unexpected throw: ${err instanceof Error ? err.message : String(err)}`);
        return { entries: [], failed: true } satisfies DemoScanChainResult;
      }),
    ),
  );
  return {
    entries:     results.flatMap(r => r.entries),
    chainErrors: DEMO_SCAN_CHAINS.flatMap((cfg, i) => results[i].failed ? [cfg.key] : []),
  };
}
