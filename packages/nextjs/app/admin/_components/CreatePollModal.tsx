"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { LuCross } from "react-icons/lu";
import { MdEdit } from "react-icons/md";
import { RxCross2 } from "react-icons/rx";
import Modal from "~~/components/Modal";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { EMode, PollType } from "~~/types/poll";
import { notification } from "~~/utils/scaffold-eth";

const formatDateTimeLocal = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

type StartMode = "now" | "specific";
type EndMode = "duration" | "specific";

// Buffer added to start timestamps so the tx has time to mine before block.timestamp
// catches up. Applied both to `startMode === "now"` (auto-buffer) and as a minimum
// lead time for `startMode === "specific"` (validation). MACIWrapper.createPoll
// requires `_startTime >= block.timestamp` at mining time.
const START_TIME_BUFFER_SECONDS = 60;

// Shared validation messages — referenced both by the inline field hints (shown
// under the offending input) and by the onSubmit toasts so a user never sees
// two different phrasings for the same underlying error.
const MSG = {
  needTwoCandidates: "A poll must have at least 2 candidates",
  blankCandidate: "Candidate name cannot be blank",
  selectPollType: "Please select a poll type",
  invalidStartDate: "Please enter a valid start date",
  startLead: `Start date must be at least ${START_TIME_BUFFER_SECONDS} seconds in the future`,
  invalidEndDate: "Please enter a valid end date",
  endAfterStart: "End date must be after the start date",
  endAfterStartOneMinute: "End time must be at least 1 minute after the start",
  durationMin: "Poll duration must be at least 1 minute",
  durationInvalid: "Please enter a valid duration (at least 1 minute)",
  weightCapInvalid: "Please enter a valid total weight cap",
} as const;

