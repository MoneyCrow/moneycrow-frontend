import { useState } from 'react';
import { useTron } from '../context/TronContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Standalone TronLink connect button. Three states:
 *
 *   1. TronLink not installed → "Install TronLink" linking to tronlink.org.
 *   2. Installed but not connected → "Connect TronLink" triggers the
 *      tron_requestAccounts flow.
 *   3. Connected → shortened T-address with a click-to-disconnect tooltip.
 *
 * Colours match the gold/dark theme used by RainbowKit's ConnectButton so
 * the two sit cleanly next to each other.
 */
export function TronWalletButton() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { installed, connected, address, network, connect, disconnect } = useTron();

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const border       = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
  const textPrimary  = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.55)';

  // ── State 1: not installed ──────────────────────────────────────────────────
  if (!installed) {
    return (
      <a
        href="https://www.tronlink.org/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: 'transparent',
          border: `1px solid ${border}`,
          color: textSecondary,
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
          textDecoration: 'none',
        }}
      >
        <TronLogo />
        Install TronLink ↗
      </a>
    );
  }

  // ── State 2: installed but not connected ────────────────────────────────────
  if (!connected) {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <button
          onClick={async () => {
            setBusy(true);
            setError(null);
            try { await connect(); }
            catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
          disabled={busy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: '#F2B705',
            border: 'none',
            color: '#111111',
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <TronLogo />
          {busy ? 'Connecting…' : 'Connect TronLink'}
        </button>
        {error && (
          <div style={{ fontSize: 11, color: '#F87171', maxWidth: 240 }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── State 3: connected ──────────────────────────────────────────────────────
  // Short form: first 6 chars + last 4 — same convention as RainbowKit.
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
  const networkLabel =
    network === 'mainnet' ? 'TRON' :
    network === 'shasta'  ? 'TRON Shasta' :
    'TRON ?';

  return (
    <button
      onClick={() => disconnect()}
      title={`${address}\n(click to disconnect)`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: isDark ? 'rgba(242,183,5,0.08)' : 'rgba(242,183,5,0.10)',
        border: '1px solid rgba(242,183,5,0.40)',
        color: textPrimary,
        cursor: 'pointer',
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
      }}
    >
      <TronLogo />
      <span style={{ color: '#F2B705', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {networkLabel}
      </span>
      <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{short}</code>
    </button>
  );
}

/** Tiny inline TRON glyph — keeps the component asset-free. */
function TronLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        fill="#FF060A"
        d="M11 14l16 36 26-30zM27 50l4-16-9-12 5 28zM37 41l8-7-15 1 7 6zM23 22l4 12 14-1z"
      />
    </svg>
  );
}
