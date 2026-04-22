import { useTheme } from '../context/ThemeContext';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';
import { SharpButton } from '../components/sharp/SharpButton';

const steps = [
  {
    num: '01', actor: 'Depositor', color: '#4F8EFF', title: 'Lock Funds',
    desc: 'Connect your wallet, specify the recipient, choose token and network, write terms. Funds lock in the audited smart contract — not in our custody.',
    points: ['ETH, USDC, MATIC, WBTC supported', 'Base or Polygon Mainnet', 'Optional plain-language release conditions'],
  },
  {
    num: '02', actor: 'Recipient', color: '#A855F7', title: 'Accept Terms',
    desc: 'The recipient reviews the full escrow terms on-chain. Accepting creates a verifiable, immutable agreement. Both parties are now bound.',
    points: ['Signed acceptance transaction on-chain', 'Terms recorded permanently', 'No off-chain paperwork required'],
  },
  {
    num: '03', actor: 'Admin', color: '#F2B705', title: 'Admin Approves',
    desc: 'Once delivery is confirmed, the admin reviews evidence and approves the release — or refunds the depositor. All actions are on-chain transactions.',
    points: ['Dual-key release model', 'Neutral on-chain arbitration', 'Dispute resolution at any stage'],
  },
  {
    num: '04', actor: 'Recipient', color: '#34D399', title: 'Claim Funds',
    desc: 'With approval confirmed on-chain, the recipient claims their funds at any time. Settlement is instant and direct to their wallet.',
    points: ['Single-transaction claim', 'Funds arrive instantly', 'Permanent on-chain record'],
  },
];

export default function HowItWorks({ onNav }: { onNav?: (p: string) => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';
  const cardBg = isDark ? '#1C1C1C' : '#FFFFFF';

  return (
    <div style={{ maxWidth: 860, fontFamily: "'Space Grotesk', sans-serif" }}>
      <SharpPageHeader title="How It Works" subtitle="The MoneyCrow escrow protocol — trustless, transparent, on-chain." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', borderBottom: i < steps.length - 1 ? `1px solid ${border}` : 'none' }}>
            {/* Number */}
            <div style={{ padding: '32px 0 32px 0', display: 'flex', justifyContent: 'center' }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'rgba(242,183,5,0.25)', letterSpacing: '-1px' }}>{s.num}</span>
            </div>
            {/* Content */}
            <div style={{ padding: '32px 0 32px 24px', borderLeft: `2px solid ${s.color}30` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ width: 16, height: 2, background: s.color }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: s.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.actor}</span>
              </div>
              <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700, color: textPrimary, letterSpacing: '-0.3px' }}>{s.title}</h2>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: textSecondary, lineHeight: 1.8 }}>{s.desc}</p>
              {s.points.map((pt, j) => (
                <div key={j} style={{ display: 'flex', gap: 10, fontSize: 13, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(17,17,17,0.65)', marginBottom: 5 }}>
                  <span style={{ color: '#F2B705', flexShrink: 0 }}>→</span>{pt}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 48, background: cardBg, border: `1px solid ${border}`, padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ width: 20, height: 2, background: '#F2B705', marginBottom: 12 }} />
          <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: textPrimary }}>Ready to create your first escrow?</p>
          <p style={{ margin: 0, fontSize: 13, color: textSecondary }}>Under 2 minutes. No sign-up required.</p>
        </div>
        {onNav && <SharpButton onClick={() => onNav('create')}>Create Escrow →</SharpButton>}
      </div>
    </div>
  );
}
