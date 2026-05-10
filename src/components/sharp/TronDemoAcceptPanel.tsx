import { useEffect, useState } from 'react';
import { useTron } from '../../context/TronContext';
import { useTheme } from '../../context/ThemeContext';
import {
  TRON_DEMO_ABI,
  getTronDemoAddress,
  isTronDemoReady,
} from '../../contracts/EscrowTronDemo';
import { SharpButton } from './SharpButton';
import { SharpCard } from './SharpCard';

/**
 * TRON-side counterpart to the EVM DemoAccept render path. Activates when
 * the depositor address typed into DemoAccept.tsx is base58 (`T...`) — the
 * page detects the shape and renders this component, leaving the EVM
 * branch untouched for `0x...` lookups.
 *
 * Mirrors the Phase 0 spike's signing pattern:
 *   tronWeb.trx._signTypedData(domain, typesWithoutDomain, message)
 *
 * EIP-712 typehash uses `DemoAcceptance` (not `EscrowAcceptance`) so a
 * signature for the demo can never be replayed against the production
 * Escrow contract on the same chain. Domain name is `MoneyCrowDemo` to
 * match the EVM demo contract's domain.
 */

const DEMO_TYPES = {
  DemoAcceptance: [
    { name: 'depositor', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount',    type: 'uint256' },
    { name: 'token',     type: 'address' },
    { name: 'termsHash', type: 'bytes32' },
  ],
};

const STATUS_LABEL = ['Pending', 'Accepted', 'Approved'] as const;

interface DemoState {
  recipientBase58:  string;       // T-format; what we compare against the connected wallet
  recipientEvm:     `0x${string}`;
  depositorEvm:     `0x${string}`;
  tokenEvm:         `0x${string}`;
  amount:           bigint;
  termsHash:        `0x${string}`;
  status:           number;
  createdAt:        bigint;
}

/** Convert a TRON 21-byte hex address (`41…`) to the 20-byte EVM-form
 *  (`0x…`) that EIP-712 typed-data and Solidity's `address` use. Returns
 *  the input unchanged if the shape is unexpected — caller should be
 *  prepared for that. */
function tronHexToEvm(tronHex: string): `0x${string}` {
  const stripped = tronHex.startsWith('0x') ? tronHex.slice(2) : tronHex;
  if (stripped.length === 42 && stripped.toLowerCase().startsWith('41')) {
    return ('0x' + stripped.slice(2).toLowerCase()) as `0x${string}`;
  }
  if (stripped.length === 40) {
    return ('0x' + stripped.toLowerCase()) as `0x${string}`;
  }
  return ('0x' + stripped.toLowerCase()) as `0x${string}`;
}

interface Props {
  depositorBase58: string;
}

export function TronDemoAcceptPanel({ depositorBase58 }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border        = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const textTertiary  = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(17,17,17,0.35)';

  const tron = useTron();
  const demoAddr  = getTronDemoAddress(tron.chainId);
  const demoReady = isTronDemoReady(tron.chainId);

  const [demo,        setDemo]        = useState<DemoState | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError,   setDemoError]   = useState<string | null>(null);

  const [signature,  setSignature]  = useState<string | null>(null);
  const [signing,    setSigning]    = useState(false);
  const [signError,  setSignError]  = useState<string | null>(null);

  const [txId,         setTxId]         = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);

  const [description, setDescription] = useState('');

  // Demo description — pulled from the backend metadata store, same source
  // the EVM flow uses (privacy refactor stripped descriptions from on-chain).
  useEffect(() => {
    if (!tron.chainId || !depositorBase58) return;
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    fetch(`${apiBase}/demo/meta?chainId=${tron.chainId}&depositor=${depositorBase58}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { ok?: boolean; description?: string } | null) => {
        setDescription(data?.ok && data.description ? data.description : '');
      })
      .catch(() => setDescription(''));
  }, [tron.chainId, depositorBase58]);

  // Read the demo struct from the contract.
  useEffect(() => {
    if (!tron.tronWeb || !demoAddr || !depositorBase58) {
      setDemo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDemoLoading(true);
      setDemoError(null);
      try {
        // tronWeb.contract(abi, address) returns an instance bound to the
        // ABI we pass; the implicit-ABI overload (.at()) requires the ABI
        // to be already known on-chain via Tronscan, which we can't rely
        // on for fresh deploys.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (tron.tronWeb as any).contract(TRON_DEMO_ABI, demoAddr);
        const result = await c.getDemoEscrow(depositorBase58).call();
        if (cancelled) return;

        // tronWeb returns struct fields by name AND positional index. Try
        // names first, fall back to indices for older tronWeb versions
        // that don't decode named tuples.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as any;
        const depositorHex = String(r.depositor ?? r[0] ?? '');
        const recipientHex = String(r.recipient ?? r[1] ?? '');
        const tokenHex     = String(r.token     ?? r[2] ?? '');
        const amountRaw    = r.amount    ?? r[3];
        const termsHashRaw = String(r.termsHash ?? r[4] ?? '');
        const statusRaw    = r.status    ?? r[5];
        const createdRaw   = r.createdAt ?? r[6];

        const amount    = typeof amountRaw === 'bigint' ? amountRaw : BigInt(String(amountRaw ?? 0));
        const createdAt = typeof createdRaw === 'bigint' ? createdRaw : BigInt(String(createdRaw ?? 0));
        const status    = Number(statusRaw ?? 0);

        // Empty-demo sentinel: depositor zero AND amount zero AND no recipient.
        const allZero = (
          /^0x0+$/.test(tronHexToEvm(depositorHex)) &&
          amount === 0n
        );
        if (allZero) {
          setDemo(null);
          setDemoLoading(false);
          return;
        }

        // Convert recipient to base58 too so we can compare against the
        // connected wallet's address (which TronContext exposes as base58).
        // tron.tronWeb!.address.fromHex takes the 41-prefixed hex.
        let recipientBase58 = '';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tw = tron.tronWeb as any;
          if (recipientHex.startsWith('0x41')) {
            recipientBase58 = tw.address.fromHex(recipientHex.slice(2));
          } else if (recipientHex.startsWith('41') && recipientHex.length === 42) {
            recipientBase58 = tw.address.fromHex(recipientHex);
          } else {
            recipientBase58 = recipientHex;
          }
        } catch {
          recipientBase58 = recipientHex;
        }

        setDemo({
          recipientBase58,
          recipientEvm: tronHexToEvm(recipientHex),
          depositorEvm: tronHexToEvm(depositorHex),
          tokenEvm:     tronHexToEvm(tokenHex),
          amount,
          termsHash:    (termsHashRaw.startsWith('0x') ? termsHashRaw : '0x' + termsHashRaw) as `0x${string}`,
          status,
          createdAt,
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // "REVERT opcode" / "no demo" → just no demo for this address; not an error.
        if (/revert|not exist|no demo/i.test(msg)) {
          setDemo(null);
        } else {
          setDemoError(msg);
        }
      } finally {
        if (!cancelled) setDemoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tron.tronWeb, demoAddr, depositorBase58]);

  // ── Render branches ────────────────────────────────────────────────────────

  const headerStyle: React.CSSProperties = {
    background: '#F2B705', color: '#000', fontWeight: 700,
    padding: '8px 14px', marginBottom: 20, fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.04em',
  };

  // Not connected to TronLink → prompt connect.
  if (!tron.connected) {
    return (
      <SharpCard style={{ padding: '28px 32px' }}>
        <div style={headerStyle}>DEMO MODE — no real funds are involved</div>
        <div className="not-connected">
          Connect TronLink to sign demo acceptance for TRON depositor <code>{depositorBase58}</code>.
        </div>
      </SharpCard>
    );
  }

  // TronLink on a chain we don't have a demo deploy for.
  if (!demoReady || !demoAddr) {
    return (
      <SharpCard style={{ padding: '28px 32px' }}>
        <div style={headerStyle}>DEMO MODE — no real funds are involved</div>
        <div className="not-connected">
          MoneyCrowDemo is not yet deployed on this TRON network. Switch to a network where it's live.
        </div>
      </SharpCard>
    );
  }

  const isRecipient = demo && tron.address && demo.recipientBase58 === tron.address;
  const isPending   = demo?.status === 0;
  const isAccepted  = demo?.status === 1;
  const isApproved  = demo?.status === 2;

  // ── Sign action ────────────────────────────────────────────────────────────

  const handleSign = async () => {
    if (!demo || !tron.addressEvm || !demoAddr) return;
    setSignature(null);
    setSignError(null);
    setSigning(true);
    try {
      const sig = await tron.signTypedData(
        {
          name:              'MoneyCrowDemo',
          version:           '1',
          chainId:           tron.chainId,
          verifyingContract: demoAddr,
        },
        DEMO_TYPES,
        {
          depositor: demo.depositorEvm,
          recipient: demo.recipientEvm,
          amount:    demo.amount,
          token:     demo.tokenEvm,
          termsHash: demo.termsHash,
        },
      );
      setSignature(sig.startsWith('0x') ? sig : '0x' + sig);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  };

  // ── Submit action ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!signature || !demoAddr || !tron.tronWeb) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (tron.tronWeb as any).contract(TRON_DEMO_ABI, demoAddr);
      const id: string = await c.acceptDemo(depositorBase58, signature).send();
      setTxId(id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Receipt screen ─────────────────────────────────────────────────────────

  if (txId) {
    const explorerBase = tron.network === 'shasta'
      ? 'https://shasta.tronscan.org'
      : 'https://tronscan.org';
    return (
      <SharpCard style={{ padding: '28px 32px' }}>
        <div style={headerStyle}>DEMO MODE — no real funds are involved</div>
        <div className="alert alert-success" style={{ marginBottom: 16, borderColor: '#F2B705', color: '#F2B705', background: 'rgba(242,183,5,0.06)' }}>
          Demo accepted on TRON — admin will now approve to complete the flow.
        </div>
        <p style={{ fontSize: 12, color: textTertiary, marginBottom: 6 }}>Tx ID:</p>
        <a
          href={`${explorerBase}/#/transaction/${txId}`}
          target="_blank" rel="noopener noreferrer"
          style={{ color: '#F2B705', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}
        >
          {txId}
        </a>
      </SharpCard>
    );
  }

  // ── Pending → sign + submit panel ──────────────────────────────────────────

  const rowStyle:   React.CSSProperties = { display: 'flex', gap: 0, borderBottom: `1px solid ${border}` };
  const labelStyle: React.CSSProperties = { width: 130, flexShrink: 0, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: `1px solid ${border}` };
  const valueStyle: React.CSSProperties = { flex: 1, padding: '10px 14px', fontSize: 13, color: isDark ? '#FFFFFF' : '#111111', wordBreak: 'break-all' };

  const formatTrxAmount = (raw: bigint) => {
    if (raw === 0n) return '0 (simulated)';
    // TRX has 6 decimals on TRON.
    const whole = raw / 1_000_000n;
    const frac  = raw % 1_000_000n;
    const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
    return fracStr.length > 0 ? `${whole}.${fracStr} TRX (simulated)` : `${whole} TRX (simulated)`;
  };

  return (
    <SharpCard style={{ padding: '28px 32px' }}>
      <div style={headerStyle}>DEMO MODE — no real funds are involved</div>

      {demoLoading && <p style={{ fontSize: 13, color: textSecondary }}>Loading demo from contract…</p>}
      {demoError   && <div className="alert alert-error">{demoError}</div>}

      {!demoLoading && !demo && !demoError && (
        <p style={{ fontSize: 13, color: textSecondary }}>
          No demo found on TRON for depositor <code>{depositorBase58}</code>.
        </p>
      )}

      {!isPending && !!demo && (
        <div className={`alert ${isApproved ? 'alert-success' : 'alert-info'}`} style={{ marginTop: 12 }}>
          {isAccepted && 'You already signed — waiting for admin to approve.'}
          {isApproved && 'Demo complete — the full escrow flow has been simulated.'}
        </div>
      )}

      {!!demo && isPending && !isRecipient && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          Connected wallet is not the recipient for this demo.<br />
          <code style={{ fontSize: 11 }}>Expected: {demo.recipientBase58}</code>
        </div>
      )}

      {!!demo && isPending && isRecipient && !signature && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: textSecondary, marginBottom: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Review demo details and sign the EIP-712 acceptance via TronLink
          </p>

          <div style={{ border: `1px solid ${border}`, marginBottom: 20 }}>
            {([
              ['Status',      STATUS_LABEL[demo.status] ?? String(demo.status)],
              ['Amount',      formatTrxAmount(demo.amount)],
              ['Description', description ? `"${description}"` : '—'],
              ['Depositor',   depositorBase58],
              ['Recipient',   demo.recipientBase58],
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
            disabled={signing}
          >
            {signing ? 'Awaiting TronLink…' : 'Sign Demo Acceptance'}
          </SharpButton>

          {signError && <div className="alert alert-error" style={{ marginTop: 12 }}>{signError}</div>}
        </div>
      )}

      {!!signature && (
        <div style={{ marginTop: 16 }}>
          <div className="alert alert-success" style={{ marginBottom: 16, borderColor: '#F2B705', color: '#F2B705', background: 'rgba(242,183,5,0.06)' }}>
            Signature obtained — submit to TRON to record acceptance.
          </div>

          <p style={{ fontSize: 12, color: textTertiary, marginBottom: 6 }}>Signature:</p>
          <code style={{ fontSize: 10, color: textSecondary, wordBreak: 'break-all', display: 'block', marginBottom: 16 }}>
            {signature}
          </code>

          <SharpButton
            style={{ background: '#F2B705', color: '#000', border: 'none' }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Accept Demo on TRON'}
          </SharpButton>

          {submitError && <div className="alert alert-error" style={{ marginTop: 12 }}>{submitError}</div>}
        </div>
      )}
    </SharpCard>
  );
}
