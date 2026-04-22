import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { SharpPageHeader } from '../components/sharp/SharpPageHeader';

const faqs = [
  { q: 'What is MoneyCrow?', a: 'MoneyCrow is a trustless escrow protocol on Base and Polygon. Smart contracts hold funds until both parties confirm the deal — no human custody, no middleman.' },
  { q: 'What tokens are supported?', a: 'ETH, USDC, MATIC, and WBTC. All held natively in the smart contract. Additional ERC-20 tokens are on the roadmap.' },
  { q: 'How does admin approval work?', a: 'The admin acts as a neutral on-chain arbiter. Once delivery is confirmed, the admin reviews evidence and approves the release or triggers a refund. Every action is an on-chain transaction.' },
  { q: 'Are the contracts audited?', a: 'Yes — professionally audited with zero critical vulnerabilities. The full audit report is publicly available in our documentation.' },
  { q: 'What happens in a dispute?', a: 'Either party can raise a dispute. The admin reviews evidence from both sides and makes a ruling: approve release or refund the depositor.' },
  { q: 'What are the fees?', a: "A flat 1% platform fee on the locked amount, charged at creation. Gas fees on Base and Polygon are minimal." },
  { q: 'Is MoneyCrow non-custodial?', a: 'Completely. Funds are locked in audited smart contracts. No one at MoneyCrow can access your assets at any point.' },
  { q: 'Can I cancel before acceptance?', a: 'Yes. Before the recipient accepts, the depositor can cancel and receive a full refund minus gas. After acceptance, cancellation requires admin intervention.' },
];

function FaqItem({ item, index, open, onToggle }: { item: { q: string; a: string }; index: number; open: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';

  return (
    <div style={{ borderBottom: index < faqs.length - 1 ? `1px solid ${border}` : 'none' }}>
      <button onClick={onToggle} style={{
        width: '100%', padding: '20px 24px', background: 'none', border: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: open ? '#F2B705' : textPrimary, textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.1px' }}>{item.q}</span>
        <span style={{ flexShrink: 0, fontSize: 20, color: open ? '#F2B705' : (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(17,17,17,0.3)'), transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s, color 0.15s', lineHeight: 1 }}>+</span>
      </button>
      {open && (
        <div style={{ padding: '0 24px 20px', fontSize: 14, color: textSecondary, lineHeight: 1.8, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>{item.a}</div>
      )}
    </div>
  );
}

export default function Faq() {
  const [open, setOpen] = useState<number>(0);
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const cardBg = isDark ? '#1C1C1C' : '#FFFFFF';

  return (
    <div style={{ maxWidth: 720, fontFamily: "'Space Grotesk', sans-serif" }}>
      <SharpPageHeader title="FAQ" subtitle="Answers to common questions about the MoneyCrow protocol." />
      <div style={{ border: `1px solid ${border}`, background: cardBg }}>
        {faqs.map((f, i) => (
          <FaqItem
            key={i}
            item={f}
            index={i}
            open={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}
      </div>
    </div>
  );
}
