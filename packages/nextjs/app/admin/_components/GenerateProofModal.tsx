"use client";

import { useState } from "react";
import { Dialog } from "@headlessui/react";
import Modal from "~~/components/Modal";
import { Poll } from "~~/types/poll";
import { notification } from "~~/utils/scaffold-eth";

interface GenerateProofModalProps {
  poll: Poll | undefined;
  show: boolean;
  setOpen: (value: boolean) => void;
  onSuccess?: () => void;
}

export default function GenerateProofModal({ poll, show, setOpen, onSuccess }: GenerateProofModalProps) {
  const [coordinatorPrivateKey, setCoordinatorPrivateKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);

  const isDisabled = isLoading || (useCustomKey && !coordinatorPrivateKey.trim());

  async function handleGenerateProof() {
    if (!poll || isDisabled) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/tally/prove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pollId: poll.id.toString(),
          coordinatorPrivateKey: useCustomKey ? coordinatorPrivateKey.trim() : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        notification.error(data.error || "Failed to generate proof");
        return;
      }

      notification.success("Proof generated successfully!");
      setOpen(false);
      setCoordinatorPrivateKey("");
      setUseCustomKey(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error(err);
      notification.error("Failed to generate proof");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal show={show} setOpen={setOpen}>
      <div className="mt-3 text-center sm:mt-5 mb-6">
        <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
          Generate Proof
        </Dialog.Title>
        <p className="mt-2 text-sm text-neutral-content/70">
          Generate the tally proof for poll #{poll?.id.toString()} using the local coordinator key stored in
          `packages/hardhat/coordinatorKeyPair.json`.
        </p>
      </div>
      <div>
        <label className="mb-3 flex items-center gap-2 text-sm text-neutral-content/80">
          <input
            type="checkbox"
            checked={useCustomKey}
            onChange={e => setUseCustomKey(e.target.checked)}
            className="checkbox checkbox-sm"
          />
          Override with a custom coordinator private key
        </label>
        {useCustomKey && (
          <input
            type="password"
            className="border border-gray-300 rounded-md px-4 py-2 w-full focus:outline-none bg-white text-black"
            placeholder="Coordinator private key (macisk.xxx...)"
            value={coordinatorPrivateKey}
            onChange={e => setCoordinatorPrivateKey(e.target.value)}
          />
        )}
        <p className="mt-1 text-xs text-neutral-content/70">
          The default flow reads the key from the local Hardhat workspace, validates it against the deployed MACI
          coordinator public key, and keeps `deploy-config.json` in sync automatically.
        </p>
      </div>
      <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
        <button
          type="button"
          className="inline-flex w-full justify-center rounded-md bg-primary text-primary-content px-3 py-2 font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleGenerateProof}
          disabled={isDisabled}
        >
          {isLoading ? "Generating..." : "Generate Proof"}
        </button>
        <button
          type="button"
          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            setOpen(false);
            setCoordinatorPrivateKey("");
            setUseCustomKey(false);
          }}
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
