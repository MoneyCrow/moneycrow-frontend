// New contract address — same on Base and Polygon (EIP-712 v2, 2026-04-17)
export const ESCROW_ADDRESS: Record<number, `0x${string}`> = {
  8453: '0xad29BABD124fF59a3C72E768e37dcC04CF1185eb', // Base mainnet
  137:  '0xad29BABD124fF59a3C72E768e37dcC04CF1185eb', // Polygon mainnet
};

export const SUPPORTED_CHAIN_IDS = [8453, 137] as const;

/** Returns the contract address for the given chain, or undefined if unsupported. */
export function getEscrowAddress(chainId: number | undefined): `0x${string}` | undefined {
  return chainId !== undefined ? ESCROW_ADDRESS[chainId] : undefined;
}

/**
 * Status enum (matches contract):
 *   0 = Pending          — deposited, waiting for recipient to accept
 *   1 = Active           — recipient accepted, waiting for admin approval
 *   2 = Released         — recipient claimed funds
 *   3 = Refunded         — funds returned to depositor
 */
export const STATUS_LABEL   = ['Pending', 'Active', 'Released', 'Refunded'] as const;
export const STATUS_VARIANT = ['pending', 'active', 'released', 'refunded'] as const;

export const ESCROW_ABI = [
  // ── Views ──────────────────────────────────────────────────────────────────
  { inputs: [], name: 'admin',                          outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'feeBps',                         outputs: [{ type: 'uint16' }],  stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'TIMEOUT',                        outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'MAX_FEE_BPS',                    outputs: [{ type: 'uint16' }],  stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'defaultTerms',                   outputs: [{ type: 'string' }],  stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'defaultAcceptDeadlineDuration',  outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'domainSeparator',                outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'releaseApproved',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'getEscrow',
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'depositor',                 type: 'address' },
        { name: 'recipient',                 type: 'address' },
        { name: 'token',                     type: 'address' },
        { name: 'amount',                    type: 'uint256' },
        { name: 'createdAt',                 type: 'uint256' },
        { name: 'status',                    type: 'uint8'   },
        { name: 'feeBps',                    type: 'uint16'  },
        { name: 'description',               type: 'string'  },
        { name: 'recipientEmail',            type: 'string'  },
        { name: 'recipientTelegram',         type: 'string'  },
        { name: 'depositorEmail',            type: 'string'  },
        { name: 'depositorTelegram',         type: 'string'  },
        { name: 'terms',                     type: 'string'  },
        { name: 'acceptDeadline',            type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'timeRemaining',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },

  // ── Depositor actions ──────────────────────────────────────────────────────
  {
    inputs: [
      { name: 'recipient',         type: 'address' },
      { name: 'description',       type: 'string'  },
      { name: 'recipientEmail',    type: 'string'  },
      { name: 'recipientTelegram', type: 'string'  },
      { name: 'depositorEmail',    type: 'string'  },
      { name: 'depositorTelegram', type: 'string'  },
      { name: 'terms',             type: 'string'  },
      { name: 'acceptDeadline',    type: 'uint256' },
    ],
    name: 'depositETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token',             type: 'address' },
      { name: 'amount',            type: 'uint256' },
      { name: 'recipient',         type: 'address' },
      { name: 'description',       type: 'string'  },
      { name: 'recipientEmail',    type: 'string'  },
      { name: 'recipientTelegram', type: 'string'  },
      { name: 'depositorEmail',    type: 'string'  },
      { name: 'depositorTelegram', type: 'string'  },
      { name: 'terms',             type: 'string'  },
      { name: 'acceptDeadline',    type: 'uint256' },
    ],
    name: 'depositERC20',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimTimeout',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'depositorRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ── Recipient actions ──────────────────────────────────────────────────────
  {
    inputs: [
      { name: 'depositor',  type: 'address' },
      { name: 'signature',  type: 'bytes'   },
    ],
    name: 'acceptEscrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ── Admin actions ──────────────────────────────────────────────────────────
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'approveRelease',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositor', type: 'address' }],
    name: 'refund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newFeeBps', type: 'uint16' }],
    name: 'setFeeBps',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'terms', type: 'string' }],
    name: 'setDefaultTerms',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'duration', type: 'uint256' }],
    name: 'setDefaultAcceptDeadlineDuration',
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

  // ── Events ─────────────────────────────────────────────────────────────────
  {
    name: 'Deposited',
    type: 'event',
    inputs: [
      { name: 'depositor',         type: 'address', indexed: true  },
      { name: 'recipient',         type: 'address', indexed: true  },
      { name: 'token',             type: 'address', indexed: false },
      { name: 'amount',            type: 'uint256', indexed: false },
      { name: 'feeBps',            type: 'uint16',  indexed: false },
      { name: 'description',       type: 'string',  indexed: false },
      { name: 'recipientEmail',    type: 'string',  indexed: false },
      { name: 'recipientTelegram', type: 'string',  indexed: false },
      { name: 'depositorEmail',    type: 'string',  indexed: false },
      { name: 'depositorTelegram', type: 'string',  indexed: false },
    ],
  },
  {
    name: 'Accepted',
    type: 'event',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
    ],
  },
  {
    name: 'ReleaseApproved',
    type: 'event',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
    ],
  },
  {
    name: 'Released',
    type: 'event',
    inputs: [
      { name: 'depositor',         type: 'address', indexed: true  },
      { name: 'recipient',         type: 'address', indexed: true  },
      { name: 'amountToRecipient', type: 'uint256', indexed: false },
      { name: 'fee',               type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Refunded',
    type: 'event',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true  },
      { name: 'amount',    type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'AdminChanged',
    type: 'event',
    inputs: [
      { name: 'oldAdmin', type: 'address', indexed: true },
      { name: 'newAdmin', type: 'address', indexed: true },
    ],
  },
  {
    name: 'FeeBpsChanged',
    type: 'event',
    inputs: [
      { name: 'oldFeeBps', type: 'uint16', indexed: false },
      { name: 'newFeeBps', type: 'uint16', indexed: false },
    ],
  },
] as const;
