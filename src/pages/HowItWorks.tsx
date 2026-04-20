const BASE_ADDR    = '0xad29BABD124fF59a3C72E768e37dcC04CF1185eb';
const POLYGON_ADDR = '0xad29BABD124fF59a3C72E768e37dcC04CF1185eb';

type StepProps = {
  number: number;
  title: string;
  description: string;
  detail?: string;
  color?: string;
};

function Step({ number, title, description, detail, color = 'var(--cyan)' }: StepProps) {
  return (
    <div style={{
      display: 'flex', gap: 20,
      padding: '20px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        flexShrink: 0,
        width: 36, height: 36,
        borderRadius: '50%',
        background: `${color}18`,
        border: `1px solid ${color}50`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color,
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        {number}
      </div>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
          {title}
        </p>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, fontFamily: 'JetBrains Mono, monospace' }}>
          {description}
        </p>
        {detail && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--green)', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace' }}>
            // {detail}
          </p>
        )}
      </div>
    </div>
  );
}

type SectionProps = { title: string; comment?: string; children: React.ReactNode };
function Section({ title, comment, children }: SectionProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'baseline', gap: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', fontFamily: 'JetBrains Mono, monospace' }}>
          {title}
        </span>
        {comment && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            // {comment}
          </span>
        )}
      </div>
      <div style={{ padding: '4px 20px 20px' }}>
        {children}
      </div>
    </div>
  );
}

