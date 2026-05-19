import { useState, useEffect, useMemo } from 'react';
import {
  useWriteContract, useReadContract, useAccount,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { DEMO_ABI, DEMO_STATUS_LABEL, DEMO_STATUS_VARIANT, getDemoAddress } from '../../contracts/EscrowDemo';
import { SharpButton } from './SharpButton';
import { SharpCard } from './SharpCard';
import { SharpInput } from './SharpInput';
import { SharpBadge } from './SharpBadge';
import { useTheme } from '../../context/ThemeContext';

/**
 * Admin "Demo Mode" panel — extracted from AdminDashboard.tsx so the
 * demo flow can grow without bloating the dashboard page itself.
 *
 * Two surfaces:
 *
 *   1. Status card (new in this commit). When the connected admin has
 *      an existing demo on chain, render a card showing recipient,
 *      token+amount, age, terms hash, and the action button that fits
 *      the current state (Approve & Release for Accepted, italic
 *      caption for Pending awaiting recipient, nothing for Approved).
 *      Collapsed by default once Approved; expanded otherwise.
 *
 *   2. Create form. Unchanged from the prior inline DemoPanel — same
 *      tokens, same metadata POST to backend, same wiring. Lives below
 *      the status card so a fresh admin (no existing demo) sees the
 *      form immediately.
 */

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

/** Token picker for the Create Demo form. Same list as the prior inline
 *  version — kept verbatim so the dropdown ordering and labels match
 *  exactly. Native ETH first, then the common stables + WETH. */
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Best-effort symbol lookup for a token address, falling back to a
 *  truncated 0x… form when the address isn't in our curated list.
 *  Native (0x0…) is rendered as the chain's native symbol. */
function tokenInfo(
  token: string,
  chainId: number,
  nativeSymbol: string,
): { symbol: string; decimals: number } {
  if (token.toLowerCase() === ETH_ZERO) return { symbol: nativeSymbol, decimals: 18 };
  const list = DEMO_TOKENS[chainId] ?? [];
  const hit  = list.find(t => t.address.toLowerCase() === token.toLowerCase());
  if (hit) return { symbol: hit.label, decimals: hit.decimals };
  // Unknown token — show truncated address as a stand-in symbol, default
  // to 18-decimal so the amount display doesn't blow up.
  return { symbol: `${token.slice(0, 6)}…${token.slice(-4)}`, decimals: 18 };
}

/** Compact age string + full ISO for hover. createdAt is a unix-seconds
 *  bigint (block.timestamp in the contract). Returns "Just now" for
 *  sub-minute deltas to avoid the awkward "0m ago" edge. */
function formatAge(createdAt: bigint): { rel: string; iso: string } {
  const ms     = Number(createdAt) * 1000;
  const iso    = new Date(ms).toISOString();
  const secs   = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60)        return { rel: 'just now',                  iso };
  const mins = Math.floor(secs / 60);
  if (mins < 60)        return { rel: `${mins}m ago`,              iso };
  const hrs  = Math.floor(mins / 60);
  if (hrs < 24)         return { rel: `${hrs}h ago`,               iso };
  const days = Math.floor(hrs / 24);
  if (days < 30)        return { rel: `${days}d ago`,              iso };
  const months = Math.floor(days / 30);
  return { rel: `${months}mo ago`, iso };
}

/** Truncate a 32-byte hex string for compact display. Full value goes
 *  in the `title` attribute so hover reveals it. */
function truncHash(h: string): string {
  if (h.length <= 14) return h;
  return `${h.slice(0, 6)}…${h.slice(-6)}`;
}

/** Compact wallet-address form — different ratio from truncHash because
 *  the suffix is what matters for visual disambiguation between two
 *  addresses with similar prefixes. */
function truncAddr(a: string): string {
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Connected admin's wallet — same address used to read the demo struct
   *  via getDemoEscrow(adminAddr). Parent guarantees this equals the
   *  contract's `admin()` because the entire AdminDashboard is gated on
   *  isAdmin before rendering this panel. */
  address: `0x${string}`;
  chain:   NonNullable<ReturnType<typeof useAccount>['chain']>;
}

