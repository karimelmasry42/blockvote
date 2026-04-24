"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Keypair, PrivKey } from "maci-domainobjs";
import { useAccount, useSignMessage } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";
import { useScaffoldContractRead, useScaffoldEventHistory, useScaffoldEventSubscriber } from "~~/hooks/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";

interface IAuthContext {
  isRegistered: boolean;
  isRegisteredLoaded: boolean;
  keypair: Keypair | null;
  stateIndex: bigint | null;
  generateKeypair: () => Promise<Keypair | null>;
}

export const AuthContext = createContext<IAuthContext>({} as IAuthContext);

// MACI private keys are deterministic from the wallet signature of "Login to <origin>".
// Persisting the derived keypair saves a signature prompt on every refresh without
// leaking anything the wallet wouldn't re-produce on demand. Keys are scoped by
// wallet address so switching wallets never overwrites another wallet's entry —
// reconnecting an old wallet rehydrates instantly instead of re-prompting.
const KEYPAIR_STORAGE_PREFIX = "blockvote.maciKeypair.";

const storageKeyFor = (address: string) => `${KEYPAIR_STORAGE_PREFIX}${address.toLowerCase()}`;

const loadStoredKeypair = (address: string | undefined): Keypair | null => {
  if (typeof window === "undefined" || !address) return null;
  try {
    const raw = sessionStorage.getItem(storageKeyFor(address));
    if (!raw) return null;
    if (!PrivKey.isValidSerializedPrivKey(raw)) return null;
    return new Keypair(PrivKey.deserialize(raw));
  } catch {
    return null;
  }
};

const saveStoredKeypair = (address: string, keypair: Keypair) => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKeyFor(address), keypair.privKey.serialize());
  } catch {
    // sessionStorage can throw in private browsing modes; degrade silently to in-memory only
  }
};

export default function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const [keypair, setKeyPair] = useState<Keypair | null>(null);
  const [stateIndex, setStateIndex] = useState<bigint | null>(null);
  const [signatureMessage, setSignatureMessage] = useState<string>("");
  const prevAddressRef = useRef<string | undefined>(undefined);

  const { signMessageAsync } = useSignMessage({ message: signatureMessage });

  useEffect(() => {
    setSignatureMessage(`Login to ${window.location.origin}`);
  }, []);

  // Hydrate / clear keypair in response to address changes.
  // - undefined → address (page load or reconnect): rehydrate from storage
  // - addressA  → addressB (wallet switch): drop in-memory; per-address storage
  //   entries are independent, so B's entry rehydrates if present and A's is
  //   preserved for when A reconnects
  // - address   → undefined (disconnect): drop in-memory but keep storage so reconnect is instant
  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = address;

    if (!address) {
      if (prev) setKeyPair(null);
      return;
    }

    if (prev && prev.toLowerCase() !== address.toLowerCase()) {
      setKeyPair(null);
    }

    const stored = loadStoredKeypair(address);
    if (stored) setKeyPair(stored);
  }, [address]);

  const { data: isRegisteredData, refetch: refetchIsRegistered } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "isPublicKeyRegistered",
    args: keypair ? keypair.pubKey.rawPubKey : [0n, 0n],
  });

  const isRegistered = Boolean(isRegisteredData);
  const isRegisteredLoaded = keypair !== null && isRegisteredData !== undefined;

  const generateKeypair = useCallback(async (): Promise<Keypair | null> => {
    if (!address || !isConnected || !signatureMessage) return null;

    try {
      const signature = await signMessageAsync();
      const userKeyPair = new Keypair(new PrivKey(signature));
      saveStoredKeypair(address, userKeyPair);
      setKeyPair(userKeyPair);
      // Kick an immediate refetch so the UI doesn't wait for a new Hardhat block
      // (watch:true is block-gated; idle local chains would otherwise stall).
      refetchIsRegistered();
      return userKeyPair;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [address, isConnected, signatureMessage, signMessageAsync, refetchIsRegistered]);

  const chainId = scaffoldConfig.targetNetworks[0].id;

  const {
    MACIWrapper: { deploymentBlockNumber },
  } = deployedContracts[chainId];

  const { data: SignUpEvents } = useScaffoldEventHistory({
    contractName: "MACIWrapper",
    eventName: "SignUp",
    filters: {
      _userPubKeyX: BigInt(keypair?.pubKey.asContractParam().x || 0n),
      _userPubKeyY: BigInt(keypair?.pubKey.asContractParam().y || 0n),
    },
    fromBlock: BigInt(deploymentBlockNumber),
  });

  useEffect(() => {
    if (!keypair || !SignUpEvents || !SignUpEvents.length) {
      setStateIndex(null);
      return;
    }

    const event = SignUpEvents.filter(
      log =>
        log.args._userPubKeyX?.toString() === keypair.pubKey.asContractParam().x &&
        log.args._userPubKeyY?.toString() === keypair.pubKey.asContractParam().y,
    )[0];
    setStateIndex(event?.args?._stateIndex || null);
  }, [keypair, SignUpEvents]);

  useScaffoldEventSubscriber({
    contractName: "MACIWrapper",
    eventName: "SignUp",
    listener: logs => {
      logs.forEach(log => {
        if (
          (keypair?.pubKey.asContractParam().x !== undefined &&
            log.args._userPubKeyX !== BigInt(keypair?.pubKey.asContractParam().x)) ||
          (keypair?.pubKey.asContractParam().y !== undefined &&
            log.args._userPubKeyY !== BigInt(keypair?.pubKey.asContractParam().y))
        )
          return;
        refetchIsRegistered();
        setStateIndex(log.args._stateIndex || null);
      });
    },
  });

  return (
    <AuthContext.Provider value={{ isRegistered, isRegisteredLoaded, keypair, stateIndex, generateKeypair }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
