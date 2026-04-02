import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";

export default function RegisterButton() {
  const { keypair, isRegistered, generateKeypair } = useAuthContext();

  const { writeAsync } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "signUp",
    args: [keypair?.pubKey.asContractParam() as { x: bigint; y: bigint }, "0x", "0x"],
  });

  async function register() {
    if (!keypair) return;

    try {
      await writeAsync({ args: [keypair.pubKey.asContractParam() as { x: bigint; y: bigint }, "0x", "0x"] });
    } catch (err) {
      console.log(err);
    }
  }

  if (!keypair) {
    return (
      <button
        className="border border-slate-600 bg-primary px-5 py-3 rounded-lg font-bold hover:bg-secondary hover:shadow-md transition"
        onClick={generateKeypair}
      >
        Get Started
      </button>
    );
  }

  if (isRegistered) {
    return (
      <div className="border border-slate-600 bg-base-100 px-5 py-3 rounded-lg font-semibold">
        Registration Complete
      </div>
    );
  }

  return (
    <button
      className="border border-slate-600 bg-primary px-5 py-3 rounded-lg font-bold hover:bg-secondary hover:shadow-md transition"
      onClick={register}
    >
      Register to Vote
    </button>
  );
}
