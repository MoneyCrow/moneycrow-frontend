import { useState, useEffect, useCallback } from 'react';
import {
  useWriteContract, useReadContract, useAccount,
  useWaitForTransactionReceipt, usePublicClient,
} from 'wagmi';
import { formatEther, formatUnits, parseAbiItem } from 'viem';
import { ESCROW_ABI, getEscrowAddress, STATUS_LABEL, STATUS_VARIANT } from '../contracts/Escrow';
import { DEMO_ABI, DEMO_STATUS_VARIANT, getDemoAddress } from '../contracts/EscrowDemo';
import { SharpButton } from '../components/sharp/SharpButton';
import { SharpCard } from '../components/sharp/SharpCard';
import { SharpInput } from '../components/sharp/SharpInput';
import { SharpBadge } from '../components/sharp/SharpBadge';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';
import { useTheme } from '../context/ThemeContext';

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

const DEPLOY_BLOCK: Record<number, bigint> = {
  8453: 44905249n,
  137:  85739901n,
};

const CHUNK_SIZE = 10_000n;

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6  },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI',  decimals: 18 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6  },
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6  },
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI',  decimals: 18 },
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 },
};

const DEPOSITED_EVENT = parseAbiItem(
  'event Deposited(address indexed depositor, address indexed recipient, address token, uint256 amount, uint16 feeBps)',
);

interface EscrowRow {
  depositor: `0x${string}`; recipient: `0x${string}`; token: `0x${string}`;
  amount: bigint; status: number; feeBps: number;
  createdAt: bigint; acceptDeadline: bigint;
}