export function DemoModePanel({ address: adminAddr, chain }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border       = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary  = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';
  const textPrimary   = isDark ? '#FFFFFF' : '#111111';

  const demoAddr = getDemoAddress(chain.id);
  const tokens   = DEMO_TOKENS[chain.id] ?? DEMO_TOKENS[8453];
  const explorerBase = chain.blockExplorers?.default.url ?? 'https://basescan.org';
  const nativeSymbol = chain.nativeCurrency?.symbol ?? 'ETH';

  // ── Create form state (unchanged from prior inline DemoPanel) ─────────────
  const [recipient,         setRecipient]         = useState('');
  const [selectedTokenIdx,  setSelectedTokenIdx]  = useState(0);
  const [customToken,       setCustomToken]       = useState('');
  const [showCustom,        setShowCustom]        = useState(false);
  const [amount,            setAmount]            = useState('');
  const [description,       setDescription]       = useState('');
  const [recipientEmail,    setRecipientEmail]    = useState('');
  const [recipientTelegram, setRecipientTelegram] = useState('');
  const [depositorEmail,    setDepositorEmail]    = useState('');
  const [depositorTelegram, setDepositorTelegram] = useState('');
  const [createErrorMsg,    setCreateErrorMsg]    = useState('');
  const [verifyToken,       setVerifyToken]       = useState('');

  useEffect(() => { setSelectedTokenIdx(0); setCustomToken(''); setShowCustom(false); }, [chain.id]);

  const selectedToken = tokens[selectedTokenIdx];
  const tokenAddress  = showCustom ? customToken : selectedToken.address;
  const tokenDecimals = showCustom ? 18 : selectedToken.decimals;
  const isValidToken  = !showCustom || (customToken.length === 42 && customToken.startsWith('0x'));
  const isValidRecip  = recipient.length === 42 && recipient.startsWith('0x');
  const parsedAmount  = (() => {
    try {
      const n = parseFloat(amount);
      if (isNaN(n) || n <= 0) return null;
      return BigInt(Math.round(n * 10 ** tokenDecimals));
    } catch { return null; }
  })();
  const canCreate = !!demoAddr && isValidRecip && !!parsedAmount && !!description && isValidToken;

  // ── On-chain demo read ────────────────────────────────────────────────────
  const { data: demo, refetch: refetchDemo } = useReadContract({
    address: demoAddr!, abi: DEMO_ABI, functionName: 'getDemoEscrow',
    args: [adminAddr], query: { enabled: !!demoAddr },
  });
  // "Real" demo means a populated struct — not just the zero-value tuple
  // the contract returns for an unknown depositor. The previous code only
  // checked amount > 0n, which works for the live case but lets through a
  // hypothetical "create but never paid" half-state. createdAt > 0 AND
  // recipient != 0x0 is the canonical "this slot is occupied" signal.
  const realDemo = !!demo
    && demo.createdAt > 0n
    && demo.recipient.toLowerCase() !== ETH_ZERO;
  const demoStatus = realDemo ? demo.status : -1;

  // ── Write hooks ───────────────────────────────────────────────────────────
  const { writeContract: writeCreate, data: createHash, isPending: createPending, error: createError, reset: resetCreate } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash });

  useEffect(() => {
    if (!createSuccess) return;
    refetchDemo();
    if (depositorTelegram.trim()) {
      const token   = crypto.randomUUID();
      const handle  = depositorTelegram.trim();
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
      fetch(`${apiBase}/telegram/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, username: handle }),
      }).catch(() => {});
      setVerifyToken(token);
    }
  }, [createSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!canCreate || !demoAddr || !adminAddr) return;
    resetCreate();
    setCreateErrorMsg('');
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    let termsHash: `0x${string}`;
    try {
      const res = await fetch(`${apiBase}/demo/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          depositorAddress:  adminAddr,
          chainId:           chain.id,
          depositorEmail,
          depositorTelegram,
          recipientEmail,
          recipientTelegram,
          description,
        }),
      });
      const data = await res.json() as { ok: boolean; termsHash?: string };
      if (!data.ok || !data.termsHash) throw new Error('Register failed');
      termsHash = data.termsHash as `0x${string}`;
    } catch {
      setCreateErrorMsg('Could not reach server — please try again');
      return;
    }
    writeCreate({
      address: demoAddr, abi: DEMO_ABI, functionName: 'createDemo',
      args: [recipient as `0x${string}`, tokenAddress as `0x${string}`, parsedAmount!, termsHash],
    });
  };

  const { writeContract: writeApprove, data: approveHash, isPending: approvePending, error: approveError, reset: resetApprove } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => { if (approveSuccess) { refetchDemo(); } }, [approveSuccess, refetchDemo]);

  const handleApproveDemo = () => {
    if (!demoAddr) return;
    resetApprove();
    writeApprove({ address: demoAddr, abi: DEMO_ABI, functionName: 'approveDemo', args: [adminAddr] });
  };

  // ── Status card open/collapsed state ──────────────────────────────────────
  // Default: open for Pending/Accepted (action might be needed), collapsed
  // for Approved (terminal, no action). The user can still toggle either way.
  const [statusOpen, setStatusOpen] = useState(true);
  useEffect(() => {
    if (!realDemo) return;
    setStatusOpen(demoStatus !== 2);
  }, [realDemo, demoStatus]);

  // ── Derived display values for the status card ────────────────────────────
  const tokenMeta = useMemo(
    () => realDemo
      ? tokenInfo(demo.token, chain.id, nativeSymbol)
      : null,
    [realDemo, demo?.token, chain.id, nativeSymbol],
  );
  const amountDisplay = realDemo && tokenMeta
    ? (demo.token.toLowerCase() === ETH_ZERO
        ? formatEther(demo.amount)
        : formatUnits(demo.amount, tokenMeta.decimals))
    : '';
  const age = realDemo ? formatAge(demo.createdAt) : null;

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 0,
    background: isDark ? '#1C1C1C' : '#FFFFFF',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'}`,
    color: isDark ? '#FFFFFF' : '#111111',
    fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, outline: 'none',
    cursor: 'pointer', boxSizing: 'border-box' as const,
  };

  if (!demoAddr) {
    return (
      <SharpCard>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F2B705', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Demo Mode</span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: textSecondary }}>
            MoneyCrowDemo not yet deployed on this network.
            Deploy with: <code>npx hardhat ignition deploy ignition/modules/Demo.ts --network {chain.name.toLowerCase()}</code>
          </p>
        </div>
      </SharpCard>
    );
  }

  // Section-header style for inner labels — matches the existing visual
  // language used by the Create form ("Create Demo — set up a simulated …").
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: textTertiary,
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12,
  };

  // Card containing the per-row label/value pairs for the status card.
  // Pulled out for legibility — the JSX below is already dense.
  const rowLabelStyle: React.CSSProperties = {
    width: 120, flexShrink: 0,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: textTertiary, paddingTop: 3,
  };
  const rowValueStyle: React.CSSProperties = {
    flex: 1, minWidth: 0,
    fontSize: 13, color: textPrimary, wordBreak: 'break-all',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    paddingBottom: 10,
  };

  return (
    <SharpCard>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#F2B705', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Demo Mode</span>
        <span style={{ fontSize: 12, color: textSecondary }}>— createDemo / approveDemo</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {/* Demo banner */}
        <div style={{ background: '#F2B705', color: '#000', fontWeight: 700, padding: '8px 14px', marginBottom: 16, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}>
          DEMO MODE — no real funds are involved
        </div>

        {/* ── Status card (replaces the old single-line PENDING label) ────── */}
        {realDemo && (
          <div style={{
            marginBottom: 20,
            border: `1px solid ${border}`,
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          }}>
            {/* Header — always visible, click to toggle expand */}
            <button
              type="button"
              onClick={() => setStatusOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif",
                color: textPrimary,
                borderBottom: statusOpen ? `1px solid ${border}` : 'none',
              }}
            >
              <span style={{ fontSize: 11, color: textTertiary, width: 12 }}>{statusOpen ? '▾' : '▸'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Current Demo
              </span>
              <SharpBadge status={DEMO_STATUS_VARIANT[demoStatus] ?? 'pending'} />
              <span style={{ fontSize: 11, color: textTertiary }}>
                {DEMO_STATUS_LABEL[demoStatus] ?? ''}
              </span>
              <div style={{ flex: 1 }} />
              {age && (
                <span title={age.iso} style={{ fontSize: 11, color: textTertiary }}>
                  {age.rel}
                </span>
              )}
            </button>

            {/* Body — populated rows for recipient / amount / terms hash */}
            {statusOpen && (
              <div style={{ padding: '14px 14px 6px' }}>
                {/* Recipient */}
                <div style={rowStyle}>
                  <div style={rowLabelStyle}>Recipient</div>
                  <div style={{ ...rowValueStyle, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <code style={{ fontFamily: 'monospace', fontSize: 12, color: textPrimary }}>{demo.recipient}</code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(demo.recipient).catch(() => {})}
                      title="Copy address"
                      aria-label="Copy recipient address"
                      style={{
                        background: 'transparent', border: `1px solid ${border}`,
                        padding: '2px 6px', cursor: 'pointer',
                        fontSize: 10, color: textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase',
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      copy
                    </button>
                    <a
                      href={`${explorerBase}/address/${demo.recipient}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on block explorer"
                      style={{
                        fontSize: 10, color: '#F2B705', letterSpacing: '0.06em', textTransform: 'uppercase',
                        textDecoration: 'none', padding: '2px 6px',
                        border: '1px solid rgba(242,183,5,0.30)',
                      }}
                    >
                      view ↗
                    </a>
                  </div>
                </div>

                {/* Token + amount */}
                <div style={rowStyle}>
                  <div style={rowLabelStyle}>Amount</div>
                  <div style={rowValueStyle}>
                    <span style={{ fontFamily: 'monospace' }}>{amountDisplay}</span>
                    <span style={{ marginLeft: 6, color: textSecondary, fontSize: 12 }}>{tokenMeta?.symbol}</span>
                  </div>
                </div>

                {/* Terms hash */}
                <div style={rowStyle}>
                  <div style={rowLabelStyle}>Terms hash</div>
                  <div style={rowValueStyle}>
                    <code title={demo.termsHash} style={{ fontFamily: 'monospace', fontSize: 12, color: textPrimary }}>
                      {truncHash(demo.termsHash)}
                    </code>
                  </div>
                </div>

                {/* Created timestamp — full ISO already on the header hover,
                    but include it as a row too for users who don't think to
                    hover. The relative form on the header is enough at a
                    glance; this row is the authoritative timestamp. */}
                <div style={rowStyle}>
                  <div style={rowLabelStyle}>Created</div>
                  <div style={rowValueStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: textPrimary }}>
                      {age?.iso}
                    </span>
                  </div>
                </div>

                {/* Per-status action row. The matrix:
                      - Pending  + admin == depositor → italic "waiting" caption
                      - Pending  + admin != depositor → "Force Approve" disabled
                                                        (unreachable inside the
                                                        admin panel today, but
                                                        encoded for symmetry)
                      - Accepted + admin               → "Approve & Release"
                      - Approved                       → nothing
                    `acceptDemo` for recipient-side flow lives at
                    /demo-accept?address=<depositor> — already implemented
                    in src/pages/DemoAccept.tsx; the banner + My-Demos tab
                    in a later commit will surface that route to recipients. */}
                <div style={{ marginTop: 12, borderTop: `1px solid ${border}`, paddingTop: 14 }}>
                  {demoStatus === 0 && demo.depositor.toLowerCase() === adminAddr.toLowerCase() && (
                    <p style={{ fontSize: 12, color: textSecondary, fontStyle: 'italic', margin: 0 }}>
                      Waiting for recipient <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{truncAddr(demo.recipient)}</code> to accept.
                    </p>
                  )}
                  {demoStatus === 0 && demo.depositor.toLowerCase() !== adminAddr.toLowerCase() && (
                    <span
                      title="approveDemo requires recipient acceptance first — contract reverts on Pending state"
                      style={{ display: 'inline-block', cursor: 'not-allowed' }}
                    >
                      <SharpButton disabled style={{ opacity: 0.5 }}>
                        Force Approve
                      </SharpButton>
                    </span>
                  )}
                  {demoStatus === 1 && (
                    <div>
                      {approveSuccess ? (
                        <div className="alert alert-success">Demo approved — flow complete</div>
                      ) : (
                        <>
                          <SharpButton
                            style={{ background: '#F2B705', color: '#000', border: 'none' }}
                            onClick={handleApproveDemo}
                            disabled={approvePending || approveConfirming}
                          >
                            {approvePending ? 'Awaiting signature...' : approveConfirming ? 'Mining...' : 'Approve & Release'}
                          </SharpButton>
                          {approveError && <div className="alert alert-error" style={{ marginTop: 8 }}>{approveError.message}</div>}
                        </>
                      )}
                      {approveHash && (
                        <div style={{ marginTop: 6, fontSize: 11 }}>
                          <a href={`${explorerBase}/tx/${approveHash}`} target="_blank" rel="noreferrer"
                            style={{ color: textTertiary }}>View tx ↗</a>
                        </div>
                      )}
                    </div>
                  )}
                  {demoStatus === 2 && (
                    <p style={{ fontSize: 12, color: textSecondary, fontStyle: 'italic', margin: 0 }}>
                      Demo complete — terminal state, no further actions.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Create Demo form ─────────────────────────────────────────────── */}
        <p style={sectionLabel}>
          Create Demo — set up a simulated escrow
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <SharpInput label="Recipient Address" id="demoRecipient" placeholder="0x..." value={recipient} onChange={e => setRecipient(e.target.value)} />

          {/* Token picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: textSecondary, letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>Token</label>
            <select
              value={showCustom ? '__custom__' : String(selectedTokenIdx)}
              onChange={e => {
                if (e.target.value === '__custom__') { setShowCustom(true); }
                else { setShowCustom(false); setSelectedTokenIdx(Number(e.target.value)); }
              }}
              style={selectStyle}
            >
              {tokens.map((t, i) => (<option key={t.address} value={String(i)}>{t.label}</option>))}
              <option value="__custom__">custom address…</option>
            </select>
            {showCustom && (
              <SharpInput placeholder="0x... ERC-20 token address" value={customToken} onChange={e => setCustomToken(e.target.value)} />
            )}
          </div>

          <SharpInput
            label={`Amount (${showCustom ? 'tokens' : selectedToken.label})`}
            id="demoAmount" type="number" min="0" step="any" placeholder="e.g. 1.5"
            value={amount} onChange={e => setAmount(e.target.value)}
          />
          <SharpInput label="Description" id="demoDesc" placeholder="e.g. Demo payment for consulting services" value={description} onChange={e => setDescription(e.target.value)} />

          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SharpInput label="Recipient Email" id="demoREmail" type="email" placeholder="recipient@example.com" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} />
            <SharpInput label="Recipient Telegram" id="demoRTg" placeholder="@username" value={recipientTelegram} onChange={e => setRecipientTelegram(e.target.value)} />
            <SharpInput label="Depositor Email" id="demoDEmail" type="email" placeholder="admin@example.com" value={depositorEmail} onChange={e => setDepositorEmail(e.target.value)} />
            <SharpInput label="Depositor Telegram" id="demoDTg" placeholder="@username" value={depositorTelegram} onChange={e => setDepositorTelegram(e.target.value)} />
          </div>
        </div>

        {createSuccess ? (
          <div className="alert alert-success">
            Demo created — recipient notified to sign acceptance
            {createHash && (
              <span style={{ marginLeft: 8, fontSize: 11 }}>
                <a href={`${explorerBase}/tx/${createHash}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>View tx ↗</a>
              </span>
            )}
          </div>
        ) : (
          <SharpButton
            style={{ background: '#F2B705', color: '#000', border: 'none' }}
            onClick={handleCreate}
            disabled={!canCreate || createPending || createConfirming}
          >
            {createPending ? 'Awaiting signature...' : createConfirming ? 'Mining...' : 'Create Demo'}
          </SharpButton>
        )}

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
            Demo created — tap here to verify your Telegram and receive notifications
          </button>
        )}

        {createErrorMsg && <div className="alert alert-error" style={{ marginTop: 12 }}>{createErrorMsg}</div>}
        {createError && <div className="alert alert-error" style={{ marginTop: 12 }}>{createError.message}</div>}
      </div>
    </SharpCard>
  );
}