type PillProps = { label: string; color: string; sub?: string };
function Pill({ label, color, sub }: PillProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '10px 14px',
      background: `${color}10`,
      border: `1px solid ${color}35`,
      borderRadius: 3,
      flex: '1 1 160px',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export default function HowItWorks() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ marginBottom: 28, paddingTop: 4 }}>
        <h1 style={{
          margin: '0 0 6px',
          fontSize: 20, fontWeight: 700,
          color: 'var(--text)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          How It Works
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          // plain-language guide — no crypto experience required
        </p>
      </div>

      {/* ── The Escrow Flow ── */}
      <Section title="theEscrowFlow" comment="step-by-step">
        <Step
          number={1}
          title="Depositor locks funds"
          description="You connect your wallet and lock funds into the smart contract. You set the recipient's wallet address, a description, optional terms, and contact details. The funds leave your wallet and sit in the smart contract — not with us. The escrow starts as Pending."
          detail="The contract records the amount, recipient, and terms permanently on-chain. No one can alter it."
          color="var(--cyan)"
        />
        <Step
          number={2}
          title="Recipient signs acceptance (EIP-712)"
          description="The recipient gets notified. They visit the Status page, connect their wallet, read the terms, and sign an off-chain EIP-712 typed-data message to accept. They then submit that signature on-chain (acceptEscrow). The escrow moves from Pending → Active."
          detail="If the recipient does not accept within 48 hours, the depositor can reclaim their funds automatically — no admin needed."
          color="var(--orange)"
        />
        <Step
          number={3}
          title="Admin approves the release"
          description="Once the deliverable is fulfilled, the admin calls approveRelease() on-chain. This sets an on-chain flag that allows the recipient to claim. Both parties are notified by email and/or Telegram."
          detail="The contract enforces a 96-hour Active timeout — if the admin is unresponsive, the depositor can reclaim automatically."
          color="var(--green)"
        />
        <Step
          number={4}
          title="Recipient claims funds"
          description="The recipient visits the Claim page, reviews the payout, and clicks claim(). The contract verifies their wallet address, deducts the fee (currently 0.25%), and sends the net amount directly to their wallet."
          detail="Only the exact recipient address set at deposit time can claim. No one else can — not even the admin."
          color="var(--pink)"
        />
        <div style={{
          marginTop: 16,
          padding: '14px 16px',
          background: 'rgba(199,144,234,0.07)',
          border: '1px solid rgba(199,144,234,0.25)',
          borderRadius: 3,
          fontSize: 11,
          color: 'var(--muted)',
          lineHeight: 1.7,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{ color: '#c792ea', fontWeight: 600 }}>// what the smart contract enforces automatically:</span>
          <br />— Recipient must cryptographically sign acceptance before funds go Active
          <br />— If recipient doesn't accept in 48h, depositor gets a full refund (no admin needed)
          <br />— Only the recipient wallet can claim (cryptographic proof)
          <br />— The admin cannot move funds to any other address
          <br />— If 96 hours pass after acceptance with no admin action, depositor gets a full refund
          <br />— The fee is fixed at deposit time — it cannot be changed retroactively
          <br />— Every action is recorded permanently on a public blockchain
        </div>
      </Section>

      {/* ── Supported Networks ── */}
      <Section title="supportedNetworks" comment="two EVM chains">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          {/* Base */}
          <div style={{
            flex: '1 1 280px',
            padding: '14px 16px',
            background: 'rgba(126,232,250,0.05)',
            border: '1px solid rgba(126,232,250,0.25)',
            borderRadius: 3,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
                Base Mainnet
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                chainId: 8453
              </span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace' }}>
              Built by Coinbase on the OP Stack. Very low gas fees (~$0.01 per tx) and fast 2-second blocks.
              Ideal for most users.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'JetBrains Mono, monospace' }}>
                Gas: ~$0.01
              </span>
              <a
                href={`https://basescan.org/address/${BASE_ADDR}#code`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 10, color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none' }}
              >
                {BASE_ADDR.slice(0, 10)}…{BASE_ADDR.slice(-6)} ↗ Basescan
              </a>
            </div>
          </div>
          {/* Polygon */}
          <div style={{
            flex: '1 1 280px',
            padding: '14px 16px',
            background: 'rgba(199,144,234,0.05)',
            border: '1px solid rgba(199,144,234,0.25)',
            borderRadius: 3,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c792ea' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c792ea', fontFamily: 'JetBrains Mono, monospace' }}>
                Polygon Mainnet
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                chainId: 137
              </span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace' }}>
              High-throughput PoS sidechain. Extremely low fees (~$0.001 per tx). Popular for
              high-frequency or low-value transfers.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'JetBrains Mono, monospace' }}>
                Gas: ~$0.001
              </span>
              <a
                href={`https://polygonscan.com/address/${POLYGON_ADDR}#code`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 10, color: '#c792ea', fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none' }}
              >
                {POLYGON_ADDR.slice(0, 10)}…{POLYGON_ADDR.slice(-6)} ↗ Polygonscan
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Supported Wallets ── */}
      <Section title="supportedWallets" comment="any EVM-compatible wallet">
        <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: '8px 0 12px', fontFamily: 'JetBrains Mono, monospace' }}>
          Any Ethereum-compatible wallet works. Click "Connect Wallet" in the top-right and choose your wallet. If yours isn't listed by name, use WalletConnect — it covers 300+ wallets.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'MetaMask',       sub: 'most popular browser extension' },
            { label: 'Coinbase Wallet', sub: 'great for beginners' },
            { label: 'Rainbow',        sub: 'clean mobile wallet' },
            { label: 'Trust Wallet',   sub: 'multi-chain mobile' },
            { label: 'Phantom',        sub: 'Solana + EVM' },
            { label: 'Exodus',         sub: 'via WalletConnect' },
            { label: 'Ledger',         sub: 'hardware wallet via WC' },
            { label: 'Trezor',         sub: 'hardware wallet via WC' },
          ].map(w => (
            <Pill key={w.label} label={w.label} sub={w.sub} color="var(--cyan)" />
          ))}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--green)', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace' }}>
          // WalletConnect covers 300+ additional wallets — if you have an EVM wallet, it works here.
        </p>
      </Section>

      {/* ── Supported Tokens ── */}
      <Section title="supportedTokens" comment="ETH + any ERC-20">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <Pill label="ETH (native)" sub="native asset on both networks" color="var(--cyan)" />
          <Pill label="USDC"          sub="recommended stablecoin" color="var(--green)" />
          <Pill label="USDT"          sub="most popular globally" color="var(--orange)" />
          <Pill label="Any ERC-20"    sub="paste contract address" color="var(--muted)" />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace' }}>
          // To use a custom token: select "ERC-20" mode on the deposit form, paste the token contract address,
          and the app will auto-detect the symbol and decimals. The token must be ERC-20 compliant.
        </p>
      </Section>

      {/* ── Transparency & Security ── */}
      <Section title="transparencyAndSecurity" comment="auditable, non-custodial">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
          {[
            { icon: '✓', text: 'Both contracts fully verified on BaseScan, Polygonscan, and Sourcify — anyone can read the code.', color: 'var(--green)' },
            { icon: '✓', text: 'Built on OpenZeppelin audited libraries — ReentrancyGuard prevents re-entrancy attacks, SafeERC20 handles token edge cases.', color: 'var(--green)' },
            { icon: '✓', text: 'Non-custodial — funds are locked in the contract itself. They never pass through our wallets, servers, or control.', color: 'var(--green)' },
            { icon: '✓', text: '96-hour auto-refund — if the admin takes no action (approve or refund) within 96 hours, the depositor can reclaim funds by calling claimTimeout().', color: 'var(--green)' },
            { icon: '✓', text: 'Open source — the entire smart contract is publicly readable on BaseScan and Polygonscan.', color: 'var(--green)' },
            { icon: '✓', text: 'Current fee: 0.25% (25 bps) — deducted only when the recipient claims. The depositor pays nothing extra.', color: 'var(--orange)' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '10px 0',
              borderBottom: i < 5 ? '1px solid var(--border)' : 'none',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              <span style={{ color: item.color, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.65 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
