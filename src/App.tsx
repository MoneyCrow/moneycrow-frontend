import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import DepositForm    from './pages/DepositForm';
import EscrowStatus   from './pages/EscrowStatus';
import AdminDashboard from './pages/AdminDashboard';
import ClaimPage      from './pages/ClaimPage';
import HowItWorks     from './pages/HowItWorks';
import Faq            from './pages/Faq';
import Footer         from './components/Footer';
import { SUPPORTED_CHAIN_IDS } from './contracts/Escrow';

export type Page = 'deposit' | 'status' | 'admin' | 'claim' | 'how-it-works' | 'faq';

const NETWORK_META: Record<number, { name: string; color: string; dot: string }> = {
  8453: { name: 'Base',    color: '#7ee8fa', dot: '#7ee8fa' },
  137:  { name: 'Polygon', color: '#c792ea', dot: '#c792ea' },
};

function NetworkBadge() {
  const { chain, isConnected } = useAccount();
  if (!isConnected || !chain) return null;

  const meta = NETWORK_META[chain.id];
  if (!meta) {
    return (
      <span style={{
        fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
        padding: '3px 10px', borderRadius: 2, letterSpacing: '0.05em',
        background: 'rgba(240,113,120,0.12)', color: 'var(--red)',
        border: '1px solid rgba(240,113,120,0.35)',
      }}>
        ⚠ unsupported network
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
      padding: '3px 10px', borderRadius: 2, letterSpacing: '0.05em',
      background: `${meta.color}18`,
      color: meta.color,
      border: `1px solid ${meta.color}50`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
      {meta.name}
    </span>
  );
}

function UnsupportedNetworkBanner() {
  const { chain, isConnected } = useAccount();
  const isUnsupported = isConnected && chain && !(SUPPORTED_CHAIN_IDS as readonly number[]).includes(chain.id);
  if (!isUnsupported) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 24px',
      background: 'rgba(240,113,120,0.07)',
      borderBottom: '1px solid rgba(240,113,120,0.25)',
      fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
      color: 'var(--red)',
    }}>
      <span style={{ fontSize: 14 }}>⚠</span>
      <span>
        Connected to <strong>{chain!.name}</strong> — please switch to{' '}
        <strong>Base</strong> or <strong>Polygon</strong> mainnet to use this app.
      </span>
    </div>
  );
}

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'deposit',      label: 'deposit' },
  { page: 'status',       label: 'status' },
  { page: 'claim',        label: 'claim' },
  { page: 'how-it-works', label: 'how it works' },
  { page: 'faq',          label: 'faq' },
  { page: 'admin',        label: 'admin' },
];

/** Read a single URL search param safely (works on first render). */
function urlParam(key: string): string {
  try { return new URLSearchParams(window.location.search).get(key) ?? ''; }
  catch { return ''; }
}

const VALID_TABS: Page[] = ['deposit', 'status', 'admin', 'claim', 'how-it-works', 'faq'];

export default function App() {
  console.log('App mounting');

  // Initialise from URL so email deep-links land on the right tab.
  // e.g. https://moneycrow.xyz/?tab=status&depositor=0xABC…
  //      https://moneycrow.xyz/?tab=claim&depositor=0xABC…
  //      https://moneycrow.xyz/?tab=admin
  const [page, setPage] = useState<Page>(() => {
    const tab = urlParam('tab') as Page;
    return VALID_TABS.includes(tab) ? tab : 'deposit';
  });

  // Pre-fill the claim page depositor when arriving via a deep-link.
  const [claimDepositor, setClaimDepositor] = useState(() => urlParam('depositor'));

  const goToClaim = (depositor: string) => {
    setClaimDepositor(depositor);
    setPage('claim');
  };

  return (
    <div className="app">
      <header>
        <div className="logo">
          <div className="logo-icon">M</div>
          <div className="logo-text">Money<span>Crow</span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NetworkBadge />
          <ConnectButton />
        </div>
      </header>

      <UnsupportedNetworkBanner />

      <nav>
        {NAV_ITEMS.map(({ page: p, label }) => (
          <button
            key={p}
            className={page === p ? 'active' : ''}
            onClick={() => setPage(p)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        {page === 'deposit'      && <DepositForm />}
        {page === 'status'       && <EscrowStatus onGoToClaim={goToClaim} />}
        {page === 'claim'        && <ClaimPage initialDepositor={claimDepositor} />}
        {page === 'how-it-works' && <HowItWorks />}
        {page === 'faq'          && <Faq />}
        {page === 'admin'        && <AdminDashboard />}
      </main>

      <Footer onNavigate={setPage} />
    </div>
  );
}
