import { useEffectOnce, useLocalStorage } from "usehooks-ts";
import { Connector, useAccount, useConnect } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const SCAFFOLD_WALLET_STORAGE_KEY = "scaffoldEth2.wallet";
const WAGMI_WALLET_STORAGE_KEY = "wagmi.wallet";

// ID of the SAFE connector instance
const SAFE_ID = "safe";

const getInitialConnector = (
  previousWalletId: string,
  connectors: Connector[],
): { connector: Connector | undefined; chainId?: number } | undefined => {
  // Auto-connect to SAFE instantly if loaded in a SAFE frame
  const safeConnectorInstance = connectors.find(connector => connector.id === SAFE_ID && connector.ready);
  if (safeConnectorInstance) {
    return { connector: safeConnectorInstance };
  }

  if (previousWalletId && scaffoldConfig.walletAutoConnect) {
    const connector = connectors.find(f => f.id === previousWalletId);
    return { connector };
  }

  return undefined;
};

/**
 * Automatically reconnect to the previously used wallet on page load.
 * New users see the Connect button; disconnected users stay disconnected.
 */
export const useAutoConnect = (): void => {
  const [, setWalletId] = useLocalStorage<string>(SCAFFOLD_WALLET_STORAGE_KEY, "", {
    initializeWithValue: false,
  });
  const connectState = useConnect();

  useAccount({
    onConnect({ connector }) {
      setWalletId(connector?.id ?? "");
    },
    onDisconnect() {
      window.localStorage.setItem(WAGMI_WALLET_STORAGE_KEY, JSON.stringify(""));
      setWalletId("");
    },
  });

  useEffectOnce(() => {
    // Read synchronously to avoid the initializeWithValue:false timing issue —
    // the deferred state value may still be "" when this effect fires.
    const storedWalletId =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem(SCAFFOLD_WALLET_STORAGE_KEY) ?? '""') ||
          JSON.parse(localStorage.getItem(WAGMI_WALLET_STORAGE_KEY) ?? '""')
        : "";

    const initialConnector = getInitialConnector(storedWalletId, connectState.connectors);

    if (initialConnector?.connector) {
      connectState.connect({ connector: initialConnector.connector, chainId: initialConnector.chainId });
    }
  });
};
