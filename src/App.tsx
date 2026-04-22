import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { ThemeProvider } from './context/ThemeContext';
import { AppShell } from './components/sharp/AppShell';
import Landing        from './pages/Landing';
import DepositForm    from './pages/DepositForm';
import EscrowStatus   from './pages/EscrowStatus';
import AdminDashboard from './pages/AdminDashboard';
import ClaimPage      from './pages/ClaimPage';
import DemoAccept     from './pages/DemoAccept';
import HowItWorks     from './pages/HowItWorks';
import Faq            from './pages/Faq';
import { ESCROW_ABI, getEscrowAddress } from './contracts/Escrow';

export type Page = 'landing' | 'create' | 'status' | 'claim' | 'demo-accept' | 'admin' | 'how-it-works' | 'faq';

const VALID_TABS: Page[] = ['landing', 'create', 'status', 'claim', 'demo-accept', 'admin', 'how-it-works', 'faq'];

function urlParam(key: string): string {
  try { return new URLSearchParams(window.location.search).get(key) ?? ''; } catch { return ''; }
}

function mapLegacyTab(tab: string): Page {
  if (tab === 'deposit') return 'create';
  if (VALID_TABS.includes(tab as Page)) return tab as Page;
  return 'landing';
}

function AppInner() {
  const [page, setPage] = useState<Page>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mc_v3_state') || '{}');
      const urlTab = urlParam('tab');
      if (urlTab) return mapLegacyTab(urlTab);
      if (saved.page && VALID_TABS.includes(saved.page)) return saved.page;
    } catch {}
    return 'landing';
  });

  const [claimDepositor]      = useState(() => urlParam('depositor'));
  const [demoAcceptDepositor] = useState(() => urlParam('tab') === 'demo-accept' ? urlParam('depositor') : '');

  const { address, chain } = useAccount();
  const escrowAddr = getEscrowAddress(chain?.id);
  const { data: adminAddress } = useReadContract({
    address: escrowAddr, abi: ESCROW_ABI, functionName: 'admin',
    query: { enabled: !!escrowAddr },
  });
  const isAdmin = !!(address && adminAddress && address.toLowerCase() === (adminAddress as string).toLowerCase());

  function navigate(p: Page) {
    setPage(p);
    try {
      const saved = JSON.parse(localStorage.getItem('mc_v3_state') || '{}');
      localStorage.setItem('mc_v3_state', JSON.stringify({ ...saved, page: p }));
    } catch {}
  }

  function goToClaim(depositor: string) {
    navigate('claim');
    void depositor;
  }

  return (
    <AppShell page={page} onNav={navigate} isAdmin={isAdmin}>
      {page === 'landing'      && <Landing onNav={navigate} />}
      {page === 'create'       && <DepositForm />}
      {page === 'status'       && <EscrowStatus onGoToClaim={goToClaim} />}
      {page === 'claim'        && <ClaimPage initialDepositor={claimDepositor} />}
      {page === 'demo-accept'  && <DemoAccept initialDepositor={demoAcceptDepositor} />}
      {page === 'how-it-works' && <HowItWorks />}
      {page === 'faq'          && <Faq />}
      {page === 'admin'        && <AdminDashboard />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
