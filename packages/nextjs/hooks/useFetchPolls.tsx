import { useEffect, useState } from "react";
import { useScaffoldContractRead } from "./scaffold-eth";
import { useChainTimestamp } from "./useChainTimestamp";
import { Poll, PollStatus, RawPoll, getCandidateOptions } from "~~/types/poll";

export function getPollStatus(poll: RawPoll, now = Math.round(new Date().getTime() / 1000)) {
  const currentTime = BigInt(now);

  if (poll.paused && poll.endTime > currentTime && !poll.tallyJsonCID) {
    return PollStatus.PAUSED;
  }

  if (poll.startTime > currentTime) {
    return PollStatus.NOT_STARTED;
  }

  if (poll.endTime > currentTime) {
    return PollStatus.OPEN;
  }

  if (!poll.tallyJsonCID) {
    return PollStatus.CLOSED;
  }

  return PollStatus.RESULT_COMPUTED;
}

export const useFetchPolls = (currentPage = 1, limit = 10, reversed = true) => {
  const [polls, setPolls] = useState<Poll[]>();
  const chainTimestamp = useChainTimestamp();
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

    const now = chainTimestamp ?? Math.round(new Date().getTime() / 1000);
    const _polls: Poll[] = [];

    for (const rawPoll of rawPolls) {
      _polls.push({
        ...rawPoll,
        status: getPollStatus(rawPoll, now),
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
  }, [rawPolls, chainTimestamp]);

  function refetch() {
    return Promise.all([refetchTotalPolls(), refetchPolls()]);
  }

  return { totalPolls: Number(totalPolls || 0n), polls, refetch };
};
