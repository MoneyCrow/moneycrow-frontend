export const DEMO_ADDRESS: Record<number, `0x${string}`> = {
  8453: '0xFc6e21b81aF72c8a2077d1C73CEb16716bcf6061',
  137:  '0x0fF998cDC01E285473120a8279A1be74C3d57929',
};

export function getDemoAddress(chainId: number | undefined): `0x${string}` | undefined {
  if (chainId === undefined) return undefined;
  const addr = DEMO_ADDRESS[chainId];
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return undefined;
  return addr;
}

export const DEMO_STATUS_LABEL   = ['Pending', 'Accepted', 'Approved'] as const;
export const DEMO_STATUS_VARIANT = ['pending', 'active',   'released'] as const;

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
        { name: 'depositor',  type: 'address' },
        { name: 'recipient',  type: 'address' },
        { name: 'token',      type: 'address' },
        { name: 'amount',     type: 'uint256' },
        { name: 'termsHash',  type: 'bytes32' },
        { name: 'status',     type: 'uint8'   },
        { name: 'createdAt',  type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
    type: 'function',
  },

  // ── Admin write ────────────────────────────────────────────────────────────
  {
    inputs: [
      { name: 'recipient',  type: 'address' },
      { name: 'token',      type: 'address' },
      { name: 'amount',     type: 'uint256' },
      { name: 'termsHash',  type: 'bytes32' },
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
      { name: 'depositor', type: 'address', indexed: true  },
      { name: 'recipient', type: 'address', indexed: true  },
      { name: 'token',     type: 'address', indexed: false },
      { name: 'amount',    type: 'uint256', indexed: false },
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
