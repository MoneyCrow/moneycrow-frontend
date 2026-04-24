import { useState, useEffect } from 'react';
import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { ESCROW_ABI, getEscrowAddress, STATUS_LABEL } from '../contracts/Escrow';
import { SharpButton } from '../components/sharp/SharpButton';
import { SharpCard } from '../components/sharp/SharpCard';
import { SharpInput } from '../components/sharp/SharpInput';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';
import { useTheme } from '../context/ThemeContext';

const ERC20_DECIMALS_ABI = [
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

type Props = { initialDepositor?: string };

export default function ClaimPage({ initialDepositor = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

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

  const { data: releaseApproved } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'releaseApproved',
    args: [queryAddr as `0x${string}`],
    query: { enabled: isValidAddr(queryAddr) && !!escrowAddr && escrow?.status === 1 },
  });

  const { writeContract, data: claimHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

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

  const rowStyle: React.CSSProperties = { display: 'flex', gap: 0, borderBottom: `1px solid ${border}` };
  const labelStyle: React.CSSProperties = { width: 140, flexShrink: 0, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: `1px solid ${border}` };
  const valueStyle: React.CSSProperties = { flex: 1, padding: '10px 14px', fontSize: 13, color: isDark ? '#FFFFFF' : '#111111', wordBreak: 'break-all' };

  if (!isConnected) {
    return (
      <div>
        <SharpPageHeader title="Claim Funds" subtitle="Claim your approved escrow funds directly to your wallet." />
        <SharpCard><div className="not-connected">Connect wallet to claim funds</div></SharpCard>
      </div>
    );
  }
  if (!escrowAddr) {
    return (
      <div>
        <SharpPageHeader title="Claim Funds" subtitle="Claim your approved escrow funds directly to your wallet." />
        <SharpCard><div className="not-connected">Unsupported network — switch to Base or Polygon mainnet</div></SharpCard>
      </div>
    );
  }

  return (
    <div>
      <SharpPageHeader title="Claim Funds" subtitle="Claim your approved escrow funds directly to your wallet." />

      <SharpCard style={{ padding: '28px 32px' }}>
        {/* Depositor lookup */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <SharpInput
                label="Depositor Address"
                id="depositorAddr"
                placeholder="0x... (paste depositor address from your notification)"
                value={depositorInput}
                onChange={e => { setDepositorInput(e.target.value); reset(); }}
                onKeyDown={e => e.key === 'Enter' && isValidAddr(depositorInput) && setQueryAddr(depositorInput)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <SharpButton size="sm" onClick={() => { setQueryAddr(depositorInput); reset(); }}
                disabled={!isValidAddr(depositorInput)}>
                Query
              </SharpButton>
            </div>
          </div>
        </div>

        {isLoading && <p style={{ fontSize: 13, color: textSecondary }}>Loading...</p>}

        {isValidAddr(queryAddr) && !isLoading && escrow && escrow.amount === 0n && (
          <p style={{ fontSize: 13, color: textSecondary }}>No escrow found for this address</p>
        )}

        {escrow && escrow.amount > 0n && !canClaim && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {!isActive
              ? `Escrow status is not Active (current: ${STATUS_LABEL[escrow.status] ?? escrow.status})`
              : isActive && !releaseApproved
              ? 'Admin has not yet approved the release'
              : `Connected wallet is not the recipient — expected ${escrow.recipient}`
            }
          </div>
        )}

        {/* Claim panel */}
        {canClaim && !isSuccess && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: textSecondary, marginBottom: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Admin approved release — review before claiming
            </p>

            <div style={{ border: `1px solid ${border}`, marginBottom: 20 }}>
              {([
                ['Terms Hash',   escrow.termsHash.slice(0, 18) + '…'],
                ['Gross Amount', formatAmt(gross)],
                ['Fee',          feeText],
                ['Fee Amount',   feeAmt > 0n ? `− ${formatAmt(feeAmt)}` : 'none'],
                ['Net to You',   formatAmt(net)],
                ['Depositor',    escrow.depositor],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ ...rowStyle, borderBottom: `1px solid ${border}` }}>
                  <div style={labelStyle}>{label}</div>
                  <div style={{
                    ...valueStyle,
                    color: label === 'Net to You' ? '#34D399' : label === 'Fee Amount' ? '#F87171' : (isDark ? '#FFFFFF' : '#111111'),
                    fontWeight: label === 'Net to You' ? 700 : 400,
                  }}>
                    {label === 'Depositor' ? <code>{value}</code> : value}
                  </div>
                </div>
              ))}
            </div>

            <SharpButton
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}
              onClick={handleClaim}
              disabled={isPending || isConfirming}
            >
              {isPending ? 'Awaiting signature...' : isConfirming ? 'Mining...' : 'Claim Funds'}
            </SharpButton>
            <p style={{ marginTop: 12, fontSize: 12, color: textTertiary, lineHeight: 1.6 }}>
              Your wallet address is cryptographically verified. No other wallet can claim these funds.
            </p>

            {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error.message}</div>}
          </div>
        )}

        {/* Receipt */}
        {isSuccess && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: textSecondary, marginBottom: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Claim confirmed</p>
            <div style={{ border: `1px solid ${border}`, marginBottom: 16 }}>
              <div style={rowStyle}>
                <div style={labelStyle}>Received</div>
                <div style={{ ...valueStyle, color: '#34D399', fontWeight: 700 }}>{formatAmt(net)}</div>
              </div>
              <div style={rowStyle}>
                <div style={labelStyle}>Fee Deducted</div>
                <div style={{ ...valueStyle, color: '#F87171' }}>{feeAmt > 0n ? formatAmt(feeAmt) : 'none'}</div>
              </div>
              <div style={rowStyle}>
                <div style={labelStyle}>Tx Hash</div>
                <div style={valueStyle}>
                  <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${claimHash}`} target="_blank" rel="noreferrer"
                    style={{ color: '#F2B705', wordBreak: 'break-all' }}>
                    {claimHash}
                  </a>
                </div>
              </div>
            </div>
            <div className="alert alert-success">
              Funds claimed —{' '}
              <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${claimHash}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
            </div>
          </div>
        )}
      </SharpCard>
    </div>
  );
}
