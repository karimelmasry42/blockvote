import { NextRequest } from "next/server";
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

function streamCommand(command: string, args: string[], extraEnv?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: HARDFAT_DIR,
      shell: true,
      env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
    });

    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});

    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });

    child.on("error", err => reject(err));
  });
}

export async function POST(request: NextRequest) {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ event, ...payload })}\n\n`));
      };

      try {
        const body = await request.json();
        const { pollId: rawPollId, coordinatorPrivateKey } = body;

        if (rawPollId === undefined || rawPollId === null) {
          send("error", { message: "pollId is required" });
          controller.close();
          return;
        }

        const pollId = rawPollId.toString();
        if (!/^\d+$/.test(pollId)) {
          send("error", { message: "Invalid pollId format" });
          controller.close();
          return;
        }

        send("progress", { step: "validating", message: "Validating coordinator key" });

        const coordinatorKeyPairPath = path.join(HARDFAT_DIR, "coordinatorKeyPair.json");
        const deployConfigPath = path.join(HARDFAT_DIR, "deploy-config.json");

        const coordinatorKeyPair = loadCoordinatorKeyPair(coordinatorKeyPairPath);
        const deployConfig = readJsonFile(deployConfigPath);

        if (!deployConfig) {
          send("error", { message: "Missing coordinatorKeyPair.json or deploy-config.json" });
          controller.close();
          return;
        }

        const resolvedCoordinatorPrivateKey = coordinatorPrivateKey?.trim() || coordinatorKeyPair.privKey;
        const providedPubKey = extractPubkeyFromPrivkey(resolvedCoordinatorPrivateKey);
        const onChainPubKey = await readOnChainCoordinatorPubKey();

        if (providedPubKey !== onChainPubKey) {
          send("error", {
            message: "Coordinator private key does not match the coordinator public key deployed on localhost",
          });
          controller.close();
          return;
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

        send("progress", { step: "merge", message: "Merging state and message trees" });
        await streamCommand("npx", ["hardhat", "run", "scripts/force-merge.ts", "--network", "localhost"], {
          FORCE_MERGE_POLL_ID: pollId.toString(),
        });

        send("progress", { step: "state", message: "Rebuilding MACI state from on-chain events" });
        send("progress", {
          step: "mp-proofs",
          message: "Generating message processing proofs (this may take a while)",
        });
        send("progress", { step: "mp-submit", message: "Submitting message processing proofs" });
        send("progress", { step: "tally-proofs", message: "Generating tally proofs (this may take a while)" });
        send("progress", { step: "tally-submit", message: "Submitting tally proofs" });

        await streamCommand("npx", [
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

        const tallyData = readJsonFile(tallyFile);
        if (!tallyData) {
          send("error", { message: "Failed to generate tally file" });
          controller.close();
          return;
        }

        send("complete", {
          tallyFile: `tally-poll-${pollId}.json`,
          tallyData,
          usedStoredCoordinatorKey: !coordinatorPrivateKey?.trim(),
        });
      } catch (error: unknown) {
        console.error("[tally-prove] Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to generate proof";
        send("error", { message: errorMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
