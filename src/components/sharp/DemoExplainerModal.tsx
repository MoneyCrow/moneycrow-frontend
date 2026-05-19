import { useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { SharpButton } from './SharpButton';

/**
 * One-time explainer shown the first time a recipient clicks Accept on
 * a demo. Without context, a recipient who's never seen MoneyCrow gets
 * a raw MetaMask popup with no explanation of what they're signing —
 * predictably scary and a sharp drop-off point. This modal does the
 * preflight so the wallet popup feels like a continuation of the demo,
 * not a surprise from a third party.
 *
 * Gating: the consumer is expected to check `localStorage.seenDemoExplainer`
 * before opening this modal. Clicking "Continue to wallet" sets the
 * flag so subsequent Accept clicks fire the wallet popup directly.
 *
 * Layout mirrors MobileNav's backdrop + dialog pattern (the only
 * existing modal-shaped component in the codebase). zIndex 1000 sits
 * above the recipient banner (200) and any future overlays we might
 * add — well clear of normal-page UI but below browser-native chrome.
 */

interface Props {
  open:        boolean;
  onCancel:    () => void;
  /** Fires after the user clicks "Continue to wallet". The caller is
   *  responsible for triggering the wallet popup; this modal only
   *  manages the explainer + the localStorage flag. */
  onContinue:  () => void;
}

const EXPLAINER_STORAGE_KEY = 'seenDemoExplainer';

/** Stamp the localStorage flag so future Accept clicks skip the modal.
 *  Exported as a side-effect helper so callers can also pre-set the
 *  flag (e.g. if the explainer was shown via a different surface). */
export function markDemoExplainerSeen(): void {
  try { localStorage.setItem(EXPLAINER_STORAGE_KEY, '1'); }
  catch { /* quota or disabled — best-effort */ }
}

/** Check whether the explainer has been seen this browser. Returns
 *  true if seen (skip the modal); false if not (open it first). */
export function hasSeenDemoExplainer(): boolean {
  try { return localStorage.getItem(EXPLAINER_STORAGE_KEY) === '1'; }
  catch { return false; }
}

export function DemoExplainerModal({ open, onCancel, onContinue }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const bg       = isDark ? '#111111' : '#FFFFFF';
  const border   = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
  const textPrimary   = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(17,17,17,0.65)';

  // ESC closes — basic keyboard a11y. Click on backdrop also closes;
  // both routes converge on onCancel so the consumer's open-state
  // resets identically.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const handleContinue = () => {
    markDemoExplainerSeen();
    onContinue();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — click to cancel. */}
      <div
        onClick={onCancel}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)',
        }}
      />

      {/* Dialog. Fixed-position centered card so the modal stays
          anchored regardless of scroll position on long pages. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-explainer-title"
        style={{
          position: 'fixed', zIndex: 1001,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(90vw, 520px)',
          background: bg,
          border: `1px solid ${border}`,
          fontFamily: "'Space Grotesk', sans-serif",
          color: textPrimary,
          boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F2B705', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            About to accept
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>
          <h2
            id="demo-explainer-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 700, marginBottom: 14 }}
          >
            About to accept a MoneyCrow demo
          </h2>

          <p style={{ fontSize: 14, lineHeight: 1.6, color: textSecondary, marginBottom: 12 }}>
            MoneyCrow is a non-custodial escrow service. This is a sandbox demo —
            no real funds will move regardless of what the wallet popup says.
          </p>

          <p style={{ fontSize: 14, lineHeight: 1.6, color: textSecondary, marginBottom: 12 }}>
            Your wallet will ask you to sign a transaction. This is normal — it's
            how the production flow works, and the demo simulates it end-to-end
            so you can see what real usage feels like.
          </p>

          <p style={{
            fontSize: 12, lineHeight: 1.6, color: textSecondary,
            marginBottom: 0, padding: '10px 12px',
            background: 'rgba(242,183,5,0.06)',
            borderLeft: '3px solid #F2B705',
          }}>
            <strong style={{ color: textPrimary }}>Gas cost:</strong>{' '}
            ~$0.001 (one-time signature fee on Base).
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <SharpButton
            onClick={onCancel}
            style={{ background: 'transparent', border: `1px solid ${border}`, color: textPrimary }}
          >
            Cancel
          </SharpButton>
          <SharpButton
            onClick={handleContinue}
            style={{ background: '#F2B705', color: '#000', border: 'none' }}
          >
            Continue to wallet
          </SharpButton>
        </div>
      </div>
    </>
  );
}
