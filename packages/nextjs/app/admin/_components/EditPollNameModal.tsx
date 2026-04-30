"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import Modal from "~~/components/Modal";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { Poll } from "~~/types/poll";
import { notification } from "~~/utils/scaffold-eth";

const MAX_NAME_LENGTH = 100;

export default function EditPollNameModal({
  poll,
  show,
  setOpen,
  refetchPolls,
}: {
  poll: Poll | undefined;
  show: boolean;
  setOpen: (value: boolean) => void;
  refetchPolls: () => void;
}) {
  const [name, setName] = useState(poll?.name ?? "");

  useEffect(() => {
    setName(poll?.name ?? "");
  }, [poll]);

  const { writeAsync, isMining } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "updatePollName",
    args: [0n, ""],
  });

  const trimmedName = name.trim();
  const isTooLong = trimmedName.length > MAX_NAME_LENGTH;
  const isEmpty = trimmedName.length === 0;
  const isUnchanged = poll && trimmedName === poll.name.trim();
  const isDisabled = isEmpty || isTooLong || isUnchanged || isMining;

  async function onSubmit() {
    if (!poll || isDisabled) return;

    try {
      await writeAsync({ args: [poll.id, trimmedName] });
      notification.success("Poll name updated");
      refetchPolls();
      setOpen(false);
    } catch (err) {
      console.error(err);
      notification.error("Failed to update poll name");
    }
  }

  return (
    <Modal show={show} setOpen={setOpen}>
      <div className="mt-3 text-center sm:mt-5 mb-6">
        <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
          Edit Poll Name
        </Dialog.Title>
      </div>
      <div>
        <input
          type="text"
          className="border border-gray-300 rounded-md px-4 py-2 w-full focus:outline-none bg-white text-black"
          placeholder="Enter new poll name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH + 10}
        />
        <p className={`mt-1 text-xs ${isTooLong ? "text-red-500" : "text-neutral-content/70"}`}>
          {trimmedName.length}/{MAX_NAME_LENGTH}
        </p>
      </div>
      <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
        <button
          type="button"
          className="inline-flex w-full justify-center rounded-md bg-primary text-primary-content px-3 py-2 font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onSubmit}
          disabled={isDisabled}
        >
          {isMining ? "Confirming..." : "Save"}
        </button>
        <button
          type="button"
          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setOpen(false)}
          disabled={isMining}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
