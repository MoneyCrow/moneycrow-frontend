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

type Mode = 'eth' | 'erc20';

export default function DepositForm() {
  const { address, isConnected, chain } = useAccount();
  const escrowAddr = getEscrowAddress(chain?.id);
  const [mode, setMode]                     = useState<Mode>('eth');
  const [recipient, setRecipient]           = useState('');
  const [amount, setAmount]                 = useState('');
  const [description, setDescription]       = useState('');
  const [tokenAddr, setTokenAddr]           = useState('');
  const [approved, setApproved]             = useState(false);

  const [recipientEmail, setRecipientEmail]       = useState('');
  const [recipientTelegram, setRecipientTelegram] = useState('');
  const [depositorEmail, setDepositorEmail]       = useState('');
  const [depositorTelegram, setDepositorTelegram] = useState('');
  const [terms, setTerms]                         = useState('');
  const [contactError, setContactError]           = useState('');

  const isValidToken = tokenAddr.length === 42 && tokenAddr.startsWith('0x');

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

    // ── Telegram verification — silent fire-and-forget ────────────────────────
    if (depositorTelegram.trim()) {
      const token    = crypto.randomUUID();
      const handle   = depositorTelegram.trim();
      const apiBase  = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
      fetch(`${apiBase}/telegram/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, username: handle }),
      }).catch(() => {}); // silent — don't block the success flow
      window.open(`https://t.me/MoneyCrowBot?start=verify_${token}`, '_blank', 'noopener,noreferrer');
    }

    // ── Reset form ────────────────────────────────────────────────────────────
    setRecipient('');
    setAmount('');
    setDescription('');
    setTokenAddr('');
    setApproved(false);
    setRecipientEmail('');
    setRecipientTelegram('');
    setDepositorEmail('');
    setDepositorTelegram('');
    setTerms('');
    setContactError('');
  }, [depositSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedAmount = (() => {
    try { return mode === 'eth' ? parseEther(amount || '0') : parseUnits(amount || '0', decimals ?? 18); }
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
    return <Card><div className="not-connected">connect wallet to create a deposit</div></Card>;
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
              <Label htmlFor="tokenAddr">token_address</Label>
              <Input id="tokenAddr" placeholder="0x... (token contract)" value={tokenAddr}
                onChange={e => { setTokenAddr(e.target.value); setApproved(false); }} required />
              {symbol && <p className="mt-1.5 text-[11px] text-[var(--green)]">// detected: {symbol} ({decimals} decimals)</p>}
            </div>
          )}

          <div>
            <Label htmlFor="recipient">recipient</Label>
            <Input id="recipient" placeholder="0x..." value={recipient}
              onChange={e => setRecipient(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="amount">
              {symbol ? `amount_${symbol.toLowerCase()}` : mode === 'eth' ? 'amount_eth' : 'amount_tokens'}
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
        {(depositError ?? approveError) && (
          <div className="alert alert-error mt-4">
            ✗ {(depositError ?? approveError)?.message}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