function EscrowListPanel({ escrowAddr, chainId, onSelectDepositor }: {
  escrowAddr: `0x${string}`; chainId: number; onSelectDepositor: (addr: string) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

  const publicClient = usePublicClient();
  const [rows,         setRows]         = useState<EscrowRow[]>([]);
  const [scanning,     setScanning]     = useState(false);
  const [scanned,      setScanned]      = useState(false);
  const [scanError,    setScanError]    = useState('');
  const [scanProgress, setScanProgress] = useState('');
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);

  const trunc = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const fmtAmt = (r: EscrowRow) => {
    if (r.token.toLowerCase() === ETH_ZERO) return `${formatEther(r.amount)} ETH`;
    const known = KNOWN_TOKENS[r.token.toLowerCase()];
    if (known) return `${formatUnits(r.amount, known.decimals)} ${known.symbol}`;
    return `${formatUnits(r.amount, 18)} (${r.token.slice(0, 8)}…)`;
  };

  const fmtDeadline = (ts: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (ts === 0n) return '// none';
    if (ts < now)  return 'expired';
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
      const totalChunks = Number((toBlock - fromBlock + CHUNK_SIZE) / CHUNK_SIZE);
      const warnings: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allLogs: any[] = [];

      let chunkFrom = fromBlock;
      let chunkIdx  = 0;

      while (chunkFrom <= toBlock) {
        const chunkTo = chunkFrom + CHUNK_SIZE - 1n < toBlock ? chunkFrom + CHUNK_SIZE - 1n : toBlock;
        chunkIdx++;
        setScanProgress(`chunk ${chunkIdx}/${totalChunks}`);
        try {
          const chunk = await publicClient.getLogs({ address: escrowAddr, event: DEPOSITED_EVENT, fromBlock: chunkFrom, toBlock: chunkTo });
          allLogs.push(...chunk);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`skipped blocks ${chunkFrom}–${chunkTo}: ${msg}`);
        }
        chunkFrom = chunkTo + 1n;
      }

      if (warnings.length > 0) setScanWarnings(warnings);

      const seen = new Set<string>();
      const order: `0x${string}`[] = [];
      const eventAmounts = new Map<string, { amount: bigint; token: `0x${string}` }>();

      for (const log of [...allLogs].reverse()) {
        const args = log.args as { depositor?: `0x${string}`; amount?: bigint; token?: `0x${string}` };
        const dep = args.depositor;
        if (!dep) continue;
        const key = dep.toLowerCase();
        if (args.amount !== undefined) {
          eventAmounts.set(key, { amount: args.amount, token: args.token ?? (ETH_ZERO as `0x${string}`) });
        }
        if (!seen.has(key)) { seen.add(key); order.unshift(dep); }
      }

      setScanProgress('reading escrow state…');

      type GetEscrowResult = {
        depositor: `0x${string}`; recipient: `0x${string}`; token: `0x${string}`;
        amount: bigint; createdAt: bigint; status: number | bigint; feeBps: number | bigint;
        termsHash: `0x${string}`; acceptDeadline: bigint;
      };

      const escrows = await Promise.all(
        order.map(dep => publicClient.readContract({
          address: escrowAddr, abi: ESCROW_ABI, functionName: 'getEscrow', args: [dep],
        }) as Promise<GetEscrowResult>)
      );

      setRows(escrows.map((e, i) => {
        const dep = order[i];
        const evtAmt = eventAmounts.get(dep.toLowerCase());
        const amount = e.amount > 0n ? e.amount : (evtAmt?.amount ?? 0n);
        const token  = e.token !== ETH_ZERO ? e.token : (evtAmt?.token ?? e.token);
        return {
          depositor: dep, recipient: e.recipient, token, amount,
          status: Number(e.status), feeBps: Number(e.feeBps),
          createdAt: e.createdAt, acceptDeadline: e.acceptDeadline,
        };
      }));
      setScanned(true);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  }, [publicClient, escrowAddr, chainId]);

  useEffect(() => {
    if (publicClient) scan();
  }, [scan]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = rows.filter(r => r.status === 0 || r.status === 1);
  const closed = rows.filter(r => r.status === 2 || r.status === 3);

  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 12px', borderBottom: `1px solid ${border}` };
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, borderBottom: `1px solid ${border}` };

  return (
    <SharpCard>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4F8EFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Escrow List</span>
        <span style={{ fontSize: 12, color: textSecondary }}>— all deposits on-chain</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <SharpButton size="sm" onClick={scan} disabled={scanning}>
            {scanning ? 'Scanning...' : scanned ? 'Refresh' : 'Scan'}
          </SharpButton>
          {scanned && !scanning && (
            <span style={{ fontSize: 12, color: textTertiary }}>
              {rows.length} total · {active.length} active · {closed.length} closed
            </span>
          )}
          {scanning && scanProgress && (
            <span style={{ fontSize: 12, color: '#4F8EFF' }}>{scanProgress}</span>
          )}
        </div>

        {scanError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{scanError}</div>}
        {scanWarnings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {scanWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#F2B705', marginBottom: 2 }}>Warning: {w}</div>
            ))}
          </div>
        )}

        {scanned && rows.length === 0 && !scanning && (
          <p style={{ fontSize: 13, color: textSecondary }}>No deposits found in block range</p>
        )}

        {active.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Active Escrows</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Depositor</th>
                    <th style={thStyle}>Recipient</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Deadline / Note</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(r => (
                    <tr key={r.depositor}>
                      <td style={tdStyle}><code style={{ color: '#4F8EFF' }} title={r.depositor}>{trunc(r.depositor)}</code></td>
                      <td style={tdStyle}><code style={{ color: textSecondary }} title={r.recipient}>{trunc(r.recipient)}</code></td>
                      <td style={{ ...tdStyle, color: '#34D399' }}>{fmtAmt(r)}</td>
                      <td style={tdStyle}><SharpBadge status={STATUS_VARIANT[r.status] ?? 'pending'} /></td>
                      <td style={{ ...tdStyle, color: textTertiary }}>
                        {r.status === 0 ? fmtDeadline(r.acceptDeadline) : '—'}
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => onSelectDepositor(r.depositor)}
                          style={{ fontSize: 11, color: '#F2B705', cursor: 'pointer', background: 'none', border: 'none', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}
                        >
                          Select →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {closed.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Closed Escrows</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Depositor</th>
                    <th style={thStyle}>Recipient</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(r => (
                    <tr key={r.depositor}>
                      <td style={tdStyle}><code style={{ color: textTertiary }} title={r.depositor}>{trunc(r.depositor)}</code></td>
                      <td style={tdStyle}><code style={{ color: textTertiary }} title={r.recipient}>{trunc(r.recipient)}</code></td>
                      <td style={{ ...tdStyle, color: textSecondary }}>{fmtAmt(r)}</td>
                      <td style={tdStyle}><SharpBadge status={STATUS_VARIANT[r.status] ?? 'refunded'} /></td>
                      <td style={{ ...tdStyle, color: textTertiary }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </SharpCard>
  );
}

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

  const demoAddr = getDemoAddress(chain.id);
  const tokens   = DEMO_TOKENS[chain.id] ?? DEMO_TOKENS[8453];

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
  const [createErrorMsg,    setCreateErrorMsg]     = useState('');

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

  const { data: demo, refetch: refetchDemo } = useReadContract({
    address: demoAddr!, abi: DEMO_ABI, functionName: 'getDemoEscrow',
    args: [adminAddr], query: { enabled: !!demoAddr },
  });
  const hasDemo    = !!demo && demo.amount > 0n;
  const demoStatus = hasDemo ? demo.status : -1;

  const { writeContract: writeCreate, data: createHash, isPending: createPending, error: createError, reset: resetCreate } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash });

  useEffect(() => { if (createSuccess) { refetchDemo(); } }, [createSuccess, refetchDemo]);

  const handleCreate = async () => {
    if (!canCreate || !demoAddr || !address) return;
    resetCreate();
    setCreateErrorMsg('');
    // Abort if registration fails — proceeding without it means no notifications
    // and no description visible to the recipient.
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    let termsHash: `0x${string}`;
    try {
      const res = await fetch(`${apiBase}/demo/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          depositorAddress:  address,
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

        {/* Current demo status */}
        {hasDemo && (
          <div style={{ marginBottom: 16, padding: '12px 16px', border: `1px solid ${border}`, fontSize: 12 }}>
            <span style={{ color: textSecondary }}>current_demo_status: </span>
            <SharpBadge status={DEMO_STATUS_VARIANT[demoStatus] ?? 'pending'} />
            {demoStatus === 1 && <span style={{ color: textTertiary, marginLeft: 8 }}>— recipient signed, ready to approve</span>}
            {demoStatus === 2 && <span style={{ color: textTertiary, marginLeft: 8 }}>— demo complete</span>}
          </div>
        )}

        {/* approveDemo */}
        {demoStatus === 1 && (
          <div style={{ marginBottom: 20 }}>
            {approveSuccess ? (
              <div className="alert alert-success">Demo approved — flow complete</div>
            ) : (
              <>
                <SharpButton
                  style={{ background: '#F2B705', color: '#000', border: 'none' }}
                  onClick={handleApproveDemo}
                  disabled={approvePending || approveConfirming}
                >
                  {approvePending ? 'Awaiting signature...' : approveConfirming ? 'Mining...' : 'Approve Demo'}
                </SharpButton>
                {approveError && <div className="alert alert-error" style={{ marginTop: 8 }}>{approveError.message}</div>}
              </>
            )}
            {approveHash && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <a href={`${chain.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${approveHash}`} target="_blank" rel="noreferrer"
                  style={{ color: textTertiary }}>View tx ↗</a>
              </div>
            )}
            <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '20px 0' }} />
          </div>
        )}

        <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
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
                <a href={`${chain.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${createHash}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>View tx ↗</a>
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

        {createErrorMsg && <div className="alert alert-error" style={{ marginTop: 12 }}>{createErrorMsg}</div>}
        {createError && <div className="alert alert-error" style={{ marginTop: 12 }}>{createError.message}</div>}
      </div>
    </SharpCard>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';
  return (
    <tr>
      <td style={{ width: 176, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, verticalAlign: 'top' }}>
        {label}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 13, color: isDark ? '#FFFFFF' : '#111111', borderBottom: `1px solid ${border}`, wordBreak: 'break-all' }}>
        {children}
      </td>
    </tr>
  );
}

export default function AdminDashboard() {
  const { address, isConnected, chain } = useAccount();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

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

  const handleSelectDepositor = useCallback((addr: string) => {
    setDepositorInput(addr);
    setQueryAddr(addr);
    resetAction();
    setLastAction(null);
    document.getElementById('admin-action-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [resetAction]);

  if (!isConnected) {
    return (
      <div>
        <SharpPageHeader title="Admin Dashboard" subtitle="Approve releases and manage escrows." />
        <SharpCard><div className="not-connected">Connect wallet to access admin panel</div></SharpCard>
      </div>
    );
  }
  if (!escrowAddr) {
    return (
      <div>
        <SharpPageHeader title="Admin Dashboard" subtitle="Approve releases and manage escrows." />
        <SharpCard><div className="not-connected">Unsupported network — switch to Base or Polygon mainnet</div></SharpCard>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <SharpPageHeader title="Admin Dashboard" subtitle="Approve releases and manage escrows." />
        <SharpCard style={{ padding: '28px 32px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#F87171', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Access Denied</p>
          <p style={{ fontSize: 13, color: textSecondary }}>Connected wallet is not admin</p>
          <p style={{ fontSize: 13, color: textSecondary, marginTop: 8 }}>Admin: <code>{adminAddress as string}</code></p>
        </SharpCard>
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SharpPageHeader title="Admin Dashboard" subtitle="Approve releases, issue refunds, and manage escrows." />

      {/* Escrow lookup + actions */}
      <SharpCard id="admin-action-card">
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Admin Actions</span>
          <span style={{ fontSize: 12, color: textSecondary }}>— approveRelease / refund</span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 12, color: '#34D399', marginBottom: 16, fontWeight: 600 }}>Connected as admin ✓</p>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <SharpInput
                  label="Depositor Address"
                  id="depositor"
                  placeholder="0x..."
                  value={depositorInput}
                  onChange={e => { setDepositorInput(e.target.value); resetAction(); setLastAction(null); }}
                  onKeyDown={e => e.key === 'Enter' && isValidAddr(depositorInput) && setQueryAddr(depositorInput)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <SharpButton size="sm" onClick={() => setQueryAddr(depositorInput)} disabled={!isValidAddr(depositorInput)}>
                  Query
                </SharpButton>
              </div>
            </div>
          </div>

          {escrowLoading && <p style={{ fontSize: 13, color: textSecondary }}>Loading...</p>}

          {isValidAddr(queryAddr) && !escrowLoading && !hasEscrow && (
            <p style={{ fontSize: 13, color: textSecondary }}>No active escrow for this address</p>
          )}

          {hasEscrow && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Escrow Details</p>
              <div style={{ border: `1px solid ${border}`, marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <InfoRow label="Status"><SharpBadge status={STATUS_VARIANT[escrow.status] ?? 'pending'} /></InfoRow>
                    <InfoRow label="Amount">{amountDisplay}</InfoRow>
                    <InfoRow label="Fee">{escrow.feeBps} bps ({Number(escrow.feeBps) / 100}%)</InfoRow>
                    <InfoRow label="Terms Hash"><code style={{ fontSize: 11 }}>{escrow.termsHash}</code></InfoRow>
                    <InfoRow label="Recipient"><code>{escrow.recipient}</code></InfoRow>
                    <InfoRow label="Depositor"><code>{escrow.depositor}</code></InfoRow>
                  </tbody>
                </table>
              </div>

              {actionSuccess ? (
                <div className="alert alert-success">
                  {lastAction === 'approve'
                    ? 'Release approved — recipient can now claim'
                    : 'Refunded — funds returned to depositor'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <SharpButton
                      style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}
                      onClick={handleApprove}
                      disabled={isBusy || escrow.status !== 1}
                      title={escrow.status !== 1 ? 'Escrow must be Active to approve' : ''}
                    >
                      {isBusy && lastAction === 'approve' ? 'Processing...' : 'Approve Release'}
                    </SharpButton>
                    <SharpButton
                      style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}
                      onClick={handleRefund}
                      disabled={isBusy || (escrow.status !== 0 && escrow.status !== 1)}
                    >
                      {isBusy && lastAction === 'refund' ? 'Processing...' : 'Refund'}
                    </SharpButton>
                  </div>

                  {escrow.status === 0 && (
                    <p style={{ marginTop: 10, fontSize: 12, color: '#F2B705' }}>
                      Pending — waiting for recipient to sign acceptance · refund available
                    </p>
                  )}
                  {(escrow.status === 2 || escrow.status === 3) && (
                    <p style={{ marginTop: 10, fontSize: 12, color: textTertiary }}>
                      Escrow is {STATUS_LABEL[escrow.status] ?? 'unknown'} — no actions available
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {actionSuccess && actionHash && (
            <div style={{ marginTop: 10, fontSize: 11 }}>
              <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${actionHash}`} target="_blank" rel="noreferrer"
                style={{ color: textTertiary }}>View tx on explorer ↗</a>
            </div>
          )}
          {actionError && <div className="alert alert-error" style={{ marginTop: 16 }}>{actionError.message}</div>}
        </div>
      </SharpCard>

      {/* Fee setter */}
      <SharpCard>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F2B705', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Set Fee</span>
          <span style={{ fontSize: 12, color: textSecondary }}>— setFeeBps ( newFeeBps )</span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: textSecondary, marginBottom: 16 }}>
            Current default:{' '}
            <span style={{ color: '#F2B705', fontWeight: 600 }}>
              {globalFeeBps !== undefined ? `${globalFeeBps} bps (${Number(globalFeeBps) / 100}%)` : '...'}
            </span>
            {' '}· max 1000 bps (10%)
          </p>
          <div style={{ marginBottom: 16, maxWidth: 200 }}>
            <SharpInput
              label="New Fee (bps)"
              id="newFee"
              type="number" min="0" max="1000" step="1"
              placeholder="25 = 0.25%"
              value={newFeeInput}
              onChange={e => { setNewFeeInput(e.target.value); resetFee(); }}
            />
          </div>
          <SharpButton onClick={handleSetFee}
            disabled={feePending || feeConfirming || !newFeeInput || parseInt(newFeeInput) > 1000}>
            {feePending ? 'Awaiting signature...' : feeConfirming ? 'Confirming...' : 'Set Fee'}
          </SharpButton>
          {feeSuccess && (
            <div className="alert alert-success" style={{ marginTop: 16 }}>
              Fee updated —{' '}
              <a href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${feeHash}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
            </div>
          )}
          {feeError && <div className="alert alert-error" style={{ marginTop: 16 }}>{feeError.message}</div>}
        </div>
      </SharpCard>

      {/* Demo mode */}
      {chain && address && (
        <DemoPanel address={address} chain={chain} />
      )}

      {/* Escrow list */}
      <EscrowListPanel
        escrowAddr={escrowAddr}
        chainId={chain?.id ?? 8453}
        onSelectDepositor={handleSelectDepositor}
      />
    </div>
  );
}
