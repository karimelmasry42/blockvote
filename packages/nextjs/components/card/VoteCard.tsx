import { memo, useRef, useState } from "react";
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
}: VoteCardProps) => {
  const [votes, setVotes] = useState(currentVotes || 0);
  const votesFieldRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="bg-primary flex w-full px-3 py-3 rounded-lg items-start gap-3">
        {pollOpen && (
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
                  case PollType.WEIGHTED_MULTIPLE_VOTE:
                    onChange(true, votes);
                    if (votes) {
                      setIsInvalid(false);
                    } else {
                      setIsInvalid(true);
                    }
                    break;
                }
              } else {
                onChange(false, 0);
                setIsInvalid(false);
                setVotes(0);
                if (votesFieldRef.current) {
                  votesFieldRef.current.value = "";
                }
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

        <div className={`flex-1 ${!pollOpen ? "ml-2" : ""}`}>
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
            "border border-slate-600 bg-primary text-primary-content placeholder:text-accent-content placeholder:font-light rounded-lg px-2 py-2 ml-2 w-20" +
            (isInvalid ? " border-red-500" : "")
          }
          disabled={!isChecked}
          placeholder="Votes"
          min={0}
          max={100}
          step={1}
          defaultValue={currentVotes || ""}
          onChange={function (e) {
            const rawValue = e.currentTarget.value;
            const parsedValue = Number(rawValue);
            const isEmpty = rawValue === "";
            const isInteger = Number.isInteger(parsedValue);
            const isInRange = parsedValue >= 0 && parsedValue <= 100;
            const isValid = !isEmpty && isInteger && Number.isFinite(parsedValue) && isInRange;

            if (!isValid) {
              setIsInvalid(isChecked);
              setVotes(0);
              onChange(isChecked, 0);
              return;
            }

            setIsInvalid(false);
            setVotes(parsedValue);
            onChange(isChecked, parsedValue);
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
    prev.onChange === next.onChange
  );
});
