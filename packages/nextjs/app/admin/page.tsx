"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CreatePollModal from "./_components/CreatePollModal";
import EditPollNameModal from "./_components/EditPollNameModal";
import PollStatusModal from "./_components/PollStatusModal";
import { MdEdit } from "react-icons/md";
import { useAccount } from "wagmi";
import Paginator from "~~/components/Paginator";
import { useScaffoldContractRead, useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { useFetchPolls } from "~~/hooks/useFetchPolls";
import { useTotalPages } from "~~/hooks/useTotalPages";
import { Poll, PollStatus } from "~~/types/poll";
import { notification } from "~~/utils/scaffold-eth";

export default function AdminPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [openCreatePollModal, setOpenCreatePollModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [selectedPollForStatusModal, setSelectedPollForStatusModal] = useState<Poll>();
  const [selectedPollForNameModal, setSelectedPollForNameModal] = useState<Poll>();

  const { data: admin } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "owner",
  });

  const { totalPolls, polls, refetch: refetchPolls } = useFetchPolls(currentPage, limit);
  const totalPages = useTotalPages(totalPolls, limit);

  const { writeAsync: pausePoll, isMining: isPausing } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "pausePoll" as const,
    args: [0n],
  });

  const { writeAsync: resumePoll, isMining: isResuming } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "resumePoll" as const,
    args: [0n],
  });

  const { writeAsync: closePoll, isMining: isClosing } = useScaffoldContractWrite({
    contractName: "MACIWrapper",
    functionName: "closePoll" as const,
    args: [0n],
  });

  const EDIT_WINDOW_MS = 5 * 60 * 1000;
  const canEditPollName = (poll: Poll) => Date.now() < Number(poll.startTime) * 1000 + EDIT_WINDOW_MS;

  const ownerLoaded = admin !== undefined;
  const isOwner = useMemo(() => {
    if (!address || !admin) return false;
    return address.toLowerCase() === String(admin).toLowerCase();
  }, [address, admin]);

  useEffect(() => {
    if (!ownerLoaded) return;

    if (!isConnected || !address) {
      router.replace("/");
      return;
    }

    if (!isOwner) {
      router.replace("/");
    }
  }, [ownerLoaded, isConnected, address, isOwner, router]);

  const handlePausePoll = async (pollId: bigint) => {
    try {
      await pausePoll({ args: [pollId] });
      notification.success("Poll paused");
      refetchPolls();
    } catch (err) {
      console.error(err);
      notification.error("Failed to pause poll");
    }
  };

  const handleResumePoll = async (pollId: bigint) => {
    try {
      await resumePoll({ args: [pollId] });
      notification.success("Poll resumed");
      refetchPolls();
    } catch (err) {
      console.error(err);
      notification.error("Failed to resume poll");
    }
  };

 const handleClosePoll = async (pollId: bigint) => {
  if (!confirm("Close this poll now? This action cannot be undone.")) {
    return;
  }

  try {
    await closePoll({ args: [pollId] });

    notification.success("Close transaction submitted");

    await new Promise(resolve => setTimeout(resolve, 2000));

    await refetchPolls();
  } catch (err) {
    console.error(err);
    notification.error("Failed to close poll");
  }
};
  if (!ownerLoaded) {
    return <div className="container mx-auto pt-10">Loading...</div>;
  }

  if (!isConnected || !address || !isOwner) {
    return null;
  }

  return (
    <div className="container mx-auto pt-10">
      <div className="flex">
        <div className="flex-1 text-2xl">Polls</div>
        <button
          className="border border-slate-600 bg-primary px-3 py-2 rounded-lg font-bold"
          onClick={() => setOpenCreatePollModal(true)}
        >
          Create Poll
        </button>
      </div>

      {polls && polls.length !== 0 ? (
        <>
          <table className="border-separate w-full mt-7 mb-4">
            <thead>
              <tr className="text-lg font-extralight">
                <th className="border border-slate-600 bg-primary">Poll ID</th>
                <th className="border border-slate-600 bg-primary">Poll Name</th>
                <th className="border border-slate-600 bg-primary">Start Time</th>
                <th className="border border-slate-600 bg-primary">End Time</th>
                <th className="border border-slate-600 bg-primary">Status</th>
                <th className="border border-slate-600 bg-primary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {polls.map(poll => (
                <tr key={poll.id.toString()} className="pt-10 text-center">
                  <td className="border border-slate-600 py-2 px-1 text-sm font-medium">{poll.id.toString()}</td>
                  <td>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-center gap-2">
                        <span>{poll.name}</span>
                        {canEditPollName(poll) && (
                          <button
                            className="btn btn-circle btn-ghost btn-sm"
                            onClick={() => setSelectedPollForNameModal(poll)}
                          >
                            <MdEdit size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {poll.candidateOptions?.slice(0, 3).map((candidate, index) => (
                          <div key={index} className="flex items-center gap-2 bg-primary rounded-lg px-2 py-1">
                            <Image
                              src={candidate.image || "/default-candidate.png"}
                              alt={candidate.name}
                              width={24}
                              height={24}
                              className="rounded-full object-cover border border-slate-400"
                              unoptimized
                            />
                            <span className="text-xs">{candidate.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td>{new Date(Number(poll.startTime) * 1000).toLocaleString()}</td>
                  <td>{new Date(Number(poll.endTime) * 1000).toLocaleString()}</td>
                  <td>
                    {poll.status === PollStatus.RESULT_COMPUTED ? (
  <>
                        {poll.status}{" "}
                        <Link href={`/poll/${poll.id}`} className="text-blue-600 underline">
                          (View Results)
                        </Link>
                      </>
                    ) : (
                      poll.status
                    )}
                  </td>
                  <td className="border border-slate-600 py-2 px-1 text-sm">
                    <div className="flex flex-wrap justify-center gap-2">
                     {poll.status === PollStatus.OPEN ? (
  <>
    <button
      type="button"
      onClick={() => handlePausePoll(poll.id)}
      disabled={isPausing || isClosing}
      className="rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Pause
    </button>

    <button
      type="button"
      onClick={() => handleClosePoll(poll.id)}
      disabled={isClosing}
      className="ml-2 rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Close
    </button>
  </>
) : poll.status === PollStatus.PAUSED ? (
  <>
    <button
      type="button"
      onClick={() => handleResumePoll(poll.id)}
      disabled={isResuming || isClosing}
      className="rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Resume
    </button>

    <button
      type="button"
      onClick={() => handleClosePoll(poll.id)}
      disabled={isClosing}
      className="ml-2 rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Close
    </button>
  </>
) : poll.status === PollStatus.CLOSED ? (
  <button
    type="button"
    onClick={() => setSelectedPollForStatusModal(poll)}
    className="rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/80"
  >
    Upload tally file
  </button>
) : poll.status === PollStatus.RESULT_COMPUTED ? (
  <Link
    href={`/poll/${poll.id}`}
    className="rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/80"
  >
    View Results
  </Link>
) : (
  <span className="text-sm opacity-70">No actions available</span>
)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <Paginator currentPage={currentPage} totalPages={totalPages} setPageNumber={setCurrentPage} />
          )}
        </>
      ) : (
        <div>No polls found</div>
      )}

      <CreatePollModal refetchPolls={refetchPolls} show={openCreatePollModal} setOpen={setOpenCreatePollModal} />

      <PollStatusModal
        poll={selectedPollForStatusModal}
        setOpen={() => setSelectedPollForStatusModal(undefined)}
        show={Boolean(selectedPollForStatusModal)}
      />

      <EditPollNameModal
        poll={selectedPollForNameModal}
        setOpen={() => setSelectedPollForNameModal(undefined)}
        show={Boolean(selectedPollForNameModal)}
        refetchPolls={refetchPolls}
      />
    </div>
  );
}
