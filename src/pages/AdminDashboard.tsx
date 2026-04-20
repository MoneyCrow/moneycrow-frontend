import { useState, useEffect, useCallback } from 'react';
import {
  useWriteContract, useReadContract, useAccount,
  useWaitForTransactionReceipt, usePublicClient,
} from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import { ESCROW_ABI, getEscrowAddress, STATUS_LABEL, STATUS_VARIANT } from '../contracts/Escrow';
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
  const [rows,      setRows]      = useState<EscrowRow[]>([]);
  const [scanning,  setScanning]  = useState(false);
  const [scanned,   setScanned]   = useState(false);
  const [scanError, setScanError] = useState('');

  const trunc = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const fmtAmt = (r: EscrowRow) =>
    r.token.toLowerCase() === ETH_ZERO
      ? `${formatEther(r.amount)} ETH`
      : `${r.amount} tokens`;

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
    try {
      const fromBlock = DEPLOY_BLOCK[chainId] ?? 0n;

      const logs = await publicClient.getLogs({
        address:   escrowAddr,
        event:     DEPOSITED_EVENT,
        fromBlock,
        toBlock:   'latest',
      });

      // Deduplicate depositors — reverse scan so first occurrence in `order`
      // corresponds to the earliest deposit (latest deposit overwrites state).
      const seen  = new Set<string>();
      const order: `0x${string}`[] = [];
      for (const log of [...logs].reverse()) {
        const dep = (log.args as { depositor?: `0x${string}` }).depositor;
        if (dep && !seen.has(dep.toLowerCase())) {
          seen.add(dep.toLowerCase());
          order.unshift(dep);
        }
      }

      // Batch-read current on-chain state for every depositor
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
        escrows.map((e, i) => ({
          depositor:      order[i],
          recipient:      e.recipient,
          token:          e.token,
          amount:         e.amount,
          status:         Number(e.status),
          feeBps:         Number(e.feeBps),
          description:    e.description,
          createdAt:      e.createdAt,
          acceptDeadline: e.acceptDeadline,
        })),
      );
      setScanned(true);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
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
          {scanning && (
            <span className="text-[11px] text-[var(--muted2)]">// querying chain…</span>
          )}
        </div>

        {scanError && <div className="alert alert-error mb-3">✗ {scanError}</div>}

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

      {/* ── Escrow list ── */}
      <EscrowListPanel
        escrowAddr={escrowAddr}
        chainId={chain?.id ?? 8453}
        onSelectDepositor={handleSelectDepositor}
      />

    </div>
  );
}
