"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CreatePollModal from "./_components/CreatePollModal";
import EditPollNameModal from "./_components/EditPollNameModal";
import PollStatusModal from "./_components/PollStatusModal";
import { useAccount } from "wagmi";
import Paginator from "~~/components/Paginator";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { useFetchPolls } from "~~/hooks/useFetchPolls";
import { useTotalPages } from "~~/hooks/useTotalPages";
import { Poll, PollStatus } from "~~/types/poll";
import { notification } from "~~/utils/scaffold-eth";

const EDIT_NAME_WINDOW_SECONDS = 5 * 60;

export default function AdminPage() {
  const router = useRouter();
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { isOwner, isOwnerLoading } = useAuthContext();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const [openCreatePollModal, setOpenCreatePollModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [selectedPollForStatusModal, setSelectedPollForStatusModal] = useState<Poll>();
  const [selectedPollForNameModal, setSelectedPollForNameModal] = useState<Poll>();
  const [closingPollId, setClosingPollId] = useState<bigint | null>(null);
  const [locallyClosedPollIds, setLocallyClosedPollIds] = useState<Set<string>>(new Set());

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

  const ownerLoaded = !isOwnerLoading;
  const walletLoaded = !isConnecting && !isReconnecting;

  useEffect(() => {
    if (!ownerLoaded || !walletLoaded) return;

    if (!isConnected || !address || !isOwner) {
      router.replace("/polls");
    }
  }, [ownerLoaded, walletLoaded, isConnected, address, isOwner, router]);
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

    setClosingPollId(pollId);

    try {
      await closePoll({ args: [pollId] });

      notification.success("Poll closed");

      setLocallyClosedPollIds(prev => {
        const next = new Set(prev);
        next.add(pollId.toString());
        return next;
      });

      await refetchPolls();

      setLocallyClosedPollIds(prev => {
        if (!prev.has(pollId.toString())) return prev;
        const next = new Set(prev);
        next.delete(pollId.toString());
        return next;
      });
    } catch (err) {
      console.error(err);
      notification.error("Failed to close poll");
    } finally {
      setClosingPollId(null);
    }
  };
  if (!ownerLoaded || !walletLoaded) {
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
              {polls.map(poll => {
                const isLocallyClosed = locallyClosedPollIds.has(poll.id.toString());
                const effectiveStatus = isLocallyClosed ? PollStatus.CLOSED : poll.status;
                const editWindowOpen = now < Number(poll.createdAt) + EDIT_NAME_WINDOW_SECONDS;
                const canEditName =
                  editWindowOpen &&
                  effectiveStatus !== PollStatus.CLOSED &&
                  effectiveStatus !== PollStatus.RESULT_COMPUTED;

                return (
                  <tr key={poll.id.toString()}>
                    <td className="border border-slate-600 py-2 px-1 text-sm text-center">{poll.id.toString()}</td>

                    <td className="border border-slate-600 py-2 px-1 text-sm">{poll.name}</td>

                    <td className="border border-slate-600 py-2 px-1 text-sm text-center">
                      {new Date(Number(poll.startTime) * 1000).toLocaleString()}
                    </td>

                    <td className="border border-slate-600 py-2 px-1 text-sm text-center">
                      {new Date(Number(poll.endTime) * 1000).toLocaleString()}
                    </td>

                    <td className="border border-slate-600 py-2 px-1 text-sm text-center">{effectiveStatus}</td>

                    <td className="border border-slate-600 py-2 px-1 text-sm">
                      <div className="flex flex-wrap justify-center gap-2">
                        {canEditName && closingPollId !== poll.id && (
                          <button
                            type="button"
                            onClick={() => setSelectedPollForNameModal(poll)}
                            className="rounded-md bg-yellow-500 px-4 py-2 font-semibold text-white hover:bg-yellow-600"
                          >
                            Edit Name
                          </button>
                        )}
                        {closingPollId === poll.id ? (
                          <button
                            type="button"
                            disabled
                            className="rounded-md bg-gray-500 px-4 py-2 font-semibold text-white cursor-not-allowed"
                          >
                            Closing...
                          </button>
                        ) : effectiveStatus === PollStatus.OPEN ? (
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
                        ) : effectiveStatus === PollStatus.PAUSED ? (
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
                        ) : effectiveStatus === PollStatus.CLOSED ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPollForStatusModal(poll)}
                            className="rounded-md bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/80"
                          >
                            Upload tally file
                          </button>
                        ) : effectiveStatus === PollStatus.RESULT_COMPUTED ? (
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
                );
              })}
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
