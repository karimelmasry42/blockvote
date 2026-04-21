/**
 * Fix verification tests for WrapperAwarePoll + WrapperAwarePollFactory.
 *
 * These tests confirm that after the fix:
 *   - pausePoll  → direct Poll.publishMessage reverts with PollIsPaused
 *   - closePoll  → direct Poll.publishMessage reverts with VotingPeriodOver
 *   - startTime  → direct Poll.publishMessage reverts with VotingNotStarted
 *   - within the valid window → publishMessage still succeeds
 */

import { expect } from "chai";
import { ethers, deployments, getNamedAccounts } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Keypair } from "maci-domainobjs";

// ─── helpers ────────────────────────────────────────────────────────────────

function freshEncPubKey() {
  return new Keypair().pubKey.asContractParam();
}

const DUMMY_MESSAGE = { msgType: 1n, data: Array(10).fill(0n) };
const NON_QV = 1;
const START_OFFSET = 2; // seconds buffer so createPoll's block.timestamp <= startTime

async function setup() {
  await deployments.fixture([
    "InitialVoiceCreditProxy",
    "Gatekeeper",
    "Verifier",
    "Poseidon",
    "PollFactory",
    "MessageProcessorFactory",
    "TallyFactory",
    "MACI",
  ]);

  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);
  const maciWrapper = await ethers.getContract("MACIWrapper", signer);
  const pollFactory = await ethers.getContract("PollFactory", signer);

  // Wire the factory to the wrapper (mirrors 09_configure.ts).
  await (await pollFactory.setWrapper(await maciWrapper.getAddress())).wait();

  const coordinatorKeypair = new Keypair();
  await (
    await maciWrapper.setConfig(
      {
        intStateTreeDepth: 1,
        messageTreeSubDepth: 1,
        messageTreeDepth: 2,
        voteOptionTreeDepth: 2,
      },
      coordinatorKeypair.pubKey.asContractParam(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    )
  ).wait();

  return { maciWrapper, signer };
}

/**
 * Create a test poll and return the underlying Poll address.
 * @param startOffsetSecs  Seconds from now before the wrapper considers the poll started.
 *                         Must be ≥ START_OFFSET so createPoll's timestamp check passes.
 * @param advancePastStart When true (default), advances EVM time past startTime so the
 *                         poll is immediately active.  Pass false for startTime-gate tests.
 */
async function createTestPoll(
  maciWrapper: Awaited<ReturnType<typeof ethers.getContract>>,
  startOffsetSecs = START_OFFSET,
  durationSecs = 3600,
  advancePastStart = true,
) {
  const now = await time.latest();
  const tx = await maciWrapper.createPoll(
    "Fix Test Poll",
    ["Option A", "Option B"],
    "",
    now + startOffsetSecs,
    durationSecs,
    NON_QV,
  );
  await tx.wait();

  if (advancePastStart) {
    await time.increase(startOffsetSecs + 1);
  }

  const pollData = await maciWrapper.fetchPoll(0n);
  return { pollAddress: pollData.pollContracts.poll as string };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("WrapperAwarePoll fix verification", function () {
  this.timeout(120_000);

  it("normal vote: publishMessage succeeds when poll is active", async function () {
    const { maciWrapper } = await setup();
    const { pollAddress } = await createTestPoll(maciWrapper);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.not.be.reverted;
  });

  it("pause fix: publishMessage reverts with PollIsPaused when wrapper pauses", async function () {
    const { maciWrapper } = await setup();
    const { pollAddress } = await createTestPoll(maciWrapper);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await (await maciWrapper.pausePoll(0n)).wait();

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "PollIsPaused",
    );
  });

  it("closePoll fix: publishMessage reverts with VotingPeriodOver after wrapper closes early", async function () {
    const { maciWrapper } = await setup();
    // advancePastStart=true ensures we are past startTime before closing,
    // so the revert reason is VotingPeriodOver (endTime), not VotingNotStarted.
    const { pollAddress } = await createTestPoll(maciWrapper);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await (await maciWrapper.closePoll(0n)).wait();

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "VotingPeriodOver",
    );
  });

  it("startTime fix: publishMessage reverts with VotingNotStarted before wrapper startTime", async function () {
    const { maciWrapper } = await setup();
    // advancePastStart=false keeps us before the announced start time.
    const { pollAddress } = await createTestPoll(maciWrapper, 1800, 3600, false);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "VotingNotStarted",
    );
  });

  it("resume after pause: publishMessage succeeds again after admin resumes", async function () {
    const { maciWrapper } = await setup();
    const { pollAddress } = await createTestPoll(maciWrapper);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await (await maciWrapper.pausePoll(0n)).wait();
    await (await maciWrapper.resumePoll(0n)).wait();

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.not.be.reverted;
  });
});
