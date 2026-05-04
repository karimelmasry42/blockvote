import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const HARDHAT_DIR = path.join(process.cwd(), "..", "hardhat");

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: HARDHAT_DIR,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seconds = body.seconds || 3600;

    console.log(`[clock-sync] Advancing blockchain time by ${seconds} seconds`);

    await runCommand("npx", [
      "hardhat",
      "run",
      "scripts/advance-time.ts",
      seconds.toString(),
      "--network",
      "localhost",
    ]);

    return NextResponse.json({
      success: true,
      message: `Advanced time by ${seconds} seconds`,
    });
  } catch (error: any) {
    console.error("[clock-sync] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to sync clock" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Clock sync endpoint - POST with { seconds: number }" });
}
