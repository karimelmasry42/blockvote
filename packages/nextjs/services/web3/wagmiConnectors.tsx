import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import * as chains from "viem/chains";
import { configureChains } from "wagmi";
import { publicProvider } from "wagmi/providers/public";
import scaffoldConfig from "~~/scaffold.config";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const targetNetworks = getTargetNetworks();

// Add mainnet for ENS resolution and ETH price, but skip it on local hardhat — ENS lookups
// on test addresses cause the ENS reverse resolver to revert with "Internal error".
const enabledChains =
  targetNetworks.find(network => network.id === 1) || targetNetworks.every(n => n.id === chains.hardhat.id)
    ? targetNetworks
    : [...targetNetworks, chains.mainnet];

/**
 * Chains for the app
 */
export const appChains = configureChains(
  enabledChains,
  [publicProvider()],
  {
    // We might not need this checkout https://github.com/scaffold-eth/scaffold-eth-2/pull/45#discussion_r1024496359, will test and remove this before merging
    stallTimeout: 3_000,
    // Sets pollingInterval if using chains other than local hardhat chain
    ...(targetNetworks.find(network => network.id !== chains.hardhat.id)
      ? {
          pollingInterval: scaffoldConfig.pollingInterval,
        }
      : {}),
  },
);

const walletsOptions = { chains: appChains.chains, projectId: scaffoldConfig.walletConnectProjectId };
const wallets = [
  metaMaskWallet({ ...walletsOptions, shimDisconnect: true }),
  walletConnectWallet(walletsOptions),
  ledgerWallet(walletsOptions),
  braveWallet(walletsOptions),
  coinbaseWallet({ ...walletsOptions, appName: "scaffold-eth-2" }),
  rainbowWallet(walletsOptions),
  safeWallet({ ...walletsOptions }),
];

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = connectorsForWallets([
  {
    groupName: "Supported Wallets",
    wallets,
  },
]);
