import { useState } from 'react';

type FaqItem = {
  q: string;
  a: string | React.ReactNode;
};

const FAQ: FaqItem[] = [
  {
    q: 'What is escrow and why use it?',
    a: 'Escrow is a neutral holding arrangement where funds are locked until a condition is met. Instead of paying upfront and hoping the other party delivers — or delivering first and hoping you get paid — both sides use escrow as a trusted middleman. Here, the middleman is a smart contract: code that runs automatically on a public blockchain, with rules that neither party can change once agreed.',
  },
  {
    q: 'How do I know my funds are safe?',
    a: (
      <>
        <p style={{ margin: '0 0 8px' }}>Several layers protect your funds:</p>
        <p style={{ margin: '0 0 6px' }}>1. <strong>Verified smart contract</strong> — the contract code is publicly visible and auditable on BaseScan and Polygonscan. Anyone can read exactly how funds move.</p>
        <p style={{ margin: '0 0 6px' }}>2. <strong>OpenZeppelin libraries</strong> — built on industry-standard audited code used by thousands of DeFi protocols.</p>
        <p style={{ margin: '0 0 6px' }}>3. <strong>Non-custodial</strong> — funds go directly into the contract, never to our wallets. Even if our website went offline, your funds are safe in the contract.</p>
        <p style={{ margin: 0 }}>4. <strong>96-hour timeout</strong> — if nothing happens, you get a full refund automatically.</p>
      </>
    ),
  },
  {
    q: 'What happens if the recipient never claims?',
    a: "If the escrow is approved for release but the recipient never claims, the funds simply stay in the contract until claimed. There's no deadline on the recipient's side once approved. If you want the funds back, you'd need the admin to issue a refund. This situation is unusual — recipients almost always claim promptly since money is waiting for them.",
  },
  {
    q: 'Can I cancel after depositing?',
    a: "If the recipient hasn't accepted yet (status Pending) and the 48-hour accept deadline has passed, you can call depositorRefund() from the Status page to get a full refund — no admin needed. Once the escrow is Active (accepted), you cannot unilaterally cancel — the recipient has already committed. You can request a refund from the admin, who can call refund() at any time while the escrow is Pending or Active. If 96 hours pass after acceptance with no admin action, you can trigger a timeout refund using claimTimeout().",
  },
  {
    q: 'What if I send to the wrong address?',
    a: "Only the recipient address set at deposit time can claim the funds. If you enter the wrong recipient address, the real recipient cannot access the funds. In this case, contact the admin immediately — they can issue a refund to your depositor address so you can try again. Always double-check the recipient address before depositing.",
  },
  {
    q: 'What is the acceptance step and why is it required?',
    a: (
      <>
        <p style={{ margin: '0 0 8px' }}>When a depositor creates an escrow, it starts in <strong>Pending</strong> status. The recipient must sign the escrow terms using EIP-712 before the escrow becomes <strong>Active</strong>. This protects both parties:</p>
        <p style={{ margin: '0 0 6px' }}>1. <strong>The recipient confirms the terms</strong> — they explicitly agree to what they are expected to deliver before the funds are locked in Active state.</p>
        <p style={{ margin: '0 0 6px' }}>2. <strong>The depositor is protected</strong> — if the recipient never accepts, the escrow stays Pending and the depositor can reclaim their funds after the accept deadline (default 48 hours).</p>
        <p style={{ margin: 0 }}>The signature is an off-chain EIP-712 typed-data signature — no gas is spent signing, only when submitting the accepted signature on-chain via acceptEscrow().</p>
      </>
    ),
  },
  {
    q: 'What is the 96-hour auto-refund?',
    a: 'Every Active escrow has a 96-hour clock from the moment of deposit. If the admin has not approved the release or issued a refund within 96 hours, the depositor can call claimTimeout() to receive a full refund. This protects depositors from an unresponsive admin. You can trigger this from the Escrow Status page — no admin involvement needed.',
  },
  {
    q: 'Which wallets are supported?',
    a: 'Any EVM-compatible wallet works. Named options in the connect modal include MetaMask, Coinbase Wallet, Rainbow, Trust Wallet, and Phantom. The "Other wallets — 300+ supported" option uses WalletConnect, which connects Exodus, Ledger, Trezor, and hundreds more. If your wallet supports Ethereum or an EVM chain, it works here.',
  },
  {
    q: 'Which tokens can I deposit?',
    a: "ETH (native Ether) works on both Base and Polygon. Any ERC-20 token also works — select ERC-20 mode on the deposit form, paste the token's contract address, and the app detects the symbol and decimals automatically. USDC and USDT are recommended stablecoins for most use cases.",
  },
  {
    q: 'What is the fee and when is it charged?',
    a: 'The current fee is 0.25% (25 basis points). It is deducted from the recipient\'s payout at the moment they claim. The depositor does not pay any extra fee — you lock exactly the amount you specify. The fee is shown on the deposit form (read-only) so both parties see it upfront before any funds move.',
  },
  {
    q: 'What networks are supported and which should I use?',
    a: (
      <>
        <p style={{ margin: '0 0 8px' }}>Two networks are live:</p>
        <p style={{ margin: '0 0 6px' }}><strong>Base mainnet</strong> (chainId 8453) — built by Coinbase, ~$0.01 gas. Recommended for most users. Use MetaMask or Coinbase Wallet and switch to Base.</p>
        <p style={{ margin: 0 }}><strong>Polygon mainnet</strong> (chainId 137) — ~$0.001 gas. Best if you already have MATIC for gas or are depositing very small amounts. Both networks are equivalent in security — choose whichever the other party prefers.</p>
      </>
    ),
  },
  {
    q: 'Can the admin steal my funds?',
    a: "No. The admin can only do two things: approve the release to the recipient, or refund to the depositor. The admin cannot redirect funds to any other address. This is enforced by the smart contract — not a policy promise, but actual code that runs on-chain. You can verify this by reading the contract source on BaseScan or Polygonscan.",
  },
  {
    q: 'What does "non-custodial" mean?',
    a: "Non-custodial means we never hold your funds. When you deposit, funds go directly from your wallet into the smart contract on-chain. There is no intermediate step where funds touch our wallets, bank accounts, or servers. We have no ability to freeze, redirect, or spend your funds. The smart contract is the only entity that holds them, and it follows its programmed rules exactly.",
  },
  {
    q: 'How do I verify the contract is legitimate?',
    a: (
      <>
        <p style={{ margin: '0 0 8px' }}>Three ways to independently verify:</p>
        <p style={{ margin: '0 0 6px' }}>1. <strong>BaseScan</strong> — visit the contract address on basescan.org and click the "Contract" tab. You can read the full verified Solidity source.</p>
        <p style={{ margin: '0 0 6px' }}>2. <strong>Polygonscan</strong> — same process for the Polygon deployment.</p>
        <p style={{ margin: 0 }}>3. <strong>Sourcify</strong> — both contracts are also verified on sourcify.dev, an independent decentralized verifier. Look for the green "Full Match" badge.</p>
      </>
    ),
  },
];

