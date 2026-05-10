import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
// NB: `tronweb` is a heavy lib (~230 KB gzipped). We deliberately do NOT
// import it statically — every API surface we need is on the injected
// `window.tronWeb` provided by TronLink. This keeps the EVM-only bundle
// untouched and the tronweb npm dep there only as a typing reference.

/**
 * TronContext — React provider for TronLink wallet integration.
 *
 * Built deliberately independent of wagmi/viem because:
 *   - TronLink doesn't expose EIP-1193 (window.ethereum). It injects
 *     window.tronWeb on its own schedule and dispatches state changes via
 *     postMessage with `{ isTronLink: true, message: { action, data } }`.
 *   - wagmi connectors expect EIP-1193 transports. Forcing a custom
 *     connector through wagmi just to bridge those two worlds adds layers
 *     of indirection without any benefit.
 *
 * Phase 0 confirmed:
 *   - tronWeb.trx._signTypedData(domain, typesWithoutDomain, message) is
 *     the API that produces a signature TVM ecrecover can verify.
 *   - block.chainid: Shasta = 2494104990, mainnet = 728126428.
 *   - address(this) abi.encode uses the 20-byte EVM-form (no 0x41 prefix).
 *
 * IMPORTANT: TRON base58 is case-sensitive. We never .toLowerCase() the
 * `address` field. The hex-form `addressEvm` IS lowercased — that's the
 * EVM convention and ecrecover returns it that way too.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export const TRON_MAINNET_CHAIN_ID = 728126428;
export const TRON_SHASTA_CHAIN_ID  = 2494104990;

export type TronNetwork = 'mainnet' | 'shasta' | 'unknown';

export interface TronContextValue {
  /** Whether TronLink is installed (window.tronWeb is present). */
  installed: boolean;
  /** Whether a wallet is currently connected (tronWeb.ready + address present). */
  connected: boolean;
  /** Base58 T-address. NEVER lowercased — base58 is case-sensitive. */
  address:    string | null;
  /** EVM-form 20-byte hex (`0x…`) for use in EIP-712 typed-data messages
   *  and contract calls that take Solidity `address`. */
  addressEvm: string | null;
  /** TRON chain id (728126428 or 2494104990). null if unknown. */
  chainId:    number | null;
  /** Friendly network name derived from chainId. */
  network:    TronNetwork;

  connect:     () => Promise<void>;
  disconnect:  () => void;

  /**
   * Sign EIP-712 typed data via `tronWeb.trx._signTypedData(...)`.
   * Strips EIP712Domain from `types` before passing — that's the variant
   * Phase 0 confirmed actually works on TronLink (the public
   * `signTypedData` rejects with "Signature verification invalid" on
   * several recent versions).
   */
  signTypedData: (
    domain:  Record<string, unknown>,
    types:   Record<string, unknown>,
    message: Record<string, unknown>,
  ) => Promise<string>;

  /** Raw TronWeb instance for components that need to make contract calls
   *  (`tronWeb.contract().at(...)`, etc.). Null until installed + ready. */
  tronWeb: typeof window.tronWeb | null;
}

// ── Window typing for window.tronWeb ─────────────────────────────────────────

declare global {
  interface Window {
    // TronWeb static class type — the injected instance has the same shape.
    // Loose typing keeps this file from turning into a TronWeb type novel;
    // we only access a small surface area at runtime.
    tronWeb?: {
      ready:    boolean;
      defaultAddress: { base58: string; hex: string };
      fullNode?: { host: string };
      address: {
        toHex:   (base58: string) => string;
        fromHex: (hex: string)   => string;
      };
      trx: {
        _signTypedData?: (domain: object, types: object, message: object) => Promise<string>;
        signTypedData?:  (...args: unknown[]) => Promise<string>;
      };
      contract: (...args: unknown[]) => { at: (address: string) => Promise<unknown> };
    };
    tronLink?: {
      request: (args: { method: string; params?: unknown }) => Promise<{ code: number; message?: string }>;
    };
  }
}

// ── Context plumbing ─────────────────────────────────────────────────────────

const TronContext = createContext<TronContextValue | null>(null);

