import { useTron } from '../context/TronContext';
import { useTheme } from '../context/ThemeContext';
import { isTronReady } from '../contracts/EscrowTron';
import { TronWalletButton } from './TronWalletButton';

/**
 * Compact, additive panel that surfaces TRON support to users on pages
 * that currently flow through the EVM (DepositForm, EscrowStatus).
 *
 * Renders nothing when TronLink is not installed — the EVM-only user
 * never sees it. Once installed, shows the wallet connect button plus
 * a one-line readiness statement:
 *
 *   - Not connected     → "Connect to enable TRON support."
 *   - Connected, ready  → "Ready on <network>." (deposit/accept enabled)
 *   - Connected, gated  → "TRON contract not deployed yet — coming soon."
 *
 * Variant prop controls the verbiage:
 *   - 'deposit' → "deposit" wording
 *   - 'accept'  → "acceptance" wording
 */
interface Props {
  variant?: 'deposit' | 'accept';
}

export function TronStatusBanner({ variant = 'deposit' }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const tron = useTron();

  // EVM-only users: render nothing.
  if (!tron.installed) return null;

  const ready = isTronReady(tron.chainId);
  const verb  = variant === 'deposit' ? 'deposits' : 'acceptances';

  let statusLine: string;
  if (!tron.connected) {
    statusLine = `Connect TronLink to enable TRON ${verb}.`;
  } else if (ready) {
    const networkLabel =
      tron.network === 'mainnet' ? 'TRON mainnet' :
      tron.network === 'shasta'  ? 'TRON Shasta'  :
      'an unknown TRON network';
    statusLine = `Ready on ${networkLabel}.`;
  } else {
    statusLine = `TRON ${verb} are coming soon — contract not yet deployed on this network.`;
  }

  const border  = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const text    = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(17,17,17,0.70)';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap',
        padding: '12px 16px',
        marginBottom: 16,
        background: 'rgba(255,6,10,0.04)',     // very subtle TRON-red wash
        border:     `1px solid ${border}`,
        borderLeft: '3px solid #FF060A',        // TRON brand red
      }}
    >
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 13,
        color: text,
        flex: 1,
        minWidth: 220,
      }}>
        <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FF060A', marginBottom: 4 }}>
          TRON support
        </div>
        {statusLine}
      </div>
      <TronWalletButton />
    </div>
  );
}
