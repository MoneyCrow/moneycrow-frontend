import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  rainbowWallet,
  walletConnectWallet,
  phantomWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { base, polygon } from 'wagmi/chains';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string;

export const config = getDefaultConfig({
  appName:   'MoneyCrow Escrow',
  projectId: PROJECT_ID,
  chains:    [base, polygon],
  ssr:       false,

  // Custom wallet list — overrides RainbowKit defaults so we control ordering
  // and can rename the WalletConnect entry.
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        rainbowWallet,
        trustWallet,
        phantomWallet,
        // Rename WalletConnect to something friendlier for non-crypto users
        (params) => ({
          ...walletConnectWallet(params),
          name: 'Other wallets — 300+ supported',
          shortName: 'Exodus, Phantom, Ledger, Trezor and more',
        }),
      ],
    },
  ],
});
