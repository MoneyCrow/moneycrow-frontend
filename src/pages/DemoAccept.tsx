import { useState, useEffect } from 'react';
import {
  useReadContract,
  useWriteContract,
  useSignTypedData,
  useAccount,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { DEMO_ABI, DEMO_STATUS_LABEL, getDemoAddress } from '../contracts/EscrowDemo';
import { Button }                     from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input }                      from '@/components/ui/input';
import { Label }                      from '@/components/ui/label';

// ── Token helpers ─────────────────────────────────────────────────────────────

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

const ERC20_META_ABI = [
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

// ── EIP-712 types for DemoAcceptance ─────────────────────────────────────────

const DEMO_TYPES = {
  DemoAcceptance: [
    { name: 'depositor',   type: 'address' },
    { name: 'recipient',   type: 'address' },
    { name: 'amount',      type: 'uint256' },
    { name: 'token',       type: 'address' },
    { name: 'description', type: 'string'  },
  ],
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

type Props = { initialDepositor?: string };

export default function DemoAccept({ initialDepositor = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const demoAddr = getDemoAddress(chain?.id);

  const [depositorInput, setDepositorInput] = useState(initialDepositor);
  const [queryAddr, setQueryAddr]           = useState(initialDepositor);
  const [sig, setSig]                       = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (initialDepositor) {
      setDepositorInput(initialDepositor);
      setQueryAddr(initialDepositor);
    }
  }, [initialDepositor]);

  const isValidAddr = (a: string) => a.length === 42 && a.startsWith('0x');

  // ── Read demo escrow ──────────────────────────────────────────────────────

  const { data: demo, isLoading } = useReadContract({
    address: demoAddr!, abi: DEMO_ABI, functionName: 'getDemoEscrow',
    args: [queryAddr as `0x${string}`],
    query: { enabled: isValidAddr(queryAddr) && !!demoAddr },
  });

  // ── Token metadata ────────────────────────────────────────────────────────

  const isERC20 = demo && demo.token !== ETH_ZERO;
  const { data: tokenDecimals } = useReadContract({
    address: demo?.token as `0x${string}`, abi: ERC20_META_ABI, functionName: 'decimals',
    query: { enabled: !!isERC20 },
  });
  const { data: tokenSymbol } = useReadContract({
    address: demo?.token as `0x${string}`, abi: ERC20_META_ABI, functionName: 'symbol',
    query: { enabled: !!isERC20 },
  });

  const formatAmt = (raw: bigint) => {
    if (!demo) return '';
    if (!isERC20) return `${formatEther(raw)} ETH`;
    return `${formatUnits(raw, tokenDecimals ?? 18)} ${tokenSymbol ?? 'tokens'}`;
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasDemo     = !!demo && demo.amount > 0n;
  const isPending   = hasDemo && demo.status === 0;
  const isAccepted  = hasDemo && demo.status === 1;
  const isApproved  = hasDemo && demo.status === 2;
  const isRecipient = address && demo && address.toLowerCase() === demo.recipient.toLowerCase();
  const statusLabel = hasDemo ? (DEMO_STATUS_LABEL[demo.status] ?? String(demo.status)) : '';

  // ── EIP-712 sign ──────────────────────────────────────────────────────────

  const { signTypedData, isPending: isSigning, error: signError } = useSignTypedData();

  const handleSign = () => {
    if (!demo || !demoAddr || !address) return;
    setSig(null);
    signTypedData(
      {
        domain: {
          name:              'MoneyCrowDemo',
          version:           '1',
          chainId:           chain!.id,
          verifyingContract: demoAddr,
        },
        types:   DEMO_TYPES,
        primaryType: 'DemoAcceptance',
        message: {
          depositor:   queryAddr as `0x${string}`,
          recipient:   address,
          amount:      demo.amount,
          token:       demo.token as `0x${string}`,
          description: demo.description,
        },
      },
      { onSuccess: (s) => setSig(s) },
    );
  };

  // ── Submit acceptDemo tx ──────────────────────────────────────────────────

  const { writeContract, data: txHash, isPending: isTxPending, error: txError, reset: resetTx } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleAccept = () => {
    if (!sig || !demoAddr) return;
    resetTx();
    writeContract({
      address: demoAddr,
      abi: DEMO_ABI,
      functionName: 'acceptDemo',
      args: [queryAddr as `0x${string}`, sig],
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return <Card><div className="not-connected">connect wallet to sign demo acceptance</div></Card>;
  }
  if (!demoAddr) {
    return <Card><div className="not-connected">// demo not yet deployed on this network — switch to Base or Polygon</div></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <span style={{ color: '#f59e0b' }}>demo_accept</span>
        <span className="text-[var(--muted)]">( depositor ) &mdash; recipient signs</span>
      </CardHeader>
      <CardBody>

        {/* Amber demo banner */}
        <div style={{
          background: '#f59e0b', color: '#000', fontFamily: 'monospace',
          fontWeight: 700, padding: '8px 14px', borderRadius: 4, marginBottom: 16, fontSize: 12,
        }}>
          ⚠ THIS IS A DEMO — no real funds are involved
        </div>

        {/* Depositor lookup */}
        <div className="mb-4">
          <Label htmlFor="demoDepositorAddr">depositor_address</Label>
          <div className="flex gap-2">
            <Input
              id="demoDepositorAddr"
              placeholder="0x... (paste from your invitation email)"
              value={depositorInput}
              onChange={e => { setDepositorInput(e.target.value); setSig(null); resetTx(); }}
              onKeyDown={e => e.key === 'Enter' && isValidAddr(depositorInput) && setQueryAddr(depositorInput)}
              className="flex-1"
            />
            <Button size="sm" onClick={() => { setQueryAddr(depositorInput); setSig(null); resetTx(); }}
              disabled={!isValidAddr(depositorInput)}>
              query
            </Button>
          </div>
        </div>

        {isLoading && <p className="text-[var(--muted)] text-xs">// loading...</p>}

        {isValidAddr(queryAddr) && !isLoading && !hasDemo && (
          <p className="text-[var(--muted)] text-xs">// no demo found for this depositor address</p>
        )}

        {/* Status when not pending */}
        {hasDemo && !isPending && !isSuccess && (
          <div className={`alert ${isApproved ? 'alert-success' : 'alert-info'} mt-3`}>
            {isAccepted  && '✓ you already signed — waiting for admin to approve'}
            {isApproved  && '✓ demo complete — the full escrow flow has been simulated'}
          </div>
        )}

        {/* Not the recipient */}
        {hasDemo && isPending && !isRecipient && (
          <div className="alert alert-error mt-3">
            ✗ connected wallet is not the recipient for this demo
            <br /><code className="text-xs">expected: {demo?.recipient}</code>
          </div>
        )}

        {/* ── Sign panel ── */}
        {hasDemo && isPending && isRecipient && !sig && !isSuccess && (
          <div className="mt-4">
            <p className="text-[11px] text-[var(--muted2)] mb-3">
              // review demo details and sign the EIP-712 acceptance
            </p>

            <table className="w-full border-collapse mb-5">
              <tbody>
                {([
                  ['status',       statusLabel],
                  ['amount',       `${formatAmt(demo.amount)} (simulated)`],
                  ['description',  `"${demo.description}"`],
                  ['depositor',    demo.depositor],
                  ['recipient',    demo.recipient],
                ] as [string, string][]).map(([label, value]) => (
                  <tr key={label}>
                    <td className="text-[var(--pink)] text-xs w-32 pr-3 py-2 border-b border-[var(--border)] align-top">{label}</td>
                    <td className="text-[var(--green)] text-xs py-2 border-b border-[var(--border)] break-all">
                      {label === 'depositor' || label === 'recipient' ? <code>{value}</code> : value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Button
              style={{ background: '#f59e0b', color: '#000', fontWeight: 700 }}
              onClick={handleSign}
              disabled={isSigning}
            >
              {isSigning ? '> awaiting signature...' : '> sign demo acceptance()'}
            </Button>

            {signError && <div className="alert alert-error mt-3">✗ {signError.message}</div>}
          </div>
        )}

        {/* ── Submit tx panel (after signing) ── */}
        {sig && !isSuccess && (
          <div className="mt-4">
            <div className="alert alert-success mb-4" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
              ✓ signature obtained — submit to chain to record acceptance
            </div>

            <p className="text-[11px] text-[var(--muted2)] mb-2">signature:</p>
            <code className="text-[9px] text-[var(--muted)] break-all block mb-4">{sig}</code>

            <Button
              style={{ background: '#f59e0b', color: '#000', fontWeight: 700 }}
              onClick={handleAccept}
              disabled={isTxPending || isConfirming}
            >
              {isTxPending ? '> awaiting signature...' : isConfirming ? '> mining...' : '> acceptDemo()'}
            </Button>

            {txError && <div className="alert alert-error mt-3">✗ {txError.message}</div>}
          </div>
        )}

        {/* ── Receipt ── */}
        {isSuccess && (
          <div className="mt-4">
            <div className="alert alert-success mb-3" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
              ✓ demo accepted — admin will now approve to complete the flow
            </div>
            <table className="w-full border-collapse mb-4">
              <tbody>
                <tr>
                  <td className="text-[var(--pink)] text-xs w-32 pr-3 py-2 border-b border-[var(--border)]">tx_hash</td>
                  <td className="py-2 text-xs">
                    <a
                      href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${txHash}`}
                      target="_blank" rel="noreferrer"
                      className="text-[var(--cyan)] break-all hover:underline"
                    >
                      {txHash}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-[var(--muted2)]">
              // the admin will call approveDemo() to finish the simulation.
              You'll receive a notification when it's done.
            </p>
          </div>
        )}

      </CardBody>
    </Card>
  );
}
