import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import { Keypair, PrivKey, PubKey } from "maci-domainobjs";
import path from "path";
import { createPublicClient, http } from "viem";
import { localhost } from "viem/chains";

const HARDFAT_DIR = path.join(process.cwd(), "..", "hardhat");
const DEPLOYMENTS_DIR = path.join(HARDFAT_DIR, "deployments", "localhost");

function readJsonFile(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: HARDFAT_DIR,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", data => {
      stdout += data.toString();
    });

    child.stderr.on("data", data => {
      stderr += data.toString();
    });

    child.on("close", code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout));
      }
    });

    child.on("error", err => {
      reject(err);
    });
  });
}

function extractPubkeyFromPrivkey(privKey: string): string {
  try {
    return new Keypair(PrivKey.deserialize(privKey)).pubKey.serialize();
  } catch {
    throw new Error("Invalid coordinator private key format");
  }
}

function loadCoordinatorKeyPair(filePath: string): { privKey: string; pubKey: string } {
  const coordinatorKeyPair = readJsonFile(filePath);

  if (!coordinatorKeyPair?.privKey || !coordinatorKeyPair?.pubKey) {
    throw new Error("Missing or invalid coordinatorKeyPair.json");
  }

  const derivedPubKey = extractPubkeyFromPrivkey(coordinatorKeyPair.privKey);

  if (derivedPubKey !== coordinatorKeyPair.pubKey) {
    const repairedKeyPair = { ...coordinatorKeyPair, pubKey: derivedPubKey };
    writeJsonFile(filePath, repairedKeyPair);
    console.warn("coordinatorKeyPair.json pubKey did not match privKey; repaired pubKey from privKey");
    return repairedKeyPair;
  }

  return coordinatorKeyPair;
}

function loadMaciWrapperDeployment() {
  const deploymentPath = path.join(DEPLOYMENTS_DIR, "MACIWrapper.json");
  const deployment = readJsonFile(deploymentPath);

  if (!deployment?.address || !deployment?.abi) {
    throw new Error("Missing MACIWrapper deployment for localhost");
  }

  return deployment;
}

function createLocalPublicClient() {
  return createPublicClient({
    chain: localhost,
    transport: http("http://127.0.0.1:8545"),
  });
}

async function readOnChainCoordinatorPubKey() {
  const deployment = loadMaciWrapperDeployment();
  const publicClient = createLocalPublicClient();

  const coordinatorPubKey = await publicClient.readContract({
    address: deployment.address,
    abi: deployment.abi,
    functionName: "coordinatorPubKey",
    args: [],
  });

  return new PubKey([BigInt(coordinatorPubKey[0].toString()), BigInt(coordinatorPubKey[1].toString())]).serialize();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pollId: rawPollId, coordinatorPrivateKey } = body;

    if (rawPollId === undefined || rawPollId === null) {
      return NextResponse.json({ error: "pollId is required" }, { status: 400 });
    }

    const pollId = rawPollId.toString();
    if (!/^\d+$/.test(pollId)) {
      return NextResponse.json({ error: "Invalid pollId format" }, { status: 400 });
    }

    const coordinatorKeyPairPath = path.join(HARDFAT_DIR, "coordinatorKeyPair.json");
    const deployConfigPath = path.join(HARDFAT_DIR, "deploy-config.json");

    const coordinatorKeyPair = loadCoordinatorKeyPair(coordinatorKeyPairPath);
    const deployConfig = readJsonFile(deployConfigPath);

    if (!deployConfig) {
      return NextResponse.json({ error: "Missing coordinatorKeyPair.json or deploy-config.json" }, { status: 500 });
    }

    const resolvedCoordinatorPrivateKey = coordinatorPrivateKey?.trim() || coordinatorKeyPair.privKey;
    const providedPubKey = extractPubkeyFromPrivkey(resolvedCoordinatorPrivateKey);
    const onChainPubKey = await readOnChainCoordinatorPubKey();

    if (providedPubKey !== onChainPubKey) {
      return NextResponse.json(
        { error: "Coordinator private key does not match the coordinator public key deployed on localhost" },
        { status: 400 },
      );
    }

    const network = "localhost";
    if (deployConfig[network]?.Poll?.coordinatorPubkey !== onChainPubKey) {
      deployConfig[network].Poll.coordinatorPubkey = onChainPubKey;
      writeJsonFile(deployConfigPath, deployConfig);
    }

    const tallyOutputDir = path.join(HARDFAT_DIR, "tally-output");
    if (!fs.existsSync(tallyOutputDir)) {
      fs.mkdirSync(tallyOutputDir, { recursive: true });
    }

    const tallyFile = path.join(tallyOutputDir, `tally-poll-${pollId}.json`);

    let mergeAttempt = 0;
    const maxMergeAttempts = 3;

    while (mergeAttempt < maxMergeAttempts) {
      try {
        await runCommand("npx", ["hardhat", "merge", "--poll", pollId.toString(), "--network", "localhost"]);
        break;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "";
        if (errorMsg.includes("Voting period is not over")) {
          mergeAttempt++;
          if (mergeAttempt >= maxMergeAttempts) {
            return NextResponse.json(
              { error: "Voting period is not over. Please wait for the poll to end or manually advance time." },
              { status: 400 },
            );
          }
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          throw err;
        }
      }
    }

    let proveAttempt = 0;
    const maxProveAttempts = 3;

    while (proveAttempt < maxProveAttempts) {
      try {
        await runCommand("npx", [
          "hardhat",
          "prove",
          "--poll",
          pollId.toString(),
          "--output-dir",
          "tally-output",
          "--coordinator-private-key",
          resolvedCoordinatorPrivateKey,
          "--tally-file",
          tallyFile,
          "--network",
          "localhost",
        ]);
        break;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "";
        if (errorMsg.includes("Voting period is not over")) {
          proveAttempt++;
          if (proveAttempt >= maxProveAttempts) {
            return NextResponse.json(
              { error: "Voting period is not over. Please wait for the poll to end or manually advance time." },
              { status: 400 },
            );
          }
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          throw err;
        }
      }
    }

    const tallyData = readJsonFile(tallyFile);
    if (!tallyData) {
      return NextResponse.json({ error: "Failed to generate tally file" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tallyFile: `tally-poll-${pollId}.json`,
      tallyData,
      usedStoredCoordinatorKey: !coordinatorPrivateKey?.trim(),
    });
  } catch (error: unknown) {
    console.error("[tally-prove] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate proof";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
