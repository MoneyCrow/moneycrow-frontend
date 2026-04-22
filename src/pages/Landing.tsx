import { useTheme } from '../context/ThemeContext';
import { SharpButton } from '../components/sharp/SharpButton';
import logoGold from '../assets/logo-gold.png';
import type { Page } from '../components/sharp/AppShell';

interface Props {
  onNav: (page: Page) => void;
}

const stats = [
  { value: '$2.4B', label: 'Volume Secured'   },
  { value: '50K+',  label: 'Active Users'      },
  { value: '99.9%', label: 'Uptime'            },
  { value: '0',     label: 'Security Breaches' },
];

const features = [
  { title: 'Non-Custodial',     desc: 'Funds are held exclusively in audited smart contracts. Nobody touches your assets.' },
  { title: 'On-Chain Record',   desc: 'Every action — acceptance, approval, release — is a verifiable on-chain transaction.' },
  { title: 'Dual-Key Release',  desc: 'Admin approval required before funds move. No single point of failure.' },
  { title: 'Multi-Chain',       desc: 'Live on Base and Polygon Mainnet. More networks on the roadmap.' },
  { title: 'Fast Settlement',   desc: 'Once approved, funds settle instantly on-chain. No intermediary delays.' },
  { title: 'Audited Contracts', desc: 'Zero critical vulnerabilities. Audit report is public and linked in our docs.' },
];

const steps = [
  { num: '01', title: 'Lock',    desc: 'Depositor locks funds in a smart contract and sets terms.' },
  { num: '02', title: 'Accept',  desc: 'Recipient reviews and accepts terms on-chain.' },
  { num: '03', title: 'Approve', desc: 'Admin verifies delivery and approves release.' },
  { num: '04', title: 'Claim',   desc: 'Recipient claims funds directly to their wallet.' },
];

export default function Landing({ onNav }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: textPrimary }}>

      {/* ── HERO ── */}
      <section style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', marginTop: '-44px', padding: '80px 0 60px', borderBottom: `1px solid ${border}`, position: 'relative' }}>

        {/* Large crow watermark */}
        <div style={{ position: 'absolute', right: -40, top: '50%', transform: 'translateY(-50%)', opacity: 0.035, pointerEvents: 'none' }}>
          <img src={logoGold} style={{ width: 480, height: 480, objectFit: 'contain' }} alt="" />
        </div>

        <div style={{ maxWidth: 640, position: 'relative', zIndex: 1 }}>
          {/* Eyebrow */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <span style={{ width: 24, height: 1, background: '#F2B705' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#F2B705', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Base & Polygon Mainnet</span>
          </div>

          <h1 style={{ fontSize: 80, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-3px', margin: '0 0 12px', color: textPrimary }}>
            Your<br />Money,
          </h1>
          <h1 style={{ fontSize: 80, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-3px', margin: '0 0 36px', color: '#F2B705' }}>
            Secured.
          </h1>

          <p style={{ fontSize: 18, color: textSecondary, lineHeight: 1.75, margin: '0 0 44px', maxWidth: 480, fontWeight: 400 }}>
            Trustless escrow for the on-chain economy. Lock funds, set terms, release on delivery — zero counterparty risk.
          </p>

          <div style={{ display: 'flex', gap: 12 }}>
            <SharpButton size="lg" onClick={() => onNav('create')}>Create Escrow</SharpButton>
            <SharpButton size="lg" variant="outline" onClick={() => onNav('status')}>View Escrows</SharpButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 44, paddingTop: 44, borderTop: `1px solid ${border}` }}>
            <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(17,17,17,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Deployed on</span>
            <span style={{ background: 'rgba(0,82,255,0.1)', color: '#4F8EFF', fontSize: 10, fontWeight: 700, padding: '4px 10px', border: '1px solid rgba(79,142,255,0.2)', letterSpacing: '0.1em' }}>BASE</span>
            <span style={{ background: 'rgba(130,71,229,0.1)', color: '#A855F7', fontSize: 10, fontWeight: 700, padding: '4px 10px', border: '1px solid rgba(168,85,247,0.2)', letterSpacing: '0.1em' }}>POLYGON</span>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${border}`, margin: '0' }}>
        {stats.map((s, i) => (
          <div key={i} style={{ padding: '44px 40px', borderRight: i < stats.length - 1 ? `1px solid ${border}` : 'none' }}>
            <div style={{ fontSize: 52, fontWeight: 700, color: '#F2B705', letterSpacing: '-2px', lineHeight: 1, marginBottom: 8 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '80px 0', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 24, height: 1, background: '#F2B705' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F2B705', letterSpacing: '0.14em', textTransform: 'uppercase' }}>The Protocol</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', color: textPrimary, lineHeight: 1.05 }}>Four steps.<br />Zero trust required.</h2>
          </div>
          <SharpButton variant="outline" onClick={() => onNav('how-it-works')}>Full Explanation →</SharpButton>
        </div>

        {/* Steps — sharp bordered grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `1px solid ${border}` }}>
          {steps.map((s, i) => (
            <div key={i} style={{ padding: '36px 32px', borderRight: i < steps.length - 1 ? `1px solid ${border}` : 'none', position: 'relative' }}>
              <div style={{ fontSize: 56, fontWeight: 700, color: isDark ? 'rgba(242,183,5,0.1)' : 'rgba(242,183,5,0.25)', letterSpacing: '-2px', lineHeight: 1, marginBottom: 24, fontFamily: "'Space Grotesk', sans-serif" }}>{s.num}</div>
              <div style={{ width: 20, height: 2, background: '#F2B705', marginBottom: 16 }} />
              <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: textPrimary, letterSpacing: '-0.2px' }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: textSecondary, lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: '80px 0', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ width: 24, height: 1, background: '#F2B705' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F2B705', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Why MoneyCrow</span>
        </div>
        <h2 style={{ margin: '0 0 44px', fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', color: textPrimary, lineHeight: 1.05 }}>Built for Trust.</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: `1px solid ${border}` }}>
          {features.map((f, i) => (
            <div key={i} style={{
              padding: '32px 28px',
              borderRight: i % 3 < 2 ? `1px solid ${border}` : 'none',
              borderBottom: i < 3 ? `1px solid ${border}` : 'none',
            }}>
              <div style={{ width: 20, height: 2, background: '#F2B705', marginBottom: 16 }} />
              <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: textPrimary, letterSpacing: '-0.1px' }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: textSecondary, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '80px 0', borderBottom: `1px solid ${border}`, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 48, position: 'relative' }}>
        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', opacity: 0.04, pointerEvents: 'none' }}>
          <img src={logoGold} style={{ width: 280, height: 280, objectFit: 'contain' }} alt="" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', color: textPrimary, lineHeight: 1.05 }}>
            Secure your next deal<br /><span style={{ color: '#F2B705' }}>without a middleman.</span>
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: textSecondary }}>No bank. No lawyer. No escrow agent. Just code.</p>
        </div>
        <SharpButton size="lg" onClick={() => onNav('create')} style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
          Create Escrow →
        </SharpButton>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logoGold} style={{ width: 22, height: 22, objectFit: 'contain' }} alt="" />
          <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>MoneyCrow</span>
          <span style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(17,17,17,0.2)' }}>— Trustless Escrow Protocol</span>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {['Docs', 'Audit Report', 'Terms', 'Privacy'].map(l => (
            <span key={l} style={{ fontSize: 12, color: textSecondary, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, transition: 'color 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.color = isDark ? '#FFFFFF' : '#111111'; }}
              onMouseLeave={e => { e.currentTarget.style.color = textSecondary; }}
            >{l}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
