import { useTheme } from '../context/ThemeContext';
import { SharpButton } from '../components/sharp/SharpButton';
import { useIsMobile } from '../components/sharp/useIsMobile';
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
  const isMobile = useIsMobile();
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(17,17,17,0.5)';

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: textPrimary }}>

      {/* ── HERO ── */}
      <section style={{
        minHeight: isMobile ? 0 : 'calc(100vh - 64px)',
        display: 'flex', alignItems: 'center',
        marginTop: isMobile ? -28 : -44,
        padding: isMobile ? '56px 0 48px' : '80px 0 60px',
        borderBottom: `1px solid ${border}`,
        position: 'relative',
        textAlign: isMobile ? 'center' : 'left',
      }}>

        {/* Large crow watermark — centered behind on mobile, right on desktop */}
        <div style={{
          position: 'absolute',
          top: '50%',
          transform: isMobile ? 'translate(-50%, -50%)' : 'translateY(-50%)',
          left: isMobile ? '50%' : 'auto',
          right: isMobile ? 'auto' : -40,
          opacity: isMobile ? 0.05 : 0.035,
          pointerEvents: 'none',
        }}>
          <img
            src={logoGold}
            style={{ width: isMobile ? 320 : 480, height: isMobile ? 320 : 480, objectFit: 'contain' }}
            alt=""
          />
        </div>

        <div style={{
          maxWidth: 640,
          width: '100%',
          position: 'relative',
          zIndex: 1,
          marginLeft: isMobile ? 'auto' : 0,
          marginRight: isMobile ? 'auto' : 0,
        }}>
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginBottom: isMobile ? 24 : 32,
          }}>
            <span style={{ width: 24, height: 1, background: '#F2B705' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#F2B705', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Base & Polygon Mainnet</span>
          </div>

          <h1 style={{
            fontSize: isMobile ? 52 : 80,
            fontWeight: 700, lineHeight: 0.95,
            letterSpacing: isMobile ? '-1.5px' : '-3px',
            margin: '0 0 12px', color: textPrimary,
          }}>
            Your<br />Money,
          </h1>
          <h1 style={{
            fontSize: isMobile ? 52 : 80,
            fontWeight: 700, lineHeight: 0.95,
            letterSpacing: isMobile ? '-1.5px' : '-3px',
            margin: isMobile ? '0 0 24px' : '0 0 36px',
            color: '#F2B705',
          }}>
            Secured.
          </h1>

          <p style={{
            fontSize: isMobile ? 16 : 18,
            color: textSecondary,
            lineHeight: isMobile ? 1.7 : 1.75,
            margin: isMobile ? '0 auto 32px' : '0 0 44px',
            maxWidth: 480, fontWeight: 400,
          }}>
            Trustless escrow for the on-chain economy. Lock funds, set terms, release on delivery — zero counterparty risk.
          </p>

          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
          }}>
            <SharpButton
              size="lg"
              onClick={() => onNav('create')}
              style={isMobile ? { width: '100%', justifyContent: 'center' } : undefined}
            >
              Create Escrow
            </SharpButton>
            <SharpButton
              size="lg"
              variant="outline"
              onClick={() => onNav('status')}
              style={isMobile ? { width: '100%', justifyContent: 'center' } : undefined}
            >
              View Escrows
            </SharpButton>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginTop: isMobile ? 32 : 44,
            paddingTop: isMobile ? 32 : 44,
            borderTop: `1px solid ${border}`,
            justifyContent: isMobile ? 'center' : 'flex-start',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(17,17,17,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Deployed on</span>
            <span style={{ background: 'rgba(0,82,255,0.1)', color: '#4F8EFF', fontSize: 10, fontWeight: 700, padding: '4px 10px', border: '1px solid rgba(79,142,255,0.2)', letterSpacing: '0.1em' }}>BASE</span>
            <span style={{ background: 'rgba(130,71,229,0.1)', color: '#A855F7', fontSize: 10, fontWeight: 700, padding: '4px 10px', border: '1px solid rgba(168,85,247,0.2)', letterSpacing: '0.1em' }}>POLYGON</span>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        borderBottom: `1px solid ${border}`,
      }}>
        {stats.map((s, i) => {
          // Mobile: 2×2 grid — odd cells get right border, top row gets bottom border.
          // Desktop: all but last get right border.
          const desktopBorderRight = !isMobile && i < stats.length - 1;
          const mobileBorderRight = isMobile && i % 2 === 0;
          const mobileBorderBottom = isMobile && i < 2;
          return (
            <div key={i} style={{
              padding: isMobile ? '28px 20px' : '44px 40px',
              borderRight: (desktopBorderRight || mobileBorderRight) ? `1px solid ${border}` : 'none',
              borderBottom: mobileBorderBottom ? `1px solid ${border}` : 'none',
            }}>
              <div style={{
                fontSize: isMobile ? 36 : 52,
                fontWeight: 700, color: '#F2B705',
                letterSpacing: isMobile ? '-1px' : '-2px',
                lineHeight: 1, marginBottom: 8,
              }}>{s.value}</div>
              <div style={{
                fontSize: isMobile ? 11 : 12,
                color: textSecondary, letterSpacing: '0.06em',
                textTransform: 'uppercase', fontWeight: 600,
              }}>{s.label}</div>
            </div>
          );
        })}
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{
        padding: isMobile ? '48px 0' : '80px 0',
        borderBottom: `1px solid ${border}`,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'flex-end',
          marginBottom: isMobile ? 32 : 48,
          gap: isMobile ? 24 : 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 24, height: 1, background: '#F2B705' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F2B705', letterSpacing: '0.14em', textTransform: 'uppercase' }}>The Protocol</span>
            </div>
            <h2 style={{
              margin: 0,
              fontSize: isMobile ? 32 : 44,
              fontWeight: 700,
              letterSpacing: isMobile ? '-1px' : '-1.5px',
              color: textPrimary, lineHeight: 1.05,
            }}>
              Four steps.<br />Zero trust required.
            </h2>
          </div>
          <SharpButton
            variant="outline"
            onClick={() => onNav('how-it-works')}
            style={isMobile ? { width: '100%', justifyContent: 'center' } : undefined}
          >
            Full Explanation →
          </SharpButton>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
          border: `1px solid ${border}`,
        }}>
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            return (
              <div key={i} style={{
                padding: isMobile ? '28px 20px' : '36px 32px',
                borderRight: !isMobile && !last ? `1px solid ${border}` : 'none',
                borderBottom: isMobile && !last ? `1px solid ${border}` : 'none',
                position: 'relative',
              }}>
                <div style={{
                  fontSize: isMobile ? 44 : 56,
                  fontWeight: 700,
                  color: isDark ? 'rgba(242,183,5,0.1)' : 'rgba(242,183,5,0.25)',
                  letterSpacing: '-2px', lineHeight: 1, marginBottom: 24,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>{s.num}</div>
                <div style={{ width: 20, height: 2, background: '#F2B705', marginBottom: 16 }} />
                <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: textPrimary, letterSpacing: '-0.2px' }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: textSecondary, lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{
        padding: isMobile ? '48px 0' : '80px 0',
        borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ width: 24, height: 1, background: '#F2B705' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F2B705', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Why MoneyCrow</span>
        </div>
        <h2 style={{
          margin: isMobile ? '0 0 32px' : '0 0 44px',
          fontSize: isMobile ? 32 : 44,
          fontWeight: 700,
          letterSpacing: isMobile ? '-1px' : '-1.5px',
          color: textPrimary, lineHeight: 1.05,
        }}>
          Built for Trust.
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          border: `1px solid ${border}`,
        }}>
          {features.map((f, i) => {
            const last = i === features.length - 1;
            return (
              <div key={i} style={{
                padding: isMobile ? '28px 20px' : '32px 28px',
                // Desktop: right border on cols 0,1,3,4 (not 2,5); bottom border on row 0 (idx 0-2).
                borderRight: !isMobile && i % 3 < 2 ? `1px solid ${border}` : 'none',
                borderBottom: isMobile
                  ? (!last ? `1px solid ${border}` : 'none')
                  : (i < 3 ? `1px solid ${border}` : 'none'),
              }}>
                <div style={{ width: 20, height: 2, background: '#F2B705', marginBottom: 16 }} />
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: textPrimary, letterSpacing: '-0.1px' }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: textSecondary, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        padding: isMobile ? '48px 0' : '80px 0',
        borderBottom: `1px solid ${border}`,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 24 : 48,
        position: 'relative',
        textAlign: isMobile ? 'center' : 'left',
      }}>
        <div style={{
          position: 'absolute',
          right: isMobile ? '50%' : 0,
          top: '50%',
          transform: isMobile ? 'translate(50%, -50%)' : 'translateY(-50%)',
          opacity: isMobile ? 0.05 : 0.04,
          pointerEvents: 'none',
        }}>
          <img
            src={logoGold}
            style={{ width: isMobile ? 220 : 280, height: isMobile ? 220 : 280, objectFit: 'contain' }}
            alt=""
          />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{
            margin: '0 0 12px',
            fontSize: isMobile ? 32 : 44,
            fontWeight: 700,
            letterSpacing: isMobile ? '-1px' : '-1.5px',
            color: textPrimary, lineHeight: 1.05,
          }}>
            Secure your next deal<br /><span style={{ color: '#F2B705' }}>without a middleman.</span>
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: textSecondary }}>No bank. No lawyer. No escrow agent. Just code.</p>
        </div>
        <SharpButton
          size="lg"
          onClick={() => onNav('create')}
          style={{
            position: 'relative',
            zIndex: 1,
            flexShrink: 0,
            ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}),
          }}
        >
          Create Escrow →
        </SharpButton>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: isMobile ? '24px 0' : '32px 0',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 20 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <img src={logoGold} style={{ width: 22, height: 22, objectFit: 'contain' }} alt="" />
          <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>MoneyCrow</span>
          <span style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(17,17,17,0.2)' }}>— Trustless Escrow Protocol</span>
        </div>
        <div style={{
          display: 'flex',
          gap: isMobile ? 16 : 28,
          flexWrap: 'wrap',
        }}>
          {['Docs', 'Audit Report', 'Terms', 'Privacy'].map(l => (
            <span
              key={l}
              style={{
                fontSize: 12, color: textSecondary, cursor: 'pointer',
                letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600,
                transition: 'color 0.12s',
                ...(isMobile ? { display: 'inline-block', padding: '8px 0' } : {}),
              }}
              onMouseEnter={e => { e.currentTarget.style.color = isDark ? '#FFFFFF' : '#111111'; }}
              onMouseLeave={e => { e.currentTarget.style.color = textSecondary; }}
            >{l}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
