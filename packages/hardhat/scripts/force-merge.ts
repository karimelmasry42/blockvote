import hre from "hardhat";
import fs from "fs";
import path from "path";

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments", "localhost");

function loadDeployment(name: string) {
  return JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, `${name}.json`), "utf-8"));
}

const messageAqAbi = [
  "function subTreesMerged() view returns (bool)",
  "function getMainRoot(uint256 depth) view returns (uint256)",
  "function getSrIndices() view returns (uint256, uint256)",
];

async function main() {
  const pollId = process.env.FORCE_MERGE_POLL_ID;
  if (!pollId) {
    console.error("FORCE_MERGE_POLL_ID environment variable is required");
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();

  const maciDeployment = loadDeployment("MACIWrapper");
  const maciContract = new hre.ethers.Contract(maciDeployment.address, maciDeployment.abi, deployer);

  const pollContracts = await maciContract.polls(pollId);
  const pollAddress = pollContracts.poll;

  if (pollAddress === hre.ethers.ZeroAddress) {
    throw new Error(`Poll ${pollId} not found`);
  }

  console.log(`Poll ${pollId} contract: ${pollAddress}`);

  const pollAbi = (await hre.artifacts.readArtifact("WrapperAwarePoll")).abi as any[];
  const pollContract = new hre.ethers.Contract(pollAddress, pollAbi, deployer);

  const extContracts = await pollContract.extContracts();
  const messageAqAddress = extContracts.messageAq;
  console.log(`MessageAq contract: ${messageAqAddress}`);

  const messageAqContract = new hre.ethers.Contract(messageAqAddress, messageAqAbi, deployer);

  const treeDepths = await pollContract.treeDepths();
  const messageTreeDepth = Number(treeDepths.messageTreeDepth);
  const defaultSrQueueOps = 4;

  const startBalance = await hre.ethers.provider.getBalance(deployer);
  console.log("Start balance: ", Number(startBalance / 10n ** 12n) / 1e6);

  // Step 1: merge signups
  if (!(await pollContract.stateMerged())) {
    console.log("Merging signups...");
    const tx = await pollContract.mergeMaciState();
    const receipt = await tx.wait();
    console.log(`mergeMaciState() done — tx: ${receipt.hash}, gas: ${receipt.gasUsed}`);
  } else {
    console.log("State already merged");
  }

  // Step 2: merge message subtrees
  let subTreesMerged = false;
  while (!subTreesMerged) {
    subTreesMerged = await messageAqContract.subTreesMerged();
    if (subTreesMerged) {
      console.log("All message subtrees already merged");
    } else {
      const indices = await messageAqContract.getSrIndices();
      console.log(`Merging message subroots ${indices[0] + 1n} / ${indices[1] + 1n}`);
      const tx = await pollContract.mergeMessageAqSubRoots(defaultSrQueueOps);
      const receipt = await tx.wait();
      console.log(`mergeMessageAqSubRoots() done — tx: ${receipt.hash}, gas: ${receipt.gasUsed}`);
    }
  }

  // Step 3: merge messages
  const mainRoot = await messageAqContract.getMainRoot(messageTreeDepth);
  if (mainRoot.toString() === "0") {
    console.log("Merging message AQ...");
    const tx = await pollContract.mergeMessageAq();
    const receipt = await tx.wait();
    console.log(`mergeMessageAq() done — tx: ${receipt.hash}, gas: ${receipt.gasUsed}`);
  } else {
    console.log("Message AQ already merged");
  }

  const endBalance = await hre.ethers.provider.getBalance(deployer);
  console.log("End balance: ", Number(endBalance / 10n ** 12n) / 1e6);
  console.log("Merge expenses: ", Number((startBalance - endBalance) / 10n ** 12n) / 1e6);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
