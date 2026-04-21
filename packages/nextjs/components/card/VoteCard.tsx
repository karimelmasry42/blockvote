import { memo, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CandidateOption, DEFAULT_CANDIDATE_IMAGE, PollType } from "~~/types/poll";

type VoteCardProps = {
  index: number;
  candidate: CandidateOption;
  isChecked: boolean;
  isVoting: boolean;
  pollType: PollType;
  onChange: (checked: boolean, votes: number) => void;
  setIsInvalid: (value: boolean) => void;
  isInvalid: boolean;
  pollOpen: boolean;
  currentVotes?: number;
  weightCap?: number;
};

const VoteCard = ({
  index,
  candidate,
  onChange,
  pollType,
  isInvalid,
  setIsInvalid,
  pollOpen,
  currentVotes,
  isChecked,
  isVoting,
  weightCap = 100,
}: VoteCardProps) => {
  const [votes, setVotes] = useState(currentVotes || 0);
  const votesFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVotes(currentVotes || 0);
  }, [currentVotes]);

  return (
    <>
      <div className="bg-primary flex w-full px-3 py-3 rounded-lg items-start gap-3">
        {pollOpen && pollType !== PollType.WEIGHTED_MULTIPLE_VOTE && (
          <input
            type={pollType === PollType.SINGLE_VOTE ? "radio" : "checkbox"}
            className="mt-2 mr-1"
            value={index}
            checked={isChecked}
            disabled={!pollOpen || isVoting}
            onChange={e => {
              if (e.target.checked) {
                switch (pollType) {
                  case PollType.SINGLE_VOTE:
                    onChange(true, 1);
                    break;
                  case PollType.MULTIPLE_VOTE:
                    onChange(true, 1);
                    break;
                }
              } else {
                onChange(false, 0);
                setIsInvalid(false);
              }
            }}
            name={pollType === PollType.SINGLE_VOTE ? "candidate-votes" : `candidate-votes-${index}`}
          />
        )}

        <Image
          src={candidate.image || DEFAULT_CANDIDATE_IMAGE}
          alt={candidate.name}
          width={56}
          height={56}
          className="rounded-full object-cover border border-slate-400 shrink-0"
          unoptimized
        />

        <div className={`flex-1 ${!pollOpen || pollType === PollType.WEIGHTED_MULTIPLE_VOTE ? "ml-2" : ""}`}>
          <div className="font-semibold">{candidate.name}</div>
          {candidate.description ? (
            <div className="text-sm opacity-80 mt-1 whitespace-pre-wrap">{candidate.description}</div>
          ) : null}
        </div>
      </div>

      {pollOpen && pollType === PollType.WEIGHTED_MULTIPLE_VOTE && (
        <input
          ref={votesFieldRef}
          type="number"
          className={
            "border border-slate-600 bg-primary text-primary-content placeholder:text-accent-content placeholder:font-light rounded-lg px-2 py-2 ml-2 mt-2 w-28" +
            (isInvalid ? " border-red-500" : "")
          }
          disabled={isVoting}
          placeholder="Weight"
          min={0}
          max={weightCap}
          step={1}
          value={votes === 0 ? "" : votes}
          onChange={e => {
            const rawValue = e.currentTarget.value;

            if (rawValue === "") {
              setVotes(0);
              setIsInvalid(false);
              onChange(false, 0);
              return;
            }

            const parsedValue = Number(rawValue);
            const isInteger = Number.isInteger(parsedValue);
            const isInRange = parsedValue >= 0 && parsedValue <= weightCap;
            const isValid = Number.isFinite(parsedValue) && isInteger && isInRange;

            if (!isValid) {
              setIsInvalid(true);
              setVotes(0);
              onChange(false, 0);
              return;
            }

            setIsInvalid(false);
            setVotes(parsedValue);

            if (parsedValue === 0) {
              onChange(false, 0);
            } else {
              onChange(true, parsedValue);
            }
          }}
        />
      )}
    </>
  );
};

export default memo(VoteCard, (prev, next) => {
  return (
    prev.index === next.index &&
    prev.candidate.name === next.candidate.name &&
    prev.candidate.image === next.candidate.image &&
    prev.candidate.description === next.candidate.description &&
    prev.isChecked === next.isChecked &&
    prev.isInvalid === next.isInvalid &&
    prev.pollOpen === next.pollOpen &&
    prev.pollType === next.pollType &&
    prev.isVoting === next.isVoting &&
    prev.currentVotes === next.currentVotes &&
    prev.weightCap === next.weightCap &&
    prev.onChange === next.onChange
  );
});
