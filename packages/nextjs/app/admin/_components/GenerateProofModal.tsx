"use client";

import { useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import Modal from "~~/components/Modal";
import { Poll } from "~~/types/poll";
import { notification } from "~~/utils/scaffold-eth";

interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

const STEPS: ProgressStep[] = [
  { id: "validating", label: "Validating coordinator key", status: "pending" },
  { id: "merge", label: "Merging state and message trees", status: "pending" },
  { id: "state", label: "Rebuilding MACI state from on-chain events", status: "pending" },
  { id: "mp-proofs", label: "Generating message processing proofs", status: "pending" },
  { id: "mp-submit", label: "Submitting message processing proofs", status: "pending" },
  { id: "tally-proofs", label: "Generating tally proofs", status: "pending" },
  { id: "tally-submit", label: "Submitting tally proofs", status: "pending" },
];

interface GenerateProofModalProps {
  poll: Poll | undefined;
  show: boolean;
  setOpen: (value: boolean) => void;
  onSuccess?: () => void;
  onUploadTally?: (poll: Poll) => void;
}

export default function GenerateProofModal({ poll, show, setOpen, onSuccess, onUploadTally }: GenerateProofModalProps) {
  const [coordinatorPrivateKey, setCoordinatorPrivateKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [success, setSuccess] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>(STEPS);
  const [currentStepLabel, setCurrentStepLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const isDisabled = isLoading || (useCustomKey && !coordinatorPrivateKey.trim());

  async function handleGenerateProof() {
    if (!poll || isDisabled) return;

    setIsLoading(true);
    setSuccess(false);
    setSteps(STEPS);
    setCurrentStepLabel("");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/tally/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pollId: poll.id.toString(),
          coordinatorPrivateKey: useCustomKey ? coordinatorPrivateKey.trim() : undefined,
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        notification.error(text || "Failed to generate proof");
        setIsLoading(false);
        return;
      }

      if (!response.body) {
        notification.error("Streaming not supported");
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            handleEvent(parsed.event, parsed);
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error(err);
        notification.error("Failed to generate proof");
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function handleEvent(event: string, data: any) {
    switch (event) {
      case "progress": {
        setCurrentStepLabel(data.message || "");
        setSteps(prev =>
          prev.map(s => {
            if (s.id === data.step) return { ...s, status: "active" as const };
            if (isStepBefore(s.id, data.step)) return { ...s, status: "done" as const };
            return s;
          }),
        );
        break;
      }
      case "complete": {
        setSteps(prev => prev.map(s => ({ ...s, status: "done" as const })));
        setCurrentStepLabel("");
        setSuccess(true);
        if (onSuccess) onSuccess();
        break;
      }
      case "error": {
        setSteps(prev =>
          prev.map(s => {
            if (s.status === "active") return { ...s, status: "error" as const };
            return s;
          }),
        );
        setCurrentStepLabel("");
        notification.error(data.message || "Failed to generate proof");
        setIsLoading(false);
        break;
      }
    }
  }

  function isStepBefore(id: string, target: string): boolean {
    const order = STEPS.map(s => s.id);
    return order.indexOf(id) < order.indexOf(target);
  }

  function handleUploadTally() {
    if (!poll) return;
    setCoordinatorPrivateKey("");
    setUseCustomKey(false);
    setSuccess(false);
    setOpen(false);
    onUploadTally?.(poll);
  }

  function handleCancel() {
    if (isLoading && abortRef.current) {
      abortRef.current.abort();
    }
    setCoordinatorPrivateKey("");
    setUseCustomKey(false);
    setSuccess(false);
    setOpen(false);
  }

  if (success && poll) {
    return (
      <Modal show={show} setOpen={setOpen}>
        <div className="mt-3 text-center sm:mt-5 mb-6">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
            Proof Generated
          </Dialog.Title>
          <p className="mt-2 text-sm text-neutral-content/70">
            Tally proof for poll #{poll.id.toString()} was generated successfully.
          </p>
          <p className="mt-1 text-sm text-neutral-content/70">
            Next step: upload the tally file to IPFS to publish results.
          </p>
        </div>
        <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
          <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-primary text-primary-content px-3 py-2 font-semibold shadow-sm sm:col-start-2 hover:opacity-90"
            onClick={handleUploadTally}
          >
            Upload Tally File
          </button>
          <button
            type="button"
            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
            onClick={() => {
              setSuccess(false);
              setOpen(false);
            }}
          >
            Close
          </button>
        </div>
      </Modal>
    );
  }

  if (isLoading) {
    return (
      <Modal show={show} setOpen={setOpen}>
        <div className="mt-3 mb-6">
          <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content text-center">
            Generating Proof
          </Dialog.Title>
          <p className="mt-2 text-sm text-neutral-content/70 text-center">{currentStepLabel || "Starting..."}</p>
        </div>
        <div className="space-y-2 mb-6">
          {steps.map(step => (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm border transition-colors ${
                step.status === "active"
                  ? "border-primary bg-primary/10"
                  : step.status === "done"
                  ? "border-green-500/30 bg-green-500/5"
                  : step.status === "error"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-slate-600/30 opacity-50"
              }`}
            >
              <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                {step.status === "done" ? (
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : step.status === "active" ? (
                  <svg className="w-4 h-4 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : step.status === "error" ? (
                  <span className="text-red-500 font-bold">!</span>
                ) : (
                  <span className="text-slate-500">&bull;</span>
                )}
              </span>
              <span
                className={
                  step.status === "active"
                    ? "text-neutral-content font-medium"
                    : step.status === "done"
                    ? "text-green-400"
                    : step.status === "error"
                    ? "text-red-400"
                    : "text-neutral-content/50"
                }
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal show={show} setOpen={setOpen}>
      <div className="mt-3 text-center sm:mt-5 mb-6">
        <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
          Generate Proof
        </Dialog.Title>
        <p className="mt-2 text-sm text-neutral-content/70">Generate the tally proof for poll #{poll?.id.toString()}</p>
      </div>
      <div>
        <div className="flex flex-col gap-3 mb-4">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 cursor-pointer hover:bg-base-200 transition-colors">
            <input
              type="radio"
              name="keyMode"
              checked={!useCustomKey}
              onChange={() => {
                setUseCustomKey(false);
                setCoordinatorPrivateKey("");
              }}
              className="radio radio-sm"
            />
            <div>
              <span className="font-semibold">Auto</span>
              <p className="text-xs text-neutral-content/70 mt-0.5">Read key from local coordinatorKeyPair.json</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 cursor-pointer hover:bg-base-200 transition-colors">
            <input
              type="radio"
              name="keyMode"
              checked={useCustomKey}
              onChange={() => setUseCustomKey(true)}
              className="radio radio-sm"
            />
            <div className="flex-1">
              <span className="font-semibold">Manual</span>
              <p className="text-xs text-neutral-content/70 mt-0.5">Enter a custom coordinator private key</p>
            </div>
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
        </div>
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
          onClick={handleCancel}
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
