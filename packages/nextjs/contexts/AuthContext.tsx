"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Keypair, PrivKey } from "maci-domainobjs";
import { getAddress, isAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";
import { useScaffoldContractRead, useScaffoldEventHistory, useScaffoldEventSubscriber } from "~~/hooks/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";

interface IAuthContext {
  isRegistered: boolean;
  isAuthLoading: boolean;
  keypair: Keypair | null;
  stateIndex: bigint | null;
  generateKeypair: () => void;
  isOwner: boolean;
  owner: string | undefined;
  isOwnerLoading: boolean;
}

export const AuthContext = createContext<IAuthContext>({} as IAuthContext);

export default function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const [keypair, setKeyPair] = useState<Keypair | null>(null);
  const [stateIndex, setStateIndex] = useState<bigint | null>(null);
  const [signatureMessage, setSignatureMessage] = useState<string>("");

  const { signMessageAsync } = useSignMessage({ message: signatureMessage });

  useEffect(() => {
    setSignatureMessage(`Login to ${window.location.origin}`);
  }, []);

  const storageKey = (addr: string) => `maci-signature-${getAddress(addr)}`;

  useEffect(() => {
    if (!address) return;

    const stored = sessionStorage.getItem(storageKey(address));
    if (stored) {
      try {
        const userKeyPair = new Keypair(new PrivKey(stored));
        setKeyPair(userKeyPair);
        return;
      } catch {
        sessionStorage.removeItem(storageKey(address));
      }
    }

    setKeyPair(null);
  }, [address]);

  const generateKeypair = useCallback(() => {
    if (!address || !isConnected || !signatureMessage) return;

    (async () => {
      try {
        const signature = await signMessageAsync();
        sessionStorage.setItem(storageKey(address), signature);
        const userKeyPair = new Keypair(new PrivKey(signature));
        setKeyPair(userKeyPair);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [address, isConnected, signatureMessage, signMessageAsync]);

  const {
    data: isRegistered,
    isLoading: isAuthLoading,
    refetch: refetchIsRegistered,
  } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "isPublicKeyRegistered",
    args: keypair ? keypair.pubKey.rawPubKey : [0n, 0n],
  });

  const { data: owner, isLoading: isOwnerLoading } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "owner",
  });

  const isOwner =
    !!address && !!owner && isAddress(address) && isAddress(owner) && getAddress(address) === getAddress(owner);

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
    <AuthContext.Provider
      value={{
        isRegistered: Boolean(isRegistered),
        isAuthLoading,
        keypair,
        stateIndex,
        generateKeypair,
        isOwner,
        owner: typeof owner === "string" ? owner : undefined,
        isOwnerLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
