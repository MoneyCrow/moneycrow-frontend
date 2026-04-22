import { useState, useEffect, useCallback } from 'react';
import {
  useWriteContract, useReadContract, useAccount,
  useWaitForTransactionReceipt, usePublicClient,
} from 'wagmi';
import { formatEther, formatUnits, parseAbiItem } from 'viem';
import { ESCROW_ABI, getEscrowAddress, STATUS_LABEL, STATUS_VARIANT } from '../contracts/Escrow';
import { DEMO_ABI, DEMO_STATUS_LABEL, DEMO_STATUS_VARIANT, getDemoAddress } from '../contracts/EscrowDemo';
import { Button }                     from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input }                      from '@/components/ui/input';
import { Label }                      from '@/components/ui/label';
import { Badge }                      from '@/components/ui/badge';

// ── Constants ──────────────────────────────────────────────────────────────────

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

/** First block to scan per chain (contract deploy block − buffer). */
const DEPLOY_BLOCK: Record<number, bigint> = {
  8453: 44905249n, // Base mainnet
  137:  85739901n, // Polygon mainnet
};

/**
 * Max blocks per getLogs call.
 * Base mainnet.base.org free tier: 10 000-block hard cap.
 * Polygon publicnode: no documented cap, 10 000 is conservative and safe.
 */
const CHUNK_SIZE = 10_000n;

/**
 * Known ERC-20 tokens per chain — used for display formatting in the list.
 * Keyed by lowercase contract address.
 */
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  // Base mainnet
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6  },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI',  decimals: 18 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  // Polygon mainnet
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6  },
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6  },
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI',  decimals: 18 },
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 },
};

const DEPOSITED_EVENT = parseAbiItem(
  'event Deposited(address indexed depositor, address indexed recipient, address token, uint256 amount, uint16 feeBps, string description, string recipientEmail, string recipientTelegram, string depositorEmail, string depositorTelegram)',
);

// ── Shared helper components ───────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="text-[var(--pink)] text-xs w-44 pr-3 py-2 border-b border-[var(--border)] align-top">
        {label}
      </td>
      <td className="text-[var(--green)] text-xs py-2 border-b border-[var(--border)] break-all">
        {children}
      </td>
    </tr>
  );
}

function ContactCell({ value }: { value: string }) {
  return <span className={value ? 'text-[var(--green)]' : 'text-[var(--muted2)]'}>{value || '// not set'}</span>;
}

// ── Escrow row type ────────────────────────────────────────────────────────────

interface EscrowRow {
  depositor:      `0x${string}`;
  recipient:      `0x${string}`;
  token:          `0x${string}`;
  amount:         bigint;
  status:         number;
  feeBps:         number;
  description:    string;
  createdAt:      bigint;
  acceptDeadline: bigint;
}

// ── EscrowListPanel ───────────────────────────────────────────────────────────

