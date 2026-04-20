type Page = 'deposit' | 'status' | 'admin' | 'claim' | 'how-it-works' | 'faq';

type FooterProps = {
  onNavigate: (page: Page) => void;
};

const BASE_ADDR    = '0xad29BABD124fF59a3C72E768e37dcC04CF1185eb';
const POLYGON_ADDR = '0xad29BABD124fF59a3C72E768e37dcC04CF1185eb';

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer style={{
      marginTop: 64,
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {/* Main footer grid */}
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '36px 24px 28px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 32,
      }}>
        {/* Brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 3,
              background: 'linear-gradient(135deg, var(--cyan) 0%, #38bdf8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#000',
            }}>M</div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              Money<span style={{ color: 'var(--cyan)' }}>Crow</span>
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
            Trustless escrow on Base &amp; Polygon.<br />
            Non-custodial. Open source.
          </p>
        </div>

        {/* Contracts */}
        <div>
          <p style={{ fontSize: 10, color: 'var(--muted2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            // contracts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }} />
              <a
                href={`https://basescan.org/address/${BASE_ADDR}#code`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: 'var(--cyan)', textDecoration: 'none' }}
              >
                Base — {truncate(BASE_ADDR)} ↗
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c792ea', flexShrink: 0 }} />
              <a
                href={`https://polygonscan.com/address/${POLYGON_ADDR}#code`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: '#c792ea', textDecoration: 'none' }}
              >
                Polygon — {truncate(POLYGON_ADDR)} ↗
              </a>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div>
          <p style={{ fontSize: 10, color: 'var(--muted2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            // navigate
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {([
              ['deposit',      'deposit'],
              ['status',       'escrow status'],
              ['how-it-works', 'how it works'],
              ['faq',          'faq'],
              ['admin',        'admin'],
            ] as [Page, string][]).map(([page, label]) => (
              <button
                key={page}
                onClick={() => onNavigate(page)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 11, color: 'var(--muted)', textAlign: 'left',
                  fontFamily: 'JetBrains Mono, monospace',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Security */}
        <div>
          <p style={{ fontSize: 10, color: 'var(--muted2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            // security
          </p>
          <div style={{
            padding: '8px 12px',
            borderRadius: 3,
            border: '1px solid rgba(195,232,141,0.25)',
            background: 'rgba(195,232,141,0.05)',
            fontSize: 11, lineHeight: 1.65,
            color: 'var(--green)',
            marginBottom: 12,
          }}>
            ⚠ Always verify you are on<br />
            <strong>moneycrow.xyz</strong>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { name: 'Base',    color: 'var(--cyan)' },
              { name: 'Polygon', color: '#c792ea' },
            ].map(({ name, color }) => (
              <span key={name} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontWeight: 600,
                padding: '3px 8px', borderRadius: 2,
                background: `${color}18`,
                color, border: `1px solid ${color}40`,
                letterSpacing: '0.04em',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                {name} live
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        maxWidth: 900,
        margin: '0 auto',
      }}>
        <span style={{ fontSize: 10, color: 'var(--muted2)' }}>
          © {new Date().getFullYear()} MoneyCrow. All rights reserved.
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['OpenZeppelin', 'Verified', 'Non-custodial'].map(tag => (
            <span key={tag} style={{
              fontSize: 9, color: 'var(--muted2)', padding: '2px 7px',
              border: '1px solid var(--border2)', borderRadius: 2,
              letterSpacing: '0.05em',
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
