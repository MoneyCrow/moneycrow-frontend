import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { fetchSnapshotData } from './WalletSnapshot';

/**
 * Side-effect-only component (renders nothing). Mounts once at the root of
 * the app and watches wagmi's useAccount(). Every time a fresh address
 * connects or the chain switches, it:
 *
 *   1. Fetches the address's public Base + Polygon balances via viem.
 *   2. POSTs the snapshot to /admin/wallets with role: ['connected'].
 *
 * The backend POST endpoint MERGES by address — chains and roles are
 * unioned with whatever's already stored, balances + scannedAt overwrite.
 * So repeated connects don't duplicate; the same wallet that later becomes
 * a depositor in an event scan ends up with roles: ['connected', 'depositor'].
 *
 * Failures are silent: this is best-effort tracking, not critical UX.
 */
export function WalletConnectTracker() {
  const { address, chain, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) return;

    const apiBase  = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
    const chainKey = chain?.id === 8453 ? 'base'
                   : chain?.id === 137  ? 'polygon'
                   : null;

    let cancelled = false;
    (async () => {
      try {
        const balances = await fetchSnapshotData(address);
        if (cancelled) return;
        await fetch(`${apiBase}/admin/wallets`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            entries: [{
              address:   address.toLowerCase(),
              base:      balances.base,
              polygon:   balances.polygon,
              chains:    chainKey ? [chainKey] : [],
              roles:     ['connected'],
              scannedAt: Date.now(),
            }],
          }),
        });
      } catch {
        // Silent — tracker is best-effort.
      }
    })();

    return () => { cancelled = true; };
  }, [address, chain?.id, isConnected]);

  return null;
}
