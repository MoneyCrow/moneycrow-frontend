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

function rpcUrlFor(chainKey: 'base' | 'polygon'): string | undefined {
  if (ALCHEMY_KEY) return `https://${alchemySubdomain(chainKey)}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  const env = import.meta.env as Record<string, string | undefined>;
  return chainKey === 'base' ? env.VITE_BASE_RPC_URL : env.VITE_POLYGON_RPC_URL;
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
 * Scan one chain for DemoCreated events where `addr` plays `role`, then
 * read each unique counterparty's current demo struct and return only
 * the entries that match `statusFilter` (or all of them, when omitted).
 *
 * Per-chunk getLogs failures are swallowed individually so a single
 * 429 / 503 / transient timeout doesn't blank an otherwise-good scan.
 * Per-counterparty read failures are similarly tolerated. The caller
 * may wrap the whole thing in a try/catch but partial results are
 * always preferred to no results.
 */
export async function scanChainDemos(
  cfg:  DemoScanChain,
  role: DemoScanRole,
  addr: `0x${string}`,
  opts: DemoScanOptions = {},
): Promise<DemoEntry[]> {
  const demoAddr = getDemoAddress(cfg.chainId);
  if (!demoAddr) return [];

  const deployBlock = DEPLOY_BLOCK[cfg.chainId] ?? 0n;
  const toBlock     = await cfg.client.getBlockNumber();
  const windowStart = opts.scanWindowBlocks !== undefined && toBlock > opts.scanWindowBlocks
    ? toBlock - opts.scanWindowBlocks
    : 0n;
  const fromBlock   = windowStart > deployBlock ? windowStart : deployBlock;

  type Log = { args?: { depositor?: `0x${string}`; recipient?: `0x${string}` } };
  const allLogs: Log[] = [];
  let chunkFrom = fromBlock;
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
    } catch { /* skip this chunk */ }
    chunkFrom = chunkTo + 1n;
  }

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
  return out;
}

/** Convenience: scan all configured chains in parallel. Each chain's
 *  failure is isolated; the result is the union of successful chains. */
export async function scanAllDemos(
  role: DemoScanRole,
  addr: `0x${string}`,
  opts: DemoScanOptions = {},
): Promise<DemoEntry[]> {
  const results = await Promise.all(
    DEMO_SCAN_CHAINS.map(cfg =>
      scanChainDemos(cfg, role, addr, opts).catch(() => [] as DemoEntry[]),
    ),
  );
  return results.flat();
}
