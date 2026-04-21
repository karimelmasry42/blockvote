import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { ContractStorage, EContracts } from "maci-contracts";

const storage = ContractStorage.getInstance();

const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const poseidonT3 = await hre.ethers.getContract("PoseidonT3", deployer);
  const poseidonT4 = await hre.ethers.getContract("PoseidonT4", deployer);
  const poseidonT5 = await hre.ethers.getContract("PoseidonT5", deployer);
  const poseidonT6 = await hre.ethers.getContract("PoseidonT6", deployer);

  // Deploy WrapperAwarePollFactory under the "PollFactory" deployment name so
  // that downstream scripts (07_maci.ts) and the MACI constructor receive it
  // without changes.  setWrapper() is called in 09_configure.ts once
  // MACIWrapper's address is known.
  await hre.deployments.deploy("PollFactory", {
    contract: "WrapperAwarePollFactory",
    from: deployer,
    args: [],
    log: true,
    libraries: {
      PoseidonT3: await poseidonT3.getAddress(),
      PoseidonT4: await poseidonT4.getAddress(),
      PoseidonT5: await poseidonT5.getAddress(),
      PoseidonT6: await poseidonT6.getAddress(),
    },
    autoMine: true,
  });

  const pollFactory = await hre.ethers.getContract("PollFactory", deployer);

  console.log(`The poll factory (WrapperAwarePollFactory) is deployed at ${await pollFactory.getAddress()}`);

  await storage.register({
    id: EContracts.PollFactory,
    // @ts-expect-error WrapperAwarePollFactory satisfies IPollFactory
    contract: pollFactory,
    args: [],
    network: hre.network.name,
  });
};

export default deployContracts;

deployContracts.tags = ["PollFactory"];
