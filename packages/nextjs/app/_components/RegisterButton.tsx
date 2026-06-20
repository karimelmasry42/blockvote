import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";

export default function RegisterButton({
  label = "Sign In",
  generateLabel,
  compact = false,
}: {
  label?: string;
  generateLabel?: string;
  compact?: boolean;
}) {
  const { keypair, isRegistered, generateKeypair } = useAuthContext();

  const { writeAsync } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "signUp",
    args: [keypair?.pubKey.asContractParam() as { x: bigint; y: bigint }, "0x", "0x"],
  });

  async function register() {
    if (!keypair) return;

    try {
      await writeAsync({
        args: [keypair.pubKey.asContractParam() as { x: bigint; y: bigint }, "0x", "0x"],
      });
    } catch (err) {
      console.log(err);
    }
  }

  const buttonClass = compact
    ? "bg-secondary shadow-md hover:bg-secondary text-white py-1 px-3 text-sm rounded-full transition flex items-center"
    : "border border-slate-600 bg-primary px-5 py-3 rounded-lg font-bold hover:bg-secondary hover:shadow-md transition";

  const completeClass = compact
    ? "bg-base-100 border border-slate-600 py-1.5 px-3 text-sm rounded-full font-semibold"
    : "border border-slate-600 bg-base-100 px-5 py-3 rounded-lg font-semibold";

  if (!keypair) {
    return (
      <button className={buttonClass} onClick={generateKeypair}>
        {generateLabel ?? label}
      </button>
    );
  }

  if (isRegistered) {
    return <div className={completeClass}>Registration Complete</div>;
  }

  return (
    <button className={buttonClass} onClick={register}>
      {label}
    </button>
  );
}
