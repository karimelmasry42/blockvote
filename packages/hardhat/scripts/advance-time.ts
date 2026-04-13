/**
 * Advance the local Hardhat chain's block timestamp.
 *
 * Usage:
 *   yarn hardhat run scripts/advance-time.ts --network localhost
 *   yarn hardhat run scripts/advance-time.ts --network localhost 7200   # advance by 2 hours
 *
 * Default: advances by 3600 seconds (1 hour).
 *
 * Why this is needed:
 *   On a local Hardhat node, block timestamps only advance when blocks are mined.
 *   MACI's merge task checks `deployTime + duration` against the latest block timestamp,
 *   NOT wall-clock time. So even if real minutes have passed, the chain may think
 *   the poll is still active. This script forces the chain clock forward.
 */

import hre from "hardhat";

async function main() {
  const seconds = Number(process.argv[2]) || 3600;

  const blockBefore = await hre.ethers.provider.getBlock("latest");
  console.log(`Current block timestamp: ${blockBefore?.timestamp} (${new Date((blockBefore?.timestamp ?? 0) * 1000).toISOString()})`);

  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await hre.network.provider.send("evm_mine");

  const blockAfter = await hre.ethers.provider.getBlock("latest");
  console.log(`Advanced by ${seconds} seconds`);
  console.log(`New block timestamp:     ${blockAfter?.timestamp} (${new Date((blockAfter?.timestamp ?? 0) * 1000).toISOString()})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
