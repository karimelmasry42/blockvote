import { useEffect, useState } from "react";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";

export default function RegisterButton({
  label = "Get Started",
  generateLabel,
  compact = false,
}: {
  label?: string;
  generateLabel?: string;
  compact?: boolean;
}) {
  const { keypair, isRegistered, isRegisteredLoaded, generateKeypair } = useAuthContext();
  const [isBusy, setIsBusy] = useState(false);
  const [autoRegisterPending, setAutoRegisterPending] = useState(false);

  const { writeAsync } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "signUp",
    args: [keypair?.pubKey.asContractParam() as { x: bigint; y: bigint }, "0x", "0x"],
  });

  const register = async () => {
    if (!keypair) return;
    await writeAsync({
      args: [keypair.pubKey.asContractParam() as { x: bigint; y: bigint }, "0x", "0x"],
    });
  };

  // After a fresh generateKeypair(), wait for the isRegistered read to resolve
  // against the new pubkey. If not already registered on-chain, fire signUp
  // automatically so a brand-new user only clicks once.
  useEffect(() => {
    if (!autoRegisterPending) return;
    if (!keypair || !isRegisteredLoaded) return;
    setAutoRegisterPending(false);
    if (!isRegistered) {
      register().catch(err => console.log(err));
    }
    // register's identity depends on writeAsync/keypair; not listing it here avoids
    // re-triggering the effect after setAutoRegisterPending(false) lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRegisterPending, keypair, isRegisteredLoaded, isRegistered]);

  const handleClick = async () => {
    if (isBusy || autoRegisterPending) return;
    setIsBusy(true);
    try {
      if (!keypair) {
        const newKey = await generateKeypair();
        if (newKey) setAutoRegisterPending(true);
      } else if (!isRegistered) {
        await register();
      }
    } catch (err) {
      console.log(err);
    } finally {
      setIsBusy(false);
    }
  };

  const buttonClass = compact
    ? "bg-secondary shadow-md hover:bg-secondary text-white py-1 px-3 text-sm rounded-full transition flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
    : "border border-slate-600 bg-primary px-5 py-3 rounded-lg font-bold hover:bg-secondary hover:shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed";

  const completeClass = compact
    ? "bg-base-100 border border-slate-600 py-1.5 px-3 text-sm rounded-full font-semibold"
    : "border border-slate-600 bg-base-100 px-5 py-3 rounded-lg font-semibold";

  if (keypair && isRegistered) {
    return <div className={completeClass}>Registration Complete</div>;
  }

  // Keypair derived but the on-chain read hasn't returned yet — don't flash an
  // active register button that would invite a duplicate-signUp click.
  if (keypair && !isRegisteredLoaded) {
    return (
      <button className={buttonClass} disabled>
        Checking registration…
      </button>
    );
  }

  const working = isBusy || autoRegisterPending;
  const displayLabel = !keypair ? generateLabel ?? label : label;

  return (
    <button className={buttonClass} onClick={handleClick} disabled={working}>
      {working ? "Processing…" : displayLabel}
    </button>
  );
}
