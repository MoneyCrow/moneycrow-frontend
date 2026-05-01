/**
 * TRON Escrow contract addresses + readiness gate.
 *
 * Mirrors the role of `Escrow.ts` for the EVM side, but kept in its own
 * file so nothing accidentally cross-pollinates: TRON addresses are
 * base58 (case-sensitive) — the EVM `Record<number, \`0x${string}\`>` typing
 * doesn't fit, and lowercasing them anywhere would corrupt the value.
 *
 * Shasta now points at the full production Escrow.sol (Phase 3 dry-run).
 * Mainnet stays empty until the deployer wallet is funded and the mainnet
 * deploy runs — `isTronReady(chainId)` flips to true automatically once
 * the slot below is non-empty, so no other code needs to change.
 */

import { TRON_MAINNET_CHAIN_ID, TRON_SHASTA_CHAIN_ID } from '../context/TronContext';

/** Escrow contract address (base58 `T…`) per TRON chainId.
 *  Empty string means "not deployed on this network yet". */
export const TRON_ESCROW_ADDRESS: Record<number, string> = {
  [TRON_MAINNET_CHAIN_ID]: '',                                       // mainnet — pending funded deployer
  [TRON_SHASTA_CHAIN_ID]:  'TDRPm9BHh44r26rBTeGapEAZbjCvpokGif',     // Phase 3 dry-run — full Escrow.sol
};

/** Demo escrow contract address — also empty until deployed. */
export const TRON_DEMO_ADDRESS: Record<number, string> = {
  [TRON_MAINNET_CHAIN_ID]: '',
  [TRON_SHASTA_CHAIN_ID]:  '',
};

/** Returns the escrow contract address for `chainId`, or undefined when
 *  the chain isn't a TRON chain or doesn't have a deployed contract. */
export function getTronEscrowAddress(chainId: number | null): string | undefined {
  if (chainId === null) return undefined;
  const addr = TRON_ESCROW_ADDRESS[chainId];
  return addr && addr.length > 0 ? addr : undefined;
}

/** Returns the demo contract address for `chainId`, or undefined. */
export function getTronDemoAddress(chainId: number | null): string | undefined {
  if (chainId === null) return undefined;
  const addr = TRON_DEMO_ADDRESS[chainId];
  return addr && addr.length > 0 ? addr : undefined;
}

/**
 * Master gate for "is the TRON deposit/accept flow usable on this chain?".
 *
 * Components branch on this to either render the live UI or a "TRON support
 * coming soon — contract not yet deployed" placeholder. The wallet-connect
 * UI works regardless (we can demonstrate signing without a real escrow),
 * but actual on-chain calls need this flag to be true.
 *
 * Phase 3 status:
 *   - Shasta: ✅ true  (full Escrow.sol deployed — depositETH, acceptEscrow,
 *     claim, refund, etc. all work end-to-end on testnet TRX)
 *   - Mainnet: ❌ false (deployer wallet pending funding)
 */
export function isTronReady(chainId: number | null): boolean {
  return getTronEscrowAddress(chainId) !== undefined;
}

/**
 * Minimal ABI for the expected production Escrow.sol on TRON. Same shape
 * as the EVM version (because we plan to deploy the same source). When
 * the contract IS deployed, components can do:
 *
 *   const c = await tronWeb.contract(TRON_ESCROW_ABI, address).at(address);
 *   await c.depositETH(recipient, termsHash, 0).send({ callValue: amount });
 *
 * Kept in this file rather than imported from the JSON artefact so the
 * frontend bundle stays small. Only the methods used here are listed.
 */
export const TRON_ESCROW_ABI = [
  // ── Views ──
  {
    constant: true,
    name: 'admin',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // ── Depositor actions ──
  {
    name: 'depositETH',
    inputs: [
      { name: 'recipient',      type: 'address' },
      { name: 'termsHash',      type: 'bytes32' },
      { name: 'acceptDeadline', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    name: 'depositERC20',
    inputs: [
      { name: 'token',          type: 'address' },
      { name: 'amount',         type: 'uint256' },
      { name: 'recipient',      type: 'address' },
      { name: 'termsHash',      type: 'bytes32' },
      { name: 'acceptDeadline', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // ── Recipient actions ──
  {
    name: 'acceptEscrow',
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'signature', type: 'bytes'   },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    name: 'claim',
    inputs: [{ name: 'depositor', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
