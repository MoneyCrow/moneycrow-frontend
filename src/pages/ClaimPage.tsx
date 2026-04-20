import { useState, useEffect } from 'react';
import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { ESCROW_ABI, getEscrowAddress, STATUS_LABEL } from '../contracts/Escrow';
import { Button }                     from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input }                      from '@/components/ui/input';
import { Label }                      from '@/components/ui/label';

const ERC20_DECIMALS_ABI = [
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

type Props = { initialDepositor?: string };

export default function ClaimPage({ initialDepositor = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const escrowAddr = getEscrowAddress(chain?.id);

  const [depositorInput, setDepositorInput] = useState(initialDepositor);
  const [queryAddr, setQueryAddr]           = useState(initialDepositor);

  useEffect(() => {
    if (initialDepositor) {
      setDepositorInput(initialDepositor);
      setQueryAddr(initialDepositor);
    }
  }, [initialDepositor]);

  const isValidAddr = (a: string) => a.length === 42 && a.startsWith('0x');

  const { data: escrow, isLoading } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'getEscrow',
    args: [queryAddr as `0x${string}`],
    query: { enabled: isValidAddr(queryAddr) && !!escrowAddr },
  });

  const isERC20 = escrow && escrow.token !== ETH_ZERO;

  const { data: tokenDecimals } = useReadContract({ address: escrow?.token as `0x${string}`, abi: ERC20_DECIMALS_ABI, functionName: 'decimals', query: { enabled: !!isERC20 } });
  const { data: tokenSymbol }   = useReadContract({ address: escrow?.token as `0x${string}`, abi: ERC20_DECIMALS_ABI, functionName: 'symbol',   query: { enabled: !!isERC20 } });

  // releaseApproved is now a mapping — read it directly from the contract
  const { data: releaseApproved } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'releaseApproved',
    args: [queryAddr as `0x${string}`],
    query: { enabled: isValidAddr(queryAddr) && !!escrowAddr && escrow?.status === 1 },
  });

  const { writeContract, data: claimHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

  // canClaim: status must be Active (1) AND releaseApproved flag is set
  const isActive    = escrow?.status === 1;
  const isRecipient = address && escrow && address.toLowerCase() === escrow.recipient.toLowerCase();
  const canClaim    = isActive && releaseApproved === true && isRecipient;

  const formatAmt = (raw: bigint) => {
    if (!escrow) return '';
    if (!isERC20) return `${formatEther(raw)} ETH`;
    return `${formatUnits(raw, tokenDecimals ?? 18)} ${tokenSymbol ?? 'tokens'}`;
  };

  const gross   = escrow?.amount ?? 0n;
  const feeBps  = escrow?.feeBps ?? 0;
  const feeAmt  = (gross * BigInt(feeBps)) / 10_000n;
  const net     = gross - feeAmt;
  const feeText = feeBps > 0 ? `${feeBps} bps (${feeBps / 100}%)` : 'none';

  const handleClaim = () => {
    if (!canClaim) return;
    reset();
    writeContract({ address: escrowAddr!, abi: ESCROW_ABI, functionName: 'claim', args: [queryAddr as `0x${string}`] });
  };

  if (!isConnected) {
    return <Card><div className="not-connected">connect wallet to claim funds</div></Card>;
  }
  if (!escrowAddr) {
    return <Card><div className="not-connected">// unsupported network — switch to Base or Polygon mainnet</div></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-[var(--orange)]">claim</span>
        <span className="text-[var(--muted)]">( depositor ) &mdash; recipient only</span>
      </CardHeader>
      <CardBody>

        {/* Depositor lookup */}
        <div className="mb-4">
          <Label htmlFor="depositorAddr">depositor_address</Label>
          <div className="flex gap-2">
            <Input
              id="depositorAddr"
              placeholder="0x... (paste depositor address from your notification)"
              value={depositorInput}
              onChange={e => { setDepositorInput(e.target.value); reset(); }}
              onKeyDown={e => e.key === 'Enter' && isValidAddr(depositorInput) && setQueryAddr(depositorInput)}
              className="flex-1"
            />
            <Button size="sm" onClick={() => { setQueryAddr(depositorInput); reset(); }}
              disabled={!isValidAddr(depositorInput)}>
              query
            </Button>
          </div>
        </div>


        {isLoading && <p className="text-[var(--muted)] text-xs">// loading...</p>}

        {isValidAddr(queryAddr) && !isLoading && escrow && escrow.amount === 0n && (
          <p className="text-[var(--muted)] text-xs">// no escrow found for this address</p>
        )}

        {escrow && escrow.amount > 0n && !canClaim && (
          <div className="alert alert-error mt-3">
            {!isActive
              ? `✗ escrow status is not Active (current: ${STATUS_LABEL[escrow.status] ?? escrow.status})`
              : isActive && !releaseApproved
              ? '✗ admin has not yet approved the release'
              : `✗ connected wallet is not the recipient — expected ${escrow.recipient}`
            }
          </div>
        )}

        {/* ── Claim panel ── */}
        {canClaim && !isSuccess && (
          <div className="mt-4">
            <p className="text-[11px] text-[var(--muted2)] mb-3">
              // admin approved release — review before claiming
            </p>

            <table className="w-full border-collapse mb-5">
              <tbody>
                {([
                  ['description',  `"${escrow.description}"`],
                  ['gross_amount', formatAmt(gross)],
                  ['fee',          feeText],
                  ['fee_amount',   feeAmt > 0n ? `− ${formatAmt(feeAmt)}` : 'none'],
                  ['net_to_you',   formatAmt(net)],
                  ['depositor',    escrow.depositor],
                ] as [string, string][]).map(([label, value]) => (
                  <tr key={label}>
                    <td className="text-[var(--pink)] text-xs w-32 pr-3 py-2 border-b border-[var(--border)] align-top">{label}</td>
                    <td className={[
                      'text-xs py-2 border-b border-[var(--border)] break-all',
                      label === 'net_to_you'  ? 'text-[var(--green)] font-semibold' :
                      label === 'fee_amount'  ? 'text-[var(--red)]' :
                      'text-[var(--green)]',
                    ].join(' ')}>
                      {label === 'depositor' ? <code>{value}</code> : value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Button variant="success" onClick={handleClaim} disabled={isPending || isConfirming}>
              {isPending ? '> awaiting signature...' : isConfirming ? '> mining...' : '> claim()'}
            </Button>
            <p className="mt-3 text-[11px] text-[var(--muted2)] leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              // Your wallet address is cryptographically verified.
              No other wallet can claim these funds.
            </p>

            {error && <div className="alert alert-error mt-4">✗ {error.message}</div>}
          </div>
        )}

        {/* ── Receipt ── */}
        {isSuccess && (
          <div className="mt-4">
            <p className="text-[11px] text-[var(--muted2)] mb-3">// claim confirmed</p>
            <table className="w-full border-collapse mb-4">
              <tbody>
                <tr>
                  <td className="text-[var(--pink)] text-xs w-32 pr-3 py-2 border-b border-[var(--border)]">received</td>
                  <td className="text-[var(--green)] text-xs font-semibold py-2 border-b border-[var(--border)]">{formatAmt(net)}</td>
                </tr>
                <tr>
                  <td className="text-[var(--pink)] text-xs w-32 pr-3 py-2 border-b border-[var(--border)]">fee_deducted</td>
                  <td className="text-[var(--red)] text-xs py-2 border-b border-[var(--border)]">{feeAmt > 0n ? formatAmt(feeAmt) : 'none'}</td>
                </tr>
                <tr>
                  <td className="text-[var(--pink)] text-xs w-32 pr-3 py-2">tx_hash</td>
                  <td className="py-2 text-xs">
                    <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${claimHash}`} target="_blank" rel="noreferrer"
                      className="text-[var(--cyan)] break-all hover:underline">
                      {claimHash}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="alert alert-success">
              ✓ funds claimed —{' '}
              <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${claimHash}`} target="_blank" rel="noreferrer">view on explorer ↗</a>
            </div>
          </div>
        )}

      </CardBody>
    </Card>
  );
}
