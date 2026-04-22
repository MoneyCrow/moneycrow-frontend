/**
 * MoneyCrowDemo contract — frontend bindings.
 *
 * TODO: fill DEMO_ADDRESS entries after deploying MoneyCrowDemo.sol to each chain.
 *       Run:  npx hardhat ignition deploy ignition/modules/Demo.ts --network base
 *             npx hardhat ignition deploy ignition/modules/Demo.ts --network polygon
 *       Then paste the deployed addresses below.
 */

// ── Addresses ─────────────────────────────────────────────────────────────────

export const DEMO_ADDRESS: Record<number, `0x${string}`> = {
  8453: '0x0000000000000000000000000000000000000000', // TODO: Base mainnet
  137:  '0x0000000000000000000000000000000000000000', // TODO: Polygon mainnet
};

/**
 * Returns the demo contract address for the given chain, or undefined if the
 * contract has not yet been deployed there (zero address is treated as unset).
 */
export function getDemoAddress(chainId: number | undefined): `0x${string}` | undefined {
  if (chainId === undefined) return undefined;
  const addr = DEMO_ADDRESS[chainId];
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return undefined;
  return addr;
}

// ── Status ────────────────────────────────────────────────────────────────────

/** Mirrors DemoStatus enum in MoneyCrowDemo.sol */
export const DEMO_STATUS_LABEL   = ['Pending', 'Accepted', 'Approved'] as const;
export const DEMO_STATUS_VARIANT = ['pending', 'active',   'released'] as const;

// ── ABI ───────────────────────────────────────────────────────────────────────

export const DEMO_ABI = [
  // ── Views ──────────────────────────────────────────────────────────────────
  {
    inputs: [],
    name: 'admin',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'domainSeparator',
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'getDemoEscrow',
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'depositor',         type: 'address' },
        { name: 'recipient',         type: 'address' },
        { name: 'token',             type: 'address' },
        { name: 'amount',            type: 'uint256' },
        { name: 'description',       type: 'string'  },
        { name: 'recipientEmail',    type: 'string'  },
        { name: 'recipientTelegram', type: 'string'  },
        { name: 'depositorEmail',    type: 'string'  },
        { name: 'depositorTelegram', type: 'string'  },
        { name: 'status',            type: 'uint8'   },
        { name: 'createdAt',         type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
    type: 'function',
  },

  // ── Admin write ────────────────────────────────────────────────────────────
  {
    inputs: [
      { name: 'recipient',         type: 'address' },
      { name: 'token',             type: 'address' },
      { name: 'amount',            type: 'uint256' },
      { name: 'description',       type: 'string'  },
      { name: 'recipientEmail',    type: 'string'  },
      { name: 'recipientTelegram', type: 'string'  },
      { name: 'depositorEmail',    type: 'string'  },
      { name: 'depositorTelegram', type: 'string'  },
    ],
    name: 'createDemo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'approveDemo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newAdmin', type: 'address' }],
    name: 'changeAdmin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ── Recipient write ────────────────────────────────────────────────────────
  {
    inputs: [
      { name: 'depositor',  type: 'address' },
      { name: 'signature',  type: 'bytes'   },
    ],
    name: 'acceptDemo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  {
    name: 'DemoCreated',
    type: 'event',
    inputs: [
      { name: 'depositor',         type: 'address', indexed: true  },
      { name: 'recipient',         type: 'address', indexed: true  },
      { name: 'token',             type: 'address', indexed: false },
      { name: 'amount',            type: 'uint256', indexed: false },
      { name: 'description',       type: 'string',  indexed: false },
      { name: 'recipientEmail',    type: 'string',  indexed: false },
      { name: 'recipientTelegram', type: 'string',  indexed: false },
      { name: 'depositorEmail',    type: 'string',  indexed: false },
      { name: 'depositorTelegram', type: 'string',  indexed: false },
    ],
  },
  {
    name: 'DemoAccepted',
    type: 'event',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
    ],
  },
  {
    name: 'DemoApproved',
    type: 'event',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
    ],
  },
] as const;
