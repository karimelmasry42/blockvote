/**
 * Regression tests confirming the WrapperAwarePoll fix closes the three
 * previously-confirmed bypasses.
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
const START_OFFSET = 2;

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

  await (await pollFactory.setWrapper(await maciWrapper.getAddress())).wait();

  const coordinatorKeypair = new Keypair();
  await (
    await maciWrapper.setConfig(
      { intStateTreeDepth: 1, messageTreeSubDepth: 1, messageTreeDepth: 2, voteOptionTreeDepth: 2 },
      coordinatorKeypair.pubKey.asContractParam(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    )
  ).wait();

  return { maciWrapper, signer };
}

async function createTestPoll(
  maciWrapper: Awaited<ReturnType<typeof ethers.getContract>>,
  startOffsetSecs = START_OFFSET,
  durationSecs = 3600,
  advancePastStart = true,
) {
  const now = await time.latest();
  const tx = await maciWrapper.createPoll(
    "Regression Poll",
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

// ─── regression tests ───────────────────────────────────────────────────────

describe("MACIWrapper bypass regression (WrapperAwarePoll)", function () {
  this.timeout(120_000);

  it("pause bypass FIXED: publishMessage reverts with PollIsPaused while wrapper is paused", async function () {
    const { maciWrapper } = await setup();
    const { pollAddress } = await createTestPoll(maciWrapper);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await (await maciWrapper.pausePoll(0n)).wait();

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "PollIsPaused",
    );
  });

  it("closePoll bypass FIXED: publishMessage reverts with VotingPeriodOver after wrapper closes early", async function () {
    const { maciWrapper } = await setup();
    // advancePastStart=true ensures we are past startTime before closing.
    const { pollAddress } = await createTestPoll(maciWrapper);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await (await maciWrapper.closePoll(0n)).wait();

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "VotingPeriodOver",
    );
  });

  it("startTime bypass FIXED: publishMessage reverts with VotingNotStarted before announced start", async function () {
    const { maciWrapper } = await setup();
    const { pollAddress } = await createTestPoll(maciWrapper, 1800, 3600, false);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "VotingNotStarted",
    );
  });

  it("real deadline still enforced: publishMessage reverts with VotingPeriodOver after Poll duration", async function () {
    const { maciWrapper } = await setup();
    const duration = 3600;
    const { pollAddress } = await createTestPoll(maciWrapper, START_OFFSET, duration);
    const poll = await ethers.getContractAt("WrapperAwarePoll", pollAddress);

    await time.increase(duration + 1);

    await expect(poll.publishMessage(DUMMY_MESSAGE, freshEncPubKey())).to.be.revertedWithCustomError(
      poll,
      "VotingPeriodOver",
    );
  });
});
