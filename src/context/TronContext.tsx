import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

  // Detect TronLink injection. The extension sets window.tronWeb on its
  // own schedule, often after our initial render — poll briefly.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const tick = () => {
      if (cancelled) return;
      refreshFromTronWeb();
      if (!window.tronWeb && attempts < 40) {
        attempts++;
        setTimeout(tick, 250); // ~10s of polling on first load
      }
    };
    tick();

    return () => { cancelled = true; };
  }, [refreshFromTronWeb]);

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
    if (window.tronLink?.request) {
      // Modern flow: explicitly request account access. TronLink shows its
      // approval popup if not already granted.
      const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
      if (res?.code !== 200) {
        throw new Error(res?.message ?? 'TronLink rejected the connection request');
      }
    }
    // Either way, refresh state from window.tronWeb.
    refreshFromTronWeb();
  }, [refreshFromTronWeb]);

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
