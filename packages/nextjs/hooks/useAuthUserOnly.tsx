import { useEffect } from "react";
import { useRouter } from "next/navigation";
<<<<<<< HEAD
import { getAddress, isAddress } from "viem";
=======
>>>>>>> a30c5c87de8cc370070fcbf96d9e309570a6d131
import { useAccount } from "wagmi";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractRead } from "~~/hooks/scaffold-eth";

export function useAuthUserOnly({ inverted }: { inverted?: boolean }) {
  const router = useRouter();
<<<<<<< HEAD
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { isRegistered, isAuthLoading } = useAuthContext();

  const { data: owner, isLoading: isOwnerLoading } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "owner",
  });
=======
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const { isRegistered, isAuthLoading, isOwner, isOwnerLoading } = useAuthContext();
>>>>>>> a30c5c87de8cc370070fcbf96d9e309570a6d131

  const isWalletLoading = isConnecting || isReconnecting;
  const isLoading = isWalletLoading || isAuthLoading || isOwnerLoading;

  const isAllowed = isConnected && (isRegistered || isOwner);

  useEffect(() => {
    if (isLoading) return;

    if (inverted && isAllowed) {
      router.replace("/polls");
      return;
    }

    if (!inverted && !isAllowed) {
      router.replace("/");
    }
  }, [isLoading, inverted, isAllowed, router]);

  return;
}
