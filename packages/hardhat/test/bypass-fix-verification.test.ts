/**
 * Fix verification tests for WrapperAwarePoll + WrapperAwarePollFactory.
 *
 * These tests confirm that after the fix:
 *   - pausePoll  → direct Poll.publishMessage reverts with PollIsPaused
 *   - closePoll  → direct Poll.publishMessage reverts with VotingPeriodOver
 *   - startTime  → direct Poll.publishMessage reverts with VotingNotStarted
 *   - within the valid window → publishMessage still succeeds
 *
 * Setup mirrors bypass-verification.test.ts but adds the setWrapper() call
 * in configure so WrapperAwarePoll can reach back into MACIWrapper.
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

async function createTestPoll(
  maciWrapper: Awaited<ReturnType<typeof ethers.getContract>>,
  startOffsetSecs = 2,
  durationSecs = 3600,
) {
  const now = await time.latest();
  const startTime = now + startOffsetSecs;

  const tx = await maciWrapper.createPoll(
    "Fix Test Poll",
    ["Option A", "Option B"],
    "",
    startTime,
    durationSecs,
    NON_QV,
  );
  await tx.wait();

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
    // Start 30 minutes in the future.
    const { pollAddress } = await createTestPoll(maciWrapper, 1800, 3600);
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
