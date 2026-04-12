import React from "react";
import { Dialog } from "@headlessui/react";
import Modal from "~~/components/Modal";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { Poll } from "~~/types/poll";
import { uploadToPinata } from "~~/utils/pinata";
import { notification } from "~~/utils/scaffold-eth";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function PollStatusModal({
  poll,
  show,
  setOpen,
}: {
  show: boolean;
  setOpen: (value: boolean) => void;
  poll: Poll | undefined;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const { writeAsync, isMining } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "updatePollTallyCID",
    args: [undefined, undefined],
  });

  const isProcessing = isUploading || isMining;

  async function uploadTallyFile() {
    if (!fileInputRef.current?.files?.length || !poll || isProcessing) {
      return;
    }

    setIsUploading(true);

    try {
      const file = fileInputRef.current.files[0];
      const content = await readFileAsText(file);

      let data: any;
      try {
        data = JSON.parse(content);
      } catch (err) {
        console.error("[tally-upload] Failed to parse JSON file:", err);
        notification.error("Invalid file: not valid JSON");
        return;
      }

      if (!data || !data.results?.tally || !Array.isArray(data.results.tally)) {
        console.error("[tally-upload] File missing results.tally array");
        notification.error("Invalid file: missing results.tally array");
        return;
      }

      let ipfsHash: string;
      try {
        console.log("[tally-upload] Uploading tally to IPFS...");
        ipfsHash = await uploadToPinata(data);
        console.log("[tally-upload] Uploaded to IPFS:", ipfsHash);
      } catch (err: any) {
        console.error("[tally-upload] IPFS upload failed:", err);
        const serverMessage = err?.response?.data?.error;
        notification.error(serverMessage || "Failed to upload tally to IPFS");
        return;
      }

      try {
        console.log("[tally-upload] Storing CID on-chain for poll", poll.id.toString());
        await writeAsync({ args: [poll.id, ipfsHash] });
        console.log("[tally-upload] On-chain CID update confirmed");
        setOpen(false);
      } catch (err) {
        console.error("[tally-upload] On-chain update failed:", err);
        // useScaffoldContractWrite / useTransactor already shows error notifications
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Modal show={show} setOpen={setOpen}>
      <div className="mt-3 text-center sm:mt-5 mb-6">
        <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
          Required Actions
        </Dialog.Title>
      </div>
      <div className=" ">
        <div className="text-center">
          <div className="text-sm">Upload the tally file</div>
          <div className="mt-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              disabled={isProcessing}
              className="file-input file-input-bordered w-full bg-primary text-neutral max-w-xs disabled:opacity-50"
            />
          </div>
        </div>
        <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
          <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-primary text-primary-content px-3 py-2 font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={uploadTallyFile}
            disabled={isProcessing}
          >
            {isUploading ? "Uploading to IPFS..." : isMining ? "Confirming transaction..." : "Upload"}
          </button>
          <button
            type="button"
            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setOpen(false)}
            disabled={isProcessing}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
