import { useState, useEffect } from 'react';
import { useReadContract, useAccount, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { ESCROW_ABI, getEscrowAddress, ESCROW_ADDRESS, STATUS_LABEL, STATUS_VARIANT } from '../contracts/Escrow';
import { Button }                     from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input }                      from '@/components/ui/input';
import { Badge }                      from '@/components/ui/badge';

const ERC20_META_ABI = [
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

const CHAIN_OPTIONS = [
  { id: 8453, name: 'Base',    color: '#7ee8fa' },
  { id: 137,  name: 'Polygon', color: '#c792ea' },
] as const;

const EXPLORER: Record<number, string> = {
  8453: 'https://basescan.org',
  137:  'https://polygonscan.com',
};

type Props = { onGoToClaim?: (depositor: string) => void };

function ContactCell({ value }: { value: string }) {
  return <span className={value ? 'text-[var(--green)]' : 'text-[var(--muted2)]'}>{value || '// not set'}</span>;
}

function fmtDeadline(ts: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (ts <= 0n) return '–';
  const date = new Date(Number(ts) * 1000).toLocaleString();
  if (ts < now) return `${date} (expired)`;
  const secsLeft = Number(ts - now);
  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  return `${date} (${h}h ${m}m remaining)`;
}

// ── EIP-712 typed data for EscrowAcceptance ───────────────────────────────────

const ACCEPTANCE_TYPES = {
  EscrowAcceptance: [
    { name: 'depositor', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount',    type: 'uint256' },
    { name: 'token',     type: 'address' },
    { name: 'terms',     type: 'string'  },
  ],
} as const;

// ── Accept-escrow sub-panel ───────────────────────────────────────────────────

function AcceptEscrowPanel({
  depositor,
  escrow,
  chainId,
  escrowAddr,
}: {
  depositor:  string;
  escrow:     { recipient: `0x${string}`; amount: bigint; token: `0x${string}`; terms: string; acceptDeadline: bigint };
  chainId:    number;
  escrowAddr: `0x${string}`;
}) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const deadlinePassed = escrow.acceptDeadline > 0n && escrow.acceptDeadline < now;

  const { signTypedData, isPending: signPending, data: signature, error: signError } = useSignTypedData();

  const { writeContract, data: acceptHash, isPending: writePending, error: writeError } = useWriteContract();
  const { isLoading: acceptConfirming, isSuccess: acceptDone } = useWaitForTransactionReceipt({ hash: acceptHash });

  // As soon as we have a signature, submit it on-chain automatically.
  useEffect(() => {
    if (signature && !writePending && !acceptHash) {
      writeContract({
        address:      escrowAddr,
        abi:          ESCROW_ABI,
        functionName: 'acceptEscrow',
        args:         [depositor as `0x${string}`, signature],
      });
    }
  }, [signature]);   // eslint-disable-line react-hooks/exhaustive-deps

  const handleSign = () => {
    signTypedData({
      domain: {
        name:              'MoneyCrow Escrow',
        version:           '1',
        chainId,
        verifyingContract: escrowAddr,
      },
      types:   ACCEPTANCE_TYPES,
      primaryType: 'EscrowAcceptance',
      message: {
        depositor: depositor as `0x${string}`,
        recipient: escrow.recipient,
        amount:    escrow.amount,
        token:     escrow.token,
        terms:     escrow.terms,
      },
    });
  };

  if (deadlinePassed) {
    return (
      <div className="mt-4 alert alert-error" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        ✗ accept deadline has passed — depositor can reclaim via depositorRefund()
      </div>
    );
  }

  if (acceptDone) {
    return (
      <div className="mt-4 alert alert-success" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        ✓ escrow accepted — status is now <b>Active</b>. Admin will review and approve release.
      </div>
    );
  }

  const busy = signPending || writePending || acceptConfirming;

  return (
    <div className="mt-4 p-4" style={{
      background: 'rgba(126,232,250,0.05)',
      border: '1px solid rgba(126,232,250,0.2)',
      borderRadius: 3,
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <p className="text-[11px] text-[var(--cyan)] mb-1">// action required — you are the recipient</p>
      <p className="text-[11px] text-[var(--muted)] mb-4 leading-relaxed">
        Sign the escrow terms with your wallet to accept. This transitions the escrow from
        Pending → Active and lets the admin approve release.
      </p>

      {escrow.terms && (
        <div className="mb-3 p-3" style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          fontSize: 11,
          color: 'var(--muted)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <span style={{ color: 'var(--pink)' }}>terms: </span>
          {escrow.terms}
        </div>
      )}

      <Button
        variant="success"
        onClick={handleSign}
        disabled={busy}
      >
        {signPending      ? '> signing...'
          : writePending  ? '> submitting...'
          : acceptConfirming ? '> confirming...'
          : '> sign & accept escrow'}
      </Button>

      {(signError ?? writeError) && (
        <div className="alert alert-error mt-3">
          ✗ {(signError ?? writeError)?.message}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EscrowStatus({ onGoToClaim }: Props) {
  const { address, chain: walletChain } = useAccount();

  // Default to wallet chain if connected + supported, else Base.
  const [selectedChainId, setSelectedChainId] = useState<number>(
    walletChain?.id && ESCROW_ADDRESS[walletChain.id] ? walletChain.id : 8453
  );

  // Follow wallet chain when it changes.
  useEffect(() => {
    if (walletChain?.id && ESCROW_ADDRESS[walletChain.id]) {
      setSelectedChainId(walletChain.id);
    }
  }, [walletChain?.id]);

  const escrowAddr = getEscrowAddress(selectedChainId);
  const explorer   = EXPLORER[selectedChainId] ?? 'https://basescan.org';

  // Pre-populate from ?depositor=0x... URL param (used in email notification links)
  const urlDepositor = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get('depositor') ?? '';
      return v.length === 42 && v.startsWith('0x') ? v : '';
    } catch { return ''; }
  })();

  const [input, setInput] = useState(urlDepositor);
  const [query, setQuery] = useState(urlDepositor);

  const isValidAddr = (a: string) => a.length === 42 && a.startsWith('0x');

  const { data: escrow, isLoading, error } = useReadContract({
    address:      escrowAddr!,
    abi:          ESCROW_ABI,
    functionName: 'getEscrow',
    args:         [query as `0x${string}`],
    chainId:      selectedChainId,
    query:        { enabled: isValidAddr(query) && !!escrowAddr },
  });

  const { data: timeLeft } = useReadContract({
    address:      escrowAddr!,
    abi:          ESCROW_ABI,
    functionName: 'timeRemaining',
    args:         [query as `0x${string}`],
    chainId:      selectedChainId,
    query:        { enabled: isValidAddr(query) && !!escrowAddr },
  });

  const { data: releaseApproved } = useReadContract({
    address:      escrowAddr!,
    abi:          ESCROW_ABI,
    functionName: 'releaseApproved',
    args:         [query as `0x${string}`],
    chainId:      selectedChainId,
    query:        { enabled: isValidAddr(query) && !!escrowAddr && !!escrow && escrow.status === 1 },
  });

  const isERC20 = escrow && escrow.token !== ETH_ZERO;

  const { data: tokenDecimals } = useReadContract({
    address:  escrow?.token as `0x${string}`,
    abi:      ERC20_META_ABI,
    functionName: 'decimals',
    chainId:  selectedChainId,
    query:    { enabled: !!isERC20 },
  });
  const { data: tokenSymbol } = useReadContract({
    address:  escrow?.token as `0x${string}`,
    abi:      ERC20_META_ABI,
    functionName: 'symbol',
    chainId:  selectedChainId,
    query:    { enabled: !!isERC20 },
  });

  const formatAmt = (raw: bigint) => {
    if (!isERC20) return `${formatEther(raw)} ETH`;
    return `${formatUnits(raw, tokenDecimals ?? 18)} ${tokenSymbol ?? 'tokens'}`;
  };

  const hasEscrow   = escrow && escrow.amount > 0n;
  const isRecipient = address && escrow && address.toLowerCase() === escrow.recipient.toLowerCase();

  // Claim button: status Active (1) AND admin has flagged releaseApproved
  const canGoClaim = hasEscrow && escrow.status === 1 && releaseApproved === true && isRecipient;

  // Accept panel: status Pending (0) AND connected wallet is recipient
  const showAcceptPanel = hasEscrow && escrow.status === 0 && isRecipient;

  const chainMeta = CHAIN_OPTIONS.find(c => c.id === selectedChainId)!;

  return (
    <Card>
      <CardHeader>
        <span className="text-[var(--orange)]">getEscrow</span>
        <span className="text-[var(--muted)]">( depositor ) &mdash; public lookup</span>
      </CardHeader>
      <CardBody>
        {/* ── Network selector — works without wallet ── */}
        <div className="mb-4">
          <p className="text-[11px] text-[var(--muted2)] mb-2">// select network</p>
          <div className="flex w-fit border border-[var(--border2)] rounded-sm overflow-hidden">
            {CHAIN_OPTIONS.map((chain, i) => (
              <button
                key={chain.id}
                type="button"
                onClick={() => { setSelectedChainId(chain.id); setQuery(''); }}
                className={[
                  'px-5 py-1.5 text-xs font-semibold font-mono cursor-pointer transition-all border-none',
                  i > 0 ? 'border-l border-[var(--border2)]' : '',
                ].join(' ')}
                style={{
                  background: selectedChainId === chain.id ? `${chain.color}18` : 'transparent',
                  color: selectedChainId === chain.id ? chain.color : 'var(--muted)',
                }}
              >
                <span style={{
                  display: 'inline-block', width: 6, height: 6,
                  borderRadius: '50%', background: chain.color,
                  marginRight: 6, verticalAlign: 'middle',
                  opacity: selectedChainId === chain.id ? 1 : 0.35,
                }} />
                {chain.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Address input ── */}
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="0x... depositor address — no wallet needed"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && isValidAddr(input) && setQuery(input)}
            className="flex-1"
          />
          <Button size="sm" onClick={() => setQuery(input)} disabled={!isValidAddr(input)}>
            query
          </Button>
        </div>

        {isLoading && <p className="text-[var(--muted)] text-xs">// loading from {chainMeta.name}...</p>}
        {error     && <div className="alert alert-error">✗ {error.message}</div>}

        {hasEscrow && (
          <>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="text-[var(--pink)] text-xs w-40 pr-3 py-2 border-b border-[var(--border)]">network</td>
                  <td className="py-2 border-b border-[var(--border)]">
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, color: chainMeta.color,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: chainMeta.color }} />
                      {chainMeta.name}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="text-[var(--pink)] text-xs w-40 pr-3 py-2 border-b border-[var(--border)]">status</td>
                  <td className="py-2 border-b border-[var(--border)]">
                    <Badge variant={STATUS_VARIANT[escrow.status] as 'pending' | 'active' | 'released' | 'refunded' | undefined}>
                      {STATUS_LABEL[escrow.status] ?? `unknown(${escrow.status})`}
                    </Badge>
                    {escrow.status === 1 && releaseApproved && (
                      <span className="ml-2 text-[10px] text-[var(--orange)]">// release approved</span>
                    )}
                  </td>
                </tr>
                {([
                  ['depositor',   <code key="d">{escrow.depositor}</code>],
                  ['recipient',   <code key="r">{escrow.recipient}</code>],
                  ['amount',      formatAmt(escrow.amount)],
                  ['fee_bps',     `${escrow.feeBps} bps (${Number(escrow.feeBps) / 100}%)`],
                  ['description', `"${escrow.description}"`],
                  ['time_left',   timeLeft !== undefined
                    ? (timeLeft > 0n ? `${(Number(timeLeft) / 3600).toFixed(1)}h remaining` : '// timed out — claimTimeout() available')
                    : '–'],
                  ['accept_deadline', fmtDeadline(escrow.acceptDeadline)],
                  ['terms',       escrow.terms || '// (contract default)'],
                ] as [string, React.ReactNode][]).map(([label, value]) => (
                  <tr key={label}>
                    <td className="text-[var(--pink)] text-xs w-40 pr-3 py-2 border-b border-[var(--border)]">{label}</td>
                    <td className="text-[var(--green)] text-xs py-2 border-b border-[var(--border)] break-all">{value}</td>
                  </tr>
                ))}

                {/* Contact info */}
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 text-[11px] text-[var(--muted2)]">// contact info</td>
                </tr>
                {([
                  ['recipient_email',    escrow.recipientEmail],
                  ['recipient_telegram', escrow.recipientTelegram],
                  ['depositor_email',    escrow.depositorEmail],
                  ['depositor_telegram', escrow.depositorTelegram],
                ] as [string, string][]).map(([label, value]) => (
                  <tr key={label}>
                    <td className="text-[var(--pink)] text-xs w-40 pr-3 py-2 border-b border-[var(--border)]">{label}</td>
                    <td className="text-xs py-2 border-b border-[var(--border)]"><ContactCell value={value} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Explorer link */}
            <div className="mt-3">
              <a
                href={`${explorer}/address/${escrowAddr}`}
                target="_blank" rel="noreferrer"
                className="text-[var(--muted2)] text-[10px] hover:text-[var(--muted)]"
                style={{ fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none' }}
              >
                // view contract on {chainMeta.name === 'Base' ? 'Basescan' : 'Polygonscan'} ↗
              </a>
            </div>

            {/* ── Recipient: accept escrow (EIP-712) ── */}
            {showAcceptPanel && escrowAddr && (
              <AcceptEscrowPanel
                depositor={query}
                escrow={escrow}
                chainId={selectedChainId}
                escrowAddr={escrowAddr}
              />
            )}

            {/* ── Recipient: claim approved funds ── */}
            {canGoClaim && (
              <div className="mt-4">
                <p className="text-[11px] text-[var(--orange)] mb-2">
                  // admin has approved release — claim your funds now
                </p>
                <Button variant="success" onClick={() => onGoToClaim?.(escrow.depositor)}>
                  &gt; go to claim →
                </Button>
              </div>
            )}

            {/* Depositor refund for expired Pending */}
            {hasEscrow && escrow.status === 0 &&
              escrow.acceptDeadline > 0n &&
              BigInt(Math.floor(Date.now() / 1000)) > escrow.acceptDeadline &&
              address?.toLowerCase() === escrow.depositor.toLowerCase() && (
              <div className="mt-4">
                <p className="text-[11px] text-[var(--red)] mb-2">
                  // accept deadline passed — recipient did not accept. You can reclaim your funds.
                </p>
                <DepositorRefundButton
                  depositor={query}
                  escrowAddr={escrowAddr!}
                />
              </div>
            )}
          </>
        )}

        {isValidAddr(query) && !isLoading && escrow && escrow.amount === 0n && (
          <p className="text-[var(--muted)] text-xs">// no escrow found for this address on {chainMeta.name}</p>
        )}

        {/* Public notice */}
        {!query && (
          <p className="text-[11px] text-[var(--muted2)] mt-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            // no wallet connection required — any visitor can look up any escrow
          </p>
        )}

      </CardBody>
    </Card>
  );
}

// ── Depositor refund sub-component ────────────────────────────────────────────

function DepositorRefundButton({
  depositor,
  escrowAddr,
}: {
  depositor:  string;
  escrowAddr: `0x${string}`;
}) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  if (isSuccess) {
    return <div className="alert alert-success">✓ refunded — funds returned to depositor</div>;
  }

  return (
    <div>
      <Button
        variant="danger"
        onClick={() => writeContract({
          address: escrowAddr,
          abi: ESCROW_ABI,
          functionName: 'depositorRefund',
          args: [depositor as `0x${string}`],
        })}
        disabled={isPending || confirming}
      >
        {isPending ? '> awaiting signature...' : confirming ? '> confirming...' : '> depositorRefund()'}
      </Button>
      {error && <div className="alert alert-error mt-2">✗ {error.message}</div>}
    </div>
  );
}
