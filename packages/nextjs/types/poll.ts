export enum PollStatus {
  NOT_STARTED = "Not Started",
  OPEN = "Open",
  PAUSED = "Paused",
  CLOSED = "Closed",
  RESULT_COMPUTED = "Result Computed",
}

export interface CandidateOption {
  name: string;
  image?: string;
  description?: string;
}

export interface PollMetadata {
  version?: number;
  pollType?: PollType;
  options?: CandidateOption[];
}

export interface RawPoll {
  id: bigint;
  name: string;
  encodedOptions: `0x${string}`;
  metadata: string;
  pollContracts: {
    poll: string;
    messageProcessor: string;
    tally: string;
  };
  startTime: bigint;
  endTime: bigint;
  numOfOptions: bigint;
  options: readonly string[];
  tallyJsonCID: string;
  paused: boolean;
}

export interface Poll extends RawPoll {
  status: PollStatus;
  candidateOptions?: CandidateOption[];
}

export enum PollType {
  NOT_SELECTED,
  SINGLE_VOTE,
  MULTIPLE_VOTE,
  WEIGHTED_MULTIPLE_VOTE,
}

/**
 * Supported verification key modes
 */
export enum EMode {
  QV,
  NON_QV,
}

export const DEFAULT_CANDIDATE_IMAGE = "/default-candidate.png";

export function getCandidateOptions(
  metadata: string | undefined,
  fallbackOptions: readonly string[],
): CandidateOption[] {
  try {
    const parsed = JSON.parse(metadata || "{}") as PollMetadata;

    if (Array.isArray(parsed.options) && parsed.options.length > 0) {
      return parsed.options.map(option => ({
        name: option?.name || "",
        image: option?.image || "",
        description: option?.description || "",
      }));
    }
  } catch {
    // ignore malformed metadata and fall back to string options
  }

  return fallbackOptions.map(option => ({
    name: option,
    image: "",
    description: "",
  }));
}
