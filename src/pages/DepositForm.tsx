import { useState, useEffect } from 'react';
import { useWriteContract, useAccount, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import { ESCROW_ABI, getEscrowAddress } from '../contracts/Escrow';
import { Button }                     from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input }                      from '@/components/ui/input';
import { Label }                      from '@/components/ui/label';

const ERC20_ABI = [
  { name: 'approve',   inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { name: 'decimals',  inputs: [], outputs: [{ type: 'uint8' }],  stateMutability: 'view', type: 'function' },
  { name: 'symbol',    inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

// ── Known tokens per chain ─────────────────────────────────────────────────────

type TokenInfo = { symbol: string; address: `0x${string}`; decimals: number };

const KNOWN_TOKENS: Record<number, TokenInfo[]> = {
  8453: [ // Base mainnet
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
    { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6  },
    { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  ],
  137: [ // Polygon mainnet
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6  },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6  },
    { symbol: 'DAI',  address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
  ],
};

type Mode = 'eth' | 'erc20';

export default function DepositForm() {
  const { address, isConnected, chain } = useAccount();
  const escrowAddr = getEscrowAddress(chain?.id);
  const [mode, setMode]                     = useState<Mode>('eth');
  const [recipient, setRecipient]           = useState('');
  const [amount, setAmount]                 = useState('');
  const [description, setDescription]       = useState('');
  const [tokenAddr, setTokenAddr]           = useState('');
  const [selectedToken, setSelectedToken]   = useState('');   // symbol key or 'custom'
  const [customTokenAddr, setCustomTokenAddr] = useState('');
  const [approved, setApproved]             = useState(false);

  const [recipientEmail, setRecipientEmail]       = useState('');
  const [recipientTelegram, setRecipientTelegram] = useState('');
  const [depositorEmail, setDepositorEmail]       = useState('');
  const [depositorTelegram, setDepositorTelegram] = useState('');
  const [terms, setTerms]                         = useState('');
  const [contactError, setContactError]           = useState('');
  const [verifyToken, setVerifyToken]             = useState('');

  // When the chain changes while in ERC20 mode, reset the token picker so the
  // user doesn't accidentally send to the wrong chain's contract address.
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
  // Use on-chain decimals when available (sanity check), fall back to known value.
  const isValidToken  = tokenAddr.length === 42 && tokenAddr.startsWith('0x');

  const { data: decimals }  = useReadContract({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals',  query: { enabled: isValidToken } });
  const { data: symbol }    = useReadContract({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol',    query: { enabled: isValidToken } });
  const { data: allowance } = useReadContract({ address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'allowance', args: [address as `0x${string}`, escrowAddr ?? '0x0000000000000000000000000000000000000000'], query: { enabled: isValidToken && !!address && !!escrowAddr } });
  const { data: globalFeeBps } = useReadContract({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'feeBps', query: { enabled: !!escrowAddr } });

  const { writeContract: writeApprove, data: approveHash, isPending: approvePending, error: approveError } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: writeDeposit, data: depositHash, isPending: depositPending, error: depositError } = useWriteContract();
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash });

  // When deposit confirms: trigger Telegram verification (if username given), then reset form
  useEffect(() => {
    if (!depositSuccess) return;

    // ── Telegram verification — register token now; window.open waits for click ─
    if (depositorTelegram.trim()) {
      const token   = crypto.randomUUID();
      const handle  = depositorTelegram.trim();
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
      fetch(`${apiBase}/telegram/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, username: handle }),
      }).catch(() => {}); // silent — don't block the success flow
      setVerifyToken(token); // banner will call window.open on user click
    }

    // ── Reset form ────────────────────────────────────────────────────────────
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
    // verifyToken intentionally NOT cleared here — banner must stay visible
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

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactError('');
    if (!escrowAddr) return;
    if (!terms.trim()) {
      setContactError('terms: required — describe what must happen before funds are released');
      return;
    }
    if (mode === 'eth') {
      writeDeposit({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'depositETH', args: [recipient as `0x${string}`, description, recipientEmail, recipientTelegram, depositorEmail, depositorTelegram, terms, 0n], value: parsedAmount });
    } else {
      writeDeposit({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'depositERC20', args: [tokenAddr as `0x${string}`, parsedAmount, recipient as `0x${string}`, description, recipientEmail, recipientTelegram, depositorEmail, depositorTelegram, terms, 0n] });
    }
  };

  const feeDisplay = globalFeeBps !== undefined
    ? `${globalFeeBps} bps (${Number(globalFeeBps) / 100}%) — set by admin`
    : 'loading...';

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <Card>
          <CardBody>
            <p style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: 'var(--muted)',
              marginBottom: 10,
              letterSpacing: '0.05em',
            }}>
              // what is this?
            </p>
            <h2 style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 12,
              lineHeight: 1.35,
            }}>
              Trustless escrow.<br />No middleman. No custody.
            </h2>
            <p style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.7,
              marginBottom: 20,
              maxWidth: 520,
            }}>
              MoneyCrow holds funds in a smart contract — not a bank, not a company.
              Money moves only when both parties agree.
              Open source and verifiable on-chain.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { icon: '⬡', color: 'var(--cyan)',   label: 'Non-custodial',  detail: 'we never hold your funds' },
                { icon: '⬡', color: 'var(--green)',  label: 'Open source',    detail: 'audit the code yourself' },
                { icon: '⬡', color: 'var(--orange)', label: 'On-chain',       detail: 'every transaction is publicly verifiable' },
              ] as const).map(({ icon, color, label, detail }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                }}>
                  <span style={{ color, fontSize: 10, flexShrink: 0 }}>{icon}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                  <span style={{ color: 'var(--muted)' }}>— {detail}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* ── Connect prompt ────────────────────────────────────────────────── */}
        <Card>
          <div className="not-connected">connect wallet to create a deposit</div>
        </Card>
      </div>
    );
  }
  if (!escrowAddr) {
    return <Card><div className="not-connected">// unsupported network — switch to Base or Polygon mainnet</div></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-[var(--orange)]">{mode === 'eth' ? 'depositETH' : 'depositERC20'}</span>
        <span className="text-[var(--muted)]">
          &nbsp;( recipient, description, contacts ) &mdash; {mode === 'eth' ? 'payable' : 'nonpayable'}
        </span>
      </CardHeader>
      <CardBody>

        {/* Mode toggle */}
        <div className="flex w-fit mb-5 border border-[var(--border2)] rounded-sm overflow-hidden">
          {(['eth', 'erc20'] as Mode[]).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setApproved(false); }}
              className={[
                'px-5 py-1.5 text-xs font-semibold font-mono cursor-pointer transition-all border-none',
                i > 0 ? 'border-l border-[var(--border2)]' : '',
                mode === m
                  ? 'bg-cyan-400/10 text-[var(--cyan)]'
                  : 'bg-transparent text-[var(--muted)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        <form onSubmit={handleDeposit} className="space-y-4">

          {mode === 'erc20' && (
            <div>
              <Label htmlFor="tokenSelect">token</Label>

              {/* ── Known token dropdown ── */}
              <select
                id="tokenSelect"
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
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border2)',
                  borderRadius: 3,
                  fontSize: 12,
                  color: selectedToken ? 'var(--text)' : 'var(--muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23637777'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: 32,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--cyan)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border2)')}
              >
                <option value="" disabled style={{ color: 'var(--muted)', background: 'var(--surface)' }}>
                  -- select token --
                </option>
                {chainTokens.map(t => (
                  <option key={t.symbol} value={t.symbol} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                    {t.symbol}
                  </option>
                ))}
                <option value="custom" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  custom address...
                </option>
              </select>

              {/* ── Custom address input (collapsible) ── */}
              {selectedToken === 'custom' && (
                <div style={{ marginTop: 8 }}>
                  <Input
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

              {/* ── Confirmation line ── */}
              {knownToken && (
                <p className="mt-1.5 text-[11px] text-[var(--green)]">
                  // {knownToken.symbol} · {knownToken.address.slice(0, 10)}…{knownToken.address.slice(-6)} · {knownToken.decimals} decimals
                </p>
              )}
              {selectedToken === 'custom' && symbol && (
                <p className="mt-1.5 text-[11px] text-[var(--green)]">
                  // detected: {symbol} ({effectiveDecimals} decimals)
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="recipient">recipient</Label>
            <Input id="recipient" placeholder="0x..." value={recipient}
              onChange={e => setRecipient(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="amount">
              {symbol
                ? `amount_${symbol.toLowerCase()}`
                : knownToken
                  ? `amount_${knownToken.symbol.toLowerCase()}`
                  : mode === 'eth' ? 'amount_eth' : 'amount_tokens'}
            </Label>
            <Input id="amount" type="number" step="any" min="0"
              placeholder={mode === 'eth' ? '0.01' : '100'} value={amount}
              onChange={e => setAmount(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="description">description</Label>
            <Input id="description" placeholder='"freelance payment for logo design"'
              value={description} onChange={e => setDescription(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="terms">terms</Label>
            <textarea
              id="terms"
              placeholder="Describe what must happen before funds are released — e.g. goods delivered and confirmed, service completed, document signed"
              value={terms}
              onChange={e => { setTerms(e.target.value); setContactError(''); }}
              rows={3}
              required
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px',
                background: 'var(--surface2)',
                border: '1px solid var(--border2)',
                borderRadius: 3,
                fontSize: 12,
                color: 'var(--text)',
                fontFamily: 'JetBrains Mono, monospace',
                resize: 'vertical',
                outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--cyan)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
            />
            <p className="mt-1.5 text-[11px] text-[var(--muted2)]">
              // recipient must sign these terms — funds stay Pending until they do (48h window)
            </p>
          </div>

          <div>
            <Label htmlFor="fee">fee_bps</Label>
            <Input id="fee" value={feeDisplay} readOnly />
            <p className="mt-1.5 text-[11px] text-[var(--muted2)]">// deducted on release · 100 bps = 1%</p>
          </div>

          {/* ── Recipient contact ── */}
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-[11px] text-[var(--muted2)] mb-3 tracking-wider">
              // ── recipient_contact
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="rEmail">recipient_email</Label>
                <Input id="rEmail" type="email" placeholder="email — optional" value={recipientEmail}
                  onChange={e => { setRecipientEmail(e.target.value); setContactError(''); }} />
                <p className="mt-1 text-[11px] text-[var(--muted2)]">optional — to receive notifications</p>
              </div>
              <div>
                <Label htmlFor="rTelegram">recipient_telegram</Label>
                <Input id="rTelegram" placeholder="@username — optional" value={recipientTelegram}
                  onChange={e => { setRecipientTelegram(e.target.value); setContactError(''); }} />
                <p className="mt-1 text-[11px] text-[var(--muted2)]">optional — to receive notifications</p>
              </div>
            </div>
          </div>

          {/* ── Depositor contact ── */}
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-[11px] text-[var(--muted2)] mb-3 tracking-wider">
              // ── your_contact
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dEmail">depositor_email</Label>
                <Input id="dEmail" type="email" placeholder="email — optional" value={depositorEmail}
                  onChange={e => { setDepositorEmail(e.target.value); setContactError(''); }} />
                <p className="mt-1 text-[11px] text-[var(--muted2)]">optional — to receive notifications</p>
              </div>
              <div>
                <Label htmlFor="dTelegram">depositor_telegram</Label>
                <Input id="dTelegram" placeholder="@username — optional" value={depositorTelegram}
                  onChange={e => { setDepositorTelegram(e.target.value); setContactError(''); }} />
                <p className="mt-1 text-[11px] text-[var(--muted2)]">optional — to receive notifications</p>
              </div>
            </div>
          </div>

          {contactError && <div className="alert alert-error">✗ {contactError}</div>}

          {/* ── Submit ── */}
          {mode === 'erc20' ? (
            <div className="pt-2 space-y-3">
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <span style={{ color: canDeposit ? 'var(--green)' : 'var(--cyan)' }}>step 1: approve</span>
                <span>→</span>
                <span style={{ color: canDeposit ? 'var(--cyan)' : 'var(--muted)' }}>step 2: deposit</span>
              </div>
              <div className="flex gap-2.5">
                {!canDeposit && (
                  <Button type="button" onClick={handleApprove}
                    disabled={approvePending || approveConfirming || !isValidToken || !amount}>
                    {approvePending ? '> awaiting signature...' : approveConfirming ? '> confirming...' : '> approve()'}
                  </Button>
                )}
                <Button type="submit"
                  disabled={!canDeposit || depositPending || depositConfirming || !recipient || !amount}>
                  {depositPending ? '> awaiting signature...' : depositConfirming ? '> mining...' : '> depositERC20()'}
                </Button>
              </div>
              {alreadyApproved && !approved && (
                <p className="text-[11px] text-[var(--green)]">// allowance already sufficient — skip to deposit</p>
              )}
              <p className="mt-1 text-[11px] text-[var(--muted2)] leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                // Funds are locked in a verified smart contract.
                Only the designated recipient can claim them.
              </p>
              {approveSuccess && !approved && (() => { setApproved(true); return null; })()}
            </div>
          ) : (
            <div className="pt-2">
              <Button type="submit" disabled={depositPending || depositConfirming}>
                {depositPending ? '> awaiting signature...' : depositConfirming ? '> mining...' : '> depositETH()'}
              </Button>
              <p className="mt-3 text-[11px] text-[var(--muted2)] leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                // Funds are locked in a verified smart contract.
                Only the designated recipient can claim them.
              </p>
            </div>
          )}
        </form>

        {depositSuccess && (
          <div className="alert alert-success mt-4">
            ✓ deposit confirmed — escrow is <b>Pending</b> until the recipient signs acceptance.{' '}
            <a
              href={`${chain?.blockExplorers?.default.url ?? 'https://basescan.org'}/tx/${depositHash}`}
              target="_blank" rel="noreferrer"
            >
              view on explorer ↗
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
            className="w-full mt-3 text-left cursor-pointer"
            style={{
              display: 'block',
              padding: '10px 14px',
              background: 'rgba(0,180,216,0.07)',
              border: '1px solid rgba(0,180,216,0.35)',
              borderRadius: 4,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: 'var(--cyan)',
              lineHeight: 1.5,
            }}
          >
            ✅ deposit confirmed — tap here to verify your Telegram and receive notifications
          </button>
        )}
        {(depositError ?? approveError) && (
          <div className="alert alert-error mt-4">
            ✗ {(depositError ?? approveError)?.message}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
