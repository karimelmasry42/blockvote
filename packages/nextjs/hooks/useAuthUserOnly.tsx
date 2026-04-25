import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { useAccount } from "wagmi";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractRead } from "~~/hooks/scaffold-eth";

export function useAuthUserOnly({ inverted }: { inverted?: boolean }) {
  const router = useRouter();
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { isRegistered, isAuthLoading } = useAuthContext();

  const { data: owner, isLoading: isOwnerLoading } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "owner",
  });

  const isWalletLoading = isConnecting || isReconnecting;
  const isLoading = isWalletLoading || isAuthLoading || isOwnerLoading;

  const isOwner =
    !!address && !!owner && isAddress(address) && isAddress(owner) && getAddress(address) === getAddress(owner);

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