const DEFAULT_VALUE: TronContextValue = {
  installed:  false,
  connected:  false,
  address:    null,
  addressEvm: null,
  chainId:    null,
  network:    'unknown',
  connect:    async () => {},
  disconnect: () => {},
  signTypedData: async () => { throw new Error('TronContext: TronLink not connected'); },
  tronWeb: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** TRON hex addresses are 21 bytes (`41` + 20-byte hash). EVM `address` is
 *  20 bytes. Strip the `41` prefix and prepend `0x` for use in EIP-712
 *  payloads and Solidity contract calls. */
function tronHexToEvm(tronHex: string): string | null {
  if (typeof tronHex !== 'string') return null;
  const stripped = tronHex.startsWith('0x') ? tronHex.slice(2) : tronHex;
  if (stripped.length !== 42 || !stripped.toLowerCase().startsWith('41')) return null;
  return ('0x' + stripped.slice(2)).toLowerCase();
}

/** Map a TronGrid host URL to chainId. TronLink doesn't expose chainId
 *  directly via its injected tronWeb, but the fullNode host tells us
 *  unambiguously which network we're on. */
function chainIdFromHost(host: string | undefined): number | null {
  if (!host) return null;
  if (host.includes('shasta'))   return TRON_SHASTA_CHAIN_ID;
  if (host.includes('trongrid')) return TRON_MAINNET_CHAIN_ID;
  // Custom RPC nodes — we can't pin chainId without an RPC call.
  // Caller can extend this if needed.
  return null;
}

function networkOfChainId(chainId: number | null): TronNetwork {
  if (chainId === TRON_MAINNET_CHAIN_ID) return 'mainnet';
  if (chainId === TRON_SHASTA_CHAIN_ID)  return 'shasta';
  return 'unknown';
}

// ── Provider ────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode;
}

