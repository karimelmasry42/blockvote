import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractRead } from "~~/hooks/scaffold-eth";

export function useAuthUserOnly({ inverted }: { inverted?: boolean }) {
  const router = useRouter();
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const { isRegistered, isAuthLoading, isOwner, isOwnerLoading } = useAuthContext();

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