function EscrowListPanel({
  escrowAddr,
  chainId,
  onSelectDepositor,
}: {
  escrowAddr:        `0x${string}`;
  chainId:           number;
  onSelectDepositor: (addr: string) => void;
}) {
  const publicClient = usePublicClient();
  const [rows,         setRows]         = useState<EscrowRow[]>([]);
  const [scanning,     setScanning]     = useState(false);
  const [scanned,      setScanned]      = useState(false);
  const [scanError,    setScanError]    = useState('');
  const [scanProgress, setScanProgress] = useState('');  // e.g. "chunk 3/47"
  const [scanWarnings, setScanWarnings] = useState<string[]>([]); // skipped chunk notes

  const trunc = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const fmtAmt = (r: EscrowRow) => {
    if (r.token.toLowerCase() === ETH_ZERO) {
      return `${formatEther(r.amount)} ETH`;
    }
    const known = KNOWN_TOKENS[r.token.toLowerCase()];
    if (known) {
      return `${formatUnits(r.amount, known.decimals)} ${known.symbol}`;
    }
    // Unknown ERC-20: assume 18 decimals, show truncated address
    return `${formatUnits(r.amount, 18)} (${r.token.slice(0, 8)}…)`;
  };

  const fmtDeadline = (ts: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (ts === 0n) return '// none';
    if (ts < now)  return '⚠ expired';
    const secs = Number(ts - now);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m remaining`;
  };

  const scan = useCallback(async () => {
    if (!publicClient) return;
    setScanning(true);
    setScanError('');
    setScanProgress('');
    setScanWarnings([]);

    try {
      const fromBlock = DEPLOY_BLOCK[chainId] ?? 0n;
      const toBlock   = await publicClient.getBlockNumber();

      // ── Chunked getLogs (10 000 blocks per call) ───────────────────────────
      const totalChunks = Number((toBlock - fromBlock + CHUNK_SIZE) / CHUNK_SIZE);
      const warnings: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allLogs: any[] = [];

      let chunkFrom = fromBlock;
      let chunkIdx  = 0;

      while (chunkFrom <= toBlock) {
        const chunkTo = chunkFrom + CHUNK_SIZE - 1n < toBlock
          ? chunkFrom + CHUNK_SIZE - 1n
          : toBlock;
        chunkIdx++;
        setScanProgress(`chunk ${chunkIdx}/${totalChunks}`);

        try {
          const chunk = await publicClient.getLogs({
            address:   escrowAddr,
            event:     DEPOSITED_EVENT,
            fromBlock: chunkFrom,
            toBlock:   chunkTo,
          });
          allLogs.push(...chunk);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`skipped blocks ${chunkFrom}–${chunkTo}: ${msg}`);
          console.warn(`[admin scan] chunk ${chunkIdx} failed:`, msg);
        }

        chunkFrom = chunkTo + 1n;
      }

      if (warnings.length > 0) setScanWarnings(warnings);

      // ── Deduplicate depositors, capture event amounts ─────────────────────
      // Reverse scan so the first entry in `order` is the earliest deposit.
      // We also capture the amount and token from the Deposited event because
      // getEscrow() returns amount=0 for settled (Released/Refunded) escrows —
      // the event log always carries the original deposited amount.
      const seen = new Set<string>();
      const order: `0x${string}`[] = [];
      const eventAmounts = new Map<string, { amount: bigint; token: `0x${string}` }>();

      for (const log of [...allLogs].reverse()) {
        const args = log.args as {
          depositor?: `0x${string}`;
          amount?:    bigint;
          token?:     `0x${string}`;
        };
        const dep = args.depositor;
        if (!dep) continue;
        const key = dep.toLowerCase();
        // Always record the event amount (first occurrence after reverse = latest deposit)
        if (args.amount !== undefined) {
          eventAmounts.set(key, {
            amount: args.amount,
            token:  args.token ?? (ETH_ZERO as `0x${string}`),
          });
        }
        if (!seen.has(key)) {
          seen.add(key);
          order.unshift(dep);
        }
      }

      // ── Batch-read current on-chain state for every depositor ──────────────
      setScanProgress('reading escrow state…');

      type GetEscrowResult = {
        depositor: `0x${string}`; recipient: `0x${string}`; token: `0x${string}`;
        amount: bigint; createdAt: bigint; status: number | bigint; feeBps: number | bigint;
        description: string; recipientEmail: string; recipientTelegram: string;
        depositorEmail: string; depositorTelegram: string;
        terms: string; acceptDeadline: bigint;
      };

      const escrows = await Promise.all(
        order.map(dep =>
          publicClient.readContract({
            address:      escrowAddr,
            abi:          ESCROW_ABI,
            functionName: 'getEscrow',
            args:         [dep],
          }) as Promise<GetEscrowResult>
        )
      );

      setRows(
        escrows.map((e, i) => {
          const dep      = order[i];
          const evtAmt   = eventAmounts.get(dep.toLowerCase());
          // getEscrow() returns amount=0 for settled escrows; fall back to the
          // Deposited event amount which always reflects the original deposit.
          const amount = e.amount > 0n ? e.amount : (evtAmt?.amount ?? 0n);
          const token  = e.token !== ETH_ZERO ? e.token : (evtAmt?.token ?? e.token);
          return {
            depositor:      dep,
            recipient:      e.recipient,
            token,
            amount,
            status:         Number(e.status),
            feeBps:         Number(e.feeBps),
            description:    e.description,
            createdAt:      e.createdAt,
            acceptDeadline: e.acceptDeadline,
          };
        }),
      );
      setScanned(true);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  }, [publicClient, escrowAddr, chainId]);

  // Auto-scan once on mount (and whenever chain/contract changes)
  useEffect(() => {
    if (publicClient) scan();
  }, [scan]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = rows.filter(r => r.status === 0 || r.status === 1);
  const closed = rows.filter(r => r.status === 2 || r.status === 3);

  const thCls = 'text-left text-[var(--muted)] font-normal pb-1.5 border-b border-[var(--border)] pr-3 text-[11px]';
  const tdCls = 'py-2 pr-3 border-b border-[var(--border)]';

  return (
    <Card>
      <CardHeader dot="cyan">
        <span className="text-[var(--cyan)]">escrow_list</span>
        <span className="text-[var(--muted)]"> — all deposits on-chain</span>
      </CardHeader>
      <CardBody>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <Button size="sm" onClick={scan} disabled={scanning}>
            {scanning ? '> scanning...' : scanned ? '> refresh()' : '> scan()'}
          </Button>
          {scanned && !scanning && (
            <span className="text-[11px] text-[var(--muted2)]">
              // {rows.length} total · {active.length} active · {closed.length} closed
            </span>
          )}
          {scanning && scanProgress && (
            <span className="text-[11px] text-[var(--cyan)] font-mono">
              // {scanProgress}
            </span>
          )}
        </div>

        {scanError && <div className="alert alert-error mb-3">✗ {scanError}</div>}

        {scanWarnings.length > 0 && (
          <div className="mb-3 text-[11px] font-mono" style={{ color: 'var(--orange)' }}>
            {scanWarnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}

        {scanned && rows.length === 0 && !scanning && (
          <p className="text-[var(--muted)] text-xs">// no deposits found in block range</p>
        )}

        {/* ── Active escrows ── */}
        {active.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] text-[var(--muted2)] mb-2 tracking-wider">// ── active_escrows</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs min-w-[620px]">
                <thead>
                  <tr>
                    <th className={thCls}>depositor</th>
                    <th className={thCls}>recipient</th>
                    <th className={thCls}>amount</th>
                    <th className={thCls}>status</th>
                    <th className={thCls}>deadline / note</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(r => (
                    <tr key={r.depositor} className="hover:bg-[var(--surface2)] transition-colors">
                      <td className={tdCls}>
                        <code className="text-[var(--cyan)]" title={r.depositor}>{trunc(r.depositor)}</code>
                      </td>
                      <td className={tdCls}>
                        <code className="text-[var(--muted)]" title={r.recipient}>{trunc(r.recipient)}</code>
                      </td>
                      <td className={`${tdCls} text-[var(--green)]`}>{fmtAmt(r)}</td>
                      <td className={tdCls}>
                        <Badge variant={STATUS_VARIANT[r.status] ?? 'active'}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className={`${tdCls} text-[var(--muted2)]`}>
                        {r.status === 0
                          ? fmtDeadline(r.acceptDeadline)
                          : `"${r.description.slice(0, 28)}${r.description.length > 28 ? '…' : ''}"`
                        }
                      </td>
                      <td className="py-2 border-b border-[var(--border)]">
                        <button
                          onClick={() => onSelectDepositor(r.depositor)}
                          className="text-[11px] text-[var(--cyan)] hover:underline cursor-pointer font-mono whitespace-nowrap"
                        >
                          &gt; select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Closed escrows ── */}
        {closed.length > 0 && (
          <div>
            <p className="text-[11px] text-[var(--muted2)] mb-2 tracking-wider">// ── closed_escrows</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs min-w-[540px]">
                <thead>
                  <tr>
                    <th className={thCls}>depositor</th>
                    <th className={thCls}>recipient</th>
                    <th className={thCls}>amount</th>
                    <th className={thCls}>status</th>
                    <th className={thCls}>description</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(r => (
                    <tr key={r.depositor} className="hover:bg-[var(--surface2)] transition-colors">
                      <td className={tdCls}>
                        <code className="text-[var(--muted2)]" title={r.depositor}>{trunc(r.depositor)}</code>
                      </td>
                      <td className={tdCls}>
                        <code className="text-[var(--muted2)]" title={r.recipient}>{trunc(r.recipient)}</code>
                      </td>
                      <td className={`${tdCls} text-[var(--muted)]`}>{fmtAmt(r)}</td>
                      <td className={tdCls}>
                        <Badge variant={STATUS_VARIANT[r.status] ?? 'active'}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className={`${tdCls} text-[var(--muted2)]`}>
                        &quot;{r.description.slice(0, 36)}{r.description.length > 36 ? '…' : ''}&quot;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </CardBody>
    </Card>
  );
}

// ── DemoPanel ─────────────────────────────────────────────────────────────────

/** Known tokens list for the demo token picker — same chains as DepositForm. */
const DEMO_TOKENS: Record<number, { label: string; address: `0x${string}`; decimals: number }[]> = {
  8453: [
    { label: 'ETH (native)',  address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { label: 'USDC',          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
    { label: 'USDT',          address: '0xfde4C96c8593536E31F229EA8f37b2adA2699bb2', decimals: 6  },
    { label: 'DAI',           address: '0x50c5725949A6F0c72E6C4a641f24049A917DB0Cb', decimals: 18 },
    { label: 'WETH',          address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  ],
  137: [
    { label: 'ETH (native)',  address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { label: 'USDC',          address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6  },
    { label: 'USDT',          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8f', decimals: 6  },
    { label: 'DAI',           address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    { label: 'WETH',          address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
  ],
};

function DemoPanel({ address: adminAddr, chain }: { address: `0x${string}`; chain: NonNullable<ReturnType<typeof useAccount>['chain']> }) {
  const demoAddr = getDemoAddress(chain.id);
  const tokens   = DEMO_TOKENS[chain.id] ?? DEMO_TOKENS[8453];

  // Form state
  const [recipient,         setRecipient]         = useState('');
  const [selectedTokenIdx,  setSelectedTokenIdx]  = useState(0);
  const [customToken,       setCustomToken]        = useState('');
  const [showCustom,        setShowCustom]         = useState(false);
  const [amount,            setAmount]             = useState('');
  const [description,       setDescription]        = useState('');
  const [recipientEmail,    setRecipientEmail]     = useState('');
  const [recipientTelegram, setRecipientTelegram]  = useState('');
  const [depositorEmail,    setDepositorEmail]     = useState('');
  const [depositorTelegram, setDepositorTelegram]  = useState('');

  // Reset token picker when chain changes
  useEffect(() => { setSelectedTokenIdx(0); setCustomToken(''); setShowCustom(false); }, [chain.id]);

  const selectedToken  = tokens[selectedTokenIdx];
  const tokenAddress   = showCustom ? customToken : selectedToken.address;
  const tokenDecimals  = showCustom ? 18 : selectedToken.decimals;
  const isValidToken   = !showCustom || (customToken.length === 42 && customToken.startsWith('0x'));
  const isValidRecip   = recipient.length === 42 && recipient.startsWith('0x');
  const parsedAmount   = (() => {
    try {
      const n = parseFloat(amount);
      if (isNaN(n) || n <= 0) return null;
      return BigInt(Math.round(n * 10 ** tokenDecimals));
    } catch { return null; }
  })();
  const canCreate = !!demoAddr && isValidRecip && !!parsedAmount && !!description && isValidToken;

  // Read current demo state for this admin
  const { data: demo, refetch: refetchDemo } = useReadContract({
    address: demoAddr!, abi: DEMO_ABI, functionName: 'getDemoEscrow',
    args: [adminAddr],
    query: { enabled: !!demoAddr },
  });
  const hasDemo    = !!demo && demo.amount > 0n;
  const demoStatus = hasDemo ? demo.status : -1;

  // createDemo
  const { writeContract: writeCreate, data: createHash, isPending: createPending,
          error: createError, reset: resetCreate } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createSuccess } =
    useWaitForTransactionReceipt({ hash: createHash });

  useEffect(() => { if (createSuccess) { refetchDemo(); } }, [createSuccess, refetchDemo]);

  const handleCreate = () => {
    if (!canCreate || !demoAddr) return;
    resetCreate();
    writeCreate({
      address: demoAddr,
      abi: DEMO_ABI,
      functionName: 'createDemo',
      args: [
        recipient      as `0x${string}`,
        tokenAddress   as `0x${string}`,
        parsedAmount!,
        description,
        recipientEmail,
        recipientTelegram,
        depositorEmail,
        depositorTelegram,
      ],
    });
  };

  // approveDemo
  const { writeContract: writeApprove, data: approveHash, isPending: approvePending,
          error: approveError, reset: resetApprove } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => { if (approveSuccess) { refetchDemo(); } }, [approveSuccess, refetchDemo]);

  const handleApproveDemo = () => {
    if (!demoAddr) return;
    resetApprove();
    writeApprove({
      address: demoAddr,
      abi: DEMO_ABI,
      functionName: 'approveDemo',
      args: [adminAddr],
    });
  };

  if (!demoAddr) {
    return (
      <Card>
        <CardHeader dot="orange">
          <span style={{ color: '#f59e0b' }}>demo_mode</span>
        </CardHeader>
        <CardBody>
          <p className="text-[var(--muted)] text-xs">
            // MoneyCrowDemo not yet deployed on this network.
            Deploy with: <code>npx hardhat ignition deploy ignition/modules/Demo.ts --network {chain.name.toLowerCase()}</code>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader dot="orange">
        <span style={{ color: '#f59e0b' }}>demo_mode</span>
        <span className="text-[var(--muted)]"> — createDemo / approveDemo</span>
      </CardHeader>
      <CardBody>

        {/* Amber demo banner */}
        <div style={{
          background: '#f59e0b', color: '#000', fontFamily: 'monospace',
          fontWeight: 700, padding: '8px 14px', borderRadius: 4, marginBottom: 16, fontSize: 12,
        }}>
          ⚠ DEMO MODE — no real funds are involved
        </div>

        {/* Current demo status */}
        {hasDemo && (
          <div className="mb-4 p-3 rounded border border-[var(--border)] text-xs font-mono">
            <span className="text-[var(--muted)]">current_demo_status: </span>
            <Badge variant={DEMO_STATUS_VARIANT[demoStatus] ?? 'pending'}>
              {DEMO_STATUS_LABEL[demoStatus] ?? String(demoStatus)}
            </Badge>
            {demoStatus === 1 && (
              <span className="text-[var(--muted2)] ml-2">— recipient signed, ready to approve</span>
            )}
            {demoStatus === 2 && (
              <span className="text-[var(--muted2)] ml-2">— demo complete</span>
            )}
          </div>
        )}

        {/* approveDemo — shown when status is Accepted (1) */}
        {demoStatus === 1 && (
          <div className="mb-5">
            {approveSuccess ? (
              <div className="alert alert-success">✓ demo approved — flow complete</div>
            ) : (
              <>
                <Button
                  style={{ background: '#f59e0b', color: '#000', fontWeight: 700 }}
                  onClick={handleApproveDemo}
                  disabled={approvePending || approveConfirming}
                >
                  {approvePending ? '> awaiting signature...' : approveConfirming ? '> mining...' : '> approveDemo()'}
                </Button>
                {approveError && <div className="alert alert-error mt-2">✗ {approveError.message}</div>}
              </>
            )}
            {approveHash && (
              <div className="mt-1 text-[11px]">
                <a href={`${chain.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${approveHash}`}
                  target="_blank" rel="noreferrer" className="text-[var(--muted2)] hover:text-[var(--muted)]">
                  // view tx ↗
                </a>
              </div>
            )}
            <hr className="border-[var(--border)] my-5" />
          </div>
        )}

        {/* createDemo form */}
        <p className="text-[11px] text-[var(--muted2)] mb-3">// createDemo — set up a simulated escrow</p>

        <div className="grid gap-3 mb-4">

          {/* Recipient */}
          <div>
            <Label htmlFor="demoRecipient">recipient_address</Label>
            <Input id="demoRecipient" placeholder="0x..." value={recipient} onChange={e => setRecipient(e.target.value)} />
          </div>

          {/* Token picker */}
          <div>
            <Label htmlFor="demoToken">token</Label>
            <div className="relative">
              <select
                id="demoToken"
                value={showCustom ? '__custom__' : String(selectedTokenIdx)}
                onChange={e => {
                  if (e.target.value === '__custom__') { setShowCustom(true); }
                  else { setShowCustom(false); setSelectedTokenIdx(Number(e.target.value)); }
                }}
                className="w-full appearance-none bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] font-mono text-xs rounded px-3 py-2 pr-8 focus:outline-none focus:border-[var(--cyan)]"
              >
                {tokens.map((t, i) => (
                  <option key={t.address} value={String(i)}>{t.label}</option>
                ))}
                <option value="__custom__">custom address…</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[10px]">▼</span>
            </div>
            {showCustom && (
              <Input
                className="mt-1.5"
                placeholder="0x... ERC-20 token address"
                value={customToken}
                onChange={e => setCustomToken(e.target.value)}
              />
            )}
          </div>

          {/* Amount */}
          <div>
            <Label htmlFor="demoAmount">
              amount <span className="text-[var(--muted2)]">({showCustom ? 'tokens' : selectedToken.label})</span>
            </Label>
            <Input id="demoAmount" type="number" min="0" step="any" placeholder="e.g. 1.5" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="demoDesc">description</Label>
            <Input id="demoDesc" placeholder="e.g. Demo payment for consulting services" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="demoREmail">recipient_email</Label>
              <Input id="demoREmail" type="email" placeholder="recipient@example.com" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="demoRTg">recipient_telegram</Label>
              <Input id="demoRTg" placeholder="@username" value={recipientTelegram} onChange={e => setRecipientTelegram(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="demoDEmail">depositor_email</Label>
              <Input id="demoDEmail" type="email" placeholder="admin@example.com" value={depositorEmail} onChange={e => setDepositorEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="demoDTg">depositor_telegram</Label>
              <Input id="demoDTg" placeholder="@username" value={depositorTelegram} onChange={e => setDepositorTelegram(e.target.value)} />
            </div>
          </div>
        </div>

        {createSuccess ? (
          <div className="alert alert-success">
            ✓ demo created — recipient notified to sign acceptance
            {createHash && (
              <span className="ml-2 text-[11px]">
                <a href={`${chain.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${createHash}`}
                  target="_blank" rel="noreferrer" className="underline">view tx ↗</a>
              </span>
            )}
          </div>
        ) : (
          <Button
            style={{ background: '#f59e0b', color: '#000', fontWeight: 700 }}
            onClick={handleCreate}
            disabled={!canCreate || createPending || createConfirming}
          >
            {createPending ? '> awaiting signature...' : createConfirming ? '> mining...' : '> createDemo()'}
          </Button>
        )}

        {createError && <div className="alert alert-error mt-3">✗ {createError.message}</div>}

      </CardBody>
    </Card>
  );
}

// ── AdminDashboard ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { address, isConnected, chain } = useAccount();
  const escrowAddr = getEscrowAddress(chain?.id);

  const [depositorInput, setDepositorInput] = useState('');
  const [queryAddr, setQueryAddr]           = useState('');
  const [newFeeInput, setNewFeeInput]       = useState('');
  const [lastAction, setLastAction]         = useState<'approve' | 'refund' | null>(null);

  const isValidAddr = (a: string) => a.length === 42 && a.startsWith('0x');

  const { data: adminAddress } = useReadContract({ address: escrowAddr!, abi: ESCROW_ABI, functionName: 'admin',   query: { enabled: !!escrowAddr } });
  const { data: globalFeeBps } = useReadContract({ address: escrowAddr!, abi: ESCROW_ABI, functionName: 'feeBps', query: { enabled: !!escrowAddr } });

  const { data: escrow, isLoading: escrowLoading } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'getEscrow',
    args: [queryAddr as `0x${string}`],
    query: { enabled: isValidAddr(queryAddr) },
  });

  const { writeContract: writeAction, data: actionHash, isPending: actionPending, error: actionError, reset: resetAction } = useWriteContract();
  const { isLoading: actionConfirming, isSuccess: actionSuccess } = useWaitForTransactionReceipt({ hash: actionHash });

  const { writeContract: writeFee, data: feeHash, isPending: feePending, error: feeError, reset: resetFee } = useWriteContract();
  const { isLoading: feeConfirming, isSuccess: feeSuccess } = useWaitForTransactionReceipt({ hash: feeHash });

  const isAdmin   = address && adminAddress && address.toLowerCase() === (adminAddress as string).toLowerCase();
  const hasEscrow = escrow && escrow.amount > 0n;
  const isBusy    = actionPending || actionConfirming;

  // Called from EscrowListPanel when user clicks "> select" on a row
  const handleSelectDepositor = useCallback((addr: string) => {
    setDepositorInput(addr);
    setQueryAddr(addr);
    resetAction();
    setLastAction(null);
    // Scroll admin action card into view
    document.getElementById('admin-action-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [resetAction]);

  if (!isConnected) {
    return <Card><div className="not-connected">connect wallet to access admin panel</div></Card>;
  }
  if (!escrowAddr) {
    return <Card><div className="not-connected">// unsupported network — switch to Base or Polygon mainnet</div></Card>;
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader dot="red">
          <span className="text-[var(--red)]">access_denied</span>
        </CardHeader>
        <CardBody>
          <p className="text-[var(--muted)] text-xs">// connected wallet is not admin</p>
          <p className="mt-2 text-xs">admin: <code>{adminAddress as string}</code></p>
        </CardBody>
      </Card>
    );
  }

  const handleApprove = () => { setLastAction('approve'); resetAction(); writeAction({ address: escrowAddr!, abi: ESCROW_ABI, functionName: 'approveRelease', args: [queryAddr as `0x${string}`] }); };
  const handleRefund  = () => { setLastAction('refund');  resetAction(); writeAction({ address: escrowAddr!, abi: ESCROW_ABI, functionName: 'refund',         args: [queryAddr as `0x${string}`] }); };
  const handleSetFee  = () => {
    const bps = parseInt(newFeeInput, 10);
    if (isNaN(bps) || bps < 0 || bps > 1000) return;
    resetFee();
    writeFee({ address: escrowAddr!, abi: ESCROW_ABI, functionName: 'setFeeBps', args: [bps] });
  };

  const amountDisplay = escrow
    ? escrow.token === ETH_ZERO
      ? `${formatEther(escrow.amount)} ETH`
      : `${escrow.amount.toString()} tokens (${escrow.token})`
    : '';

  return (
    <div className="flex flex-col gap-4">

      {/* ── Escrow lookup + actions ── */}
      <Card id="admin-action-card">
        <CardHeader dot="green">
          <span className="text-[var(--green)]">admin</span>
          <span className="text-[var(--muted)]"> — approveRelease / refund</span>
        </CardHeader>
        <CardBody>
          <p className="text-[var(--muted)] text-[11px] mb-4">// connected as admin ✓</p>

          <div className="mb-4">
            <Label htmlFor="depositor">depositor</Label>
            <div className="flex gap-2">
              <Input
                id="depositor"
                placeholder="0x..."
                value={depositorInput}
                onChange={e => { setDepositorInput(e.target.value); resetAction(); setLastAction(null); }}
                onKeyDown={e => e.key === 'Enter' && isValidAddr(depositorInput) && setQueryAddr(depositorInput)}
                className="flex-1"
              />
              <Button onClick={() => setQueryAddr(depositorInput)} disabled={!isValidAddr(depositorInput)} size="sm">
                query
              </Button>
            </div>
          </div>

          {escrowLoading && <p className="text-[var(--muted)] text-xs">// loading...</p>}

          {isValidAddr(queryAddr) && !escrowLoading && !hasEscrow && (
            <p className="text-[var(--muted)] text-xs">// no active escrow for this address</p>
          )}

          {hasEscrow && (
            <div className="mt-4">
              <p className="text-[11px] text-[var(--muted2)] mb-2">// escrow details</p>
              <table className="w-full border-collapse mb-4">
                <tbody>
                  <InfoRow label="status">
                    <Badge variant={STATUS_VARIANT[escrow.status] ?? 'active'}>
                      {STATUS_LABEL[escrow.status] ?? escrow.status}
                    </Badge>
                  </InfoRow>
                  <InfoRow label="amount">{amountDisplay}</InfoRow>
                  <InfoRow label="fee_bps">{escrow.feeBps} bps ({Number(escrow.feeBps) / 100}%)</InfoRow>
                  <InfoRow label="description">"{escrow.description}"</InfoRow>
                  <InfoRow label="recipient"><code>{escrow.recipient}</code></InfoRow>
                  <InfoRow label="depositor"><code>{escrow.depositor}</code></InfoRow>
                  <InfoRow label="─">{''}</InfoRow>
                  <InfoRow label="recipient_email">    <ContactCell value={escrow.recipientEmail} /></InfoRow>
                  <InfoRow label="recipient_telegram"> <ContactCell value={escrow.recipientTelegram} /></InfoRow>
                  <InfoRow label="depositor_email">    <ContactCell value={escrow.depositorEmail} /></InfoRow>
                  <InfoRow label="depositor_telegram"> <ContactCell value={escrow.depositorTelegram} /></InfoRow>
                </tbody>
              </table>

              {actionSuccess ? (
                <div className="alert alert-success" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                  {lastAction === 'approve'
                    ? '✓ release approved — recipient can now claim'
                    : '✓ refunded — funds returned to depositor'}
                </div>
              ) : (
                <>
                  <div className="flex gap-2.5">
                    {/* approveRelease: only when Active (status 1) */}
                    <Button variant="success" onClick={handleApprove}
                      disabled={isBusy || escrow.status !== 1}
                      title={escrow.status !== 1 ? 'escrow must be Active to approve' : ''}>
                      {isBusy && lastAction === 'approve' ? '> processing...' : '> approveRelease()'}
                    </Button>
                    {/* refund: available on Pending (0) or Active (1) */}
                    <Button variant="danger" onClick={handleRefund}
                      disabled={isBusy || (escrow.status !== 0 && escrow.status !== 1)}>
                      {isBusy && lastAction === 'refund' ? '> processing...' : '> refund()'}
                    </Button>
                  </div>

                  {escrow.status === 0 && (
                    <p className="mt-2 text-[11px] text-[var(--orange)]">
                      // Pending — waiting for recipient to sign acceptance · refund available
                    </p>
                  )}
                  {(escrow.status === 2 || escrow.status === 3) && (
                    <p className="mt-2 text-[11px] text-[var(--muted)]">
                      // escrow is {STATUS_LABEL[escrow.status] ?? 'unknown'} — no actions available
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {actionSuccess && actionHash && (
            <div className="mt-2 text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${actionHash}`}
                target="_blank" rel="noreferrer"
                className="text-[var(--muted2)] hover:text-[var(--muted)]">
                // view tx on explorer ↗
              </a>
            </div>
          )}
          {actionError && <div className="alert alert-error mt-4">✗ {actionError.message}</div>}
        </CardBody>
      </Card>

      {/* ── Fee setter ── */}
      <Card>
        <CardHeader dot="orange">
          <span className="text-[var(--orange)]">setFeeBps</span>
          <span className="text-[var(--muted)]">( newFeeBps ) &mdash; admin</span>
        </CardHeader>
        <CardBody>
          <p className="text-[var(--muted)] text-[11px] mb-4">
            // current default:{' '}
            <span className="text-[var(--cyan)]">
              {globalFeeBps !== undefined ? `${globalFeeBps} bps (${Number(globalFeeBps) / 100}%)` : '...'}
            </span>
            {' '}· max 1000 bps (10%)
          </p>
          <div className="mb-4">
            <Label htmlFor="newFee">new_fee_bps</Label>
            <Input
              id="newFee"
              type="number" min="0" max="1000" step="1"
              placeholder="25 = 0.25%"
              value={newFeeInput}
              onChange={e => { setNewFeeInput(e.target.value); resetFee(); }}
              className="max-w-[200px]"
            />
          </div>
          <Button onClick={handleSetFee}
            disabled={feePending || feeConfirming || !newFeeInput || parseInt(newFeeInput) > 1000}>
            {feePending ? '> awaiting signature...' : feeConfirming ? '> confirming...' : '> setFeeBps()'}
          </Button>
          {feeSuccess && (
            <div className="alert alert-success mt-4">
              ✓ fee updated —{' '}
              <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${feeHash}`} target="_blank" rel="noreferrer">view on explorer ↗</a>
            </div>
          )}
          {feeError && <div className="alert alert-error mt-4">✗ {feeError.message}</div>}
        </CardBody>
      </Card>

      {/* ── Demo mode ── */}
      {chain && address && (
        <DemoPanel address={address} chain={chain} />
      )}

      {/* ── Escrow list ── */}
      <EscrowListPanel
        escrowAddr={escrowAddr}
        chainId={chain?.id ?? 8453}
        onSelectDepositor={handleSelectDepositor}
      />

    </div>
  );
}
