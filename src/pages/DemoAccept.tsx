import { useState, useEffect } from 'react';
import {
  useReadContract, useWriteContract, useSignTypedData, useAccount, useWaitForTransactionReceipt,
} from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { DEMO_ABI, DEMO_STATUS_LABEL, getDemoAddress } from '../contracts/EscrowDemo';
import { SharpButton } from '../components/sharp/SharpButton';
import { SharpCard } from '../components/sharp/SharpCard';
import { SharpInput } from '../components/sharp/SharpInput';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';
import { WalletSnapshot } from '../components/sharp/WalletSnapshot';
import { TronDemoAcceptPanel } from '../components/sharp/TronDemoAcceptPanel';
import { DemoExplainerModal, hasSeenDemoExplainer } from '../components/sharp/DemoExplainerModal';
import { useTheme } from '../context/ThemeContext';

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

const ERC20_META_ABI = [
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

const DEMO_TYPES = {
  DemoAcceptance: [
    { name: 'depositor',  type: 'address' },
    { name: 'recipient',  type: 'address' },
    { name: 'amount',     type: 'uint256' },
    { name: 'token',      type: 'address' },
    { name: 'termsHash',  type: 'bytes32' },
  ],
} as const;

type Props = { initialDepositor?: string };

export default function DemoAccept({ initialDepositor = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

  const demoAddr = getDemoAddress(chain?.id);

  const [depositorInput, setDepositorInput] = useState(initialDepositor);
  const [queryAddr, setQueryAddr]           = useState(initialDepositor);
  const [sig, setSig]                       = useState<`0x${string}` | null>(null);
  const [demoDescription, setDemoDescription] = useState('');
  const [verifyToken, setVerifyToken]       = useState('');
  // First-time explainer modal — opens only on the recipient's FIRST
  // Accept click (per-browser, via localStorage flag). Subsequent
  // clicks call signTypedData directly. The flag flips in
  // markDemoExplainerSeen() when the user clicks "Continue to wallet".
  const [explainerOpen, setExplainerOpen]   = useState(false);

  const isValidAddr      = (a: string) => a.length === 42 && a.startsWith('0x');
  const isValidTronAddr  = (a: string) => a.length === 34 && a.startsWith('T');
  // Either an EVM 0x address or a TRON T address counts as "looks like a depositor".
  const isAcceptableAddr = (a: string) => isValidAddr(a) || isValidTronAddr(a);
  const isTronDepositor  = isValidTronAddr(queryAddr);

  useEffect(() => {
    if (initialDepositor) {
      setDepositorInput(initialDepositor);
      setQueryAddr(initialDepositor);
    }
  }, [initialDepositor]);

  useEffect(() => {
    if (!isValidAddr(queryAddr) || !chain?.id) return;
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    fetch(`${apiBase}/demo/meta?chainId=${chain.id}&depositor=${queryAddr}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { ok?: boolean; description?: string } | null) => {
        setDemoDescription(data?.ok && data.description ? data.description : '');
      })
      .catch(() => setDemoDescription(''));
  }, [queryAddr, chain?.id]);

  const { data: demo, isLoading } = useReadContract({
    address: demoAddr!, abi: DEMO_ABI, functionName: 'getDemoEscrow',
    args: [queryAddr as `0x${string}`],
    query: { enabled: isValidAddr(queryAddr) && !!demoAddr },
  });

  const isERC20 = demo && demo.token !== ETH_ZERO;
  const { data: tokenDecimals } = useReadContract({ address: demo?.token as `0x${string}`, abi: ERC20_META_ABI, functionName: 'decimals', query: { enabled: !!isERC20 } });
  const { data: tokenSymbol }   = useReadContract({ address: demo?.token as `0x${string}`, abi: ERC20_META_ABI, functionName: 'symbol',   query: { enabled: !!isERC20 } });

  const formatAmt = (raw: bigint) => {
    if (!demo) return '';
    if (!isERC20) return `${formatEther(raw)} ETH`;
    return `${formatUnits(raw, tokenDecimals ?? 18)} ${tokenSymbol ?? 'tokens'}`;
  };

  const hasDemo     = !!demo && demo.amount > 0n;
  const isPending   = hasDemo && demo.status === 0;
  const isAccepted  = hasDemo && demo.status === 1;
  const isApproved  = hasDemo && demo.status === 2;
  const isRecipient = address && demo && address.toLowerCase() === demo.recipient.toLowerCase();
  const statusLabel = hasDemo ? (DEMO_STATUS_LABEL[demo.status] ?? String(demo.status)) : '';

  const { signTypedData, isPending: isSigning, error: signError } = useSignTypedData();

  /** The raw "trigger the wallet popup" call. Called either directly
   *  (when the explainer has been seen before) or from the modal's
   *  "Continue to wallet" button after the explainer is acknowledged. */
  const triggerSign = () => {
    if (!demo || !demoAddr || !address) return;
    setSig(null);
    signTypedData(
      {
        domain: { name: 'MoneyCrowDemo', version: '1', chainId: chain!.id, verifyingContract: demoAddr },
        types: DEMO_TYPES,
        primaryType: 'DemoAcceptance',
        message: {
          depositor:  queryAddr as `0x${string}`,
          recipient:  address,
          amount:     demo.amount,
          token:      demo.token as `0x${string}`,
          termsHash:  demo.termsHash as `0x${string}`,
        },
      },
      { onSuccess: (s) => setSig(s) },
    );
  };

  /** User-facing entry point for the Sign button. First click in this
   *  browser surfaces the explainer; subsequent clicks fire the wallet
   *  popup directly. The flag flips inside DemoExplainerModal when the
   *  user clicks "Continue to wallet" (markDemoExplainerSeen()). */
  const handleSign = () => {
    if (hasSeenDemoExplainer()) {
      triggerSign();
    } else {
      setExplainerOpen(true);
    }
  };

  const { writeContract, data: txHash, isPending: isTxPending, error: txError, reset: resetTx } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // After the recipient accepts on-chain, give them a one-tap path to verify
  // their Telegram so they receive the DemoApproved notification. The username
  // sent here is a placeholder — the bot poller binds whatever Telegram
  // account taps /start, so as long as the admin typed the recipient's real
  // TG handle on Create, the binding will land on the correct username.
  useEffect(() => {
    if (!isSuccess || !address) return;
    const token   = crypto.randomUUID();
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    fetch(`${apiBase}/telegram/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, username: address }),
    }).catch(() => {});
    setVerifyToken(token);
  }, [isSuccess, address]);

  const handleAccept = () => {
    if (!sig || !demoAddr) return;
    resetTx();
    writeContract({ address: demoAddr, abi: DEMO_ABI, functionName: 'acceptDemo', args: [queryAddr as `0x${string}`, sig] });
  };

  const rowStyle: React.CSSProperties = { display: 'flex', gap: 0, borderBottom: `1px solid ${border}` };
  const labelStyle: React.CSSProperties = { width: 130, flexShrink: 0, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: `1px solid ${border}` };
  const valueStyle: React.CSSProperties = { flex: 1, padding: '10px 14px', fontSize: 13, color: isDark ? '#FFFFFF' : '#111111', wordBreak: 'break-all' };

  // TRON depositor — route to the TronLink-driven panel BEFORE the EVM
  // bails below. A user who pastes a T-address from a TRON-side invitation
  // email shouldn't be told "switch to Base or Polygon"; they should be
  // told "connect TronLink" (which the panel handles internally).
  if (isTronDepositor) {
    return (
      <div>
        <SharpPageHeader title="Demo Accept" subtitle="Sign demo acceptance to simulate the escrow flow." />

        <SharpCard style={{ padding: '28px 32px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <SharpInput
                label="Depositor Address"
                id="demoDepositorAddrTron"
                placeholder="0x… or T… (paste from your invitation email)"
                value={depositorInput}
                onChange={e => { setDepositorInput(e.target.value); setSig(null); resetTx(); }}
                onKeyDown={e => e.key === 'Enter' && isAcceptableAddr(depositorInput) && setQueryAddr(depositorInput)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <SharpButton size="sm"
                onClick={() => { setQueryAddr(depositorInput); setSig(null); resetTx(); }}
                disabled={!isAcceptableAddr(depositorInput)}>
                Query
              </SharpButton>
            </div>
          </div>
        </SharpCard>

        <TronDemoAcceptPanel depositorBase58={queryAddr} />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div>
        <SharpPageHeader title="Demo Accept" subtitle="Sign demo acceptance to simulate the escrow flow." />
        <SharpCard><div className="not-connected">Connect wallet to sign demo acceptance</div></SharpCard>
      </div>
    );
  }
  if (!demoAddr) {
    return (
      <div>
        <SharpPageHeader title="Demo Accept" subtitle="Sign demo acceptance to simulate the escrow flow." />
        <SharpCard><div className="not-connected">Demo not yet deployed on this network — switch to Base or Polygon</div></SharpCard>
      </div>
    );
  }

  return (
    <div>
      {/* First-time explainer. Renders nothing while closed. The
          "Continue to wallet" handler fires triggerSign(), which kicks
          off the same wallet popup the Sign button would have on a
          warm flag. */}
      <DemoExplainerModal
        open={explainerOpen}
        onCancel={() => setExplainerOpen(false)}
        onContinue={() => { setExplainerOpen(false); triggerSign(); }}
      />

      <SharpPageHeader title="Demo Accept" subtitle="Sign demo acceptance to simulate the escrow flow." />

      <SharpCard style={{ padding: '28px 32px' }}>
        {/* Demo banner */}
        <div style={{ background: '#F2B705', color: '#000', fontWeight: 700, padding: '8px 14px', marginBottom: 20, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.04em' }}>
          DEMO MODE — no real funds are involved
        </div>

        {/* Depositor lookup */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <SharpInput
                label="Depositor Address"
                id="demoDepositorAddr"
                placeholder="0x… or T… (paste from your invitation email)"
                value={depositorInput}
                onChange={e => { setDepositorInput(e.target.value); setSig(null); resetTx(); }}
                onKeyDown={e => e.key === 'Enter' && isAcceptableAddr(depositorInput) && setQueryAddr(depositorInput)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <SharpButton size="sm" onClick={() => { setQueryAddr(depositorInput); setSig(null); resetTx(); }}
                disabled={!isAcceptableAddr(depositorInput)}>
                Query
              </SharpButton>
            </div>
          </div>
        </div>

        {isLoading && <p style={{ fontSize: 13, color: textSecondary }}>Loading...</p>}

        {isValidAddr(queryAddr) && !isLoading && !hasDemo && (
          <p style={{ fontSize: 13, color: textSecondary }}>No demo found for this depositor address</p>
        )}

        {/* Status when not pending */}
        {hasDemo && !isPending && !isSuccess && (
          <div className={`alert ${isApproved ? 'alert-success' : 'alert-info'}`} style={{ marginTop: 12 }}>
            {isAccepted  && 'You already signed — waiting for admin to approve'}
            {isApproved  && 'Demo complete — the full escrow flow has been simulated'}
          </div>
        )}

        {/* Not the recipient */}
        {hasDemo && isPending && !isRecipient && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            Connected wallet is not the recipient for this demo<br />
            <code style={{ fontSize: 11 }}>Expected: {demo?.recipient}</code>
          </div>
        )}

        {/* Sign panel */}
        {hasDemo && isPending && isRecipient && !sig && !isSuccess && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: textSecondary, marginBottom: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Review demo details and sign the EIP-712 acceptance
            </p>

            <div style={{ border: `1px solid ${border}`, marginBottom: 20 }}>
              {([
                ['Status',      statusLabel],
                ['Amount',      `${formatAmt(demo.amount)} (simulated)`],
                ['Description', demoDescription ? `"${demoDescription}"` : '—'],
                ['Depositor',   demo.depositor],
                ['Recipient',   demo.recipient],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={rowStyle}>
                  <div style={labelStyle}>{label}</div>
                  <div style={valueStyle}>
                    {label === 'Depositor' || label === 'Recipient' ? <code>{value}</code> : value}
                  </div>
                </div>
              ))}
            </div>

            <SharpButton
              style={{ background: '#F2B705', color: '#000', border: 'none' }}
              onClick={handleSign}
              disabled={isSigning}
            >
              {isSigning ? 'Awaiting signature...' : 'Sign Demo Acceptance'}
            </SharpButton>

            {signError && <div className="alert alert-error" style={{ marginTop: 12 }}>{signError.message}</div>}
          </div>
        )}

        {/* Submit tx panel (after signing) */}
        {sig && !isSuccess && (
          <div style={{ marginTop: 16 }}>
            <div className="alert alert-success" style={{ marginBottom: 16, borderColor: '#F2B705', color: '#F2B705', background: 'rgba(242,183,5,0.06)' }}>
              Signature obtained — submit to chain to record acceptance
            </div>

            <p style={{ fontSize: 12, color: textTertiary, marginBottom: 6 }}>Signature:</p>
            <code style={{ fontSize: 10, color: textSecondary, wordBreak: 'break-all', display: 'block', marginBottom: 16 }}>{sig}</code>

            <SharpButton
              style={{ background: '#F2B705', color: '#000', border: 'none' }}
              onClick={handleAccept}
              disabled={isTxPending || isConfirming}
            >
              {isTxPending ? 'Awaiting signature...' : isConfirming ? 'Mining...' : 'Accept Demo'}
            </SharpButton>

            {txError && <div className="alert alert-error" style={{ marginTop: 12 }}>{txError.message}</div>}
          </div>
        )}

        {/* Receipt */}
        {isSuccess && (
          <div style={{ marginTop: 16 }}>
            <div className="alert alert-success" style={{ marginBottom: 16, borderColor: '#F2B705', color: '#F2B705', background: 'rgba(242,183,5,0.06)' }}>
              Demo accepted — admin will now approve to complete the flow
            </div>
            <div style={{ border: `1px solid ${border}`, marginBottom: 16 }}>
              <div style={rowStyle}>
                <div style={labelStyle}>Tx Hash</div>
                <div style={valueStyle}>
                  <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${txHash}`} target="_blank" rel="noreferrer"
                    style={{ color: '#F2B705', wordBreak: 'break-all' }}>
                    {txHash}
                  </a>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: textTertiary, lineHeight: 1.6 }}>
              The admin will call approveDemo() to finish the simulation. You'll receive a notification when it's done.
            </p>

            {verifyToken && (
              <button
                type="button"
                onClick={() => {
                  window.open(
                    `https://t.me/escrow_notifier_bot?start=verify_${verifyToken}`,
                    '_blank',
                    'noopener,noreferrer',
                  );
                  setVerifyToken('');
                }}
                style={{
                  display: 'block', width: '100%', marginTop: 16, padding: '10px 14px', textAlign: 'left',
                  background: 'rgba(242,183,5,0.07)', border: '1px solid rgba(242,183,5,0.35)',
                  cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: '#F2B705', lineHeight: 1.5,
                }}
              >
                Tap here to verify your Telegram and receive the approval notification
              </button>
            )}
          </div>
        )}
      </SharpCard>

      {/* Public balance snapshot — visible whenever the demo data has loaded
          (so the recipient can see what any site reads on a wallet connect). */}
      {hasDemo && demo?.recipient && (
        <div style={{ marginTop: 20 }}>
          <WalletSnapshot address={demo.recipient as `0x${string}`} />
        </div>
      )}
    </div>
  );
}
