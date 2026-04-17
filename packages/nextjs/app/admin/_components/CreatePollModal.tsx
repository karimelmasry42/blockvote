"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { LuCross } from "react-icons/lu";
import { MdEdit } from "react-icons/md";
import { RxCross2 } from "react-icons/rx";
import Modal from "~~/components/Modal";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { CandidateOption, EMode, PollType } from "~~/types/poll";
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

export default function Example({
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
    startDate: formatDateTimeLocal(now),
    expiry: formatDateTimeLocal(defaultExpiry),
    pollType: PollType.NOT_SELECTED,
    mode: EMode.QV,
    options: [{ name: "", image: "", description: "" }] as CandidateOption[],
  });

  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  const handleAddOption = () => {
    setPollData(prev => ({
      ...prev,
      options: [...prev.options, { name: "", image: "", description: "" }],
    }));
  };

  const handlePollTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pollType = parseInt(e.target.value);
    setPollData(prev => ({
      ...prev,
      pollType,
      mode: pollType === PollType.SINGLE_VOTE ? EMode.NON_QV : prev.mode,
    }));
  };

  const handleOptionChange = (
    index: number,
    field: keyof CandidateOption,
    value: string,
  ) => {
    setPollData(prev => ({
      ...prev,
      options: prev.options.map((option, i) =>
        i === index ? { ...option, [field]: value } : option,
      ),
    }));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPollData(prev => ({ ...prev, title: e.target.value }));
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPollData(prev => ({
      ...prev,
      mode: e.target.value === "0" ? EMode.QV : EMode.NON_QV,
    }));
  };

  const handleEditTitleClick = () => {
    setIsEditingTitle(true);
  };

  const handleSaveTitleClick = () => {
    setIsEditingTitle(false);
  };

  function removeOptions(index: number): void {
    setPollData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }

  const startDateObj = useMemo(
    () => (pollData.startDate ? new Date(pollData.startDate) : null),
    [pollData.startDate],
  );

  const expiryDateObj = useMemo(
    () => (pollData.expiry ? new Date(pollData.expiry) : null),
    [pollData.expiry],
  );

  const isStartDateValid = !!startDateObj && !Number.isNaN(startDateObj.getTime());
  const isExpiryDateValid = !!expiryDateObj && !Number.isNaN(expiryDateObj.getTime());

  const startTimestamp = isStartDateValid
    ? Math.round(startDateObj.getTime() / 1000)
    : null;

  const duration =
    isStartDateValid && isExpiryDateValid
      ? Math.round((expiryDateObj.getTime() - startDateObj.getTime()) / 1000)
      : null;

  const optionNames = pollData.options.map(option => option.name.trim());

  const metadata = JSON.stringify({
    version: 1,
    pollType: pollData.pollType,
    options: pollData.options.map(option => ({
      name: option.name.trim(),
      image: option.image?.trim() || "",
      description: option.description?.trim() || "",
    })),
  });

  const createPollArgs =
    startTimestamp !== null && duration !== null
      ? [
          pollData.title,
          optionNames,
          metadata,
          BigInt(startTimestamp),
          BigInt(duration),
          pollData.mode,
        ]
      : undefined;

  const { writeAsync } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "createPoll",
    args: createPollArgs as any,
  });

  async function onSubmit() {
    for (const option of pollData.options) {
      if (!option.name.trim()) {
        notification.error("Candidate name cannot be blank", { showCloseButton: false });
        return;
      }
    }

    if (!isStartDateValid) {
      notification.error("Please enter a valid start date", { showCloseButton: false });
      return;
    }

    if (!isExpiryDateValid) {
      notification.error("Please enter a valid expiry date", { showCloseButton: false });
      return;
    }

    if (startTimestamp === null || duration === null) {
      notification.error("Invalid poll time configuration", { showCloseButton: false });
      return;
    }

    if (startDateObj.getTime() < Date.now() - 5000) {
      notification.error("Start date must be now or in the future", { showCloseButton: false });
      return;
    }

    if (expiryDateObj.getTime() <= startDateObj.getTime()) {
      notification.error("Expiry date must be after the start date", { showCloseButton: false });
      return;
    }

    if (duration < 60) {
      notification.error("Expiry cannot be before atleast 1 min of creation", { showCloseButton: false });
      return;
    }

    if (pollData.pollType === PollType.NOT_SELECTED) {
      notification.error("Please select a poll type", { showCloseButton: false });
      return;
    }

    try {
      await writeAsync();
      refetchPolls();
      setOpen(false);
    } catch (err) {
      console.log(err);
    }
  }

  return (
    <Modal show={show} setOpen={setOpen}>
      <div className="mt-3 text-center sm:mt-5 mb-6">
        <Dialog.Title as="h3" className="font-bold leading-6 text-2xl text-neutral-content">
          Create a Poll
        </Dialog.Title>
      </div>

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
          <h2 className="text-xl font-semibold font-mono text-neutral-content mb-0 mt-2">
            {pollData.title}
          </h2>
        )}

        <label className="btn btn-circle swap swap-rotate ml-3 bg-primary hover:bg-primary-content text-primary-content hover:text-primary">
          <input
            type="checkbox"
            onChange={() => {
              if (isEditingTitle) {
                handleSaveTitleClick();
              } else {
                handleEditTitleClick();
              }
            }}
          />

          <div className="swap-off fill-current">
            <MdEdit size={25} />
          </div>

          <div className="swap-on fill-current">
            <RxCross2 size={25} />
          </div>
        </label>
      </div>

      <div className="mb-2 text-neutral-content">Select the start date</div>
      <input
        type="datetime-local"
        className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-full focus:outline-none"
        value={pollData.startDate}
        onChange={e => setPollData(prev => ({ ...prev, startDate: e.target.value }))}
      />

      <div className="mt-3 mb-2 text-neutral-content">Select the expiry date</div>
      <input
        type="datetime-local"
        className="border bg-secondary text-neutral rounded-xl px-4 py-2 w-full focus:outline-none"
        value={pollData.expiry}
        onChange={e => setPollData(prev => ({ ...prev, expiry: e.target.value }))}
      />

      <div className="mt-3 mb-2 text-neutral-content">Select the poll type</div>
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

      <div className="mt-3 mb-2 text-neutral-content">Quadratic Vote or Non Quadratic Vote</div>
      <select
        className="select bg-secondary text-neutral w-full rounded-xl"
        value={pollData.mode}
        onChange={handleModeChange}
        disabled={pollData.pollType === PollType.SINGLE_VOTE}
      >
        <option value={EMode.QV}>Quadratic Vote</option>
        <option value={EMode.NON_QV}>Non Quadratic Vote</option>
      </select>

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
                value={option.name}
                onChange={e => handleOptionChange(index, "name", e.target.value)}
              />

              <input
                type="text"
                className="border border-[#3647A4] bg-white text-black rounded-md px-4 py-2 w-full focus:outline-none"
                placeholder="Image URL (optional)"
                value={option.image || ""}
                onChange={e => handleOptionChange(index, "image", e.target.value)}
              />

              <textarea
                className="border border-[#3647A4] bg-white text-black rounded-md px-4 py-2 w-full focus:outline-none min-h-[80px]"
                placeholder="Description (optional)"
                value={option.description || ""}
                onChange={e => handleOptionChange(index, "description", e.target.value)}
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
        className="btn btn-outline mt-2 text-primary hover:bg-primary hover:text-primary-content bg-primary-content"
        onClick={handleAddOption}
      >
        <LuCross size={20} />
        <span>Add Candidate</span>
      </button>

      <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
        <button
          type="button"
          className="inline-flex w-full justify-center rounded-md bg-primary text-primary-content px-3 py-2 font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2"
          onClick={onSubmit}
        >
          Create
        </button>

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