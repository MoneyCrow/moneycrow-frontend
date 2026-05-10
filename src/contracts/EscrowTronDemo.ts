/**
 * TRON MoneyCrowDemo contract addresses + readiness gate.
 *
 * Mirrors `EscrowTron.ts`'s shape, kept in its own file so the production
 * Escrow and the Demo can light up independently — the Demo on Shasta
 * doesn't need a production Escrow on Shasta to be functional, and vice
 * versa. Once both are deployed on the same network, the two flags
 * (isTronReady + isTronDemoReady) flip independently.
 *
 * Phase 4 (this commit): mainnet empty (not deployed yet), Shasta empty
 * until `tronbox migrate --network shasta --f 4 --to 4` succeeds and the
 * resulting `T...` address is pasted into the Shasta entry below.
 */

import { TRON_MAINNET_CHAIN_ID, TRON_SHASTA_CHAIN_ID } from '../context/TronContext';

/** Demo contract address (base58 `T…`) per TRON chainId.
 *  Empty string means "not deployed on this network yet". */
export const TRON_DEMO_ADDRESS: Record<number, string> = {
  [TRON_MAINNET_CHAIN_ID]: '',                              // mainnet — not yet deployed
  [TRON_SHASTA_CHAIN_ID]:  '',                              // Shasta — fill after Phase 4 deploy
};

/** Returns the demo contract address for `chainId`, or undefined when the
 *  chain isn't a TRON chain or doesn't have a deployed demo contract. */
export function getTronDemoAddress(chainId: number | null): string | undefined {
  if (chainId === null) return undefined;
  const addr = TRON_DEMO_ADDRESS[chainId];
  return addr && addr.length > 0 ? addr : undefined;
}

/** Returns true if the TRON demo flow is usable on the given chain.
 *  Used by DemoAccept.tsx to gate the "Accept with TronLink" button. */
export function isTronDemoReady(chainId: number | null): boolean {
  return getTronDemoAddress(chainId) !== undefined;
}

/**
 * Minimal ABI for MoneyCrowDemo on TRON. Same shape as the EVM contract.
 * Used by tronWeb.contract(TRON_DEMO_ABI, address) to call acceptDemo.
 *
 * Only the methods the frontend actually invokes are listed — keeps the
 * bundle compact and the surface area easy to audit.
 */
export const TRON_DEMO_ABI = [
  // ── Views ──────────────────────────────────────────────────────────────────
  {
    constant: true,
    name: 'admin',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    name: 'getDemoEscrow',
    inputs: [{ name: 'depositor', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'depositor',  type: 'address' },
          { name: 'recipient',  type: 'address' },
          { name: 'token',      type: 'address' },
          { name: 'amount',     type: 'uint256' },
          { name: 'termsHash',  type: 'bytes32' },
          { name: 'status',     type: 'uint8'   },
          { name: 'createdAt',  type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // ── Recipient action ──────────────────────────────────────────────────────
  {
    name: 'acceptDemo',
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'signature', type: 'bytes'   },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
