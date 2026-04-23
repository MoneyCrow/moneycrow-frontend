import { useState, useEffect } from 'react';
import { useWriteContract, useAccount, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, parseUnits, keccak256, encodePacked } from 'viem';
import { ESCROW_ABI, getEscrowAddress } from '../contracts/Escrow';
import { SharpButton } from '../components/sharp/SharpButton';
import { SharpCard } from '../components/sharp/SharpCard';
import { SharpInput, SharpTextarea } from '../components/sharp/SharpInput';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';
import { useTheme } from '../context/ThemeContext';

const ERC20_ABI = [
  { name: 'approve',   inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { name: 'decimals',  inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',    inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

type TokenInfo = { symbol: string; address: `0x${string}`; decimals: number };

const KNOWN_TOKENS: Record<number, TokenInfo[]> = {
  8453: [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
    { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6  },
    { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  ],
  137: [
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6  },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6  },
    { symbol: 'DAI',  address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
  ],
};

type Mode = 'eth' | 'erc20';

export default function DepositForm() {
  const { address, isConnected, chain } = useAccount();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const escrowAddr = getEscrowAddress(chain?.id);
  const [mode, setMode]                     = useState<Mode>('eth');
  const [recipient, setRecipient]           = useState('');
  const [amount, setAmount]                 = useState('');
  const [description, setDescription]       = useState('');
  const [tokenAddr, setTokenAddr]           = useState('');
  const [selectedToken, setSelectedToken]   = useState('');
  const [customTokenAddr, setCustomTokenAddr] = useState('');
  const [approved, setApproved]             = useState(false);

  const [recipientEmail, setRecipientEmail]       = useState('');
  const [recipientTelegram, setRecipientTelegram] = useState('');
  const [depositorEmail, setDepositorEmail]       = useState('');
  const [depositorTelegram, setDepositorTelegram] = useState('');
  const [terms, setTerms]                         = useState('');
  const [contactError, setContactError]           = useState('');
  const [verifyToken, setVerifyToken]             = useState('');

  useEffect(() => {
    if (mode === 'erc20') {
      setSelectedToken('');
      setTokenAddr('');
      setCustomTokenAddr('');
      setApproved(false);
    }
  }, [chain?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chainTokens   = KNOWN_TOKENS[chain?.id ?? 0] ?? [];
  const knownToken    = chainTokens.find(t => t.symbol === selectedToken);
  const isValidToken  = tokenAddr.length === 42 && tokenAddr.startsWith('0x');

  const { data: decimals }  = useReadContract({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals',  query: { enabled: isValidToken } });
  const { data: symbol }    = useReadContract({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol',    query: { enabled: isValidToken } });
  const { data: allowance } = useReadContract({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'allowance', args: [address as `0x${string}`, escrowAddr ?? '0x0000000000000000000000000000000000000000'], query: { enabled: isValidToken && !!address && !!escrowAddr } });
  const { data: globalFeeBps } = useReadContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'feeBps', query: { enabled: !!escrowAddr } });

  const { writeContract: writeApprove, data: approveHash, isPending: approvePending, error: approveError } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: writeDeposit, data: depositHash, isPending: depositPending, error: depositError } = useWriteContract();
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash });

  useEffect(() => {
    if (!depositSuccess) return;
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
    setRecipient('');
    setAmount('');
    setDescription('');
    setTokenAddr('');
    setSelectedToken('');
    setCustomTokenAddr('');
    setApproved(false);
    setRecipientEmail('');
    setRecipientTelegram('');
    setDepositorEmail('');
    setDepositorTelegram('');
    setTerms('');
    setContactError('');
  }, [depositSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveDecimals = decimals ?? knownToken?.decimals ?? 18;

  const parsedAmount = (() => {
    try { return mode === 'eth' ? parseEther(amount || '0') : parseUnits(amount || '0', effectiveDecimals); }
    catch { return 0n; }
  })();

  const alreadyApproved = allowance !== undefined && parsedAmount > 0n && allowance >= parsedAmount;
  const canDeposit = approved || alreadyApproved;

  const handleApprove = () => {
    if (!escrowAddr) return;
    writeApprove({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [escrowAddr, parsedAmount] });
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError('');
    if (!escrowAddr || !address) return;
    if (!terms.trim()) {
      setContactError('terms: required — describe what must happen before funds are released');
      return;
    }

    // Register metadata with backend and get termsHash
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    let termsHash: `0x${string}`;
    try {
      const res = await fetch(`${apiBase}/escrow/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          depositorAddress:  address,
          chainId:           chain?.id,
          depositorEmail,
          depositorTelegram,
          recipientEmail,
          recipientTelegram,
          description,
          terms,
        }),
      });
      const data = await res.json() as { ok: boolean; termsHash?: string };
      if (!data.ok || !data.termsHash) throw new Error('Register failed');
      termsHash = data.termsHash as `0x${string}`;
    } catch {
      // Fallback: compute locally if backend is unreachable
      termsHash = keccak256(encodePacked(['string', 'string'], [description, terms]));
    }

    if (mode === 'eth') {
      writeDeposit({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'depositETH', args: [recipient as `0x${string}`, termsHash, 0n], value: parsedAmount });
    } else {
      writeDeposit({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'depositERC20', args: [tokenAddr as `0x${string}`, parsedAmount, recipient as `0x${string}`, termsHash, 0n] });
    }
  };

  const feeDisplay = globalFeeBps !== undefined
    ? `${globalFeeBps} bps (${Number(globalFeeBps) / 100}%) — set by admin`
    : 'loading...';

  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SharpPageHeader title="Create Escrow" subtitle="Lock funds and set terms for a trustless transaction." />
        <SharpCard style={{ padding: '32px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#FFFFFF' : '#111111', marginBottom: 12 }}>Trustless escrow. No middleman. No custody.</p>
          <p style={{ fontSize: 14, color: textSecondary, lineHeight: 1.75, marginBottom: 20, maxWidth: 520 }}>
            MoneyCrow holds funds in a smart contract — not a bank, not a company.
            Money moves only when both parties agree. Open source and verifiable on-chain.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              { color: '#4F8EFF', label: 'Non-custodial', detail: 'we never hold your funds' },
              { color: '#34D399', label: 'Open source',   detail: 'audit the code yourself' },
              { color: '#F2B705', label: 'On-chain',      detail: 'every transaction is publicly verifiable' },
            ] as const).map(({ color, label, detail }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 14 }}>
                <span style={{ width: 6, height: 6, background: color, flexShrink: 0, marginTop: 4 }} />
                <span style={{ color: isDark ? '#FFFFFF' : '#111111', fontWeight: 600 }}>{label}</span>
                <span style={{ color: textSecondary }}>— {detail}</span>
              </div>
            ))}
          </div>
        </SharpCard>
        <SharpCard>
          <div className="not-connected">Connect wallet to create a deposit</div>
        </SharpCard>
      </div>
    );
  }

  if (!escrowAddr) {
    return (
      <div>
        <SharpPageHeader title="Create Escrow" subtitle="Lock funds and set terms for a trustless transaction." />
        <SharpCard><div className="not-connected">Unsupported network — switch to Base or Polygon mainnet</div></SharpCard>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 0,
    background: isDark ? '#1C1C1C' : '#FFFFFF',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'}`,
    color: isDark ? '#FFFFFF' : '#111111',
    fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, outline: 'none',
    cursor: 'pointer', boxSizing: 'border-box' as const,
    appearance: 'none' as const,
  };

  return (
    <div>
      <SharpPageHeader title="Create Escrow" subtitle="Lock funds and set terms for a trustless transaction." />

      <SharpCard style={{ padding: '28px 32px' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', width: 'fit-content', marginBottom: 28, border: `1px solid ${border}`, overflow: 'hidden' }}>
          {(['eth', 'erc20'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="sharp-touch"
              onClick={() => { setMode(m); setApproved(false); }}
              style={{
                padding: '8px 20px', border: 'none', cursor: 'pointer',
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                background: mode === m ? '#F2B705' : 'transparent',
                color: mode === m ? '#111111' : textSecondary,
                transition: 'all 0.12s',
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {mode === 'erc20' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: textSecondary, letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>
                Token
              </label>
              <select
                value={selectedToken}
                onChange={e => {
                  const sym = e.target.value;
                  setSelectedToken(sym);
                  setApproved(false);
                  if (sym === 'custom') {
                    setTokenAddr(customTokenAddr);
                  } else {
                    const found = chainTokens.find(t => t.symbol === sym);
                    setTokenAddr(found?.address ?? '');
                  }
                }}
                required
                style={selectStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#F2B705')}
                onBlur={e  => (e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)')}
              >
                <option value="" disabled>-- select token --</option>
                {chainTokens.map(t => (
                  <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                ))}
                <option value="custom">custom address...</option>
              </select>

              {selectedToken === 'custom' && (
                <div style={{ marginTop: 8 }}>
                  <SharpInput
                    placeholder="0x... (token contract address)"
                    value={customTokenAddr}
                    onChange={e => {
                      setCustomTokenAddr(e.target.value);
                      setTokenAddr(e.target.value);
                      setApproved(false);
                    }}
                  />
                </div>
              )}

              {knownToken && (
                <p style={{ fontSize: 11, color: '#34D399', marginTop: 4 }}>
                  {knownToken.symbol} · {knownToken.address.slice(0, 10)}…{knownToken.address.slice(-6)} · {knownToken.decimals} decimals
                </p>
              )}
              {selectedToken === 'custom' && symbol && (
                <p style={{ fontSize: 11, color: '#34D399', marginTop: 4 }}>
                  detected: {symbol} ({effectiveDecimals} decimals)
                </p>
              )}
            </div>
          )}

          <SharpInput
            label="Recipient Address"
            id="recipient"
            placeholder="0x..."
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            required
          />

          <SharpInput
            label={symbol ? `Amount (${symbol})` : knownToken ? `Amount (${knownToken.symbol})` : mode === 'eth' ? 'Amount (ETH)' : 'Amount (Tokens)'}
            id="amount"
            type="number"
            step="any"
            min="0"
            placeholder={mode === 'eth' ? '0.01' : '100'}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />

          <SharpInput
            label="Description"
            id="description"
            placeholder="e.g. Freelance payment for logo design"
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
          />

          <SharpTextarea
            label="Terms"
            id="terms"
            placeholder="Describe what must happen before funds are released — e.g. goods delivered and confirmed, service completed, document signed"
            value={terms}
            onChange={e => { setTerms(e.target.value); setContactError(''); }}
            rows={3}
            required
            hint="Recipient must sign these terms — funds stay Pending until they do (48h window)"
          />

          <SharpInput
            label="Platform Fee"
            id="fee"
            value={feeDisplay}
            readOnly
            hint="Deducted on release · 100 bps = 1%"
          />

          {/* Recipient contact */}
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 16 }}>
              Recipient Contact
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SharpInput
                label="Recipient Email"
                id="rEmail"
                type="email"
                placeholder="email — optional"
                value={recipientEmail}
                onChange={e => { setRecipientEmail(e.target.value); setContactError(''); }}
                hint="Optional — to receive notifications"
              />
              <SharpInput
                label="Recipient Telegram"
                id="rTelegram"
                placeholder="@username — optional"
                value={recipientTelegram}
                onChange={e => { setRecipientTelegram(e.target.value); setContactError(''); }}
                hint="Optional — to receive notifications"
              />
            </div>
          </div>

          {/* Depositor contact */}
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: textTertiary, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 16 }}>
              Your Contact
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SharpInput
                label="Your Email"
                id="dEmail"
                type="email"
                placeholder="email — optional"
                value={depositorEmail}
                onChange={e => { setDepositorEmail(e.target.value); setContactError(''); }}
                hint="Optional — to receive notifications"
              />
              <SharpInput
                label="Your Telegram"
                id="dTelegram"
                placeholder="@username — optional"
                value={depositorTelegram}
                onChange={e => { setDepositorTelegram(e.target.value); setContactError(''); }}
                hint="Optional — to receive notifications"
              />
            </div>
          </div>

          {contactError && <div className="alert alert-error">{contactError}</div>}

          {/* Submit */}
          {mode === 'erc20' ? (
            <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: textSecondary }}>
                <span style={{ color: canDeposit ? '#34D399' : '#F2B705', fontWeight: 600 }}>Step 1: Approve</span>
                <span>→</span>
                <span style={{ color: canDeposit ? '#F2B705' : textSecondary, fontWeight: 600 }}>Step 2: Deposit</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {!canDeposit && (
                  <SharpButton type="button" onClick={handleApprove}
                    disabled={approvePending || approveConfirming || !isValidToken || !amount}>
                    {approvePending ? 'Awaiting signature...' : approveConfirming ? 'Confirming...' : 'Approve'}
                  </SharpButton>
                )}
                <SharpButton type="submit"
                  disabled={!canDeposit || depositPending || depositConfirming || !recipient || !amount}>
                  {depositPending ? 'Awaiting signature...' : depositConfirming ? 'Mining...' : 'Deposit ERC20'}
                </SharpButton>
              </div>
              {alreadyApproved && !approved && (
                <p style={{ fontSize: 12, color: '#34D399' }}>Allowance already sufficient — skip to deposit</p>
              )}
              <p style={{ fontSize: 12, color: textTertiary, lineHeight: 1.6 }}>
                Funds are locked in a verified smart contract. Only the designated recipient can claim them.
              </p>
              {approveSuccess && !approved && (() => { setApproved(true); return null; })()}
            </div>
          ) : (
            <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SharpButton type="submit" disabled={depositPending || depositConfirming}>
                {depositPending ? 'Awaiting signature...' : depositConfirming ? 'Mining...' : 'Deposit ETH'}
              </SharpButton>
              <p style={{ fontSize: 12, color: textTertiary, lineHeight: 1.6 }}>
                Funds are locked in a verified smart contract. Only the designated recipient can claim them.
              </p>
            </div>
          )}
        </form>

        {depositSuccess && (
          <div className="alert alert-success" style={{ marginTop: 16 }}>
            Deposit confirmed — escrow is <b>Pending</b> until the recipient signs acceptance.{' '}
            <a
              href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${depositHash}`}
              target="_blank" rel="noreferrer"
            >
              View on explorer ↗
            </a>
          </div>
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
            Deposit confirmed — tap here to verify your Telegram and receive notifications
          </button>
        )}

        {(depositError ?? approveError) && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {(depositError ?? approveError)?.message}
          </div>
        )}
      </SharpCard>
    </div>
  );
}