function FaqAccordion({ item, index }: { item: FaqItem; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 16,
          padding: '16px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        <span style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{
            flexShrink: 0,
            fontSize: 10, color: 'var(--cyan)', fontWeight: 600,
            marginTop: 2,
            minWidth: 24,
          }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: open ? 'var(--text)' : 'var(--muted)',
            lineHeight: 1.5,
            transition: 'color 0.15s',
          }}>
            {item.q}
          </span>
        </span>
        <span style={{
          flexShrink: 0,
          fontSize: 16, color: open ? 'var(--cyan)' : 'var(--muted2)',
          transition: 'color 0.15s, transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
          lineHeight: 1,
          marginTop: 2,
        }}>
          +
        </span>
      </button>

      {open && (
        <div style={{
          paddingLeft: 36,
          paddingBottom: 16,
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.75,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {typeof item.a === 'string' ? <p style={{ margin: 0 }}>{item.a}</p> : item.a}
        </div>
      )}
    </div>
  );
}

export default function Faq() {
  const [filter, setFilter] = useState('');
  const filtered = filter
    ? FAQ.filter(f => f.q.toLowerCase().includes(filter.toLowerCase()))
    : FAQ;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ marginBottom: 24, paddingTop: 4 }}>
        <h1 style={{
          margin: '0 0 6px',
          fontSize: 20, fontWeight: 700,
          color: 'var(--text)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          FAQ
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          // {FAQ.length} questions — click to expand
        </p>
        <input
          type="text"
          placeholder="// search questions..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 14px',
            background: 'var(--surface2)',
            border: '1px solid var(--border2)',
            borderRadius: 3,
            fontSize: 12,
            color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
            outline: 'none',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--cyan)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
        />
      </div>

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '0 20px',
      }}>
        {filtered.length === 0 ? (
          <p style={{ padding: '20px 0', fontSize: 12, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            // no questions match "{filter}"
          </p>
        ) : (
          filtered.map((item) => (
            <FaqAccordion key={item.q} item={item} index={FAQ.indexOf(item)} />
          ))
        )}
      </div>

      <div style={{
        marginTop: 20,
        padding: '14px 16px',
        background: 'rgba(126,232,250,0.05)',
        border: '1px solid rgba(126,232,250,0.2)',
        borderRadius: 3,
        fontSize: 11, color: 'var(--muted)', lineHeight: 1.65,
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        // still have questions?{' '}
        <span style={{ color: 'var(--cyan)' }}>Read the contract source</span>{' '}
        on BaseScan or Polygonscan — it is the ultimate source of truth.
      </div>
    </div>
  );
}
