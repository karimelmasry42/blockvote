import { useEffect, useState } from "react";
import { useScaffoldContractRead } from "./scaffold-eth";
import { Poll, PollStatus, RawPoll, getCandidateOptions } from "~~/types/poll";

export function getPollStatus(poll: RawPoll) {
  const now = Math.round(new Date().getTime() / 1000);

  if (poll.paused && poll.endTime > BigInt(now) && !poll.tallyJsonCID) {
    return PollStatus.PAUSED;
  }

  if (poll.startTime > BigInt(now)) {
    return PollStatus.NOT_STARTED;
  }

  if (poll.endTime > BigInt(now)) {
    return PollStatus.OPEN;
  }

  if (!poll.tallyJsonCID) {
    return PollStatus.CLOSED;
  }

  return PollStatus.RESULT_COMPUTED;
}

export const useFetchPolls = (currentPage = 1, limit = 10, reversed = true) => {
  const [polls, setPolls] = useState<Poll[]>();
  const { data: totalPolls, refetch: refetchTotalPolls } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "nextPollId",
  });

  const { data: rawPolls, refetch: refetchPolls } = useScaffoldContractRead({
    contractName: "MACIWrapper",
    functionName: "fetchPolls",
    args: [BigInt(currentPage), BigInt(limit), reversed],
  });

  useEffect(() => {
    if (!rawPolls) {
      setPolls([]);
      return;
    }

    const interval = setInterval(() => {
      const _polls: Poll[] = [];

      for (const rawPoll of rawPolls) {
        _polls.push({
          ...rawPoll,
          status: getPollStatus(rawPoll),
          candidateOptions: getCandidateOptions(rawPoll.metadata, rawPoll.options),
        });
      }

      const sortedPolls = _polls.sort((a, b) => {
        const startDiff = Number(b.startTime) - Number(a.startTime);
        if (startDiff !== 0) {
          return startDiff;
        }
        return Number(b.id) - Number(a.id);
      });
      setPolls(sortedPolls);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [rawPolls]);

  function refetch() {
    refetchTotalPolls();
    refetchPolls();
  }

  return { totalPolls: Number(totalPolls || 0n), polls, refetch };
};
