"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { genRandomSalt } from "maci-crypto";
import { Keypair, PCommand, PubKey } from "maci-domainobjs";
import { isAddress } from "viem";
import { useContractRead, useContractWrite } from "wagmi";
import PollAbi from "~~/abi/Poll";
import VoteCard from "~~/components/card/VoteCard";
import { useAuthContext } from "~~/contexts/AuthContext";
import { useChainTimestamp } from "~~/hooks/useChainTimestamp";
import { useFetchPoll } from "~~/hooks/useFetchPoll";
import { getPollStatus } from "~~/hooks/useFetchPolls";
import scaffoldConfig from "~~/scaffold.config";
import {
  CandidateOption,
  DEFAULT_CANDIDATE_IMAGE,
  PollStatus,
  PollType,
  getCandidateOptions,
  getPollWeightCap,
} from "~~/types/poll";
import { getDataFromPinata } from "~~/utils/pinata";
import { notification } from "~~/utils/scaffold-eth";
import { getParsedError } from "~~/utils/scaffold-eth/getParsedError";

export default function PollDetail({ id }: { id: bigint }) {
  const { data: poll, error, isLoading } = useFetchPoll(id);
  const [pollType, setPollType] = useState(PollType.NOT_SELECTED);

  const { keypair, stateIndex } = useAuthContext();

  const [votes, setVotes] = useState<{ index: number; votes: number }[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [isVotesInvalid, setIsVotesInvalid] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<{ candidate: CandidateOption; votes: number }[] | null>(null);
  const [status, setStatus] = useState<PollStatus>();
  const [voted, setVoted] = useState<boolean>(false);
  const [voting, setVoting] = useState<boolean>(false);
  const chainTimestamp = useChainTimestamp();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [initialVotes, setInitialVotes] = useState<{ index: number; votes: number }[]>([]);
  const [initialSelectedIndexes, setInitialSelectedIndexes] = useState<number[]>([]);

  const isAnyInvalid = Object.values(isVotesInvalid).some(v => v);

  const candidateOptions = useMemo(() => (poll ? getCandidateOptions(poll.metadata, poll.options) : []), [poll]);

  const weightCap = useMemo(() => {
    if (!poll) return 100;
    return getPollWeightCap(poll.metadata, 100);
  }, [poll]);

  const usedWeight = useMemo(() => votes.reduce((sum, vote) => sum + vote.votes, 0), [votes]);
  const remainingWeight = useMemo(() => weightCap - usedWeight, [weightCap, usedWeight]);

  const getVoteStorageKey = (pollId: bigint, voterIndex: bigint, pollAddress?: string, createdAt?: bigint) => {
    const chainId = scaffoldConfig.targetNetworks[0].id;
    return `poll-vote:${chainId}:${createdAt?.toString() || "?"}:${
      pollAddress?.toLowerCase() || "unknown"
    }:${pollId.toString()}:${voterIndex.toString()}`;
  };

  const validateVotes = (voteList: { index: number; votes: number }[]) => {
    if (pollType === PollType.WEIGHTED_MULTIPLE_VOTE) {
      let totalVotes = 0;

      for (const vote of voteList) {
        if (!Number.isInteger(vote.votes) || !Number.isFinite(vote.votes)) {
          return { valid: false, reason: "Please enter integer weight values only." };
        }

        if (vote.votes < 0 || vote.votes > weightCap) {
          return {
            valid: false,
            reason: `Each candidate weight must be between 0 and ${weightCap}.`,
          };
        }

        totalVotes += vote.votes;
        if (totalVotes > weightCap) {
          return {
            valid: false,
            reason: `Total allocated weight must be ${weightCap} or less.`,
          };
        }
      }

      return { valid: true, reason: "" };
    }

    for (const vote of voteList) {
      if (vote.votes !== 0 && vote.votes !== 1) {
        return { valid: false, reason: "Each vote must be 0 or 1." };
      }
    }

    return { valid: true, reason: "" };
  };

  function normalizeVotes(voteList: { index: number; votes: number }[]) {
    return [...voteList]
      .filter(v => v.votes > 0)
      .sort((a, b) => a.index - b.index)
      .map(v => `${v.index}:${v.votes}`)
      .join("|");
  }

  function isSameVote(current: { index: number; votes: number }[], previous: { index: number; votes: number }[]) {
    return normalizeVotes(current) === normalizeVotes(previous);
  }

  const cancelChanges = useCallback(() => {
    setVotes(initialVotes);
    setSelectedIndexes(initialSelectedIndexes);
    setIsVotesInvalid({});
    setVoted(true);
    setIsEditing(false);
  }, [initialVotes, initialSelectedIndexes]);

  useEffect(() => {
    if (!poll) {
      return;
    }

    if (stateIndex == null) {
      setVotes([]);
      setSelectedIndexes([]);
      setInitialVotes([]);
      setInitialSelectedIndexes([]);
      setVoted(false);
      setIsEditing(false);
      return;
    }

    const storageKey = getVoteStorageKey(poll.id, stateIndex, poll.pollContracts.poll, poll.createdAt);
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      setVotes([]);
      setSelectedIndexes([]);
      setInitialVotes([]);
      setInitialSelectedIndexes([]);
      setVoted(false);
      setIsEditing(false);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as {
        votes: { index: number; votes: number }[];
        pollName?: string;
        optionNames?: string[];
      };

      const samePollName = parsed?.pollName === poll.name;
      const sameOptions =
        Array.isArray(parsed?.optionNames) &&
        parsed.optionNames.length === poll.options.length &&
        parsed.optionNames.every((name, index) => name === poll.options[index]);

      if (Array.isArray(parsed?.votes) && parsed.votes.length > 0 && samePollName && sameOptions) {
        setVotes(parsed.votes);
        setSelectedIndexes(parsed.votes.map(v => v.index));
        setInitialVotes(parsed.votes);
        setInitialSelectedIndexes(parsed.votes.map(v => v.index));
        setVoted(true);
      } else {
        window.localStorage.removeItem(storageKey);
        setVotes([]);
        setSelectedIndexes([]);
        setInitialVotes([]);
        setInitialSelectedIndexes([]);
        setVoted(false);
        setIsEditing(false);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
      setVotes([]);
      setSelectedIndexes([]);
      setInitialVotes([]);
      setInitialSelectedIndexes([]);
      setVoted(false);
      setIsEditing(false);
    }
  }, [poll, stateIndex]);

  useEffect(() => {
    if (!poll || !poll.metadata) {
      return;
    }

    try {
      const { pollType } = JSON.parse(poll.metadata);
      setPollType(pollType);
    } catch (err) {
      console.error("[poll-detail] Failed to parse poll metadata:", err);
    }

    if (poll.tallyJsonCID) {
      (async () => {
        try {
          const {
            results: { tally },
          } = await getDataFromPinata(poll.tallyJsonCID);

          if (poll.options.length > tally.length) {
            throw new Error("Invalid tally data");
          }

          const tallyCounts: number[] = tally.map((v: string) => Number(v)).slice(0, poll.options.length);
          const resultRows: { candidate: CandidateOption; votes: number }[] = [];

          for (let i = 0; i < poll.options.length; i++) {
            const candidate = candidateOptions[i] || {
              name: poll.options[i],
              image: "",
              description: "",
            };

            resultRows.push({
              candidate,
              votes: tallyCounts[i],
            });
          }

          resultRows.sort((a, b) => b.votes - a.votes);
          setResult(resultRows);
        } catch (err) {
          console.error("[poll-detail] Failed to fetch tally from IPFS:", err);
          notification.error("Failed to load poll results from IPFS");
        }
      })();
    } else {
      setResult(null);
    }

    const now = chainTimestamp ?? Math.round(new Date().getTime() / 1000);
    setStatus(getPollStatus(poll, now));
  }, [poll, candidateOptions, chainTimestamp]);

  const rawPollAddress = poll?.pollContracts.poll;
  const pollAddress = rawPollAddress && isAddress(rawPollAddress) ? (rawPollAddress as `0x${string}`) : undefined;

  const { data: coordinatorPubKeyResult } = useContractRead({
    abi: PollAbi,
    address: pollAddress,
    functionName: "coordinatorPubKey",
    enabled: Boolean(pollAddress),
  });

  const { writeAsync: publishMessage } = useContractWrite({
    abi: PollAbi,
    address: pollAddress,
    functionName: "publishMessage",
  });

  const { writeAsync: publishMessageBatch } = useContractWrite({
    abi: PollAbi,
    address: pollAddress,
    functionName: "publishMessageBatch",
  });

  const [coordinatorPubKey, setCoordinatorPubKey] = useState<PubKey>();

  useEffect(() => {
    if (!coordinatorPubKeyResult) {
      return;
    }

    const coordinatorPubKey_ = new PubKey([
      BigInt((coordinatorPubKeyResult as any)[0].toString()),
      BigInt((coordinatorPubKeyResult as any)[1].toString()),
    ]);

    setCoordinatorPubKey(coordinatorPubKey_);
  }, [coordinatorPubKeyResult]);

  const castVote = async () => {
    if (!poll || stateIndex == null || !coordinatorPubKey || !keypair) {
      notification.error("Error casting vote. Please refresh the page and try again.");
      return;
    }
    const currentPoll = poll;
    const currentStateIndex = stateIndex;
    const currentCoordinatorPubKey = coordinatorPubKey;
    const currentKeypair = keypair;

    if (isAnyInvalid) {
      notification.error("Please enter a valid number of votes");
      return;
    }

    if (votes.length === 0) {
      notification.error("Please select at least one option to vote");
      return;
    }

    if (initialVotes.length > 0 && isSameVote(votes, initialVotes)) {
      notification.info("Already voted for this candidate");
      setVoted(true);
      setIsEditing(false);
      return;
    }

    const validation = validateVotes(votes);
    if (!validation.valid) {
      notification.error(validation.reason);
      return;
    }

    if (status !== PollStatus.OPEN) {
      notification.error("Voting is closed for this poll");
      return;
    }

    async function attemptVote() {
      const votesToMessage = votes.map((v, i) =>
        getMessageAndEncKeyPair(
          currentStateIndex,
          currentPoll.id,
          BigInt(v.index),
          BigInt(v.votes),
          BigInt(votes.length - i),
          currentCoordinatorPubKey,
          currentKeypair,
        ),
      );

      if (votesToMessage.length === 1) {
        await publishMessage({
          args: [
            votesToMessage[0].message.asContractParam() as unknown as {
              data: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
            },
            votesToMessage[0].encKeyPair.pubKey.asContractParam() as unknown as { x: bigint; y: bigint },
          ],
        });
      } else {
        await publishMessageBatch({
          args: [
            votesToMessage.map(
              v =>
                v.message.asContractParam() as unknown as {
                  data: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
                },
            ),
            votesToMessage.map(v => v.encKeyPair.pubKey.asContractParam() as { x: bigint; y: bigint }),
          ],
        });
      }

      notification.success("Vote casted successfully");

      const storageKey = getVoteStorageKey(
        currentPoll.id,
        currentStateIndex,
        currentPoll.pollContracts.poll,
        currentPoll.createdAt,
      );
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          votes,
          pollName: currentPoll.name,
          optionNames: [...currentPoll.options],
        }),
      );

      setInitialVotes(votes);
      setInitialSelectedIndexes(votes.map(v => v.index));
      setVoted(true);
      setIsEditing(false);
    }

    setVoting(true);

    try {
      await attemptVote();
    } catch (err: any) {
      console.log("err", err);
      notification.error(getParsedError(err));
    } finally {
      setVoting(false);
    }
  };

  function getMessageAndEncKeyPair(
    currentStateIndex: bigint,
    pollIndex: bigint,
    candidateIndex: bigint,
    weight: bigint,
    nonce: bigint,
    currentCoordinatorPubKey: PubKey,
    currentKeypair: Keypair,
  ) {
    const command: PCommand = new PCommand(
      currentStateIndex,
      currentKeypair.pubKey,
      candidateIndex,
      weight,
      nonce,
      pollIndex,
      genRandomSalt(),
    );

    const signature = command.sign(currentKeypair.privKey);
    const encKeyPair = new Keypair();
    const message = command.encrypt(signature, Keypair.genEcdhSharedKey(encKeyPair.privKey, currentCoordinatorPubKey));

    return { message, encKeyPair };
  }

  const voteUpdated = useCallback(
    (index: number, checked: boolean, voteCounts: number) => {
      if (pollType === PollType.SINGLE_VOTE) {
        setSelectedIndexes(checked ? [index] : []);
        setVotes(checked ? [{ index, votes: voteCounts }] : []);
        return;
      }

      setSelectedIndexes(prev =>
        checked
          ? [...prev.filter(selectedIndex => selectedIndex !== index), index]
          : prev.filter(selectedIndex => selectedIndex !== index),
      );

      if (checked) {
        if (pollType === PollType.WEIGHTED_MULTIPLE_VOTE && voteCounts <= 0) {
          setVotes(prev => prev.filter(v => v.index !== index));
          return;
        }

        setVotes(prev => [...prev.filter(v => v.index !== index), { index, votes: voteCounts }]);
      } else {
        setVotes(prev => prev.filter(v => v.index !== index));
      }
    },
    [pollType],
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Poll not found</div>;

  return (
    <div className="container mx-auto pt-10">
      <div className="flex h-full flex-col md:w-2/3 lg:w-1/2 mx-auto">
        <div className="my-5">
          <div className="flex flex-row items-center gap-3">
            <div className="text-2xl font-bold">
              Vote for {poll?.name}
              {status === PollStatus.CLOSED && " (Closed)"}
              {status === PollStatus.NOT_STARTED && " (Not Started)"}
              {status === PollStatus.PAUSED && " (Paused)"}
            </div>

            {!voted && pollType === PollType.WEIGHTED_MULTIPLE_VOTE && status === PollStatus.OPEN && (
              <div className="text-sm font-semibold text-neutral-content">Total weight cap: {weightCap}</div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-1 text-sm opacity-80">
            <div>
              <span className="font-semibold">Start:</span>{" "}
              {poll ? new Date(Number(poll.startTime) * 1000).toLocaleString() : "-"}
            </div>
            <div>
              <span className="font-semibold">End:</span>{" "}
              {poll ? new Date(Number(poll.endTime) * 1000).toLocaleString() : "-"}
            </div>
          </div>

          {pollType === PollType.WEIGHTED_MULTIPLE_VOTE && status === PollStatus.OPEN && !voted && (
            <div className="mt-3 text-sm opacity-80">
              Used weight: {usedWeight} / {weightCap} · Remaining: {remainingWeight}
            </div>
          )}

          {status === PollStatus.NOT_STARTED && (
            <div className="mt-4 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm font-medium">
              Voting hasn&apos;t started yet. Please come back when the poll opens.
            </div>
          )}
          {status === PollStatus.PAUSED && (
            <div className="mt-4 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm font-medium">
              Voting has been paused by the admin. Please wait until it is resumed.
            </div>
          )}
        </div>

        {voted ? (
          <div>
            <p className="font-bold">Voted:</p>

            {pollType === PollType.SINGLE_VOTE && votes.length > 0 ? (
              <div className="bg-primary w-full px-6 py-6 rounded-xl mb-2 flex flex-col items-center text-center gap-3">
                <Image
                  src={candidateOptions[votes[0].index]?.image || DEFAULT_CANDIDATE_IMAGE}
                  alt={
                    (candidateOptions[votes[0].index]?.name || poll?.options?.[votes[0].index] || "Candidate") as string
                  }
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-full object-cover border border-slate-400"
                  unoptimized
                />

                <div className="text-sm opacity-80">You voted for</div>

                <div className="text-2xl font-bold">
                  {candidateOptions[votes[0].index]?.name || poll?.options[votes[0].index]}
                </div>

                {candidateOptions[votes[0].index]?.description ? (
                  <div className="text-sm opacity-80 max-w-md whitespace-pre-wrap">
                    {candidateOptions[votes[0].index]?.description}
                  </div>
                ) : null}
              </div>
            ) : (
              <ul>
                {votes.map(vote => {
                  const candidate = candidateOptions[vote.index];

                  return (
                    <li
                      key={vote.index}
                      className="bg-primary flex w-full px-3 py-3 rounded-lg mb-2 items-center gap-3"
                    >
                      <Image
                        src={candidate?.image || DEFAULT_CANDIDATE_IMAGE}
                        alt={(candidate?.name || poll?.options?.[vote.index] || "Candidate") as string}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-full object-cover border border-slate-400 shrink-0"
                        unoptimized
                      />
                      <div className="flex-1">
                        <div className="font-semibold">{candidate?.name || poll?.options[vote.index]}</div>
                        {candidate?.description ? (
                          <div className="text-sm opacity-80 mt-1 whitespace-pre-wrap">{candidate.description}</div>
                        ) : null}
                      </div>
                      <div className="font-semibold">{vote.votes} votes</div>
                    </li>
                  );
                })}
              </ul>
            )}

            {status === PollStatus.OPEN && (
              <div className="mt-2 shadow-2xl">
                <button
                  onClick={() => {
                    setInitialVotes(votes);
                    setInitialSelectedIndexes(selectedIndexes);
                    setVoted(false);
                    setIsEditing(true);
                  }}
                  className="hover:border-black border-2 border-accent w-full text-lg text-center bg-accent py-3 rounded-xl font-bold mt-4"
                >
                  Change Vote
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {candidateOptions.map((candidate, index) => (
              <div className="pb-5 flex" key={index}>
                <VoteCard
                  pollOpen={status === PollStatus.OPEN}
                  index={index}
                  candidate={candidate}
                  isChecked={selectedIndexes.includes(index)}
                  currentVotes={votes.find(v => v.index === index)?.votes}
                  pollType={pollType}
                  weightCap={weightCap}
                  onChange={(checked, updatedVotes) => voteUpdated(index, checked, updatedVotes)}
                  isInvalid={Boolean(isVotesInvalid[index])}
                  setIsInvalid={currentStatus =>
                    setIsVotesInvalid(prev => ({
                      ...prev,
                      [index]: currentStatus,
                    }))
                  }
                  isVoting={voting}
                />
              </div>
            ))}

            {status === PollStatus.OPEN && (
              <div className="mt-2 shadow-2xl flex flex-col gap-4">
                <button
                  onClick={castVote}
                  disabled={voting}
                  className="hover:border-black border-2 border-accent w-full text-lg text-center bg-accent py-3 rounded-xl font-bold disabled:cursor-not-allowed disabled:border-none"
                >
                  Vote Now
                </button>

                {isEditing && (
                  <button
                    onClick={cancelChanges}
                    className="hover:border-black border-2 border-secondary w-full text-lg text-center bg-secondary py-3 rounded-xl font-bold"
                  >
                    Cancel Changes
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {result && (
          <div className="mt-5">
            <div className="text-2xl font-bold">Results</div>
            <div className="mt-3">
              <table className="border-separate w-full mt-7 mb-4">
                <thead>
                  <tr className="text-lg font-extralight">
                    <th className="border border-slate-600 bg-primary">Rank</th>
                    <th className="border border-slate-600 bg-primary">Candidate</th>
                    <th className="border border-slate-600 bg-primary">Votes</th>
                  </tr>
                </thead>
                <tbody>
                  {result.map((r, i) => (
                    <tr key={i} className="text-center">
                      <td>{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-3 justify-center">
                          <Image
                            src={r.candidate.image || DEFAULT_CANDIDATE_IMAGE}
                            alt={r.candidate.name}
                            width={40}
                            height={40}
                            className="rounded-full object-cover border border-slate-400"
                            unoptimized
                          />
                          <div className="text-left">
                            <div>{r.candidate.name}</div>
                            {r.candidate.description ? (
                              <div className="text-xs opacity-70">{r.candidate.description}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>{r.votes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
