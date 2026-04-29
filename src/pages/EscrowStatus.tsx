import { useState, useEffect } from 'react';
import { useReadContract, useAccount, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { ESCROW_ABI, getEscrowAddress, ESCROW_ADDRESS, STATUS_VARIANT } from '../contracts/Escrow';
import { SharpButton } from '../components/sharp/SharpButton';
import { SharpCard } from '../components/sharp/SharpCard';
import { SharpInput } from '../components/sharp/SharpInput';
import { SharpBadge } from '../components/sharp/SharpBadge';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';
import { TronStatusBanner } from '../components/TronStatusBanner';
import { useTheme } from '../context/ThemeContext';

const ERC20_META_ABI = [
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const;

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

const CHAIN_OPTIONS = [
  { id: 8453, name: 'Base',    color: '#4F8EFF' },
  { id: 137,  name: 'Polygon', color: '#A855F7' },
] as const;

const EXPLORER: Record<number, string> = {
  8453: 'https://basescan.org',
  137:  'https://polygonscan.com',
};

type Props = { onGoToClaim?: (depositor: string) => void };

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

const ACCEPTANCE_TYPES = {
  EscrowAcceptance: [
    { name: 'depositor',  type: 'address' },
    { name: 'recipient',  type: 'address' },
    { name: 'amount',     type: 'uint256' },
    { name: 'token',      type: 'address' },
    { name: 'termsHash',  type: 'bytes32' },
  ],
} as const;

function AcceptEscrowPanel({
  depositor, escrow, chainId, escrowAddr, terms,
}: {
  depositor: string;
  escrow: { recipient: `0x${string}`; amount: bigint; token: `0x${string}`; termsHash: `0x${string}`; acceptDeadline: bigint };
  terms?: string;
  chainId: number;
  escrowAddr: `0x${string}`;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';

  const now = BigInt(Math.floor(Date.now() / 1000));
  const deadlinePassed = escrow.acceptDeadline > 0n && escrow.acceptDeadline < now;

  const { signTypedData, isPending: signPending, data: signature, error: signError } = useSignTypedData();
  const { writeContract, data: acceptHash, isPending: writePending, error: writeError } = useWriteContract();
  const { isLoading: acceptConfirming, isSuccess: acceptDone } = useWaitForTransactionReceipt({ hash: acceptHash });

  const [verifyToken, setVerifyToken] = useState('');

  useEffect(() => {
    if (signature && !writePending && !acceptHash) {
      writeContract({
        address: escrowAddr, abi: ESCROW_ABI, functionName: 'acceptEscrow',
        args: [depositor as `0x${string}`, signature],
      });
    }
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the recipient accepts on-chain, register a Telegram verification
  // token so they can complete the bot /start flow and receive the
  // ReleaseApproved / Refunded notifications. The username sent here is just
  // a placeholder — bot poller binds whatever Telegram account taps /start.
  useEffect(() => {
    if (!acceptDone) return;
    const token   = crypto.randomUUID();
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    fetch(`${apiBase}/telegram/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, username: escrow.recipient }),
    }).catch(() => {});
    setVerifyToken(token);
  }, [acceptDone, escrow.recipient]);

  const handleSign = () => {
    signTypedData({
      domain: { name: 'MoneyCrow Escrow', version: '1', chainId, verifyingContract: escrowAddr },
      types: ACCEPTANCE_TYPES,
      primaryType: 'EscrowAcceptance',
      message: {
        depositor:  depositor as `0x${string}`,
        recipient:  escrow.recipient,
        amount:     escrow.amount,
        token:      escrow.token,
        termsHash:  escrow.termsHash,
      },
    });
  };

  if (deadlinePassed) {
    return <div className="alert alert-error" style={{ marginTop: 16 }}>Accept deadline has passed — depositor can reclaim via depositorRefund()</div>;
  }

  if (acceptDone) {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="alert alert-success">Escrow accepted — status is now <b>Active</b>. Admin will review and approve release.</div>
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
              display: 'block', width: '100%', marginTop: 12, padding: '10px 14px', textAlign: 'left',
              background: 'rgba(242,183,5,0.07)', border: '1px solid rgba(242,183,5,0.35)',
              cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: '#F2B705', lineHeight: 1.5,
            }}
          >
            Tap here to verify your Telegram and receive release / refund notifications
          </button>
        )}
      </div>
    );
  }

  const busy = signPending || writePending || acceptConfirming;

  return (
    <div style={{
      marginTop: 16, padding: '20px 24px',
      background: isDark ? 'rgba(79,142,255,0.05)' : 'rgba(79,142,255,0.04)',
      border: `1px solid rgba(79,142,255,0.2)`,
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#4F8EFF', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action required — you are the recipient</p>
      <p style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(17,17,17,0.55)', marginBottom: 16, lineHeight: 1.65 }}>
        Sign the escrow terms with your wallet to accept. This transitions the escrow from Pending → Active and lets the admin approve release.
      </p>

      {terms && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${border}`, fontSize: 13, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,17,17,0.65)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
          <span style={{ color: '#F2B705', fontWeight: 600 }}>Terms: </span>{terms}
        </div>
      )}

      <SharpButton onClick={handleSign} disabled={busy}>
        {signPending ? 'Signing...' : writePending ? 'Submitting...' : acceptConfirming ? 'Confirming...' : 'Sign & Accept Escrow'}
      </SharpButton>

      {(signError ?? writeError) && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {(signError ?? writeError)?.message}
        </div>
      )}
    </div>
  );
}

export default function EscrowStatus({ onGoToClaim }: Props) {
  const { address, chain: walletChain } = useAccount();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

  const [selectedChainId, setSelectedChainId] = useState<number>(
    walletChain?.id && ESCROW_ADDRESS[walletChain.id] ? walletChain.id : 8453
  );

  useEffect(() => {
    if (walletChain?.id && ESCROW_ADDRESS[walletChain.id]) {
      setSelectedChainId(walletChain.id);
    }
  }, [walletChain?.id]);

  const escrowAddr = getEscrowAddress(selectedChainId);
  const explorer   = EXPLORER[selectedChainId] ?? 'https://basescan.org';

  const urlDepositor = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get('depositor') ?? '';
      return v.length === 42 && v.startsWith('0x') ? v : '';
    } catch { return ''; }
  })();

  const [input, setInput] = useState(urlDepositor);
  const [query, setQuery] = useState(urlDepositor);
  const [escrowMetaData, setEscrowMetaData] = useState<{ description?: string; terms?: string } | null>(null);

  const isValidAddr = (a: string) => a.length === 42 && a.startsWith('0x');

  const { data: escrow, isLoading, error } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'getEscrow',
    args: [query as `0x${string}`],
    chainId: selectedChainId,
    query: { enabled: isValidAddr(query) && !!escrowAddr },
  });

  const { data: timeLeft } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'timeRemaining',
    args: [query as `0x${string}`],
    chainId: selectedChainId,
    query: { enabled: isValidAddr(query) && !!escrowAddr },
  });

  const { data: releaseApproved } = useReadContract({
    address: escrowAddr!, abi: ESCROW_ABI, functionName: 'releaseApproved',
    args: [query as `0x${string}`],
    chainId: selectedChainId,
    query: { enabled: isValidAddr(query) && !!escrowAddr && !!escrow && escrow.status === 1 },
  });

  useEffect(() => {
    if (!query || !selectedChainId) return;
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    fetch(`${apiBase}/escrow/meta?chainId=${selectedChainId}&depositor=${query}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { ok?: boolean; description?: string; terms?: string } | null) => {
        if (data?.ok) setEscrowMetaData({ description: data.description, terms: data.terms });
        else setEscrowMetaData(null);
      })
      .catch(() => setEscrowMetaData(null));
  }, [query, selectedChainId]);

  const isERC20 = escrow && escrow.token !== ETH_ZERO;

  const { data: tokenDecimals } = useReadContract({
    address: escrow?.token as `0x${string}`, abi: ERC20_META_ABI, functionName: 'decimals',
    chainId: selectedChainId, query: { enabled: !!isERC20 },
  });
  const { data: tokenSymbol } = useReadContract({
    address: escrow?.token as `0x${string}`, abi: ERC20_META_ABI, functionName: 'symbol',
    chainId: selectedChainId, query: { enabled: !!isERC20 },
  });

  const formatAmt = (raw: bigint) => {
    if (!isERC20) return `${formatEther(raw)} ETH`;
    return `${formatUnits(raw, tokenDecimals ?? 18)} ${tokenSymbol ?? 'tokens'}`;
  };

  const hasEscrow   = escrow && escrow.amount > 0n;
  const isRecipient = address && escrow && address.toLowerCase() === escrow.recipient.toLowerCase();
  const canGoClaim  = hasEscrow && escrow.status === 1 && releaseApproved === true && isRecipient;
  const showAcceptPanel = hasEscrow && escrow.status === 0 && isRecipient;
  const chainMeta = CHAIN_OPTIONS.find(c => c.id === selectedChainId)!;

  const rowStyle: React.CSSProperties = { display: 'flex', gap: 0, borderBottom: `1px solid ${border}`, minHeight: 40 };
  const labelStyle: React.CSSProperties = { width: 160, flexShrink: 0, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: `1px solid ${border}` };
  const valueStyle: React.CSSProperties = { flex: 1, padding: '10px 14px', fontSize: 13, color: isDark ? '#FFFFFF' : '#111111', wordBreak: 'break-all' };

  return (
    <div>
      <SharpPageHeader title="My Escrows" subtitle="Look up any escrow by depositor address — no wallet needed." />

      {/* TronLink-aware status row. Renders nothing if TronLink is absent;
          otherwise surfaces the connect / ready / coming-soon state for the
          recipient acceptance flow on TRON. */}
      <TronStatusBanner variant="accept" />

      <SharpCard style={{ padding: '28px 32px' }}>
        {/* Network selector */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>Network</p>
          <div style={{ display: 'flex', width: 'fit-content', border: `1px solid ${border}`, overflow: 'hidden' }}>
            {CHAIN_OPTIONS.map((chain) => (
              <button
                key={chain.id}
                type="button"
                className="sharp-touch"
                onClick={() => { setSelectedChainId(chain.id); setQuery(''); }}
                style={{
                  padding: '8px 20px', border: 'none', cursor: 'pointer',
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em',
                  background: selectedChainId === chain.id ? `${chain.color}18` : 'transparent',
                  color: selectedChainId === chain.id ? chain.color : textSecondary,
                  transition: 'all 0.12s',
                }}
              >
                <span style={{ display: 'inline-block', width: 6, height: 6, background: chain.color, marginRight: 6, verticalAlign: 'middle', opacity: selectedChainId === chain.id ? 1 : 0.35 }} />
                {chain.name}
              </button>
            ))}
          </div>
        </div>

        {/* Address input */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <SharpInput
              placeholder="0x... depositor address — no wallet needed"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isValidAddr(input) && setQuery(input)}
            />
          </div>
          <SharpButton size="sm" onClick={() => setQuery(input)} disabled={!isValidAddr(input)}>
            Query
          </SharpButton>
        </div>

        {isLoading && <p style={{ fontSize: 13, color: textSecondary }}>Loading from {chainMeta.name}...</p>}
        {error && <div className="alert alert-error">{error.message}</div>}

        {hasEscrow && (
          <>
            <div style={{ border: `1px solid ${border}`, marginTop: 8 }}>
              {/* Network row */}
              <div style={rowStyle}>
                <div style={labelStyle}>Network</div>
                <div style={valueStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: chainMeta.color, fontSize: 13, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, background: chainMeta.color }} />
                    {chainMeta.name}
                  </span>
                </div>
              </div>

              {/* Status row */}
              <div style={rowStyle}>
                <div style={labelStyle}>Status</div>
                <div style={{ ...valueStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SharpBadge status={STATUS_VARIANT[escrow.status] ?? 'pending'} />
                  {escrow.status === 1 && releaseApproved && (
                    <span style={{ fontSize: 11, color: '#F2B705', fontWeight: 600 }}>Release approved</span>
                  )}
                </div>
              </div>

              {([
                ['Depositor',   <code key="d">{escrow.depositor}</code>],
                ['Recipient',   <code key="r">{escrow.recipient}</code>],
                ['Amount',      formatAmt(escrow.amount)],
                ['Fee',         `${escrow.feeBps} bps (${Number(escrow.feeBps) / 100}%)`],
                ['Description', escrowMetaData?.description ? `"${escrowMetaData.description}"` : <span style={{ color: textTertiary }}>—</span>],
                ['Time Left',   timeLeft !== undefined
                  ? (timeLeft > 0n ? `${(Number(timeLeft) / 3600).toFixed(1)}h remaining` : 'Timed out — claimTimeout() available')
                  : '–'],
                ['Accept Deadline', fmtDeadline(escrow.acceptDeadline)],
                ['Terms',       escrowMetaData?.terms || <span style={{ color: textTertiary }}>—</span>],
              ] as [string, React.ReactNode][]).map(([label, value]) => (
                <div key={label} style={rowStyle}>
                  <div style={labelStyle}>{label}</div>
                  <div style={valueStyle}>{value}</div>
                </div>
              ))}

            </div>

            {/* Explorer link */}
            <div style={{ marginTop: 12 }}>
              <a
                href={`${explorer}/address/${escrowAddr}`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: textTertiary, textDecoration: 'none', transition: 'color 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.color = textSecondary; }}
                onMouseLeave={e => { e.currentTarget.style.color = textTertiary; }}
              >
                View contract on {chainMeta.name === 'Base' ? 'Basescan' : 'Polygonscan'} ↗
              </a>
            </div>

            {/* Accept escrow panel */}
            {showAcceptPanel && escrowAddr && (
              <AcceptEscrowPanel
                depositor={query}
                escrow={escrow}
                chainId={selectedChainId}
                escrowAddr={escrowAddr}
                terms={escrowMetaData?.terms}
              />
            )}

            {/* Claim button */}
            {canGoClaim && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, color: '#F2B705', fontWeight: 600, marginBottom: 10 }}>
                  Admin has approved release — claim your funds now
                </p>
                <SharpButton
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}
                  onClick={() => onGoToClaim?.(escrow.depositor)}
                >
                  Go to Claim →
                </SharpButton>
              </div>
            )}

            {/* Depositor refund for expired Pending */}
            {hasEscrow && escrow.status === 0 &&
              escrow.acceptDeadline > 0n &&
              BigInt(Math.floor(Date.now() / 1000)) > escrow.acceptDeadline &&
              address?.toLowerCase() === escrow.depositor.toLowerCase() && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, color: '#F87171', fontWeight: 600, marginBottom: 10 }}>
                  Accept deadline passed — recipient did not accept. You can reclaim your funds.
                </p>
                <DepositorRefundButton depositor={query} escrowAddr={escrowAddr!} />
              </div>
            )}
          </>
        )}

        {isValidAddr(query) && !isLoading && escrow && escrow.amount === 0n && (
          <p style={{ fontSize: 13, color: textSecondary }}>No escrow found for this address on {chainMeta.name}</p>
        )}

        {!query && (
          <p style={{ fontSize: 12, color: textTertiary, marginTop: 8 }}>
            No wallet connection required — any visitor can look up any escrow
          </p>
        )}
      </SharpCard>
    </div>
  );
}

function DepositorRefundButton({ depositor, escrowAddr }: { depositor: string; escrowAddr: `0x${string}` }) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  if (isSuccess) {
    return <div className="alert alert-success">Refunded — funds returned to depositor</div>;
  }

  return (
    <div>
      <SharpButton
        style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}
        onClick={() => writeContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'depositorRefund', args: [depositor as `0x${string}`] })}
        disabled={isPending || confirming}
      >
        {isPending ? 'Awaiting signature...' : confirming ? 'Confirming...' : 'Depositor Refund'}
      </SharpButton>
      {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error.message}</div>}
    </div>
  );
}