export function TronProvider({ children }: ProviderProps) {
  const [installed, setInstalled] = useState(false);
  const [address,   setAddress]   = useState<string | null>(null);
  const [chainId,   setChainId]   = useState<number | null>(null);

  // Track whether we've issued the eager `tron_requestAccounts` for this
  // page lifecycle. Without this guard, the polling loop would re-fire
  // the request every tick that runs before defaultAddress.base58 lands —
  // each call past the first is a no-op for TronLink, but it pollutes the
  // console with "in queue (4000)" responses and triggers the warning the
  // browser surfaces about repeated requests.
  const requestedAccountsRef = useRef(false);

  // Read tronWeb state into React state. Idempotent — safe to call any
  // time. Returns the snapshot it just installed so callers can chain.
  const refreshFromTronWeb = useCallback(() => {
    const tw = window.tronWeb;
    if (!tw) {
      setInstalled(false);
      setAddress(null);
      setChainId(null);
      return;
    }
    setInstalled(true);

    if (tw.ready && tw.defaultAddress?.base58) {
      setAddress(tw.defaultAddress.base58); // base58, case preserved
    } else {
      setAddress(null);
    }
    setChainId(chainIdFromHost(tw.fullNode?.host));
  }, []);

  /**
   * Fire `tron_requestAccounts` once. TronLink only injects a complete
   * `defaultAddress.base58` after a dapp has called this — if we just
   * read window.tronWeb passively, we get `installed=true, address=null`
   * forever. (TronLink's own console warning explicitly tells dapp devs
   * to call it "at the earliest time possible.")
   *
   * Behaviour matrix:
   *   - User has previously approved this origin → returns 200 silently,
   *     no popup, defaultAddress populates within ms.
   *   - User has NOT approved yet                → TronLink shows its
   *     connection-approval popup. Approve → 200; Reject → 4001.
   *   - User locked the extension                → 4000 ("in queue").
   *
   * The `silent` flag suppresses thrown errors when called eagerly from
   * the polling loop — we only want connect()'s explicit user action to
   * surface a thrown rejection.
   */
  const requestAccounts = useCallback(async (silent: boolean): Promise<void> => {
    if (!window.tronLink?.request) return;
    try {
      const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
      // 200 = approved (now or previously). Anything else means we're
      // not authorised — leave React state in the disconnected branch.
      if (res?.code === 200) {
        refreshFromTronWeb();
      } else if (!silent) {
        throw new Error(res?.message ?? 'TronLink rejected the connection request');
      }
    } catch (err) {
      if (!silent) throw err;
      // Eager call: rejection is fine, just means the user said no.
      // Don't spam the console — TronLink already logged the rejection.
    }
  }, [refreshFromTronWeb]);

  // Detect TronLink injection AND drive the request-accounts handshake.
  //
  // Three things that happen on TronLink's own schedule:
  //
  //   1. The extension sets `window.tronWeb` and `window.tronLink`
  //      (typically <100 ms after DOMContentLoaded, but can be later
  //      under load).
  //   2. The dapp must call `tronLink.request({method: 'tron_requestAccounts'})`
  //      to authorize the origin. Without this call, TronLink leaves
  //      `defaultAddress.base58` empty forever — even if the wallet is
  //      unlocked and previously connected to other dapps. (TronLink's
  //      own console warning tells devs to call this "at the earliest
  //      time possible".)
  //   3. After approval, TronLink completes a `ready` / `setNode`
  //      handshake that populates `defaultAddress.base58`. This is the
  //      moment our UI flips to connected.
  //
  // The earlier version of this loop only did (3) — passively reading
  // tronWeb — and stopped polling the moment `window.tronWeb` appeared.
  // That captured `installed=true, address=null` once and stuck there
  // forever, because (2) never happened on its own.
  //
  // Fix: as soon as `window.tronLink` is available, fire the eager
  // request once (silent — rejection is treated as "user said no", not
  // an error). Then keep polling until we see an address, or the
  // attempt cap fires. Cheap — one property read every 250 ms for at
  // most ~15 s on cold start.
  useEffect(() => {
    let cancelled = false;
    let attempts  = 0;
    const MAX_ATTEMPTS = 60; // ~15 s of polling on first load

    const tick = () => {
      if (cancelled) return;
      refreshFromTronWeb();

      // Fire the eager request once tronLink is available. This is what
      // actually makes TronLink populate defaultAddress.base58. Guarded
      // by ref so we don't spam the request on every tick.
      if (window.tronLink?.request && !requestedAccountsRef.current) {
        requestedAccountsRef.current = true;
        // Run in the background — don't await inside the tick. The
        // refreshFromTronWeb call inside requestAccounts (on success)
        // will pick up the new address; subsequent ticks here will too.
        void requestAccounts(true);
      }

      const haveAddress = !!window.tronWeb?.defaultAddress?.base58;
      if (!haveAddress && attempts < MAX_ATTEMPTS) {
        attempts++;
        setTimeout(tick, 250);
      }
    };
    tick();

    // Re-check whenever the tab regains focus / visibility. Covers the
    // common flow: user opens TronLink, approves the connection in the
    // popup, switches back to our tab — the postMessage may have already
    // fired before we mounted (or been swallowed by the extension's
    // background page), but the moment they look at our tab again we
    // re-pull from window.tronWeb and the UI flips to connected.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshFromTronWeb();
    };
    const onFocus = () => refreshFromTronWeb();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshFromTronWeb, requestAccounts]);

  // Subscribe to TronLink's postMessage stream — account/network changes.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { isTronLink?: boolean; message?: { action?: string } } | null;
      if (!data || !data.isTronLink || !data.message) return;
      const action = data.message.action;
      // accountsChanged, setNode, connect, disconnect — every relevant
      // state mutation comes through here. We don't care which one;
      // re-reading from window.tronWeb is the source of truth.
      if (
        action === 'accountsChanged' ||
        action === 'setNode'         ||
        action === 'connect'         ||
        action === 'disconnect'      ||
        action === 'tabReply'
      ) {
        refreshFromTronWeb();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshFromTronWeb]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!window.tronLink && !window.tronWeb) {
      // No way to request access — extension not installed.
      throw new Error('TronLink is not installed. Visit https://www.tronlink.org/ to install it.');
    }
    // Mark the eager-request guard so the polling loop doesn't
    // duplicate the call we're about to make. Use silent=false so a
    // user-rejection here surfaces as a thrown error the button can
    // display, unlike the eager mount-time request which swallows it.
    requestedAccountsRef.current = true;
    await requestAccounts(false);
    // requestAccounts already refreshes on success, but call again so
    // the manual flow stays symmetric with the older code paths.
    refreshFromTronWeb();
  }, [refreshFromTronWeb, requestAccounts]);

  const disconnect = useCallback(() => {
    // TronLink doesn't expose a programmatic disconnect — we just clear
    // our own state. The extension still considers itself connected, but
    // our UI treats the user as disconnected until they reconnect.
    setAddress(null);
  }, []);

  const signTypedData = useCallback(async (
    domain:  Record<string, unknown>,
    types:   Record<string, unknown>,
    message: Record<string, unknown>,
  ) => {
    const tw = window.tronWeb;
    if (!tw || !tw.ready) {
      throw new Error('TronLink is not connected.');
    }
    if (typeof tw.trx._signTypedData !== 'function') {
      throw new Error('TronLink does not expose _signTypedData on this version. Please update TronLink.');
    }
    // Strip EIP712Domain from `types` before passing — Phase 0 confirmed
    // this is the variant TronLink accepts. Including EIP712Domain causes
    // TronLink's pre-flight to reject with "Signature verification invalid".
    const typesWithoutDomain = { ...types };
    delete (typesWithoutDomain as Record<string, unknown>).EIP712Domain;

    return await tw.trx._signTypedData(domain, typesWithoutDomain, message);
  }, []);

  // ── Memoized value ─────────────────────────────────────────────────────────

  const value = useMemo<TronContextValue>(() => {
    // Use the injected window.tronWeb's static-style address helper rather
    // than importing the static TronWeb class — keeps the npm dep out of
    // the bundled JS for users who never touch TronLink.
    const addressEvm = (address && window.tronWeb?.address?.toHex)
      ? tronHexToEvm(window.tronWeb.address.toHex(address))
      : null;
    return {
      installed,
      connected:  installed && !!address,
      address,
      addressEvm,
      chainId,
      network:    networkOfChainId(chainId),
      connect,
      disconnect,
      signTypedData,
      tronWeb:    installed ? window.tronWeb ?? null : null,
    };
  }, [installed, address, chainId, connect, disconnect, signTypedData]);

  return <TronContext.Provider value={value}>{children}</TronContext.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTron(): TronContextValue {
  const ctx = useContext(TronContext);
  // If used outside the provider, return the inert default rather than
  // throwing — keeps consumers safe in Storybook / test contexts.
  return ctx ?? DEFAULT_VALUE;
}