export default function CreatePollModal({
  show,
  setOpen,
  refetchPolls,
}: {
  show: boolean;
  setOpen: (value: boolean) => void;
  refetchPolls: () => void;
}) {
  const now = new Date();
  const defaultExpiry = new Date(now.getTime() + 60 * 60 * 1000);

  const [pollData, setPollData] = useState({
    title: "Dummy Title",
    startMode: "now" as StartMode,
    startDate: formatDateTimeLocal(now),
    endMode: "duration" as EndMode,
    durationMinutes: "60",
    expiry: formatDateTimeLocal(defaultExpiry),
    pollType: PollType.NOT_SELECTED,
    weightCap: "100",
    options: [""],
    candidateDetails: [{ image: "", description: "" }],
  });

  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  const handleAddOption = () => {
    setPollData(prev => ({
      ...prev,
      options: [...prev.options, ""],
      candidateDetails: [...prev.candidateDetails, { image: "", description: "" }],
    }));
  };

  const handlePollTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setPollData(prev => ({ ...prev, pollType: parseInt(e.target.value) }));
  };

  const handleOptionChange = (index: number, value: string) => {
    setPollData(prev => ({
      ...prev,
      options: prev.options.map((option, i) => (i === index ? value : option)),
    }));
  };

  const handleCandidateDetailChange = (index: number, field: "image" | "description", value: string) => {
    setPollData(prev => ({
      ...prev,
      candidateDetails: prev.candidateDetails.map((detail, i) =>
        i === index ? { ...detail, [field]: value } : detail,
      ),
    }));
  };

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPollData(prev => ({ ...prev, title: e.target.value }));
  };

  function removeOptions(index: number): void {
    setPollData(prev => {
      const newOptions = [...prev.options];
      newOptions.splice(index, 1);
      const newDetails = [...prev.candidateDetails];
      newDetails.splice(index, 1);
      return { ...prev, options: newOptions, candidateDetails: newDetails };
    });
  }

  // When startMode = 'specific': keep expiry unchanged, recalculate duration
  const handleStartDateChange = (value: string) => {
    const newStart = new Date(value);
    const expiry = new Date(pollData.expiry);
    const diffMinutes = Math.round((expiry.getTime() - newStart.getTime()) / 60000);
    setPollData(prev => ({
      ...prev,
      startDate: value,
      durationMinutes: diffMinutes > 0 ? String(diffMinutes) : "",
    }));
  };

  // When startMode = 'specific': also recalculate duration to keep them in sync
  const handleExpiryChange = (value: string) => {
    if (pollData.startMode === "specific") {
      const expiryDate = new Date(value);
      const startDate = new Date(pollData.startDate);
      const diffMinutes = Math.round((expiryDate.getTime() - startDate.getTime()) / 60000);
      setPollData(prev => ({
        ...prev,
        expiry: value,
        durationMinutes: diffMinutes > 0 ? String(diffMinutes) : "",
      }));
    } else {
      setPollData(prev => ({ ...prev, expiry: value }));
    }
  };

  // When startMode = 'specific': also recalculate expiry to keep them in sync
  const handleDurationChange = (value: string) => {
    if (pollData.startMode === "specific") {
      const minutes = parseInt(value);
      if (!isNaN(minutes) && minutes > 0) {
        const startDate = new Date(pollData.startDate);
        const newExpiry = new Date(startDate.getTime() + minutes * 60000);
        setPollData(prev => ({ ...prev, durationMinutes: value, expiry: formatDateTimeLocal(newExpiry) }));
        return;
      }
    }
    setPollData(prev => ({ ...prev, durationMinutes: value }));
  };

  const optionNames = pollData.options.map(option => option.trim());
  const validOptionsCount = optionNames.filter(option => option !== "").length;
  const hasBlankOptions = optionNames.some(option => option === "");

  // Mirror onSubmit's validation rules per-field so the UI can show the exact
  // reason the Create button is disabled — both under the button and inline at
  // the offending input — instead of silently blocking.
  const validation = useMemo(() => {
    let startDateReason: string | null = null;
    let endTimeReason: string | null = null;
    let durationReason: string | null = null;

    if (pollData.startMode === "specific") {
      const start = new Date(pollData.startDate);
      if (isNaN(start.getTime())) {
        startDateReason = MSG.invalidStartDate;
      } else if (start.getTime() < Date.now() + START_TIME_BUFFER_SECONDS * 1000) {
        startDateReason = MSG.startLead;
      }

      const expiry = new Date(pollData.expiry);
      if (isNaN(expiry.getTime())) {
        endTimeReason = MSG.invalidEndDate;
      } else if (!isNaN(start.getTime())) {
        if (expiry.getTime() <= start.getTime()) {
          endTimeReason = MSG.endAfterStart;
        } else if (expiry.getTime() - start.getTime() < 60000) {
          endTimeReason = MSG.durationMin;
        }
      }

      const mins = parseInt(pollData.durationMinutes);
      if (isNaN(mins) || mins < 1) {
        durationReason = MSG.durationMin;
      }
    } else if (pollData.endMode === "duration") {
      const mins = parseInt(pollData.durationMinutes);
      if (isNaN(mins) || mins < 1) {
        durationReason = MSG.durationInvalid;
      }
    } else {
      // "now" + specific expiry: effective start is Date.now() + BUFFER, and the
      // on-chain duration must be ≥ 60s, so expiry must be ≥ (BUFFER + 60)s away.
      // The user-facing framing stays "1 minute after the start" (matching the
      // onSubmit toast) since the buffer is an implementation detail.
      const expiry = new Date(pollData.expiry);
      if (isNaN(expiry.getTime())) {
        endTimeReason = MSG.invalidEndDate;
      } else if (expiry.getTime() - Date.now() < (START_TIME_BUFFER_SECONDS + 60) * 1000) {
        endTimeReason = MSG.endAfterStartOneMinute;
      }
    }

    let overall: string | null = null;
    if (validOptionsCount < 2) overall = MSG.needTwoCandidates;
    else if (hasBlankOptions) overall = MSG.blankCandidate;
    else if (pollData.pollType === PollType.NOT_SELECTED) overall = MSG.selectPollType;
    else overall = startDateReason || endTimeReason || durationReason;

    return {
      startDate: startDateReason,
      endTime: endTimeReason,
      duration: durationReason,
      overall,
    };
  }, [pollData, validOptionsCount, hasBlankOptions]);

  const isCreateDisabled = validation.overall !== null;
  const fieldHint = "mt-1 text-xs text-red-500";

  const metadata = JSON.stringify({
    version: 1,
    pollType: pollData.pollType,
    weightCap: pollData.pollType === PollType.WEIGHTED_MULTIPLE_VOTE ? Number(pollData.weightCap) : undefined,
    options: pollData.options.map((option, index) => ({
      name: option.trim(),
      image: pollData.candidateDetails[index]?.image?.trim() || "",
      description: pollData.candidateDetails[index]?.description?.trim() || "",
    })),
  });

  const { writeAsync } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "createPoll",
    args: [undefined, undefined, undefined, undefined, undefined, undefined] as const,
  });

  async function onSubmit() {
    const validOptions = pollData.options.map(o => o.trim()).filter(o => o !== "");
    if (validOptions.length < 2) {
      notification.error(MSG.needTwoCandidates, { showCloseButton: false });
      return;
    }
    for (const option of pollData.options) {
      if (!option.trim()) {
        notification.error(MSG.blankCandidate, { showCloseButton: false });
        return;
      }
    }
    if (pollData.pollType === PollType.NOT_SELECTED) {
      notification.error(MSG.selectPollType, { showCloseButton: false });
      return;
    }

    let startTimestamp: number;
    let durationSeconds: number;

    if (pollData.startMode === "now") {
      // Buffer so the transaction has time to mine before startTime.
      // Without it, block.timestamp > startTimestamp by the time the tx lands.
      startTimestamp = Math.round(Date.now() / 1000) + START_TIME_BUFFER_SECONDS;
      if (pollData.endMode === "duration") {
        const mins = parseInt(pollData.durationMinutes);
        if (isNaN(mins) || mins < 1) {
          notification.error(MSG.durationInvalid, { showCloseButton: false });
          return;
        }
        durationSeconds = mins * 60;
      } else {
        const expiryDate = new Date(pollData.expiry);
        if (isNaN(expiryDate.getTime())) {
          notification.error(MSG.invalidEndDate, { showCloseButton: false });
          return;
        }
        // Compute duration relative to the buffered startTimestamp so the on-chain
        // endTime (startTimestamp + duration) matches the user-selected expiry.
        durationSeconds = Math.round(expiryDate.getTime() / 1000) - startTimestamp;
        if (durationSeconds < 60) {
          notification.error(MSG.endAfterStartOneMinute, { showCloseButton: false });
          return;
        }
      }
    } else {
      const startDate = new Date(pollData.startDate);
      const expiryDate = new Date(pollData.expiry);
      if (isNaN(startDate.getTime())) {
        notification.error(MSG.invalidStartDate, { showCloseButton: false });
        return;
      }
      // Require a minimum lead time so the tx can mine before startTime.
      // Picking a time only a few seconds in the future would otherwise revert.
      if (startDate.getTime() < Date.now() + START_TIME_BUFFER_SECONDS * 1000) {
        notification.error(MSG.startLead, { showCloseButton: false });
        return;
      }
      if (isNaN(expiryDate.getTime())) {
        notification.error(MSG.invalidEndDate, { showCloseButton: false });
        return;
      }
      if (expiryDate.getTime() <= startDate.getTime()) {
        notification.error(MSG.endAfterStart, { showCloseButton: false });
        return;
      }
      durationSeconds = Math.round((expiryDate.getTime() - startDate.getTime()) / 1000);
      if (durationSeconds < 60) {
        notification.error(MSG.durationMin, { showCloseButton: false });
        return;
      }
      startTimestamp = Math.round(startDate.getTime() / 1000);
    }

    if (pollData.pollType === PollType.WEIGHTED_MULTIPLE_VOTE) {
      const parsedWeightCap = Number(pollData.weightCap);
      if (!Number.isInteger(parsedWeightCap) || parsedWeightCap <= 0) {
        notification.error(MSG.weightCapInvalid, { showCloseButton: false });
        return;
      }
    }

    try {
      await writeAsync({
        args: [
          pollData.title,
          optionNames,
          metadata,
          BigInt(startTimestamp),
          BigInt(durationSeconds),
          EMode.NON_QV,
        ] as const,
      });
      refetchPolls();
      setOpen(false);
    } catch (err) {
      console.log(err);
    }
  }

  const tabBtn = (active: boolean) =>
    `px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
      active ? "bg-primary text-primary-content" : "bg-secondary text-neutral hover:bg-secondary/80"
    }`;

  return (
    <Modal show={show} setOpen={setOpen}>
      <div className="mt-3 text-center sm:mt-5 mb-6">
        <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
          Create a Poll
        </Dialog.Title>
      </div>

      {/* Title */}
      <div className="flex justify-between items-center mb-4">
        {isEditingTitle ? (
          <input
            type="text"
            className="border border-gray-300 rounded-md px-4 py-2 w-full focus:outline-none bg-white text-black"
            placeholder="Enter Poll Title"
            value={pollData.title}
            onChange={handleTitleChange}
          />
        ) : (
          <h2 className="text-xl font-semibold font-mono text-neutral-content mb-0 mt-2">{pollData.title}</h2>
        )}
        <label className="btn btn-circle swap swap-rotate ml-3 bg-primary hover:bg-primary-content text-primary-content hover:text-primary">
          <input type="checkbox" onChange={() => setIsEditingTitle(v => !v)} />
          <div className="swap-off fill-current">
            <MdEdit size={25} />
          </div>
          <div className="swap-on fill-current">
            <RxCross2 size={25} />
          </div>
        </label>
      </div>

      {/* Start time */}
      <div className="mb-2 text-neutral-content font-medium">Start time</div>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          className={tabBtn(pollData.startMode === "now")}
          onClick={() => setPollData(prev => ({ ...prev, startMode: "now" }))}
        >
          Start at poll creation
        </button>
        <button
          type="button"
          className={tabBtn(pollData.startMode === "specific")}
          onClick={() => setPollData(prev => ({ ...prev, startMode: "specific" }))}
        >
          Specific start time
        </button>
      </div>
      {pollData.startMode === "specific" && (
        <div className="mb-3">
          <input
            type="datetime-local"
            className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-full focus:outline-none"
            value={pollData.startDate}
            onChange={e => handleStartDateChange(e.target.value)}
          />
          {validation.startDate && <p className={fieldHint}>{validation.startDate}</p>}
        </div>
      )}

      {/* End time */}
      <div className="mb-2 text-neutral-content font-medium">End time</div>
      {pollData.startMode === "now" ? (
        <>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              className={tabBtn(pollData.endMode === "duration")}
              onClick={() => setPollData(prev => ({ ...prev, endMode: "duration" }))}
            >
              Duration
            </button>
            <button
              type="button"
              className={tabBtn(pollData.endMode === "specific")}
              onClick={() => setPollData(prev => ({ ...prev, endMode: "specific" }))}
            >
              Specific end time
            </button>
          </div>
          {pollData.endMode === "duration" ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-32 focus:outline-none"
                  value={pollData.durationMinutes}
                  onChange={e => handleDurationChange(e.target.value)}
                />
                <span className="text-neutral-content">minutes</span>
              </div>
              {validation.duration && <p className={fieldHint}>{validation.duration}</p>}
            </div>
          ) : (
            <div>
              <input
                type="datetime-local"
                className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-full focus:outline-none"
                value={pollData.expiry}
                onChange={e => handleExpiryChange(e.target.value)}
              />
              {validation.endTime && <p className={fieldHint}>{validation.endTime}</p>}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-3">
              <label className="text-neutral-content w-36 shrink-0 text-sm">Duration</label>
              <input
                type="number"
                min={1}
                step={1}
                className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-32 focus:outline-none"
                value={pollData.durationMinutes}
                onChange={e => handleDurationChange(e.target.value)}
              />
              <span className="text-neutral-content text-sm">minutes</span>
            </div>
            {validation.duration && <p className={fieldHint}>{validation.duration}</p>}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <label className="text-neutral-content w-36 shrink-0 text-sm">Specific end time</label>
              <input
                type="datetime-local"
                className="border bg-secondary text-neutral rounded-xl px-4 py-2 flex-1 focus:outline-none"
                value={pollData.expiry}
                onChange={e => handleExpiryChange(e.target.value)}
              />
            </div>
            {validation.endTime && <p className={fieldHint}>{validation.endTime}</p>}
          </div>
        </div>
      )}

      {/* Poll type */}
      <div className="mt-4 mb-2 text-neutral-content">Select the poll type</div>
      <select
        className="select bg-secondary text-neutral w-full rounded-xl"
        value={pollData.pollType}
        onChange={handlePollTypeChange}
      >
        <option disabled value={PollType.NOT_SELECTED}>
          Select Poll Type
        </option>
        <option value={PollType.SINGLE_VOTE}>Single Candidate Select</option>
        <option value={PollType.MULTIPLE_VOTE}>Multiple Candidate Select</option>
        <option value={PollType.WEIGHTED_MULTIPLE_VOTE}>Weighted-Multiple Candidate Select</option>
      </select>

      {pollData.pollType === PollType.WEIGHTED_MULTIPLE_VOTE && (
        <div className="mt-4">
          <div className="mb-2 text-neutral-content">Total weight cap</div>
          <input
            type="number"
            min={1}
            step={1}
            className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-full focus:outline-none"
            value={pollData.weightCap}
            onChange={e => setPollData(prev => ({ ...prev, weightCap: e.target.value }))}
          />
          <p className="mt-1 text-sm text-neutral-content/70">
            Maximum total weight a voter can distribute across all candidates.
          </p>
        </div>
      )}

      <div className="w-full h-[0.5px] bg-[#3647A4] shadow-2xl my-5" />

      <div className="mb-3 text-neutral-content">Create the options</div>

      {pollData.options.map((option, index) => (
        <div key={index} className="mb-4 rounded-xl border border-[#3647A4] p-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 flex flex-col gap-3">
              <input
                type="text"
                className="border border-[#3647A4] bg-white text-black rounded-md px-4 py-2 w-full focus:outline-none"
                placeholder={`Candidate ${index + 1} Name`}
                value={option}
                onChange={e => handleOptionChange(index, e.target.value)}
              />
              <input
                type="text"
                className="border border-[#3647A4] bg-white text-black rounded-md px-4 py-2 w-full focus:outline-none"
                placeholder="Image URL (optional)"
                value={pollData.candidateDetails[index]?.image || ""}
                onChange={e => handleCandidateDetailChange(index, "image", e.target.value)}
              />
              <textarea
                className="border border-[#3647A4] bg-white text-black rounded-md px-4 py-2 w-full focus:outline-none min-h-[80px]"
                placeholder="Description (optional)"
                value={pollData.candidateDetails[index]?.description || ""}
                onChange={e => handleCandidateDetailChange(index, "description", e.target.value)}
              />
            </div>
            {pollData.options.length > 1 && (
              <button
                type="button"
                className="btn btn-outline text-primary hover:bg-primary hover:text-primary-content bg-primary-content"
                onClick={() => removeOptions(index)}
              >
                <RxCross2 size={20} />
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-outline mt-2 text-primary hover:bg-primary hover:text-primary-content bg-primary-content"
        onClick={handleAddOption}
      >
        <LuCross size={20} />
        <span>Add Candidate</span>
      </button>

      <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
        <div className="sm:col-start-2">
          <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-primary text-primary-content px-3 py-2 font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onSubmit}
            disabled={isCreateDisabled}
          >
            Create
          </button>
          {validation.overall && <p className={`${fieldHint} text-center`}>{validation.overall}</p>}
        </div>
        <button
          type="button"
          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
